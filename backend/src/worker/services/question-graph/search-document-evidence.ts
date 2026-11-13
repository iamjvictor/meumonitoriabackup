import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { OpenRouterClient } from '../../client/openrouter.client.js';
import { env } from '../../../config/env.js';
import type {
  QuestionEvidenceReference,
  QuestionEvidenceSearchResult,
} from './contracts.js';
import type { ExtractedQuestionCandidate, QuestionGraphState } from './state.js';
import type { QuestionGraphContextProvider } from './context.provider.js';

type SearchInput = {
  state: QuestionGraphState;
  candidateId: string;
  query: string;
  intent: 'answer_key' | 'question_context';
  segmentId?: string;
  cursor?: string | null;
  limit?: number;
};

export type EvidenceSearchDataSource = {
  verifyDocument(documentId: string, version: string): Promise<'match' | 'unknown' | 'mismatch'>;
  lexicalChunks(documentId: string, query: string, offset: number, limit: number): Promise<Array<{ id: string; content: string; pageStart: number | null; pageEnd: number | null; chunkIndex: number }>>;
  lexicalTables(documentId: string, query: string, offset: number, limit: number): Promise<Array<{ id: string; content: string; pageStart: number | null; pageEnd: number | null; blockIndex: number }>>;
  lexicalVisuals(documentId: string, query: string, offset: number, limit: number): Promise<Array<{ id: string; description: string; pageNumber: number; bbox: unknown }>>;
  semanticChunks(documentId: string, embedding: number[], limit: number): Promise<Array<{ id: string; content: string; pageStart: number | null; pageEnd: number | null; score: number }>>;
  semanticVisuals(documentId: string, embedding: number[], limit: number): Promise<Array<{ id: string; description: string; pageNumber: number; bbox: unknown; score: number }>>;
  hasUnindexedVisuals(documentId: string): Promise<boolean>;
  hasMissingEmbeddings(documentId: string): Promise<boolean>;
};

function words(query: string): string[] {
  return [...new Set(query.split(/[^\p{L}\p{N}]+/u).map((word) => word.trim()).filter((word) => word.length >= 2))].slice(0, 12);
}

type CursorScope = { executionId: string; documentId: string; documentVersion: string; candidateId: string; query: string; intent: string; segmentId: string | null; limit: number };

function cursorOffset(cursor: string | null | undefined, scope: CursorScope): number | null {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown; scope?: CursorScope };
    if (JSON.stringify(parsed.scope) !== JSON.stringify(scope)) return null;
    return Number.isSafeInteger(parsed.offset) && Number(parsed.offset) > 0 ? Number(parsed.offset) : null;
  } catch { return null; }
}

function nextCursor(offset: number, hasMore: boolean, scope: CursorScope): string | null {
  if (!hasMore) return null;
  return Buffer.from(JSON.stringify({ offset: offset + scope.limit, scope })).toString('base64url');
}

