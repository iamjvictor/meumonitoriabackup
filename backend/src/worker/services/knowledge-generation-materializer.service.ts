import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { KnowledgeGenerationRepository, type KnowledgeGenerationScope } from '../../repositories/knowledge-generation.repository.js';
import { OpenRouterClient } from '../client/openrouter.client.js';
import { DocumentVisualIndexingService } from './document-visual-indexing.service.js';
import { assembleKnowledgeChunks, type KnowledgeLayoutPage } from './knowledge-document.assembler.js';

const ARTIFACT_BUCKET = 'document-parser-artifacts';
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const EMBEDDING_VERSION = 'knowledge-generation-v1';

type Storage = {
  upload(path: string, body: Buffer, options: { contentType: string; upsert: boolean }): Promise<{ error: unknown | null }>;
  download(path: string): Promise<{ data: Blob | null; error: unknown | null }>;
};

type BatchRecord = {
  id: string;
  runId?: string;
  pageStart: number;
  pageEnd: number;
  batchKey: string;
  checkpointSourceRunId?: string | null;
  status: string;
  artifactPath: string | null;
  artifactChecksum: string | null;
  manifest: unknown;
};

type SourceCheckpoint = {
  run: {
    id: string; documentId: string; teacherId: string; monitorId: string;
    contentHash: string; configurationHash: string; parserVersion: string; pageCount: number;
  };
  batch: BatchRecord;
};

type BatchManifest = {
  schemaVersion: string;
  documentId: string;
  runId: string;
  contentHash: string;
  configurationHash: string;
  parserVersion: string;
  pageStart: number;
  pageEnd: number;
  status: string;
  pages: Array<{
    pageNumber: number;
    status: string;
    characterCount: number;
    layoutItemCount: number;
    imageCount: number;
    errors: string[];
    blankEvidence?: string;
  }>;
  files: Array<{ path: string; sha256: string }>;
  visualAssets?: Array<{
    asset_key: string;
    asset_kind: string;
    source_item_ref: string;
    reading_order: number;
    page_number: number;
    bbox: number[] | null;
    coord_origin: string | null;
    caption: string | null;
    mime_type: string;
    width: number;
    height: number;
    sha256: string;
  }>;
};

type GenerationAsset = {
  id: string;
  assetKey: string;
  sourceKey: string;
  batchKey: string;
  sourceItemRef: string;
  readingOrder: number;
  pageNumber: number;
  assetKind: 'FIGURE' | 'PAGE';
  bbox: number[] | null;
  coordOrigin: string | null;
  caption: string | null;
  mimeType: string;
  width: number;
  height: number;
  checksum: string;
  storagePath: string;
  bytes: Buffer;
};

/** Reads durable checkpoints, builds generation-scoped chunks/assets, indexes them, then swaps the active pointer. */
export class KnowledgeGenerationMaterializerService {
  constructor(private readonly dependencies: {
    storage?: Storage;
    embeddings?: Pick<OpenRouterClient, 'createEmbeddings'>;
    indexVisualAsset?: (assetId: string) => Promise<unknown>;
    generations?: KnowledgeGenerationRepository;
  } = {}) {}

