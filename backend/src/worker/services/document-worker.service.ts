import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { aiModels } from '../../config/ai-models.config.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import {
  findDocumentForProcessing,
  markDocumentProcessing,
  markDocumentPartialSuccess,
  markDocumentReady,
  markDocumentFailed,
  markDocumentNeedsOcr,
  saveDoclingChunks,
  findReusableDoclingChunks,
} from '../../repositories/document-worker.repository.js';
import { ChunkService } from './chunk.service.js';
import { DocumentBlockDetectionService } from './document-block-detection.service.js';
import { DOCUMENT_PROCESSING_VERSION } from '../../repositories/document-processing-job.repository.js';
import { DocumentTextExtractionService } from './document-text-extraction.service.js';
import { EmbeddingService } from './embedding.service.js';
import { FlashcardGenerationService } from './flashcard/flashcard-generation.service.js';
import { QuestionExtractionService } from './question-extraction.service.js';
import { TopicProfileGenerationService } from './topic-profile-generation.service.js';
import { extractPdfPagesWithLayout } from './pdf-layout-extraction.service.js';
import {
  appendProcessingStageReport,
  appendProcessingTimeReport,
  formatDuration,
} from './processing-time-report.service.js';
import {
  createDocumentIngestionV3Service,
  type DocumentIngestionV3Service,
} from './document-parser/document-ingestion-v3.service.js';
import { DocChunkerClient, DocChunkerClientError } from './doc-chunker/doc-chunker.client.js';
import { DocChunkerV2Client } from './doc-chunker/doc-chunker-v2.client.js';
import { DocumentVisualAssetRepository } from '../../repositories/document-visual-asset.repository.js';
import { PrismaDocumentParseRunStore } from '../../repositories/document-parser.repository.js';
import { PrismaDocumentVisualLinkStore } from '../../repositories/document-visual-link.repository.js';
import { DocumentVisualLinkingService } from './document-visual-linking.service.js';
import { DocumentVisualIndexingService } from './document-visual-indexing.service.js';
import {
  completeDocumentProcessingJob,
  ensureDocumentProcessingJobs,
  failDocumentProcessingJob,
  skipDocumentProcessingJob,
  startDocumentProcessingJob,
  updateDocumentProcessingStage,
  type DocumentProcessingOperation,
} from '../../repositories/document-processing-job.repository.js';

const BUCKET = 'monitor-documents';

function sanitizeCountMap(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (/^[A-Z0-9_]+$/.test(key) && typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) {
      result[key] = count;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function sanitizeFlashcardOutputSummary(result: unknown): Record<string, Prisma.InputJsonValue> {
  const outputSummary: Record<string, Prisma.InputJsonValue> = {
    durationMs: 0,
    status: 'READY',
  };
  if (!result || typeof result !== 'object' || Array.isArray(result)) return outputSummary;
  const source = result as Record<string, unknown>;
  const summaryKeys = [
    'chunkCount', 'batchCount', 'blockCount', 'typeCounts', 'reviewCount',
    'savedCount', 'duplicateCount', 'questionCount', 'detectedCount',
    'incompleteCount', 'sourceBlockCount', 'candidateCount',
    'generated', 'accepted', 'persisted', 'rejected', 'duplicates', 'failedChunks',
    'attemptedChunks', 'successfulChunks',
  ] as const;
  for (const key of summaryKeys) {
    const value = source[key];
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') outputSummary[key] = value;
    else if (value && typeof value === 'object' && key === 'typeCounts') outputSummary[key] = value as Prisma.InputJsonValue;
  }
  if (Array.isArray(source.failedChunksDetail)) {
    outputSummary.failedChunksDetail = source.failedChunksDetail.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const detail = item as Record<string, unknown>;
      return typeof detail.chunkId === 'string' && typeof detail.code === 'string'
        ? [{ chunkId: detail.chunkId, code: detail.code }]
        : [];
    });
  }
  const ineligibleReasons = sanitizeCountMap(source.ineligibleReasons);
  if (ineligibleReasons) outputSummary.ineligibleReasons = ineligibleReasons;
  const rejectedReasons = sanitizeCountMap(source.rejectedReasons);
  if (rejectedReasons) outputSummary.rejectedReasons = rejectedReasons;
  return outputSummary;
}

export function resolveTrackedOperationStatus(result: unknown) {
  const status = result && typeof result === 'object' && !Array.isArray(result)
    ? (result as Record<string, unknown>).status
    : undefined;
  return status === 'FAILED' || status === 'PARTIAL_SUCCESS' ? status : 'READY';
}

export function shouldProcessDocumentContent(
  tag: 'KNOWLEDGE_BASE' | 'QUESTIONS' | 'FLASHCARDS',
) {
  return tag === 'KNOWLEDGE_BASE' || tag === 'QUESTIONS' || tag === 'FLASHCARDS';
}

export function shouldExtractQuestionsForDocument(
  tag: 'KNOWLEDGE_BASE' | 'QUESTIONS' | 'FLASHCARDS',
) {
  return tag === 'QUESTIONS';
}

export function shouldGenerateTopicProfile(
  tag: 'KNOWLEDGE_BASE' | 'QUESTIONS' | 'FLASHCARDS',
  topicId: string | null,
) {
  return tag === 'KNOWLEDGE_BASE' && Boolean(topicId);
}

export function resolveDocumentStatus(
  failures: Array<{ operation: DocumentProcessingOperation; error: unknown }>,
) {
  return failures.length > 0
    ? 'PARTIAL_SUCCESS' as const
    : 'READY' as const;
}

export function shouldGenerateFlashcardsAfterEmbeddings(
  tag: 'KNOWLEDGE_BASE' | 'QUESTIONS' | 'FLASHCARDS',
  embeddingsSucceeded: boolean,
  readyChunkCount: number,
) {
  return tag === 'FLASHCARDS' && embeddingsSucceeded && readyChunkCount > 0;
}

export type DocumentWorkerContext = {
  jobId?: string;
  attempt?: number;
};