function bbox(value: unknown): QuestionEvidenceReference['boundingBox'] {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const x = Number(record.x ?? record.l ?? record.left);
  const y = Number(record.y ?? record.t ?? record.top);
  const width = Number(record.width ?? (Number(record.r ?? record.right) - x));
  const height = Number(record.height ?? (Number(record.b ?? record.bottom) - y));
  return [x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : null;
}

function stateSegment(state: QuestionGraphState, segmentId: string | null): NonNullable<QuestionGraphState['segments']>[number] | undefined {
  if (!segmentId) return undefined;
  return state.segments?.find((segment) => segment.segmentId === segmentId);
}

export class QuestionDocumentEvidenceSearch {
  constructor(
    private readonly data: EvidenceSearchDataSource,
    private readonly embeddings?: Pick<OpenRouterClient, 'createEmbeddings'>,
  ) {}

  async search(input: SearchInput): Promise<QuestionEvidenceSearchResult> {
    const query = input.query.trim();
    if (!query) return { query, coverage: 'failed', hits: [], unresolvedReason: 'A consulta está vazia.' };
    const candidate = input.state.candidates.find((item) => (item.candidateId ?? item.id) === input.candidateId);
    if (!candidate) return { query, coverage: 'failed', hits: [], unresolvedReason: 'Candidato não pertence ao estado desta execução.' };
    if (input.segmentId && candidate.segmentId && input.segmentId !== candidate.segmentId) {
      return { query, coverage: 'failed', hits: [], unresolvedReason: 'O segmento solicitado não corresponde ao candidato autorizado.' };
    }
    const version = await this.data.verifyDocument(input.state.documentId, input.state.documentVersion);
    if (version === 'mismatch') return { query, coverage: 'failed', hits: [], unresolvedReason: 'A versão do documento não corresponde à execução.' };
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? 10), 1), 50);
    const scope: CursorScope = {
      executionId: input.state.executionId,
      documentId: input.state.documentId,
      documentVersion: input.state.documentVersion,
      candidateId: input.candidateId,
      query: query.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase(),
      intent: input.intent,
      segmentId: input.segmentId ?? candidate.segmentId ?? null,
      limit,
    };
    const offset = cursorOffset(input.cursor, scope);
    if (offset === null) return { query, coverage: 'failed', hits: [], unresolvedReason: 'Cursor inválido ou pertence a outra execução, candidato, consulta ou intenção.' };
    const scanLimit = Math.min(offset + limit + 1, 500);
    const terms = words(query);
    if (!terms.length) return { query, coverage: 'failed', hits: [], unresolvedReason: 'A consulta não contém termos pesquisáveis.' };

    const lexical = await Promise.all([
      this.data.lexicalChunks(input.state.documentId, query, 0, scanLimit),
      this.data.lexicalTables(input.state.documentId, query, 0, scanLimit),
      this.data.lexicalVisuals(input.state.documentId, query, 0, scanLimit),
    ]);
    let semantic: Awaited<ReturnType<EvidenceSearchDataSource['semanticChunks']>> = [];
    let semanticVisual: Awaited<ReturnType<EvidenceSearchDataSource['semanticVisuals']>> = [];
    let semanticAvailable = false;
    if (this.embeddings) {
      try {
        const [vector] = await this.embeddings.createEmbeddings([query]);
        if (vector?.length) {
          [semantic, semanticVisual] = await Promise.all([
            this.data.semanticChunks(input.state.documentId, vector, scanLimit),
            this.data.semanticVisuals(input.state.documentId, vector, scanLimit),
          ]);
          semanticAvailable = true;
        }
      } catch { /* Lexical retrieval remains useful; report partial coverage below. */ }
    }

    const hits = new Map<string, QuestionEvidenceReference>();
    const add = (hit: QuestionEvidenceReference) => {
      const current = hits.get(hit.evidenceId);
      if (!current || (hit.score ?? 0) > (current.score ?? 0)) hits.set(hit.evidenceId, hit);
    };
    for (const chunk of lexical[0]) add({ evidenceId: `chunk:${chunk.id}`, kind: 'text', pageNumber: chunk.pageStart, chunkId: chunk.id, excerpt: chunk.content, score: 0.4 });
    for (const block of lexical[1]) add({ evidenceId: `table:${block.id}`, kind: 'table', pageNumber: block.pageStart, chunkId: block.id, excerpt: block.content, score: 0.45 });
    for (const asset of lexical[2]) add({ evidenceId: `asset:${asset.id}`, kind: 'image', pageNumber: asset.pageNumber, assetId: asset.id, excerpt: asset.description, boundingBox: bbox(asset.bbox), score: 0.45 });
    for (const chunk of semantic) add({ evidenceId: `chunk:${chunk.id}`, kind: 'text', pageNumber: chunk.pageStart, chunkId: chunk.id, excerpt: chunk.content, score: chunk.score });
    for (const asset of semanticVisual) add({ evidenceId: `asset:${asset.id}`, kind: 'image', pageNumber: asset.pageNumber, assetId: asset.id, excerpt: asset.description, boundingBox: bbox(asset.bbox), score: asset.score });

    const candidateEvidence = new Set([
      ...(candidate.sourceRefs?.evidenceRefs ?? []),
      ...(candidate.sourceRefs?.chunkIds ?? candidate.sourceChunkIds),
      ...(candidate.sourceRefs?.visualAssetIds ?? candidate.visualAssetIds ?? []),
    ]);
    const selectedSegmentId = input.segmentId ?? candidate.segmentId ?? null;
    const referencedSegment = stateSegment(input.state, selectedSegmentId);
    const withAssociation = [...hits.values()].map((hit) => {
      const directReference = Boolean(referencedSegment?.evidenceRefs.includes(hit.evidenceId)
        || referencedSegment?.evidenceRefs.includes(hit.chunkId ?? '')
        || referencedSegment?.evidenceRefs.includes(hit.assetId ?? '')
        || candidateEvidence.has(hit.evidenceId)
        || candidateEvidence.has(hit.chunkId ?? '')
        || candidateEvidence.has(hit.assetId ?? ''));
      const insideSegment = Boolean(referencedSegment && referencedSegment.pageStart !== null && referencedSegment.pageEnd !== null
        && hit.pageNumber !== null && hit.pageNumber >= referencedSegment.pageStart && hit.pageNumber <= referencedSegment.pageEnd);
      const overlappingSegments = input.state.segments?.filter((segment) => segment.segmentId !== selectedSegmentId
        && segment.pageStart !== null && segment.pageEnd !== null && hit.pageNumber !== null
        && hit.pageNumber >= segment.pageStart && hit.pageNumber <= segment.pageEnd) ?? [];
      const ambiguousLocation = Boolean(insideSegment && overlappingSegments.length);
      return {
        ...hit,
        ...(selectedSegmentId && (directReference || (insideSegment && !ambiguousLocation)) ? { segmentId: selectedSegmentId } : {}),
      };
    });
    const ordered = withAssociation.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (a.pageNumber ?? 0) - (b.pageNumber ?? 0));
    const pageHits = ordered.slice(offset, offset + limit);
    const [hasUnindexedVisuals, hasMissingEmbeddings] = await Promise.all([
      this.data.hasUnindexedVisuals(input.state.documentId),
      this.data.hasMissingEmbeddings(input.state.documentId),
    ]);
    const scanTruncated = offset + limit >= 500
      || ordered.length >= scanLimit
      || lexical.some((rows) => rows.length >= scanLimit)
      || semantic.length >= scanLimit
      || semanticVisual.length >= scanLimit;
    const hasMore = ordered.length > offset + limit;
    const segmentAmbiguous = pageHits.some((hit) => !hit.segmentId && selectedSegmentId !== null);
    const coverage = version === 'unknown' || hasUnindexedVisuals || hasMissingEmbeddings || !semanticAvailable || scanTruncated ? 'partial' : 'complete';
    const reasons = [
      ...(version === 'unknown' ? ['Não foi possível confirmar a versão de todos os dados indexados.'] : []),
      ...(hasUnindexedVisuals ? ['Há assets visuais sem descrição pesquisável.'] : []),
      ...(hasMissingEmbeddings ? ['Há chunks sem embeddings; busca semântica não cobre todo o documento.'] : []),
      ...(!semanticAvailable ? ['Busca semântica indisponível nesta execução; resultados lexicais somente.'] : []),
      ...(scanTruncated ? ['Busca paginada limitada a 500 candidatos nesta consulta; cobertura global não comprovada.'] : []),
      ...(segmentAmbiguous ? ['Algumas evidências não puderam ser associadas ao segmento solicitado por referência ou limites inequívocos.'] : []),
    ];
    return {
      query,
      coverage,
      hits: pageHits,
      nextCursor: nextCursor(offset, hasMore, scope),
      unresolvedReason: reasons.length ? reasons.join(' ') : null,
    };
  }
}