  async materializeAndPublish(input: KnowledgeGenerationScope & { runId: string }) {
    if (!env.KNOWLEDGE_BATCH_PROCESSING_ENABLED) throw new Error('A publicação de gerações de conhecimento está desativada.');
    const run = await prisma.knowledgeProcessingRun.findFirst({
      where: {
        id: input.runId,
        documentId: input.documentId,
        teacherId: input.teacherId,
        monitorId: input.monitorId,
      },
      include: { batches: { orderBy: { pageStart: 'asc' } } },
    });
    if (!run) throw new Error('Execução de conhecimento não encontrada no escopo informado.');

    const existing = await prisma.knowledgeDocumentGeneration.findUnique({ where: { runId: input.runId } });
    if (run.status === 'COMPLETED' && existing?.status === 'ACTIVE') {
      return { generationId: existing.id, status: 'COMPLETED' as const, pageCount: run.pageCount, chunkCount: await prisma.documentChunk.count({ where: { generationId: existing.id } }), assetCount: await prisma.documentVisualAsset.count({ where: { generationId: existing.id } }) };
    }
    if (run.status !== 'READY_TO_PUBLISH') throw new Error('Execução ainda não concluiu todos os checkpoints para publicação.');
    const batches = run.batches as BatchRecord[];
    const document = await prisma.monitorDocument.findFirst({
      where: { id: input.documentId, teacherId: input.teacherId, monitorId: input.monitorId },
      select: { id: true, subjectId: true, tag: true, activeGenerationId: true, topicLinks: { select: { topicId: true } } },
    });
    if (!document) throw new Error('Documento não pertence ao escopo solicitado.');
    if (document.tag !== 'KNOWLEDGE_BASE') throw new Error('Gerações recuperáveis só podem ser publicadas para KNOWLEDGE_BASE.');
    const expectedActiveGenerationId = document.activeGenerationId;
    const storage = this.dependencies.storage ?? supabaseAdmin.storage.from(ARTIFACT_BUCKET) as unknown as Storage;
    const generationRepository = this.dependencies.generations ?? new KnowledgeGenerationRepository();

    const generation = await generationRepository.createStagingGeneration(input);
    if (generation.status === 'ACTIVE') {
      return { generationId: generation.id, status: 'COMPLETED' as const, pageCount: run.pageCount, chunkCount: await prisma.documentChunk.count({ where: { generationId: generation.id } }), assetCount: await prisma.documentVisualAsset.count({ where: { generationId: generation.id } }) };
    }

    const leaseOwner = randomUUID();
    const leaseSeconds = 120;
    if (!await generationRepository.acquireGenerationLease(generation.id, leaseOwner, leaseSeconds)) {
      throw new Error('Outra execução já está materializando esta geração.');
    }
    let heartbeatCheck: Promise<boolean> = Promise.resolve(true);
    const heartbeatTimer = setInterval(() => {
      heartbeatCheck = heartbeatCheck
        .then((valid) => valid && generationRepository.heartbeatGenerationLease(generation.id, leaseOwner, leaseSeconds))
        .catch(() => false);
    }, 30_000);
    const assertLease = async () => {
      if (!await heartbeatCheck) throw new Error('Lease de materialização expirou; geração staging permanecerá invisível.');
    };

    try {

    const assembled = await loadAndAssembleCheckpoints({
      batches, documentId: input.documentId, runId: input.runId, pageCount: run.pageCount,
      contentHash: run.contentHash, configurationHash: run.configurationHash, parserVersion: run.parserVersion,
      teacherId: input.teacherId, monitorId: input.monitorId,
      resolveSourceCheckpoint: async (sourceRunId, batchKey) => {
        const [sourceRun, sourceBatch] = await Promise.all([
          prisma.knowledgeProcessingRun.findFirst({ where: { id: sourceRunId } }),
          prisma.knowledgeProcessingBatch.findFirst({ where: { runId: sourceRunId, batchKey } }),
        ]);
        if (!sourceRun || !sourceBatch) return null;
        return {
          run: {
            id: sourceRun.id, documentId: sourceRun.documentId, teacherId: sourceRun.teacherId,
            monitorId: sourceRun.monitorId, contentHash: sourceRun.contentHash,
            configurationHash: sourceRun.configurationHash, parserVersion: sourceRun.parserVersion,
            pageCount: sourceRun.pageCount,
          },
          batch: sourceBatch as BatchRecord,
        };
      },
      storage,
    });
    await assertLease();
    const parseRunId = stableUuid(`${generation.id}:visual-parse-run`);
    await ensureParseRun({
      parseRunId, documentId: input.documentId, runId: input.runId, contentHash: run.contentHash,
      configurationHash: run.configurationHash, parserVersion: run.parserVersion, schemaVersion: 'docling-layout-v1',
    });

    const chunks = assembleKnowledgeChunks(assembled.pages);
    if (chunks.length === 0 && assembled.assets.length === 0) throw new Error('O documento não possui texto indexável nem assets visuais comprovados.');
    await persistAndEmbedChunks({
      generationId: generation.id, documentId: input.documentId, teacherId: input.teacherId,
      monitorId: input.monitorId, subjectId: document.subjectId, topicIds: document.topicLinks.map(({ topicId }) => topicId),
      docHash: run.contentHash, chunks,
      embeddings: this.dependencies.embeddings ?? new OpenRouterClient(),
    });
    await assertLease();
    await persistVisualAssets({
      generationId: generation.id, documentId: input.documentId, teacherId: input.teacherId,
      monitorId: input.monitorId, parseRunId, assets: assembled.assets, storage,
    });
    await linkAssetsToChunks(generation.id, chunks, assembled.assets);

    const indexVisual = this.dependencies.indexVisualAsset
      ?? ((assetId: string) => new DocumentVisualIndexingService().describeAndIndexAsset(assetId));
    const assetsToIndex = await prisma.$queryRaw<Array<{ visualAssetId: string }>>(Prisma.sql`
      SELECT dva.id AS "visualAssetId"
      FROM document_visual_assets dva
      LEFT JOIN document_visual_asset_indexes dvi ON dvi.visual_asset_id = dva.id
      WHERE dva.document_id = ${input.documentId}::uuid
        AND dva.generation_id = ${generation.id}::uuid
        AND (dvi.visual_asset_id IS NULL OR dvi.description_status <> 'READY' OR dvi.embedding IS NULL
          OR dvi.embedding_model IS DISTINCT FROM ${env.OPENROUTER_EMBEDDING_MODEL})
      ORDER BY dva.page_number, dva.id
    `);
    for (const { visualAssetId } of assetsToIndex) await indexVisual(visualAssetId);
    await assertLease();

    const metricsSaved = await prisma.knowledgeDocumentGeneration.updateMany({
      where: { id: generation.id, status: 'STAGING', leaseOwner },
      data: { pageCount: assembled.pages.length, chunkCount: chunks.length, assetCount: assembled.assets.length },
    });
    if (metricsSaved.count !== 1) throw new Error('Lease de materialização expirou antes de registrar cobertura e contagens.');

    const published = await generationRepository.activateGeneration({
      ...input,
      generationId: generation.id,
      expectedActiveGenerationId,
      leaseOwner,
      embeddingModel: env.OPENROUTER_EMBEDDING_MODEL,
    });
    if (!published) throw new Error('Outra publicação alterou a geração ativa; nenhum ponteiro foi trocado por esta execução.');

    return {
      generationId: generation.id,
      status: 'COMPLETED' as const,
      pageCount: run.pageCount,
      chunkCount: chunks.length,
      assetCount: assembled.assets.length,
      verifiedBlankPages: assembled.verifiedBlankPages,
      coveredPages: assembled.pages.length,
    };
    } finally {
      clearInterval(heartbeatTimer);
      await heartbeatCheck;
      await generationRepository.releaseGenerationLease(generation.id, leaseOwner).catch(() => false);
    }
  }
}