export type DocumentWorkerServiceDependencies = {
  documentIngestionV3Service?: DocumentIngestionV3Service | null;
  flashcardGenerationService?: Pick<FlashcardGenerationService, 'processDocument'>;
  flashcardConcurrency?: number;
  docChunkerClient?: Pick<DocChunkerClient, 'chunk'>;
  docChunkerV2Client?: Pick<DocChunkerV2Client, 'chunkWithAssets'>;
  documentVisualAssetRepository?: Pick<DocumentVisualAssetRepository, 'persistVisualParseRun'>;
  documentVisualLinkingService?: Pick<DocumentVisualLinkingService, 'linkVisualAssetsToChunks'>;
  documentVisualIndexingService?: Pick<DocumentVisualIndexingService, 'describeAndIndexAsset'>;
  saveDoclingChunks?: typeof saveDoclingChunks;
};

export class DocumentWorkerService {
  private readonly documentIngestionV3Service: DocumentIngestionV3Service | null;
  private readonly flashcardGenerationService: Pick<FlashcardGenerationService, 'processDocument'>;
  private readonly flashcardConcurrency: number;
  private readonly docChunkerClient: Pick<DocChunkerClient, 'chunk'> | null;
  private readonly docChunkerV2Client: Pick<DocChunkerV2Client, 'chunkWithAssets'> | null;
  private readonly documentVisualAssetRepository: Pick<DocumentVisualAssetRepository, 'persistVisualParseRun'> | null;
  private readonly documentVisualLinkingService: Pick<DocumentVisualLinkingService, 'linkVisualAssetsToChunks'> | null;
  private readonly documentVisualIndexingService: Pick<DocumentVisualIndexingService, 'describeAndIndexAsset'> | null;
  private readonly saveDoclingChunks: typeof saveDoclingChunks;

  constructor(
    private readonly chunkService = new ChunkService(),
    private readonly documentTextExtractionService = new DocumentTextExtractionService(),
    private readonly documentBlockDetectionService = new DocumentBlockDetectionService(),
    private readonly embeddingService = new EmbeddingService(),
    private readonly questionExtractionService = new QuestionExtractionService(),
    private readonly topicProfileGenerationService = new TopicProfileGenerationService(),
    dependencies: DocumentWorkerServiceDependencies = {},
  ) {
    if (env.DOCUMENT_INGESTION_V3_ENABLED && !env.DOCUMENT_PARSER_BASE_URL && !dependencies.documentIngestionV3Service) {
      console.log('Shadow parser V3 desativado: DOCUMENT_PARSER_BASE_URL nao foi configurado', {
        event: 'monitor.document_ingestion_v3_missing_base_url',
      });
    }
    this.documentIngestionV3Service = dependencies.documentIngestionV3Service
      ?? (env.DOCUMENT_INGESTION_V3_ENABLED && env.DOCUMENT_PARSER_BASE_URL
        ? createDocumentIngestionV3Service({ parserBaseUrl: env.DOCUMENT_PARSER_BASE_URL })
        : null);
    this.flashcardGenerationService = dependencies.flashcardGenerationService ?? new FlashcardGenerationService();
    this.flashcardConcurrency = dependencies.flashcardConcurrency ?? aiModels.flashcardGenerationConcurrency;
    this.docChunkerClient = dependencies.docChunkerClient
      ?? ((env.DOCUMENT_CHUNKER_BASE_URL ?? env.DOCUMENT_PARSER_BASE_URL)
        ? new DocChunkerClient({
          baseUrl: env.DOCUMENT_CHUNKER_BASE_URL ?? env.DOCUMENT_PARSER_BASE_URL!,
          requestTimeoutMs: env.DOCUMENT_CHUNKER_REQUEST_TIMEOUT_MS,
          maxResponseBytes: env.DOCUMENT_CHUNKER_MAX_RESPONSE_BYTES,
          logger: (event, payload) => console.log(event, payload),
        }) : null);
    this.docChunkerV2Client = dependencies.docChunkerV2Client
      ?? (env.DOCUMENT_VISUAL_ASSETS_ENABLED && (env.DOCUMENT_CHUNKER_BASE_URL ?? env.DOCUMENT_PARSER_BASE_URL)
        ? new DocChunkerV2Client({
          baseUrl: env.DOCUMENT_CHUNKER_BASE_URL ?? env.DOCUMENT_PARSER_BASE_URL!,
          requestTimeoutMs: env.DOCUMENT_CHUNKER_REQUEST_TIMEOUT_MS,
          maxResponseBytes: env.DOCUMENT_CHUNKER_MAX_RESPONSE_BYTES,
          logger: (event, payload) => console.log(event, payload),
        }) : null);
    this.documentVisualAssetRepository = dependencies.documentVisualAssetRepository
      ?? (env.DOCUMENT_VISUAL_ASSETS_ENABLED ? new DocumentVisualAssetRepository() : null);
    this.documentVisualLinkingService = dependencies.documentVisualLinkingService
      ?? (env.DOCUMENT_VISUAL_ASSETS_ENABLED
        ? new DocumentVisualLinkingService(new PrismaDocumentVisualLinkStore(), (event, fields) => console.log(event, fields))
        : null);
    this.documentVisualIndexingService = dependencies.documentVisualIndexingService
      ?? (env.DOCUMENT_VISUAL_ASSETS_ENABLED ? new DocumentVisualIndexingService() : null);
    this.saveDoclingChunks = dependencies.saveDoclingChunks ?? saveDoclingChunks;
  }