const prismaDataSource: EvidenceSearchDataSource = {
  async verifyDocument(documentId, version) {
    const document = await prisma.monitorDocument.findUnique({ where: { id: documentId }, select: { id: true, activeGenerationId: true } });
    if (!document) return 'mismatch';
    const generationId = document.activeGenerationId;
    const activeDocument = { document: { is: { activeGenerationId: generationId } } };
    const count = await prisma.documentChunk.count({ where: { documentId, generationId, ...activeDocument } });
    const matching = await prisma.documentChunk.count({ where: { documentId, generationId, ...activeDocument, docHash: version } });
    if (matching === count && count > 0) return 'match';
    return matching === 0 ? 'unknown' : 'mismatch';
  },
  async lexicalChunks(documentId, query, offset, limit) {
    const generationId = await activeGenerationId(documentId);
    return prisma.documentChunk.findMany({ where: { documentId, generationId, document: { is: { activeGenerationId: generationId } }, status: 'READY', OR: words(query).map((term) => ({ content: { contains: term, mode: 'insensitive' as const } })) }, orderBy: { chunkIndex: 'asc' }, skip: offset, take: limit, select: { id: true, content: true, pageStart: true, pageEnd: true, chunkIndex: true } });
  },
  async lexicalTables(documentId, query, offset, limit) {
    return prisma.documentBlock.findMany({ where: { documentId, type: { in: ['TABLE', 'ANSWER_KEY'] }, normalizedContent: { contains: query, mode: 'insensitive' } }, orderBy: { blockIndex: 'asc' }, skip: offset, take: limit, select: { id: true, normalizedContent: true, pageStart: true, pageEnd: true, blockIndex: true } }).then((rows) => rows.map((row) => ({ id: row.id, content: row.normalizedContent ?? '', pageStart: row.pageStart, pageEnd: row.pageEnd, blockIndex: row.blockIndex })));
  },
  async lexicalVisuals(documentId, query, offset, limit) {
    const generationId = await activeGenerationId(documentId);
    return prisma.documentVisualAsset.findMany({ where: { documentId, generationId, document: { is: { activeGenerationId: generationId } }, visualIndex: { is: { descriptionStatus: 'READY', description: { contains: query, mode: 'insensitive' }, ...(generationId ? { embeddingModel: env.OPENROUTER_EMBEDDING_MODEL } : {}) } } }, orderBy: { pageNumber: 'asc' }, skip: offset, take: limit, select: { id: true, pageNumber: true, bbox: true, visualIndex: { select: { description: true } } } }).then((rows) => rows.map((row) => ({ id: row.id, description: row.visualIndex?.description ?? '', pageNumber: row.pageNumber, bbox: row.bbox })));
  },
  async semanticChunks(documentId, embedding, limit) {
    return prisma.$queryRaw<Array<{ id: string; content: string; pageStart: number | null; pageEnd: number | null; score: number }>>(Prisma.sql`
      SELECT dc.id, dc.content, dc.page_start AS "pageStart", dc.page_end AS "pageEnd",
        1 - (dc.embedding::extensions.halfvec(2048) <=> ${JSON.stringify(embedding)}::extensions.halfvec(2048)) AS score
      FROM document_chunks dc JOIN monitor_documents d ON d.id = dc.document_id
      WHERE dc.document_id = ${documentId}::uuid AND dc.status = 'READY'::"ChunkStatus" AND dc.embedding IS NOT NULL
        AND ((d.active_generation_id IS NULL AND dc.generation_id IS NULL) OR dc.generation_id = d.active_generation_id)
        AND (d.active_generation_id IS NULL OR dc.embedding_model = ${env.OPENROUTER_EMBEDDING_MODEL})
      ORDER BY dc.embedding::extensions.halfvec(2048) <=> ${JSON.stringify(embedding)}::extensions.halfvec(2048) LIMIT ${limit}
    `);
  },
  async semanticVisuals(documentId, embedding, limit) {
    return prisma.$queryRaw<Array<{ id: string; description: string; pageNumber: number; bbox: unknown; score: number }>>(Prisma.sql`
      SELECT dva.id, dvi.description, dva.page_number AS "pageNumber", dva.bbox,
        1 - (dvi.embedding::extensions.halfvec(2048) <=> ${JSON.stringify(embedding)}::extensions.halfvec(2048)) AS score
      FROM document_visual_assets dva JOIN document_visual_asset_indexes dvi ON dvi.visual_asset_id = dva.id
      JOIN monitor_documents d ON d.id = dva.document_id
      WHERE dva.document_id = ${documentId}::uuid AND dvi.description_status = 'READY' AND dvi.embedding IS NOT NULL
        AND ((d.active_generation_id IS NULL AND dva.generation_id IS NULL) OR dva.generation_id = d.active_generation_id)
        AND (d.active_generation_id IS NULL OR dvi.embedding_model = ${env.OPENROUTER_EMBEDDING_MODEL})
      ORDER BY dvi.embedding::extensions.halfvec(2048) <=> ${JSON.stringify(embedding)}::extensions.halfvec(2048) LIMIT ${limit}
    `);
  },
  async hasUnindexedVisuals(documentId) {
    const generationId = await activeGenerationId(documentId);
    return (await prisma.documentVisualAsset.count({ where: { documentId, generationId, document: { is: { activeGenerationId: generationId } }, visualIndex: { is: { OR: [
      { descriptionStatus: { not: 'READY' } },
      ...(generationId ? [{ embeddingModel: { not: env.OPENROUTER_EMBEDDING_MODEL } }, { embeddingModel: null }] : []),
    ] } } } })) > 0;
  },
  async hasMissingEmbeddings(documentId) {
    const generationId = await activeGenerationId(documentId);
    const total = await prisma.documentChunk.count({ where: { documentId, generationId, document: { is: { activeGenerationId: generationId } }, status: 'READY' } });
    const embedded = await prisma.documentChunk.count({ where: { documentId, generationId, document: { is: { activeGenerationId: generationId } }, status: 'READY', embeddedAt: { not: null }, ...(generationId ? { embeddingModel: env.OPENROUTER_EMBEDDING_MODEL } : {}) } });
    return embedded < total;
  },
};