export async function loadAndAssembleCheckpoints(input: {
  batches: BatchRecord[];
  documentId: string;
  runId: string;
  pageCount: number;
  contentHash: string;
  configurationHash: string;
  parserVersion: string;
  teacherId?: string;
  monitorId?: string;
  resolveSourceCheckpoint?: (sourceRunId: string, batchKey: string) => Promise<SourceCheckpoint | null>;
  storage: Storage;
}) {
  if (!Number.isInteger(input.pageCount) || input.pageCount < 1) throw new Error('A execução tem contagem de páginas inválida.');
  if (input.batches.length === 0) throw new Error('A execução não possui checkpoints.');
  const pages = new Map<number, { page: KnowledgeLayoutPage; batchKey: string }>();
  const assets: GenerationAsset[] = [];
  const verifiedBlankPages: number[] = [];
  let expectedPage = 1;
  let schemaVersion: string | null = null;

  for (const batch of input.batches) {
    if (batch.status !== 'COMPLETED' || !batch.artifactPath || !batch.artifactChecksum) throw new Error('Execução contém checkpoint não concluído ou sem checksum.');
    if (batch.runId !== undefined && batch.runId !== input.runId) throw new Error('Checkpoint não pertence à execução solicitada.');
    if (!/^[a-f0-9]{64}$/i.test(batch.artifactChecksum)) throw new Error('Checksum do checkpoint possui formato inválido.');
    if (batch.pageStart !== expectedPage || batch.pageEnd < batch.pageStart || batch.pageEnd > input.pageCount) throw new Error('Os checkpoints não cobrem páginas contíguas sem lacunas ou sobreposição.');
    expectedPage = batch.pageEnd + 1;
    if (!isSafeArtifactPath(batch.artifactPath)) throw new Error('Caminho de checkpoint inválido.');
    const manifest = parseBatchManifest(batch.manifest);
    const sourceRunId = batch.checkpointSourceRunId ?? input.runId;
    if (manifest.runId !== sourceRunId) throw new Error('Manifest não corresponde à execução de origem declarada pelo checkpoint.');
    validateManifestIdentity(manifest, batch, {
      runId: sourceRunId, documentId: input.documentId, contentHash: input.contentHash,
      configurationHash: input.configurationHash, parserVersion: input.parserVersion,
    });
    if (input.teacherId && input.monitorId) {
      const expectedPath = checkpointArtifactPath(input.teacherId, input.documentId, sourceRunId, batch.batchKey);
      if (batch.artifactPath !== expectedPath) throw new Error('Caminho do checkpoint não pertence ao tenant/documento/execução/lote de origem.');
    }
    if (sourceRunId !== input.runId) {
      if (!batch.checkpointSourceRunId || !input.resolveSourceCheckpoint) throw new Error('Checkpoint clonado sem referência verificável à execução de origem.');
      const source = await input.resolveSourceCheckpoint(sourceRunId, batch.batchKey);
      if (!source || source.run.id !== sourceRunId || source.run.documentId !== input.documentId
        || source.run.contentHash !== input.contentHash || source.run.configurationHash !== input.configurationHash
        || source.run.parserVersion !== input.parserVersion || source.run.pageCount !== input.pageCount
        || (input.teacherId !== undefined && source.run.teacherId !== input.teacherId)
        || (input.monitorId !== undefined && source.run.monitorId !== input.monitorId)) {
        throw new Error('Execução de origem não corresponde ao escopo, tenant ou configuração do documento atual.');
      }
      const sourceBatch = source.batch;
      if (sourceBatch.status !== 'COMPLETED' || (sourceBatch.runId !== undefined && sourceBatch.runId !== sourceRunId) || sourceBatch.batchKey !== batch.batchKey
        || sourceBatch.pageStart !== batch.pageStart || sourceBatch.pageEnd !== batch.pageEnd
        || sourceBatch.artifactPath !== batch.artifactPath || sourceBatch.artifactChecksum !== batch.artifactChecksum
        || canonicalJson(sourceBatch.manifest) !== canonicalJson(batch.manifest)) {
        throw new Error('Checkpoint clonado diverge do lote concluído da execução de origem.');
      }
      if (sourceBatch.checkpointSourceRunId && sourceBatch.checkpointSourceRunId !== sourceRunId) {
        throw new Error('A origem do checkpoint não corresponde ao manifest imutável do lote.');
      }
    } else if (batch.checkpointSourceRunId) {
      throw new Error('Referência de origem não pode apontar para a própria execução.');
    }
    const downloaded = await input.storage.download(batch.artifactPath);
    if (downloaded.error || !downloaded.data) throw new Error('Checkpoint não está disponível no Storage privado.');
    const artifactBytes = Buffer.from(await downloaded.data.arrayBuffer());
    if (artifactBytes.length > MAX_ARTIFACT_BYTES || sha256(artifactBytes) !== batch.artifactChecksum) throw new Error('Checksum ou tamanho do checkpoint não confere.');
    const files = parseArtifactFiles(artifactBytes);
    if (schemaVersion && schemaVersion !== manifest.schemaVersion) throw new Error('Os checkpoints usam versões incompatíveis de schema.');
    if (manifest.schemaVersion !== 'knowledge-batch-v1') throw new Error('Versão de manifest sem suporte para publicação.');
    schemaVersion = manifest.schemaVersion;
    validateArtifactFilePaths(files);
    validateManifestFiles(manifest, files);

    const layoutBytes = files.get('layout.json');
    if (!layoutBytes) throw new Error('Checkpoint sem layout.json validado.');
    if (!files.has('document.json') || !files.has('document.md')) throw new Error('Checkpoint sem exports brutos esperados.');
    const layout = parseLayout(layoutBytes);
    const layoutPages = new Map(layout.map((page) => [page.pageNumber, page]));
    if (layoutPages.size !== layout.length) throw new Error('O layout contém página duplicada.');
    const batchAssetEntries = manifest.visualAssets ?? [];
    const batchAssets = parseVisualAssets(batchAssetEntries, files, batch.batchKey, input.documentId, input.runId);
    const expectedAssetPaths = new Set(batchAssets.map((asset) => `assets/${asset.assetKey}.png`));
    const packagedAssetPaths = [...files.keys()].filter((path) => path.startsWith('assets/'));
    if (packagedAssetPaths.length !== expectedAssetPaths.size || packagedAssetPaths.some((path) => !expectedAssetPaths.has(path))) {
      throw new Error('Manifest visual e arquivos de imagem do lote não correspondem.');
    }
    const assetCountByPage = new Map<number, number>();
    for (const asset of batchAssets) assetCountByPage.set(asset.pageNumber, (assetCountByPage.get(asset.pageNumber) ?? 0) + 1);
    if (batchAssets.some((asset) => asset.pageNumber < batch.pageStart || asset.pageNumber > batch.pageEnd)) {
      throw new Error('Asset visual está fora do intervalo de páginas do checkpoint.');
    }

    const expectedBatchPages = batch.pageEnd - batch.pageStart + 1;
    if (manifest.pages.length !== expectedBatchPages) throw new Error('Manifest não contabiliza todas as páginas do intervalo.');
    for (const pageInfo of manifest.pages) {
      if (!Number.isInteger(pageInfo.pageNumber) || !['CONVERTED', 'VERIFIED_BLANK', 'FAILED'].includes(pageInfo.status)
        || !Number.isInteger(pageInfo.characterCount) || pageInfo.characterCount < 0
        || !Number.isInteger(pageInfo.layoutItemCount) || pageInfo.layoutItemCount < 0
        || !Number.isInteger(pageInfo.imageCount) || pageInfo.imageCount < 0
        || !Array.isArray(pageInfo.errors) || pageInfo.errors.some((error) => typeof error !== 'string')) {
        throw new Error('Registro de página inválido no manifest persistido.');
      }
      const number = pageInfo.pageNumber;
      if (number < batch.pageStart || number > batch.pageEnd || pages.has(number)) throw new Error('Página ausente, repetida ou fora do intervalo nos checkpoints.');
      const pageLayout = layoutPages.get(number) ?? { pageNumber: number, elements: [] };
      const measuredCharacters = pageLayout.elements.reduce((sum, element) => sum + Array.from(element.text ?? '').length, 0);
      if (pageLayout.elements.length !== pageInfo.layoutItemCount || measuredCharacters !== pageInfo.characterCount) {
        throw new Error(`Layout incompleto ou divergente na página ${number}.`);
      }
      if (pageInfo.status === 'FAILED') throw new Error(`Página ${number} falhou; publicação bloqueada.`);
      if (pageInfo.status === 'VERIFIED_BLANK') {
        if (!pageInfo.blankEvidence?.trim() || pageInfo.characterCount !== 0 || pageInfo.layoutItemCount !== 0
          || pageInfo.imageCount !== 0 || (assetCountByPage.get(number) ?? 0) !== 0) {
          throw new Error(`Página ${number} não possui evidência coerente de conteúdo vazio.`);
        }
        verifiedBlankPages.push(number);
      } else if (pageInfo.status !== 'CONVERTED') {
        throw new Error(`Status de cobertura inválido na página ${number}.`);
      } else if (pageInfo.errors.length > 0) {
        throw new Error(`Página ${number} possui erros de conversão; publicação bloqueada.`);
      } else if (pageInfo.layoutItemCount === 0 && pageInfo.imageCount === 0 && pageInfo.characterCount === 0) {
        throw new Error(`Página ${number} sem evidência foi marcada como convertida.`);
      }
      pages.set(number, { page: pageLayout, batchKey: batch.batchKey });
    }
    assets.push(...batchAssets);
  }

  if (expectedPage !== input.pageCount + 1 || pages.size !== input.pageCount) throw new Error('A cobertura final não inclui cada página exatamente uma vez.');
  return {
    schemaVersion: schemaVersion ?? 'knowledge-batch-v1',
    pages: [...pages.values()].sort((a, b) => a.page.pageNumber - b.page.pageNumber),
    assets,
    verifiedBlankPages: verifiedBlankPages.sort((a, b) => a - b),
  };
}

