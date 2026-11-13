import { KnowledgeProcessingRunStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export type KnowledgeGenerationScope = {
  documentId: string;
  teacherId: string;
  monitorId: string;
};

/** Publication pointer operations; staging records remain invisible to retrieval. */
export class KnowledgeGenerationRepository {
  constructor(private readonly db: typeof prisma = prisma) {}

  async acquireGenerationLease(generationId: string, owner: string, leaseSeconds: number): Promise<boolean> {
    if (!owner.trim() || leaseSeconds < 1) throw new Error('Generation lease owner and duration are required.');
    const now = new Date();
    const result = await this.db.knowledgeDocumentGeneration.updateMany({
      where: {
        id: generationId,
        status: 'STAGING',
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }, { leaseOwner: owner }],
      },
      data: { leaseOwner: owner, leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000), heartbeatAt: now },
    });
    return result.count === 1;
  }

  async heartbeatGenerationLease(generationId: string, owner: string, leaseSeconds: number): Promise<boolean> {
    const now = new Date();
    const result = await this.db.knowledgeDocumentGeneration.updateMany({
      where: { id: generationId, status: 'STAGING', leaseOwner: owner, leaseExpiresAt: { gt: now } },
      data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000) },
    });
    return result.count === 1;
  }

  async releaseGenerationLease(generationId: string, owner: string): Promise<boolean> {
    const result = await this.db.knowledgeDocumentGeneration.updateMany({
      where: { id: generationId, status: 'STAGING', leaseOwner: owner },
      data: { leaseOwner: null, leaseExpiresAt: null },
    });
    return result.count === 1;
  }

  async createStagingGeneration(input: KnowledgeGenerationScope & { runId: string }) {
    return this.db.$transaction(async (tx) => {
      const run = await tx.knowledgeProcessingRun.findFirst({
        where: {
          id: input.runId,
          documentId: input.documentId,
          teacherId: input.teacherId,
          monitorId: input.monitorId,
          status: KnowledgeProcessingRunStatus.READY_TO_PUBLISH,
          batches: { every: { status: 'COMPLETED' } },
        },
        select: { id: true },
      });
      if (!run) throw new Error('Execução não está pronta para publicação ou pertence a outro escopo.');

      const document = await tx.monitorDocument.findFirst({
        where: { id: input.documentId, teacherId: input.teacherId, monitorId: input.monitorId },
        select: { id: true },
      });
      if (!document) throw new Error('Documento não encontrado no escopo de publicação.');

      const generation = await tx.knowledgeDocumentGeneration.upsert({
        where: { runId: input.runId },
        create: {
          documentId: input.documentId,
          teacherId: input.teacherId,
          monitorId: input.monitorId,
          runId: input.runId,
          status: 'STAGING',
        },
        update: {},
      });
      if (generation.documentId !== input.documentId || generation.teacherId !== input.teacherId || generation.monitorId !== input.monitorId) {
        throw new Error('A execução já está ligada a uma geração fora do escopo informado.');
      }
      return generation;
    });
  }

  /** Activates a fully indexed generation using compare-and-swap on the prior pointer. */
  async activateGeneration(input: KnowledgeGenerationScope & {
    generationId: string;
    expectedActiveGenerationId: string | null;
    leaseOwner?: string;
    embeddingModel?: string;
  }): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      const generation = await tx.knowledgeDocumentGeneration.findFirst({
        where: {
          id: input.generationId,
          documentId: input.documentId,
          teacherId: input.teacherId,
          monitorId: input.monitorId,
          status: { in: ['STAGING', 'RETIRED'] },
          ...(input.leaseOwner ? { leaseOwner: input.leaseOwner, leaseExpiresAt: { gt: new Date() } } : {}),
        },
        select: { id: true, runId: true, status: true, pageCount: true, chunkCount: true, assetCount: true },
      });
      if (!generation) throw new Error('Geração staging/retirada não encontrada no escopo informado.');
      if (generation.status === 'STAGING' && !input.leaseOwner) throw new Error('Lease válido é obrigatório para ativar uma geração staging.');
      if (generation.status === 'STAGING' && !input.embeddingModel?.trim()) throw new Error('Modelo de embedding é obrigatório para ativar uma geração staging.');
      if (generation.status === 'STAGING' && (generation.pageCount === null || generation.pageCount < 1 || generation.chunkCount === null || generation.assetCount === null)) {
        throw new Error('Cobertura e contagens da geração staging ainda não foram validadas.');
      }

      const ready = await tx.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
        SELECT
          (
            EXISTS (
            SELECT 1 FROM document_chunks dc
            WHERE dc.document_id = ${input.documentId}::uuid
              AND dc.generation_id = ${input.generationId}::uuid
            )
            OR EXISTS (
              SELECT 1 FROM document_visual_assets dva
              WHERE dva.document_id = ${input.documentId}::uuid
                AND dva.generation_id = ${input.generationId}::uuid
            )
          )
          ${generation.status === 'STAGING' ? Prisma.sql`
            AND (SELECT COUNT(*) FROM document_chunks dc
                 WHERE dc.document_id = ${input.documentId}::uuid AND dc.generation_id = ${input.generationId}::uuid) = ${generation.chunkCount}
            AND (SELECT COUNT(*) FROM document_visual_assets dva
                 WHERE dva.document_id = ${input.documentId}::uuid AND dva.generation_id = ${input.generationId}::uuid) = ${generation.assetCount}
          ` : Prisma.empty}
          AND NOT EXISTS (
            SELECT 1 FROM document_chunks dc
            WHERE dc.document_id = ${input.documentId}::uuid
              AND dc.generation_id = ${input.generationId}::uuid
              AND (dc.status <> 'READY'::"ChunkStatus" OR dc.embedding IS NULL)
          )
          AND NOT EXISTS (
            SELECT 1 FROM document_visual_assets dva
            LEFT JOIN document_visual_asset_indexes dvi ON dvi.visual_asset_id = dva.id
            WHERE dva.document_id = ${input.documentId}::uuid
              AND dva.generation_id = ${input.generationId}::uuid
              AND (dvi.visual_asset_id IS NULL OR dvi.description_status <> 'READY' OR dvi.embedding IS NULL)
          )
          ${generation.status === 'STAGING' ? Prisma.sql`
            AND NOT EXISTS (
              SELECT 1 FROM document_chunks dc
              WHERE dc.document_id = ${input.documentId}::uuid
                AND dc.generation_id = ${input.generationId}::uuid
                AND dc.embedding_model IS DISTINCT FROM ${input.embeddingModel}
            )
            AND NOT EXISTS (
              SELECT 1 FROM document_visual_assets dva
              JOIN document_visual_asset_indexes dvi ON dvi.visual_asset_id = dva.id
              WHERE dva.document_id = ${input.documentId}::uuid
                AND dva.generation_id = ${input.generationId}::uuid
                AND dvi.embedding_model IS DISTINCT FROM ${input.embeddingModel}
            )
          ` : Prisma.empty} AS ready
      `);
      if (!ready[0]?.ready) throw new Error('Geração incompleta: todos os chunks e índices visuais precisam estar prontos e embeddados.');

      if (generation.runId && generation.status === 'STAGING') {
        const run = await tx.knowledgeProcessingRun.findFirst({
          where: {
            id: generation.runId,
            documentId: input.documentId,
            teacherId: input.teacherId,
            monitorId: input.monitorId,
            status: KnowledgeProcessingRunStatus.READY_TO_PUBLISH,
            batches: { every: { status: 'COMPLETED' } },
          },
          select: { id: true, pageCount: true },
        });
        if (!run || run.pageCount !== generation.pageCount) throw new Error('A execução associada deixou de estar pronta ou diverge da cobertura declarada.');
      }

      const switched = await tx.monitorDocument.updateMany({
        where: {
          id: input.documentId,
          teacherId: input.teacherId,
          monitorId: input.monitorId,
          activeGenerationId: input.expectedActiveGenerationId,
        },
        data: { activeGenerationId: input.generationId },
      });
      if (switched.count !== 1) return false;

      await tx.knowledgeDocumentGeneration.updateMany({
        where: { documentId: input.documentId, status: 'ACTIVE' },
        data: { status: 'RETIRED' },
      });
      const activated = await tx.knowledgeDocumentGeneration.updateMany({
        where: { id: input.generationId, status: generation.status },
        data: { status: 'ACTIVE', publishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
      });
      if (activated.count !== 1) throw new Error('A geração deixou de estar disponível antes da publicação.');
      if (generation.runId && generation.status === 'STAGING') {
        const completedRun = await tx.knowledgeProcessingRun.updateMany({
          where: { id: generation.runId, status: KnowledgeProcessingRunStatus.READY_TO_PUBLISH },
          data: { status: KnowledgeProcessingRunStatus.COMPLETED },
        });
        if (completedRun.count !== 1) throw new Error('A execução deixou de estar pronta durante a publicação.');
      }
      return true;
    });
  }

  /** Rollback is another pointer swap; previous generation records stay intact. */
  rollbackGeneration(input: KnowledgeGenerationScope & {
    generationId: string;
    expectedActiveGenerationId: string;
  }): Promise<boolean> {
    if (input.generationId === input.expectedActiveGenerationId) throw new Error('A geração atual não pode ser seu próprio destino de rollback.');
    return this.activateGeneration(input);
  }

  /** Restores the pre-generation legacy view for the first publication rollback. */
  async rollbackToLegacy(input: KnowledgeGenerationScope & { expectedActiveGenerationId: string }): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      const current = await tx.knowledgeDocumentGeneration.findFirst({
        where: {
          id: input.expectedActiveGenerationId,
          documentId: input.documentId,
          teacherId: input.teacherId,
          monitorId: input.monitorId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (!current) throw new Error('A geração ativa não pertence ao escopo de rollback informado.');
      const switched = await tx.monitorDocument.updateMany({
        where: {
          id: input.documentId,
          teacherId: input.teacherId,
          monitorId: input.monitorId,
          activeGenerationId: input.expectedActiveGenerationId,
        },
        data: { activeGenerationId: null },
      });
      if (switched.count !== 1) return false;
      const retired = await tx.knowledgeDocumentGeneration.updateMany({
        where: { id: input.expectedActiveGenerationId, status: 'ACTIVE' },
        data: { status: 'RETIRED' },
      });
      if (retired.count !== 1) throw new Error('A geração ativa mudou durante o rollback.');
      return true;
    });
  }
}