async function activeGenerationId(documentId: string): Promise<string | null> {
  const document = await prisma.monitorDocument.findUnique({ where: { id: documentId }, select: { activeGenerationId: true } });
  return document?.activeGenerationId ?? null;
}

/** Tool facade: document identity and scope are always taken from graph state. */
export class SearchDocumentEvidenceTool {
  private readonly searcher: QuestionDocumentEvidenceSearch;
  constructor(data: EvidenceSearchDataSource = prismaDataSource, embeddings: Pick<OpenRouterClient, 'createEmbeddings'> = new OpenRouterClient()) {
    this.searcher = new QuestionDocumentEvidenceSearch(data, embeddings);
  }
  async invoke(input: SearchInput): Promise<QuestionEvidenceSearchResult> {
    return this.searcher.search(input);
  }
}

/** Adapter preserves existing load() call sites while exposing document-wide evidence search. */
export class SearchableQuestionGraphContextProvider implements QuestionGraphContextProvider {
  constructor(private readonly delegate: QuestionGraphContextProvider, private readonly tool = new SearchDocumentEvidenceTool()) {}
  load(state: QuestionGraphState, candidate: ExtractedQuestionCandidate) { return this.delegate.load(state, candidate); }
  async searchEvidence(input: Parameters<NonNullable<QuestionGraphContextProvider['searchEvidence']>>[0]): Promise<QuestionEvidenceSearchResult> {
    return this.tool.invoke({ state: input.state, candidateId: input.candidate.candidateId ?? input.candidate.id ?? '', query: input.query, intent: input.intent, segmentId: input.segmentId, cursor: input.cursor, limit: input.limit });
  }
}