function parseArtifactFiles(bytes: Buffer): Map<string, Buffer> {
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Pacote do checkpoint não é JSON válido.'); }
  if (!Array.isArray(value)) throw new Error('Pacote do checkpoint tem formato inválido.');
  const files = new Map<string, Buffer>();
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.path !== 'string' || typeof entry.sha256 !== 'string' || typeof entry.contentBase64 !== 'string'
      || !isSafeArtifactPath(entry.path) || !/^[a-f0-9]{64}$/i.test(entry.sha256) || files.has(entry.path)) {
      throw new Error('Pacote do checkpoint contém artefato inválido ou duplicado.');
    }
    const content = Buffer.from(entry.contentBase64, 'base64');
    if (content.toString('base64') !== entry.contentBase64 || sha256(content) !== entry.sha256.toLowerCase()) throw new Error('Checksum de artefato individual não confere.');
    files.set(entry.path, content);
  }
  return files;
}

function parseBatchManifest(value: unknown): BatchManifest {
  if (!isRecord(value) || typeof value.schemaVersion !== 'string' || typeof value.documentId !== 'string'
    || typeof value.runId !== 'string' || typeof value.contentHash !== 'string' || typeof value.configurationHash !== 'string'
    || typeof value.parserVersion !== 'string' || !Number.isInteger(value.pageStart) || !Number.isInteger(value.pageEnd)
    || typeof value.status !== 'string' || !Array.isArray(value.pages) || !Array.isArray(value.files)) {
    throw new Error('Manifest persistido do checkpoint é inválido.');
  }
  return value as unknown as BatchManifest;
}