  async process(documentId: string, context: DocumentWorkerContext = {}) {
    const startedAt = Date.now();
    const nonBlockingFailures: Array<{ operation: DocumentProcessingOperation; error: unknown }> = [];

    console.log('Worker iniciou o processamento do documento', {
      event: 'monitor.document_processing_started',
      documentId,
      jobId: context.jobId,
      attempt: context.attempt,
    });

    let document;
    try {
      document = await findDocumentForProcessing(documentId);
    } catch (error) {
      console.log('Falha ao buscar documento para processamento', {
        event: 'monitor.document_lookup_failed',
        documentId,
        durationMs: Date.now() - startedAt,
        error,
      });
      throw error;
    }

    if (!document) {
      console.log('Job ignorado: documento nao encontrado', {
        event: 'monitor.document_job_missing',
        documentId,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    await ensureDocumentProcessingJobs(document.id);
    const track = <T>(
      operation: DocumentProcessingOperation,
      action: () => Promise<T>,
      inputSnapshot?: Prisma.InputJsonValue,
    ) => this.runTrackedOperation(document.id, operation, action, inputSnapshot, context);
    try {
      await markDocumentProcessing(document.id);
    } catch (error) {
      console.log('Falha ao marcar documento como PROCESSING', {
        event: 'monitor.document_processing_status_failed',
        documentId: document.id,
        durationMs: Date.now() - startedAt,
        error,
      });
      throw error;
    }

    try {
      const { data, error } = await this.measureStage(
        document.id,
        'DOWNLOAD_DOCUMENT',
        () => supabaseAdmin.storage.from(BUCKET).download(document.storagePath),
        context,
        { storagePath: document.storagePath },
      );
      if (error || !data) throw new Error(error?.message || 'Arquivo nao encontrado no storage.');
      const pdfBytes = new Uint8Array(await data.arrayBuffer());
      const contentHash = createHash('sha256').update(pdfBytes).digest('hex');

      if (shouldParseVisualAssets(document.tag, env.DOCUMENT_VISUAL_ASSETS_ENABLED) && document.tag === 'QUESTIONS') {
        try {
          const visual = await this.processVisualAssetsOnly(document, pdfBytes, contentHash);
          console.log('Extração visual das questões concluída; extração textual permanece no fluxo atual', {
            event: 'document_visual_assets.question_document_completed', documentId: document.id,
            parseRunId: visual.parseRunId, assetCount: visual.assetCount,
            warningCount: visual.warningCount, reused: visual.reused,
          });
        } catch (error) {
          console.warn('Extração visual indisponível; fluxo textual de questões continuará', {
            event: 'document_visual_assets.question_document_failed_non_blocking', documentId: document.id,
            errorCode: error instanceof Error ? error.name : 'VISUAL_PARSE_FAILED',
          });
        }
      }

      let doclingChunksPersisted = false;
      let doclingFallbackOccurred = false;
      let visualParseRunId: string | null = null;
      if (shouldUseDocChunker(document.tag, env.DOCUMENT_TEXT_SOURCE)
          || (shouldParseVisualAssets(document.tag, env.DOCUMENT_VISUAL_ASSETS_ENABLED) && document.tag === 'KNOWLEDGE_BASE')) {
        if (!this.docChunkerClient && !this.docChunkerV2Client) throw new Error('DOCUMENT_CHUNKER_BASE_URL não configurada.');
        try {
          const result = await track('CREATE_RETRIEVAL_CHUNKS', async () => {
            const reusable = await findReusableDoclingChunks(document.id, contentHash, 'hybrid-v1');
            const parseRunStore = env.DOCUMENT_VISUAL_ASSETS_ENABLED ? new PrismaDocumentParseRunStore() : null;
            const visualRunKey = env.DOCUMENT_VISUAL_ASSETS_ENABLED
              ? createHash('sha256').update([document.id, contentHash, 'doc-chunker-v2', 'hybrid-v1'].join(':')).digest('hex')
              : null;
            const visualRun = visualRunKey ? await parseRunStore!.findByIdempotencyKey(visualRunKey) : null;
            if (reusable.reusable && (!env.DOCUMENT_VISUAL_ASSETS_ENABLED
                || visualRun?.status === 'COMPLETED' || visualRun?.status === 'COMPLETED_WITH_WARNINGS')) {
              if (env.DOCUMENT_VISUAL_ASSETS_ENABLED && visualRun) {
                visualParseRunId = visualRun.parseRunId;
                await this.documentVisualLinkingService?.linkVisualAssetsToChunks(
                  visualRun.parseRunId, reusable.chunks.map((chunk) => ({
                    id: chunk.id, text: chunk.content,
                    pages: Array.isArray(chunk.pages) ? chunk.pages.filter((page): page is number => typeof page === 'number') : [],
                    provenance: normalizeVisualProvenance(chunk.provenance),
                  })),
                );
              }
              return { chunkCount: reusable.chunkCount, reused: true };
            }
            const requestId = randomUUID();
            await updateDocumentProcessingStage(document.id, 'CREATE_RETRIEVAL_CHUNKS', 'DOC_CHUNKER_HTTP', requestId, env.DOCUMENT_CHUNKER_REQUEST_TIMEOUT_MS);
            const input = {
              documentId: document.id, expectedSha256: contentHash,
              fileName: document.originalName, mimeType: document.mimeType, fileBytes: pdfBytes,
              requestId,
            };
            let parsed: {
              doc_hash: string; engine: 'docling'; tokenizer_id: string; chunker_version: string;
              page_count: number; chunks: Array<{
                index: number; text: string; raw_text: string; headings: string[]; pages: number[];
                type: 'text' | 'table' | 'formula' | 'mixed'; tokens: number; provenance: Array<Record<string, unknown>>;
              }>;
            };
            if (env.DOCUMENT_VISUAL_ASSETS_ENABLED) {
              if (!this.docChunkerV2Client || !this.documentVisualAssetRepository) {
                throw new Error('A extração visual foi ativada sem cliente v2 ou persistência de assets configurados.');
              }
              const visualResult = await this.docChunkerV2Client.chunkWithAssets(input);
              const activeParseRunStore = parseRunStore ?? new PrismaDocumentParseRunStore();
              const idempotencyKey = visualRunKey!;
              const now = new Date().toISOString();
              await activeParseRunStore.save({
                parseRunId: randomUUID(), documentId: document.id, contentHash,
                parser: 'DOCLING', parserBackend: 'pipeline', parserVersion: visualResult.parserVersion,
                modelVersion: visualResult.tokenizerId, layoutSchemaVersion: 'doc-chunker/v2',
                configurationHash: visualResult.chunkerVersion, idempotencyKey,
                status: 'PROCESSING', createdAt: now, updatedAt: now,
              });
              const parseRun = await activeParseRunStore.findByIdempotencyKey(idempotencyKey);
              if (!parseRun) throw new Error('Não foi possível recuperar o parse run Docling após a criação.');
              visualParseRunId = parseRun.parseRunId;
              try {
                const persistedVisualAssets = await this.documentVisualAssetRepository.persistVisualParseRun({
                  documentId: document.id, parseRunId: parseRun.parseRunId,
                  docHash: visualResult.docHash, assets: visualResult.assets,
                });
                if (this.documentVisualIndexingService) {
                  const indexResults = await Promise.allSettled(Object.values(persistedVisualAssets.assetIdsByKey)
                    .map((assetId) => this.documentVisualIndexingService!.describeAndIndexAsset(assetId)));
                  const indexFailures = indexResults.filter((result) => result.status === 'rejected').length;
                  console.log('Indexação das imagens do documento concluída', {
                    event: 'document_visual_assets.indexing_completed', documentId: document.id,
                    parseRunId: parseRun.parseRunId, assetCount: indexResults.length, failureCount: indexFailures,
                  });
                }
                await activeParseRunStore.update(parseRun.parseRunId, {
                  status: visualResult.warnings.length ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED',
                });
              } catch (error) {
                await activeParseRunStore.update(parseRun.parseRunId, {
                  status: 'FAILED', errorCode: 'VISUAL_ASSET_PERSIST_FAILED',
                }).catch(() => undefined);
                throw error;
              }
              parsed = {
                doc_hash: visualResult.docHash, engine: visualResult.engine,
                tokenizer_id: visualResult.tokenizerId, chunker_version: visualResult.chunkerVersion,
                page_count: visualResult.pageCount, chunks: visualResult.chunks,
              };
              console.log('Assets visuais privados persistidos', {
                event: 'document_visual_assets.persist_completed', documentId: document.id,
                parseRunId: parseRun.parseRunId, assetCount: visualResult.assets.length,
                warningCount: visualResult.warnings.length,
              });
            } else {
              if (!this.docChunkerClient) throw new Error('DOCUMENT_CHUNKER_BASE_URL não configurada.');
              const legacyResult = await this.docChunkerClient.chunk(input);
              parsed = {
                doc_hash: legacyResult.doc_hash, engine: legacyResult.engine,
                tokenizer_id: legacyResult.tokenizer_id, chunker_version: legacyResult.chunker_version,
                page_count: legacyResult.page_count, chunks: legacyResult.chunks,
              };
            }
            await updateDocumentProcessingStage(document.id, 'CREATE_RETRIEVAL_CHUNKS', 'PERSIST_DOC_CHUNKS', requestId, 30_000);
            const saved = await this.saveDoclingChunks(document.id, {
              expectedHash: parsed.doc_hash, engine: parsed.engine, tokenizerId: parsed.tokenizer_id,
              chunkerVersion: parsed.chunker_version, pageCount: parsed.page_count,
              chunks: parsed.chunks.map((chunk) => ({
                index: chunk.index, text: chunk.text, rawText: chunk.raw_text,
                headings: chunk.headings, pages: chunk.pages, type: chunk.type,
                tokens: chunk.tokens, provenance: chunk.provenance,
              })),
            });
            if (visualParseRunId && this.documentVisualLinkingService) {
              const linked = await this.documentVisualLinkingService.linkVisualAssetsToChunks(
                visualParseRunId,
                parsed.chunks.flatMap((chunk, index) => {
                  const id = saved.chunkIds[index];
                  return id ? [{ id, text: chunk.text, pages: chunk.pages, provenance: chunk.provenance as Array<Record<string, unknown>> }] : [];
                }),
              );
              console.log('Vínculos de imagens aos chunks calculados', {
                event: 'document_visual_assets.chunk_links_summary', documentId: document.id,
                parseRunId: visualParseRunId, linkedCount: linked.linked.length,
                ambiguousCount: linked.ambiguous.length, missingCount: linked.missing.length,
              });
            }
            return { chunkCount: saved.savedCount, reused: saved.reused };
          }, { engine: 'docling', contentHash, sourceMode: env.DOCUMENT_TEXT_SOURCE });
          doclingChunksPersisted = true;
          console.log('Chunks Docling persistidos', {
            event: 'document_chunks.persist_completed', documentId: document.id,
            chunkCount: result.chunkCount, reused: result.reused,
            engine: 'docling', sourceMode: env.DOCUMENT_TEXT_SOURCE,
          });
        } catch (error) {
          if (env.DOCUMENT_TEXT_SOURCE !== 'auto' || !isEligibleDocChunkerFallback(error)) throw error;
          console.warn('Doc-chunker falhou; usando PDF.js para esta tentativa', {
            event: 'document_chunker.fallback_started', documentId: document.id,
            errorCode: error instanceof DocChunkerClientError ? error.code : 'DOC_CHUNKER_ERROR',
          });
          doclingFallbackOccurred = true;
        }
      }

      if (doclingChunksPersisted) {
        await this.skipOperations(document.id, ['EXTRACT_TEXT', 'NORMALIZE_TEXT', 'DETECT_BLOCKS'], 'docling_chunks_persisted');
        try {
          await track('GENERATE_CHUNK_EMBEDDINGS', () => this.embeddingService.processDocument(document.id), {
            embeddingModel: 'configured-openrouter-model', source: 'docling',
          });
        } catch (error) {
          console.warn('Embeddings Docling pendentes; retry continuará pelos chunks persistidos', {
            event: 'document_embeddings.failed', documentId: document.id,
            engine: 'docling', retryable: true,
          });
          throw error;
        }
        if (shouldGenerateTopicProfile(document.tag, document.topicId)) {
          try {
            await this.measureStage(document.id, 'GENERATE_TOPIC_PROFILE',
              () => this.topicProfileGenerationService.processTopic(document.topicId!), context, { profileScope: 'TOPIC' });
          } catch (error) {
            console.warn('Perfil do tópico não foi gerado; processamento continuará', {
              event: 'monitor.topic_profile_generation_failed_non_blocking', documentId: document.id, error,
            });
          }
        }
        await this.skipOperations(document.id, [
          'EXTRACT_QUESTIONS_TO_PENDING_REVIEW', 'MATCH_ANSWER_KEYS', 'GENERATE_FLASHCARD_CANDIDATES',
        ], 'document_tag_knowledge_base');
      }

      if (this.documentIngestionV3Service && env.DOCUMENT_TEXT_SOURCE === 'pdfjs' && shouldProcessDocumentContent(document.tag)) {
        try {
          console.log('Enviando PDF ao Docling para extracao de layout', {
            event: 'monitor.document_ingestion_v3_started',
            documentId: document.id,
            parser: 'DOCLING',
            sizeBytes: pdfBytes.byteLength,
          });
          const v3Result = await this.measureStage(
            document.id,
            'PARSE_DOCLING',
            () => this.documentIngestionV3Service!.processDocument({
              documentId: document.id,
              storagePath: document.storagePath,
              originalName: document.originalName,
              mimeType: document.mimeType,
              sizeBytes: document.sizeBytes,
              contentHash,
              fileBytes: pdfBytes,
              backend: 'pipeline',
              parserVersion: 'docling-v3',
              modelVersion: 'docling-layout-v3',
              configurationHash: `worker:${DOCUMENT_PROCESSING_VERSION}`,
              schemaVersion: 'layout-v1',
            }),
            context,
            { parser: 'DOCLING', sizeBytes: pdfBytes.byteLength },
          );
          console.log('Shadow parser V3 executado', {
            event: 'monitor.document_ingestion_v3_shadow_completed',
            documentId: document.id,
            parseRunId: v3Result.parseRunId,
            status: v3Result.status,
            layoutPersisted: v3Result.layoutPersisted,
            fallbackReason: v3Result.fallbackReason ?? null,
          });
          if (v3Result.status === 'FALLBACK_REQUIRED') {
            throw new Error(v3Result.fallbackReason ?? 'Docling solicitou fallback.');
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await markDocumentFailed(document.id, `Docling falhou; extração legada desativada: ${errorMessage}`);
          console.log('Docling falhou; processamento interrompido sem fallback legado', {
            event: 'monitor.document_ingestion_v3_failed_processing_paused',
            documentId: document.id,
            errorMessage,
            error,
          });
          throw error;
        }
      }

      if (shouldProcessDocumentContent(document.tag) && !doclingChunksPersisted) {
        console.log('Iniciando extracao de texto da base de conhecimento', {
          event: 'monitor.document_text_extraction_started',
          documentId: document.id,
        });

        const parsedPdf = await track(
          'EXTRACT_TEXT',
          async () => {
            const pages = await extractPdfPagesWithLayout(pdfBytes);
            return {
              total: pages.length,
              pages: pages.map((page) => ({
                num: page.num,
                text: page.text,
                hasImages: page.hasImages,
                imageCount: page.imageCount,
              })),
              text: pages.map((page) => page.text).join('\n\n'),
            };
          },
          { mimeType: document.mimeType, sizeBytes: document.sizeBytes },
        );

        console.log('Texto extraido do documento', {
          event: 'monitor.document_text_extraction_completed',
          documentId: document.id,
          textChars: parsedPdf.text.length,
          pageCount: parsedPdf.total,
          parsedPageCount: parsedPdf.pages.length,
        });

        const textExtraction = await track(
          'NORMALIZE_TEXT',
          () => this.documentTextExtractionService.process(document.id, parsedPdf, document.sizeBytes),
          { extractionVersion: 'pdf-layout-v2-column-aware' },
        );

        await completeDocumentProcessingJob(document.id, 'EXTRACT_TEXT', {
          textChars: parsedPdf.text.length,
          pageCount: parsedPdf.total,
        });

        if (textExtraction.quality === 'FAILED') {
          throw new Error('Nao foi possivel extrair texto do PDF.');
        }

        if (textExtraction.quality === 'NEEDS_OCR') {
          await markDocumentNeedsOcr(document.id);
          await this.skipOperations(document.id, [
            'DETECT_BLOCKS',
            'CREATE_RETRIEVAL_CHUNKS',
            'GENERATE_CHUNK_EMBEDDINGS',
            'EXTRACT_QUESTIONS_TO_PENDING_REVIEW',
            'MATCH_ANSWER_KEYS',
            'GENERATE_FLASHCARD_CANDIDATES',
            'READY_FOR_REVIEW',
          ], 'document_requires_ocr');
          console.log('Processamento interrompido: documento precisa de OCR', {
            event: 'monitor.document_processing_needs_ocr',
            documentId: document.id,
            documentTextId: textExtraction.documentTextId,
          });
          return;
        }

        const blockResult = await track(
          'DETECT_BLOCKS',
          () => this.documentBlockDetectionService.process(document.id, textExtraction.documentTextId),
          { documentTextId: textExtraction.documentTextId },
        );
        console.log('Blocos estruturais prontos antes do chunking', {
          event: 'monitor.document_blocks_ready_for_chunking',
          documentId: document.id,
          documentTextId: textExtraction.documentTextId,
          blockCount: blockResult.blockCount,
          typeCounts: blockResult.typeCounts,
        });

        const legacyChunkResult = await track(
          'CREATE_RETRIEVAL_CHUNKS',
          () => this.chunkService.processDocument(document.id, textExtraction.documentTextId),
          { documentTextId: textExtraction.documentTextId },
        );
        if (doclingFallbackOccurred) {
          console.log('Fallback PDF.js concluído', {
            event: 'document_chunker.fallback_completed', documentId: document.id,
            effectiveEngine: 'pdfjs', chunkCount: Number((legacyChunkResult as { chunkCount?: number })?.chunkCount ?? 0),
          });
        }

        let embeddingResult = { chunkCount: 0, batchCount: 0 };
        let embeddingsSucceeded = false;
        try {
          embeddingResult = await track(
            'GENERATE_CHUNK_EMBEDDINGS',
            () => this.embeddingService.processDocument(document.id),
            { embeddingModel: 'configured-openrouter-model' },
          );
          embeddingsSucceeded = embeddingResult.chunkCount > 0;
          console.log('Chunks da base de conhecimento vetorizados', {
            event: 'monitor.document_embeddings_saved',
            documentId: document.id,
            chunkCount: embeddingResult.chunkCount,
            batchCount: embeddingResult.batchCount,
            embeddingStatus: 'READY',
          });
        } catch (error) {
          nonBlockingFailures.push({ operation: 'GENERATE_CHUNK_EMBEDDINGS', error });
          console.log('Embeddings indisponiveis; processamento textual e questoes continuarao', {
            event: 'monitor.document_embeddings_failed_non_blocking',
            documentId: document.id,
            error,
          });
        }

        if (shouldGenerateTopicProfile(document.tag, document.topicId)) {
          try {
            await this.measureStage(
              document.id,
              'GENERATE_TOPIC_PROFILE',
              () => this.topicProfileGenerationService.processTopic(document.topicId!),
              context,
              { profileScope: 'TOPIC' },
            );
          } catch (error) {
            console.log('Perfil do topico nao foi gerado; processamento continuara', {
              event: 'monitor.topic_profile_generation_failed_non_blocking',
              documentId: document.id,
              topicId: document.topicId,
              subjectId: document.subjectId,
              error,
            });
          }
        }

        if (shouldExtractQuestionsForDocument(document.tag)) {
          try {
            const questionResult = await track(
              'EXTRACT_QUESTIONS_TO_PENDING_REVIEW',
              () => this.questionExtractionService.processDocument(document.id),
              { documentTag: document.tag },
            );
            const flashcardResult = await track(
              'MATCH_ANSWER_KEYS',
              async () => undefined,
              { integratedInto: 'EXTRACT_QUESTIONS_TO_PENDING_REVIEW', questionResult: 'completed' },
            );
          } catch (error) {
            nonBlockingFailures.push({ operation: 'EXTRACT_QUESTIONS_TO_PENDING_REVIEW', error });
            await skipDocumentProcessingJob(
              document.id,
              'MATCH_ANSWER_KEYS',
              { reason: 'question_extraction_failed_non_blocking' },
            );
            console.log('Agente de questoes falhou, documento continua pronto', {
              event: 'monitor.question_extraction_failed_non_blocking',
              documentId: document.id,
              error,
            });
          }
        } else if (document.tag === 'KNOWLEDGE_BASE') {
          await this.skipOperations(document.id, [
            'EXTRACT_QUESTIONS_TO_PENDING_REVIEW',
            'MATCH_ANSWER_KEYS',
          ], 'document_tag_knowledge_base');
        }

        if (document.tag === 'FLASHCARDS') {
          if (shouldGenerateFlashcardsAfterEmbeddings(document.tag, embeddingsSucceeded, embeddingResult.chunkCount)) {
            const flashcardResult = await track(
              'GENERATE_FLASHCARD_CANDIDATES',
              () => this.flashcardGenerationService.processDocument(document.id, this.flashcardConcurrency),
              { documentTag: document.tag, concurrency: this.flashcardConcurrency, embeddingChunkCount: embeddingResult.chunkCount },
            );
            if (flashcardResult.status !== 'READY') nonBlockingFailures.push({ operation: 'GENERATE_FLASHCARD_CANDIDATES', error: new Error(flashcardResult.status) });
          } else {
            await skipDocumentProcessingJob(document.id, 'GENERATE_FLASHCARD_CANDIDATES', {
              reason: 'embeddings_failed_this_execution',
            });
          }
        } else {
          await skipDocumentProcessingJob(document.id, 'GENERATE_FLASHCARD_CANDIDATES', {
            reason: 'automatic_flashcard_generation_disabled',
          });
        }

        if (document.tag === 'FLASHCARDS') {
          await this.skipOperations(document.id, [
            'EXTRACT_QUESTIONS_TO_PENDING_REVIEW',
            'MATCH_ANSWER_KEYS',
          ], 'document_tag_flashcards');
        }

      }

      if (!shouldProcessDocumentContent(document.tag)) {
        await this.skipOperations(document.id, [
          'EXTRACT_TEXT',
          'NORMALIZE_TEXT',
          'DETECT_BLOCKS',
          'CREATE_RETRIEVAL_CHUNKS',
          'GENERATE_CHUNK_EMBEDDINGS',
          'EXTRACT_QUESTIONS_TO_PENDING_REVIEW',
          'MATCH_ANSWER_KEYS',
          'GENERATE_FLASHCARD_CANDIDATES',
        ], `document_tag_${document.tag.toLowerCase()}_not_supported_yet`);
      }

      const documentStatus = resolveDocumentStatus(nonBlockingFailures);
      if (documentStatus === 'PARTIAL_SUCCESS') {
        const failedOperations = nonBlockingFailures.map(({ operation }) => operation);
        await markDocumentPartialSuccess(
          document.id,
          `Operacoes pendentes: ${failedOperations.join(', ')}`,
        );
      } else {
        await markDocumentReady(document.id);
      }
      await track(
        'READY_FOR_REVIEW',
        async () => undefined,
        { documentStatus },
      );

      console.log('Documento processado pelo worker', {
        event: 'monitor.document_worker_completed',
        documentId: document.id,
        mimeType: document.mimeType,
        expectedBytes: document.sizeBytes,
        downloadedBytes: data.size,
        durationMs: Date.now() - startedAt,
        status: documentStatus,
      });
      await appendProcessingTimeReport([
        `## Documento: ${document.originalName}`,
        `- Documento ID: \`${document.id}\``,
        `- Status: ${documentStatus}`,
        `- Iniciado em: ${new Date(startedAt).toISOString()}`,
        `- Finalizado em: ${new Date().toISOString()}`,
        `- Tempo total: ${formatDuration(Date.now() - startedAt)}`,
        `- Falhas nao bloqueantes: ${nonBlockingFailures.length}`,
      ].join('\n'));
    } catch (error) {
      await markDocumentFailed(
        document.id,
        error instanceof Error ? error.message : String(error),
      );
      console.log('Erro no processamento do documento pelo worker', {
        event: 'monitor.document_processing_failed',
        documentId: document.id,
        durationMs: Date.now() - startedAt,
        error,
      });
      await appendProcessingTimeReport([
        `## Documento: ${document.originalName}`,
        `- Documento ID: \`${document.id}\``,
        '- Status: FAILED',
        `- Iniciado em: ${new Date(startedAt).toISOString()}`,
        `- Finalizado em: ${new Date().toISOString()}`,
        `- Tempo total: ${formatDuration(Date.now() - startedAt)}`,
        `- Erro: ${error instanceof Error ? error.message : String(error)}`,
      ].join('\n'));
      throw error;
    }
  }

  private async processVisualAssetsOnly(
    document: { id: string; originalName: string; mimeType: string },
    fileBytes: Uint8Array,
    contentHash: string,
  ) {
    if (!this.docChunkerV2Client || !this.documentVisualAssetRepository) {
      throw new Error('Cliente v2 ou persistência de assets visuais não configurados.');
    }
    const idempotencyKey = createHash('sha256')
      .update([document.id, contentHash, 'doc-chunker-v2', 'hybrid-v1'].join(':')).digest('hex');
    const store = new PrismaDocumentParseRunStore();
    const existing = await store.findByIdempotencyKey(idempotencyKey);
    if (existing?.status === 'COMPLETED' || existing?.status === 'COMPLETED_WITH_WARNINGS') {
      return { parseRunId: existing.parseRunId, assetCount: 0, warningCount: 0, reused: true };
    }

    const requestId = randomUUID();
    const visual = await this.docChunkerV2Client.chunkWithAssets({
      documentId: document.id, expectedSha256: contentHash, fileName: document.originalName,
      mimeType: document.mimeType, fileBytes, requestId,
    });
    const now = new Date().toISOString();
    await store.save({
      parseRunId: existing?.parseRunId ?? randomUUID(), documentId: document.id, contentHash,
      parser: 'DOCLING', parserBackend: 'pipeline', parserVersion: visual.parserVersion,
      modelVersion: visual.tokenizerId, layoutSchemaVersion: 'doc-chunker/v2',
      configurationHash: visual.chunkerVersion, idempotencyKey, status: 'PROCESSING',
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    });
    const parseRun = await store.findByIdempotencyKey(idempotencyKey);
    if (!parseRun) throw new Error('Não foi possível recuperar o parse run após o processamento visual.');
    try {
      await this.documentVisualAssetRepository.persistVisualParseRun({
        documentId: document.id, parseRunId: parseRun.parseRunId,
        docHash: visual.docHash, assets: visual.assets,
      });
      await store.update(parseRun.parseRunId, { status: visual.warnings.length ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED' });
    } catch (error) {
      await store.update(parseRun.parseRunId, { status: 'FAILED', errorCode: 'VISUAL_ASSET_PERSIST_FAILED' }).catch(() => undefined);
      throw error;
    }
    return { parseRunId: parseRun.parseRunId, assetCount: visual.assets.length, warningCount: visual.warnings.length, reused: false };
  }

  private async skipOperations(
    documentId: string,
    operations: DocumentProcessingOperation[],
    reason: string,
  ) {
    for (const operation of operations) {
      await skipDocumentProcessingJob(documentId, operation, { reason });
    }
  }

  private async runTrackedOperation<T>(
    documentId: string,
    operation: DocumentProcessingOperation,
    action: () => Promise<T>,
    inputSnapshot?: Prisma.InputJsonValue,
    context: DocumentWorkerContext = {},
  ) {
    const startedAt = Date.now();
    const monotonicStartedAt = performance.now();
    await startDocumentProcessingJob(documentId, operation, inputSnapshot);
    const requestId = randomUUID();
    await updateDocumentProcessingStage(
      documentId, operation, operation, requestId, env.DOCUMENT_CHUNKER_REQUEST_TIMEOUT_MS,
    );
    console.log('Etapa do documento iniciada', {
      event: 'document_processing_stage.started', timestamp: new Date().toISOString(), service: 'worker',
      request_id: requestId, document_id: documentId, job_id: context.jobId ?? null,
      job_attempt: context.attempt ?? null, stage: operation,
    });
    try {
      const result = await action();
      const outputSummary = sanitizeFlashcardOutputSummary(result);
      const finishedAt = Date.now();
      outputSummary.durationMs = Math.round(performance.now() - monotonicStartedAt);
      const operationStatus = resolveTrackedOperationStatus(result);
      if (operationStatus === 'FAILED' || operationStatus === 'PARTIAL_SUCCESS') {
        outputSummary.status = operationStatus;
        if (operationStatus === 'FAILED') {
          await failDocumentProcessingJob(documentId, operation, new Error('Falha total na geracao de flashcards.'), outputSummary);
          await appendProcessingStageReport({
            documentId,
            stage: operation,
            status: 'FAILED',
            startedAt: new Date(startedAt).toISOString(),
            finishedAt: new Date(finishedAt).toISOString(),
            durationMs: finishedAt - startedAt,
            attempt: context.attempt,
            jobId: context.jobId,
            details: stageDetails(outputSummary),
            error: 'Falha total na geracao de flashcards.',
          });
          return result;
        }
      }
      await completeDocumentProcessingJob(documentId, operation, {
        ...outputSummary,
      }, operationStatus === 'PARTIAL_SUCCESS' ? 'PARTIAL_SUCCESS' : 'READY');
      console.log('Etapa do documento concluída', {
        event: 'document_processing_stage.completed', timestamp: new Date().toISOString(), service: 'worker',
        request_id: requestId, document_id: documentId, job_id: context.jobId ?? null,
        job_attempt: context.attempt ?? null, stage: operation,
        outcome: operationStatus === 'PARTIAL_SUCCESS' ? 'partial_success' : 'completed',
        duration_ms: outputSummary.durationMs, ...stageDetails(outputSummary),
      });
      await appendProcessingStageReport({
        documentId,
        stage: operation,
        status: operationStatus === 'PARTIAL_SUCCESS' ? 'PARTIAL_SUCCESS' : 'READY',
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        durationMs: outputSummary.durationMs as number,
        attempt: context.attempt,
        jobId: context.jobId,
        details: stageDetails(outputSummary),
      });
      return result;
    } catch (error) {
      await failDocumentProcessingJob(documentId, operation, error);
      const finishedAt = Date.now();
      console.error('Etapa do documento falhou', {
        event: 'document_processing_stage.failed', timestamp: new Date().toISOString(), service: 'worker',
        request_id: requestId, document_id: documentId, job_id: context.jobId ?? null,
        job_attempt: context.attempt ?? null, stage: operation, outcome: 'failed',
        duration_ms: Math.round(performance.now() - monotonicStartedAt), error_code: error instanceof DocChunkerClientError ? error.code : 'DOCUMENT_PROCESSING_FAILED',
        error_class: error instanceof Error ? error.name : 'UnknownError',
      });
      console.log('Operacao de processamento falhou', {
        event: 'monitor.document_processing_operation_failed',
        documentId,
        operation,
        jobId: context.jobId,
        attempt: context.attempt,
        durationMs: finishedAt - startedAt,
        error,
      });
      await appendProcessingStageReport({
        documentId,
        stage: operation,
        status: 'FAILED',
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        durationMs: finishedAt - startedAt,
        attempt: context.attempt,
        jobId: context.jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async measureStage<T>(
    documentId: string,
    stage: string,
    action: () => Promise<T>,
    context: DocumentWorkerContext,
    details?: Record<string, string | number | boolean | null>,
  ) {
    const startedAt = Date.now();
    const monotonicStartedAt = performance.now();
    const requestId = randomUUID();
    console.log('Etapa auxiliar iniciada', {
      event: 'document_stage.started', timestamp: new Date().toISOString(), service: 'worker',
      request_id: requestId, document_id: documentId, job_id: context.jobId ?? null,
      job_attempt: context.attempt ?? null, stage,
    });
    try {
      const result = await action();
      const finishedAt = Date.now();
      console.log('Etapa auxiliar concluída', {
        event: 'document_stage.completed', timestamp: new Date().toISOString(), service: 'worker',
        request_id: requestId, document_id: documentId, job_id: context.jobId ?? null,
        job_attempt: context.attempt ?? null, stage, outcome: 'completed',
        duration_ms: Math.round(performance.now() - monotonicStartedAt),
      });
      await appendProcessingStageReport({
        documentId,
        stage,
        status: 'READY',
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        durationMs: finishedAt - startedAt,
        attempt: context.attempt,
        jobId: context.jobId,
        details,
      });
      return result;
    } catch (error) {
      const finishedAt = Date.now();
      console.error('Etapa auxiliar falhou', {
        event: 'document_stage.failed', timestamp: new Date().toISOString(), service: 'worker',
        request_id: requestId, document_id: documentId, job_id: context.jobId ?? null,
        job_attempt: context.attempt ?? null, stage, outcome: 'failed', duration_ms: finishedAt - startedAt,
        error_code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
        error_class: error instanceof Error ? error.name : 'UnknownError',
      });
      await appendProcessingStageReport({
        documentId,
        stage,
        status: 'FAILED',
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        durationMs: finishedAt - startedAt,
        attempt: context.attempt,
        jobId: context.jobId,
        details,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

function stageDetails(summary: Record<string, Prisma.InputJsonValue>) {
  const allowedKeys = [
    'chunkCount', 'batchCount', 'blockCount', 'questionCount', 'savedCount',
    'duplicateCount', 'candidateCount', 'status',
  ] as const;
  const details: Record<string, string | number | boolean | null> = {};
  for (const key of allowedKeys) {
    const value = summary[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      details[key] = value;
    }
  }
  return details;
}

export function isEligibleDocChunkerFallback(error: unknown): boolean {
  if (!(error instanceof DocChunkerClientError)) return false;
  if (error.statusCode !== undefined && error.statusCode >= 500) return true;
  return [
    'DOC_CHUNKER_NETWORK_ERROR', 'DOC_CHUNKER_TIMEOUT', 'DOC_CHUNKER_BODY_INTERRUPTED',
    'DOC_CHUNKER_INVALID_JSON', 'DOC_CHUNKER_INVALID_CONTRACT', 'DOC_CHUNKER_RESPONSE_TOO_LARGE',
  ].includes(error.code);
}

export function shouldUseDocChunker(tag: 'KNOWLEDGE_BASE' | 'QUESTIONS' | 'FLASHCARDS', source: 'pdfjs' | 'docling' | 'auto') {
  return tag === 'KNOWLEDGE_BASE' && source !== 'pdfjs';
}

export function shouldParseVisualAssets(tag: 'KNOWLEDGE_BASE' | 'QUESTIONS' | 'FLASHCARDS', enabled: boolean) {
  return enabled && (tag === 'KNOWLEDGE_BASE' || tag === 'QUESTIONS');
}

function normalizeVisualProvenance(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const source = entry as Record<string, unknown>;
    return [{
      ...(typeof source.page === 'number' ? { page: source.page } : {}),
      ...(typeof source.item_ref === 'string' ? { item_ref: source.item_ref } : {}),
      ...(typeof source.reading_order === 'number' ? { reading_order: source.reading_order } : {}),
      ...(Array.isArray(source.bbox) && source.bbox.length === 4 && source.bbox.every((part) => typeof part === 'number')
        ? { bbox: source.bbox as number[] } : {}),
    }];
  });
}