function validateManifestIdentity(manifest: BatchManifest, batch: BatchRecord, expected: {
  runId: string; documentId: string; contentHash: string; configurationHash: string; parserVersion: string;
}) {
  if (manifest.documentId !== expected.documentId || manifest.runId !== expected.runId
    || manifest.contentHash !== expected.contentHash || manifest.configurationHash !== expected.configurationHash
    || manifest.parserVersion !== expected.parserVersion || manifest.pageStart !== batch.pageStart
    || manifest.pageEnd !== batch.pageEnd || manifest.status !== 'COMPLETED') {
    throw new Error('Manifest do checkpoint não corresponde à identidade, configuração ou intervalo autorizados.');
  }
}

function validateArtifactFilePaths(files: Map<string, Buffer>) {
  for (const path of files.keys()) {
    if (!isSafeArtifactPath(path) || !['document.json', 'document.md', 'layout.json'].includes(path)
      && !/^assets\/[a-f0-9]{32}\.png$/i.test(path)) {
      throw new Error('Checkpoint contém caminho de artefato não permitido.');
    }
  }
}

function checkpointArtifactPath(teacherId: string, documentId: string, runId: string, batchKey: string) {
  const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  if (!isUuid(teacherId) || !isUuid(documentId) || !isUuid(runId) || !/^[a-f0-9]{64}$/i.test(batchKey)) {
    throw new Error('Identidade inválida para caminho de checkpoint.');
  }
  return `knowledge-batches/${teacherId}/${documentId}/${runId}/${batchKey}.json`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function validateManifestFiles(manifest: BatchManifest, files: Map<string, Buffer>) {
  if (manifest.files.length !== files.size) throw new Error('Manifest e pacote possuem contagens diferentes de artefatos.');
  for (const file of manifest.files) {
    const bytes = files.get(file.path);
    if (!bytes || sha256(bytes) !== file.sha256.toLowerCase()) throw new Error('Manifest aponta para artefato ausente ou com hash divergente.');
  }
}

function parseLayout(bytes: Buffer): KnowledgeLayoutPage[] {
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('layout.json não é JSON válido.'); }
  if (!isRecord(value) || value.schemaVersion !== 'docling-layout-v1' || !Array.isArray(value.pages)) throw new Error('layout.json usa schema não suportado.');
  return value.pages.map((raw): KnowledgeLayoutPage => {
    if (!isRecord(raw) || !Number.isInteger(raw.pageNumber) || !Array.isArray(raw.elements)) throw new Error('Página inválida no layout.');
    const elements = raw.elements.map((item) => {
      if (!isRecord(item) || !Number.isInteger(item.externalIndex) || typeof item.type !== 'string'
        || (item.text !== null && item.text !== undefined && typeof item.text !== 'string')) throw new Error('Elemento inválido no layout.');
      return {
        externalIndex: Number(item.externalIndex), level: Number.isInteger(item.level) ? Number(item.level) : null,
        type: item.type, text: typeof item.text === 'string' ? item.text : null, bbox: item.bbox ?? null,
      };
    });
    if (elements.some((element) => ['TABLE', 'FORMULA'].includes(element.type.toUpperCase()) && !element.text?.trim())) {
      throw new Error('Tabela ou fórmula não possui texto normalizado; a publicação exige conteúdo recuperável.');
    }
    if (new Set(elements.map((element) => element.externalIndex)).size !== elements.length) throw new Error('O layout contém ordem de leitura duplicada.');
    return { pageNumber: Number(raw.pageNumber), elements };
  });
}

function parseVisualAssets(entries: BatchManifest['visualAssets'], files: Map<string, Buffer>, batchKey: string, documentId: string, runId: string): GenerationAsset[] {
  const assets: GenerationAsset[] = [];
  const seenAssetKeys = new Set<string>();
  for (const entry of entries ?? []) {
    if (!/^[a-f0-9]{32}$/i.test(entry.asset_key) || !['FIGURE', 'PAGE'].includes(entry.asset_kind)
      || !Number.isInteger(entry.page_number) || entry.page_number < 1 || !Number.isInteger(entry.width) || entry.width < 1 || entry.width > 4096
      || !Number.isInteger(entry.height) || entry.height < 1 || entry.height > 4096 || entry.mime_type !== 'image/png'
      || !/^[a-f0-9]{64}$/i.test(entry.sha256)) throw new Error('Manifest contém asset visual inválido.');
    if (seenAssetKeys.has(entry.asset_key.toLowerCase())) throw new Error('Manifest visual repete a identidade de um asset.');
    seenAssetKeys.add(entry.asset_key.toLowerCase());
    const artifactPath = `assets/${entry.asset_key}.png`;
    const bytes = files.get(artifactPath);
    if (!bytes || bytes.length > 10 * 1024 * 1024 || sha256(bytes) !== entry.sha256.toLowerCase()) throw new Error('Asset visual ausente, maior que o limite ou com hash inválido.');
    const identity = `${batchKey}:${entry.asset_key}`;
    const sourceKey = createHash('sha256').update(identity).digest('hex');
    assets.push({
      id: stableUuid(`${runId}:${documentId}:asset:${identity}`),
      assetKey: entry.asset_key.toLowerCase(), sourceKey, batchKey, sourceItemRef: String(entry.source_item_ref ?? ''),
      readingOrder: Number.isInteger(entry.reading_order) ? entry.reading_order : 0,
      pageNumber: entry.page_number, assetKind: entry.asset_kind as 'FIGURE' | 'PAGE',
      bbox: validBbox(entry.bbox), coordOrigin: typeof entry.coord_origin === 'string' ? entry.coord_origin : null,
      caption: typeof entry.caption === 'string' ? entry.caption : null, mimeType: entry.mime_type,
      width: entry.width, height: entry.height, checksum: entry.sha256.toLowerCase(),
      storagePath: '', bytes,
    });
  }
  return assets;
}

async function ensureParseRun(input: {
  parseRunId: string; documentId: string; runId: string; contentHash: string;
  configurationHash: string; parserVersion: string; schemaVersion: string;
}) {
  const idempotencyKey = createHash('sha256').update(`knowledge-generation-parse:${input.runId}`).digest('hex');
  await prisma.documentParseRun.upsert({
    where: { id: input.parseRunId },
    create: {
      id: input.parseRunId, documentId: input.documentId, parserName: 'DOCLING', parserVersion: input.parserVersion,
      configurationHash: input.configurationHash, contentHash: input.contentHash,
      layoutSchemaVersion: input.schemaVersion, idempotencyKey, status: 'COMPLETED', qualityScore: 1,
      startedAt: new Date(), finishedAt: new Date(), metrics: { knowledgeRunId: input.runId, pageAssembly: 'absolute-layout-order' },
    },
    update: {},
  });
}

async function persistAndEmbedChunks(input: {
  generationId: string; documentId: string; teacherId: string; monitorId: string; subjectId: string;
  topicIds: string[]; docHash: string; chunks: ReturnType<typeof assembleKnowledgeChunks>;
  embeddings: Pick<OpenRouterClient, 'createEmbeddings'>;
}) {
  const rows = input.chunks.map((chunk) => ({
    id: stableUuid(`${input.generationId}:chunk:${chunk.chunkIndex}`),
    documentId: input.documentId, generationId: input.generationId, teacherId: input.teacherId,
    monitorId: input.monitorId, subjectId: input.subjectId, chunkIndex: chunk.chunkIndex,
    blockId: null, chunkIndexInBlock: null, content: chunk.content, embeddingContent: chunk.content,
    contentHash: sha256(Buffer.from(chunk.content)), charCount: chunk.charCount, tokenCount: chunk.tokenCount,
    pageStart: chunk.pages[0] ?? null, pageEnd: chunk.pages.at(-1) ?? null,
    pages: chunk.pages, headings: chunk.headings, chunkType: chunk.chunkType,
    engine: 'docling-knowledge-batch', tokenizerId: 'gpt-tokenizer', chunkerVersion: 'knowledge-layout-v1',
    provenance: chunk.provenance, docHash: input.docHash,
    sourceKey: `kg:${input.generationId}:${chunk.chunkIndex}`, status: 'EMBEDDING_PENDING' as const,
  }));
  for (let start = 0; start < rows.length; start += 500) {
    const batch = rows.slice(start, start + 500);
    await prisma.documentChunk.createMany({ data: batch, skipDuplicates: true });
  }
  if (input.topicIds.length) {
    const links = rows.flatMap((chunk) => input.topicIds.map((topicId) => ({ chunkId: chunk.id, topicId })));
    for (let start = 0; start < links.length; start += 1000) {
      await prisma.documentChunkTopic.createMany({ data: links.slice(start, start + 1000), skipDuplicates: true });
    }
  }

  const persisted = await prisma.documentChunk.findMany({
    where: { generationId: input.generationId },
    orderBy: { chunkIndex: 'asc' },
    select: { id: true, chunkIndex: true, contentHash: true, content: true, embeddingContent: true, embeddingModel: true, embeddedAt: true, status: true },
  });
  if (persisted.length !== rows.length || persisted.some((row, index) => row.chunkIndex !== index || row.contentHash !== rows[index]?.contentHash)) {
    throw new Error('Chunks staging incompletos ou divergentes em relação à montagem validada.');
  }

  const needsEmbedding = persisted.filter((row) => !row.embeddedAt || row.status !== 'READY' || row.embeddingModel !== env.OPENROUTER_EMBEDDING_MODEL);
  const client = input.embeddings;
  const batchSize = Math.max(1, Math.min(100, Number.isInteger(env.EMBEDDING_BATCH_SIZE) ? env.EMBEDDING_BATCH_SIZE : 32));
  for (let start = 0; start < needsEmbedding.length; start += batchSize) {
    const batch = needsEmbedding.slice(start, start + batchSize);
    const vectors = await client.createEmbeddings(batch.map((row) => row.embeddingContent || row.content));
    if (vectors.length !== batch.length || vectors.some((vector) => vector.length !== 2048 || vector.some((value) => !Number.isFinite(value)))) {
      throw new Error('Embeddings staging têm quantidade ou dimensão incompatível com o índice configurado.');
    }
    await prisma.$transaction(batch.map((row, index) => prisma.$executeRaw`
      UPDATE document_chunks
      SET embedding = ${JSON.stringify(vectors[index])}::extensions.vector,
          embedding_model = ${env.OPENROUTER_EMBEDDING_MODEL},
          embedding_version = ${EMBEDDING_VERSION},
          embedded_at = NOW(), status = 'READY'::"ChunkStatus", updated_at = NOW()
      WHERE id = ${row.id}::uuid AND generation_id = ${input.generationId}::uuid
    `), { maxWait: 10_000, timeout: 60_000 });
  }
  const unfinished = await prisma.documentChunk.count({ where: { generationId: input.generationId, OR: [{ status: { not: 'READY' } }, { embeddedAt: null }] } });
  if (unfinished) throw new Error('Há chunks sem embedding completo na geração staging.');
}

async function persistVisualAssets(input: {
  generationId: string; documentId: string; teacherId: string; monitorId: string; parseRunId: string;
  assets: GenerationAsset[]; storage: Storage;
}) {
  const ids = input.assets.map((asset) => asset.id);
  const existing = ids.length ? await prisma.documentVisualAsset.findMany({
    where: { id: { in: ids } }, select: { id: true, checksum: true, storagePath: true, sourceKey: true },
  }) : [];
  const existingById = new Map(existing.map((row) => [row.id, row]));
  for (const asset of input.assets) {
    asset.storagePath = `knowledge-generations/${input.teacherId}/${input.documentId}/${input.generationId}/assets/${asset.id}.png`;
    const row = existingById.get(asset.id);
    if (row && (row.checksum !== asset.checksum || row.storagePath !== asset.storagePath || row.sourceKey !== asset.sourceKey)) {
      throw new Error('ID determinístico de asset já existe com conteúdo ou identidade diferente.');
    }
    if (!row) {
      const upload = await input.storage.upload(asset.storagePath, asset.bytes, { contentType: asset.mimeType, upsert: true });
      if (upload.error) throw new Error('Falha ao gravar asset da geração staging no Storage privado.');
    }
    const downloaded = await input.storage.download(asset.storagePath);
    if (downloaded.error || !downloaded.data || sha256(Buffer.from(await downloaded.data.arrayBuffer())) !== asset.checksum) {
      throw new Error('Asset da geração staging não pôde ser verificado no Storage privado.');
    }
  }
  for (let start = 0; start < input.assets.length; start += 300) {
    const batch = input.assets.slice(start, start + 300);
    await prisma.documentVisualAsset.createMany({
      data: batch.map((asset) => ({
        id: asset.id, documentId: input.documentId, generationId: input.generationId, parseRunId: input.parseRunId,
        sourceKey: asset.sourceKey, pageNumber: asset.pageNumber, assetType: asset.assetKind.toLowerCase(),
        storagePath: asset.storagePath, mimeType: asset.mimeType, width: asset.width, height: asset.height,
        bbox: asset.bbox ? asset.bbox as Prisma.InputJsonValue : Prisma.JsonNull,
        checksum: asset.checksum,
        metadata: {
          generationId: input.generationId, batchKey: asset.batchKey, assetKey: asset.assetKey,
          sourceItemRef: asset.sourceItemRef, readingOrder: asset.readingOrder, coordOrigin: asset.coordOrigin,
          caption: asset.caption, assetKind: asset.assetKind,
        } as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
  }
  if (ids.length) {
    const confirmed = await prisma.documentVisualAsset.findMany({
      where: { id: { in: ids }, documentId: input.documentId, generationId: input.generationId, parseRunId: input.parseRunId },
      select: { id: true, checksum: true, storagePath: true },
    });
    const byId = new Map(confirmed.map((row) => [row.id, row]));
    if (input.assets.some((asset) => byId.get(asset.id)?.checksum !== asset.checksum || byId.get(asset.id)?.storagePath !== asset.storagePath)) {
      throw new Error('Não foi possível confirmar todos os assets persistidos na geração staging.');
    }
  }
}

async function linkAssetsToChunks(generationId: string, chunks: ReturnType<typeof assembleKnowledgeChunks>, assets: GenerationAsset[]) {
  const chunksByPage = new Map<number, Array<{ id: string; provenance: typeof chunks[number]['provenance'] }>>();
  for (const chunk of chunks) {
    const chunkId = stableUuid(`${generationId}:chunk:${chunk.chunkIndex}`);
    for (const page of chunk.pages) {
      const matches = chunksByPage.get(page) ?? [];
      matches.push({ id: chunkId, provenance: chunk.provenance });
      chunksByPage.set(page, matches);
    }
  }
  const assetRows = assets.filter((asset) => asset.assetKind === 'FIGURE' && asset.bbox);
  const links = assetRows.flatMap((asset) => {
    return (chunksByPage.get(asset.pageNumber) ?? []).flatMap((chunk) => {
      const overlaps = chunk.provenance
        .filter((source) => source.page === asset.pageNumber && source.bbox)
        .map((source) => bboxOverlapRatio(source.bbox!, asset.bbox!))
        .filter((ratio) => ratio >= 0.35);
      const confidence = Math.max(0, ...overlaps);
      return confidence >= 0.35 ? [{
        chunkId: chunk.id, visualAssetId: asset.id, associationMethod: 'BBOX', role: 'INLINE', confidence: Math.min(0.98, confidence),
      }] : [];
    });
  });
  for (let start = 0; start < links.length; start += 1000) {
    await prisma.documentChunkVisualAsset.createMany({ data: links.slice(start, start + 1000), skipDuplicates: true });
  }
}

function bboxOverlapRatio(left: number[], right: number[]) {
  const intersectionWidth = Math.max(0, Math.min(left[2]!, right[2]!) - Math.max(left[0]!, right[0]!));
  const intersectionHeight = Math.max(0, Math.min(left[3]!, right[3]!) - Math.max(left[1]!, right[1]!));
  const intersection = intersectionWidth * intersectionHeight;
  const leftArea = Math.max(0, left[2]! - left[0]!) * Math.max(0, left[3]! - left[1]!);
  const rightArea = Math.max(0, right[2]! - right[0]!) * Math.max(0, right[3]! - right[1]!);
  const denominator = Math.min(leftArea, rightArea);
  return denominator > 0 ? intersection / denominator : 0;
}

function validBbox(value: unknown): number[] | null {
  return Array.isArray(value) && value.length === 4 && value.every((part) => typeof part === 'number' && Number.isFinite(part))
    ? value as number[]
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function isSafeArtifactPath(value: string) { return !value.startsWith('/') && !value.split('/').some((part) => part === '' || part === '.' || part === '..') && /^[a-zA-Z0-9._/-]+$/.test(value); }
function sha256(value: Buffer) { return createHash('sha256').update(value).digest('hex'); }

function stableUuid(value: string) {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
