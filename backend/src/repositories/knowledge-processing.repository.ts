import { createHash } from 'node:crypto';
import {
  KnowledgeProcessingBatchStatus,
  KnowledgeProcessingRunStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';

export type KnowledgeBatchPlan = {
  pageStart: number;
  pageEnd: number;
  batchKey: string;
};

export type CreateKnowledgeRunInput = {
  documentId: string;
  teacherId: string;
  monitorId: string;
  contentHash: string;
  configurationHash: string;
  parserVersion: string;
  profile: Prisma.InputJsonValue;
  pageCount: number;
  pageBudgetSeconds: number;
  batchSize: number;
  schemaVersion?: string;
  maxAttempts?: number;
  /** Stable BullMQ job id for one explicit teacher-triggered restart. */
  explicitRestartKey?: string;
};

export type KnowledgeLease = { runId: string; owner: string; expiresAt: Date };

/** Persistence and fencing primitives for resumable knowledge document runs. */
export class KnowledgeProcessingRepository {
  constructor(private readonly db: typeof prisma = prisma) {}

  async createOrResumeRun(input: CreateKnowledgeRunInput) {
    validateCreateInput(input);
    const schemaVersion = input.schemaVersion ?? 'knowledge-batch-v1';
    const identity = [input.teacherId, input.documentId, input.contentHash, input.parserVersion, input.configurationHash, schemaVersion].join(':');
    const advisoryKey = BigInt.asIntN(64, BigInt(`0x${createHash('sha256').update(identity).digest('hex').slice(0, 16)}`)).toString();

    return this.db.$transaction(async (tx) => {
      // Serialize planning for the same content/config identity before creating a run or batches.
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${advisoryKey}::bigint)::text`);
      const identityWhere = {
          documentId: input.documentId,
          teacherId: input.teacherId,
          monitorId: input.monitorId,
          contentHash: input.contentHash,
          configurationHash: input.configurationHash,
          parserVersion: input.parserVersion,
          schemaVersion,
      };

      const explicitRun = input.explicitRestartKey
        ? await tx.knowledgeProcessingRun.findFirst({
          where: {
            documentId: input.documentId, teacherId: input.teacherId,
            monitorId: input.monitorId, explicitRestartKey: input.explicitRestartKey,
          },
        })
        : null;

      if (explicitRun) {
        assertRunIdentity(explicitRun, input, schemaVersion);
        if (explicitRun.pageCount !== input.pageCount) throw new Error('A contagem de páginas diverge para a mesma chave explícita de reprocessamento.');
        await this.extendPausedRunBudget(tx, explicitRun, input.pageBudgetSeconds);
        await this.ensureBatches(explicitRun.id, input, schemaVersion, tx);
        return tx.knowledgeProcessingRun.findUniqueOrThrow({ where: { id: explicitRun.id }, include: { batches: { orderBy: { pageStart: 'asc' } } } });
      }

      const latest = await tx.knowledgeProcessingRun.findFirst({ where: identityWhere, orderBy: { createdAt: 'desc' } });
      if (latest && latest.pageCount !== input.pageCount) {
        throw new Error('A contagem de páginas diverge para o mesmo hash de conteúdo; não é seguro reutilizar as chaves de lote.');
      }

      if (latest && !input.explicitRestartKey) {
        await this.extendPausedRunBudget(tx, latest, input.pageBudgetSeconds);
        await this.ensureBatches(latest.id, input, schemaVersion, tx);
        return tx.knowledgeProcessingRun.findUniqueOrThrow({ where: { id: latest.id }, include: { batches: { orderBy: { pageStart: 'asc' } } } });
      }

      if (input.explicitRestartKey && latest) {
        const activeRun = await tx.knowledgeProcessingRun.findFirst({
          where: {
            ...identityWhere,
            status: { in: [KnowledgeProcessingRunStatus.QUEUED, KnowledgeProcessingRunStatus.RUNNING, KnowledgeProcessingRunStatus.READY_TO_PUBLISH] },
          },
          select: { id: true, status: true },
        });
        if (activeRun) throw new Error(`Já existe uma execução de conhecimento ${activeRun.status.toLowerCase()} para este documento; aguarde o término antes de iniciar outro reprocessamento.`);
      }

      const run = await tx.knowledgeProcessingRun.create({
        data: {
          documentId: input.documentId,
          teacherId: input.teacherId,
          monitorId: input.monitorId,
          contentHash: input.contentHash,
          configurationHash: input.configurationHash,
          parserVersion: input.parserVersion,
          schemaVersion,
          explicitRestartKey: input.explicitRestartKey ?? null,
          profile: input.profile,
          pageCount: input.pageCount,
          pageBudgetSeconds: input.pageBudgetSeconds,
        },
      });
      await this.ensureBatches(run.id, input, schemaVersion, tx);
      return tx.knowledgeProcessingRun.findUniqueOrThrow({ where: { id: run.id }, include: { batches: { orderBy: { pageStart: 'asc' } } } });
    });
  }

  private async extendPausedRunBudget(tx: Prisma.TransactionClient, run: { id: string; status: KnowledgeProcessingRunStatus; pageBudgetSeconds: number }, requestedBudget: number) {
    if (run.status !== KnowledgeProcessingRunStatus.PAUSED_TIMEOUT || run.pageBudgetSeconds >= requestedBudget) return;
    await tx.knowledgeProcessingRun.updateMany({
      where: { id: run.id, status: KnowledgeProcessingRunStatus.PAUSED_TIMEOUT, pageBudgetSeconds: run.pageBudgetSeconds },
      data: { pageBudgetSeconds: requestedBudget, status: KnowledgeProcessingRunStatus.QUEUED, errorMessage: null, heartbeatAt: new Date() },
    });
  }

  async findReusableCheckpoints(runId: string) {
    const targetRun = await this.db.knowledgeProcessingRun.findUnique({
      where: { id: runId },
      select: { id: true, documentId: true, teacherId: true, monitorId: true, contentHash: true, configurationHash: true, parserVersion: true, schemaVersion: true, pageCount: true },
    });
    if (!targetRun) throw new Error('Execução de conhecimento não encontrada para reaproveitar checkpoints.');
    const targets = await this.db.knowledgeProcessingBatch.findMany({
      where: { runId, status: KnowledgeProcessingBatchStatus.PENDING },
      orderBy: { pageStart: 'asc' },
      select: { id: true, batchKey: true, pageStart: true, pageEnd: true },
    });
    const reusable = [];
    for (const target of targets) {
      const source = await this.db.knowledgeProcessingBatch.findFirst({
        where: {
          batchKey: target.batchKey,
          status: KnowledgeProcessingBatchStatus.COMPLETED,
          checkpointSourceRunId: null,
          artifactPath: { not: null },
          artifactChecksum: { not: null },
          run: {
            is: {
              documentId: targetRun.documentId,
              teacherId: targetRun.teacherId,
              monitorId: targetRun.monitorId,
              contentHash: targetRun.contentHash,
              configurationHash: targetRun.configurationHash,
              parserVersion: targetRun.parserVersion,
              schemaVersion: targetRun.schemaVersion,
              pageCount: targetRun.pageCount,
              status: { in: [KnowledgeProcessingRunStatus.PAUSED_TIMEOUT, KnowledgeProcessingRunStatus.FAILED, KnowledgeProcessingRunStatus.COMPLETED, KnowledgeProcessingRunStatus.CANCELLED] },
            },
          },
        },
        orderBy: { completedAt: 'desc' },
        select: {
          id: true, runId: true, batchKey: true, documentId: true, teacherId: true, monitorId: true,
          pageStart: true, pageEnd: true, artifactPath: true, artifactChecksum: true,
          manifest: true, durationMs: true, completedAt: true,
          run: { select: { id: true, documentId: true, teacherId: true, monitorId: true, contentHash: true, configurationHash: true, parserVersion: true, schemaVersion: true, pageCount: true } },
        },
      });
      if (source && source.runId !== runId && source.id !== target.id
        && source.pageStart === target.pageStart && source.pageEnd === target.pageEnd) {
        reusable.push({ targetBatchId: target.id, sourceBatch: source });
      }
    }
    return reusable;
  }

  async adoptReusableCheckpoint(targetBatchId: string, sourceBatchId: string): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      const [target, source] = await Promise.all([
        tx.knowledgeProcessingBatch.findUnique({ where: { id: targetBatchId }, include: { run: true } }),
        tx.knowledgeProcessingBatch.findUnique({ where: { id: sourceBatchId }, include: { run: true } }),
      ]);
      if (!target || !source || target.status !== KnowledgeProcessingBatchStatus.PENDING
        || source.status !== KnowledgeProcessingBatchStatus.COMPLETED || source.checkpointSourceRunId !== null
        || source.batchKey !== target.batchKey || source.pageStart !== target.pageStart || source.pageEnd !== target.pageEnd
        || source.documentId !== target.documentId || source.teacherId !== target.teacherId || source.monitorId !== target.monitorId
        || source.runId === target.runId || !source.artifactPath || !source.artifactChecksum || !source.manifest) return false;
      if (target.run.status !== KnowledgeProcessingRunStatus.QUEUED
        || source.run.documentId !== target.run.documentId || source.run.teacherId !== target.run.teacherId
        || source.run.monitorId !== target.run.monitorId || source.run.contentHash !== target.run.contentHash
        || source.run.configurationHash !== target.run.configurationHash || source.run.parserVersion !== target.run.parserVersion
        || source.run.schemaVersion !== target.run.schemaVersion
        || source.run.pageCount !== target.run.pageCount
        || !new Set<KnowledgeProcessingRunStatus>([KnowledgeProcessingRunStatus.PAUSED_TIMEOUT, KnowledgeProcessingRunStatus.FAILED, KnowledgeProcessingRunStatus.COMPLETED, KnowledgeProcessingRunStatus.CANCELLED]).has(source.run.status)) return false;

      const changed = await tx.knowledgeProcessingBatch.updateMany({
        where: { id: target.id, runId: target.runId, status: KnowledgeProcessingBatchStatus.PENDING },
        data: {
          checkpointSourceRunId: source.runId,
          status: KnowledgeProcessingBatchStatus.COMPLETED,
          artifactPath: source.artifactPath,
          artifactChecksum: source.artifactChecksum,
          manifest: source.manifest,
          durationMs: source.durationMs,
          completedAt: source.completedAt,
          errorMessage: null,
        },
      });
      return changed.count === 1;
    });
  }

  async markRunReadyIfAllCheckpointsComplete(runId: string): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      const remaining = await tx.knowledgeProcessingBatch.count({ where: { runId, status: { not: KnowledgeProcessingBatchStatus.COMPLETED } } });
      if (remaining > 0) return false;
      const changed = await tx.knowledgeProcessingRun.updateMany({
        where: { id: runId, status: KnowledgeProcessingRunStatus.QUEUED, leaseOwner: null, leaseExpiresAt: null },
        data: { status: KnowledgeProcessingRunStatus.READY_TO_PUBLISH, heartbeatAt: new Date(), errorMessage: null },
      });
      return changed.count === 1;
    });
  }

  async acquireRunLease(runId: string, owner: string, leaseSeconds: number): Promise<KnowledgeLease | null> {
    if (!owner.trim() || leaseSeconds < 1) throw new Error('Lease owner and duration are required.');
    const expiresAt = new Date(Date.now() + leaseSeconds * 1000);
    const result = await this.db.knowledgeProcessingRun.updateMany({
      where: {
        id: runId,
        status: { in: [KnowledgeProcessingRunStatus.QUEUED, KnowledgeProcessingRunStatus.RUNNING, KnowledgeProcessingRunStatus.PAUSED_TIMEOUT] },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: new Date() } }, { leaseOwner: owner }],
      },
      data: {
        status: KnowledgeProcessingRunStatus.RUNNING,
        leaseOwner: owner,
        leaseExpiresAt: expiresAt,
        heartbeatAt: new Date(),
        errorMessage: null,
      },
    });
    return result.count === 1 ? { runId, owner, expiresAt } : null;
  }

  async heartbeat(lease: KnowledgeLease, leaseSeconds: number, consumedSecondsDelta = 0): Promise<boolean> {
    if (consumedSecondsDelta < 0) throw new Error('Consumed seconds delta cannot be negative.');
    const now = new Date();
    const result = await this.db.knowledgeProcessingRun.updateMany({
      where: { id: lease.runId, status: KnowledgeProcessingRunStatus.RUNNING, leaseOwner: lease.owner, leaseExpiresAt: { gt: now } },
      data: {
        heartbeatAt: now,
        leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000),
        consumedSeconds: { increment: consumedSecondsDelta },
      },
    });
    return result.count === 1;
  }

  async claimNextBatch(lease: KnowledgeLease) {
    const run = await this.db.knowledgeProcessingRun.findFirst({
      where: { id: lease.runId, status: KnowledgeProcessingRunStatus.RUNNING, leaseOwner: lease.owner, leaseExpiresAt: { gt: new Date() } },
      select: { id: true, consumedSeconds: true, pageBudgetSeconds: true },
    });
    if (!run) return null;
    if (run.consumedSeconds >= run.pageBudgetSeconds) {
      await this.finishRun(lease, KnowledgeProcessingRunStatus.PAUSED_TIMEOUT, 'Documento atingiu o orçamento de processamento.');
      return null;
    }

    const candidate = await this.db.knowledgeProcessingBatch.findFirst({
      where: { runId: run.id, status: { in: [KnowledgeProcessingBatchStatus.PENDING, KnowledgeProcessingBatchStatus.FAILED] }, attempts: { lt: env.KNOWLEDGE_BATCH_MAX_ATTEMPTS } },
      orderBy: { pageStart: 'asc' },
    });
    if (!candidate) return null;
    const claim = await this.db.knowledgeProcessingBatch.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        attempts: candidate.attempts,
        run: {
          is: {
            id: lease.runId,
            status: KnowledgeProcessingRunStatus.RUNNING,
            leaseOwner: lease.owner,
            leaseExpiresAt: { gt: new Date() },
          },
        },
      },
      data: { status: KnowledgeProcessingBatchStatus.RUNNING, attempts: { increment: 1 }, startedAt: new Date(), completedAt: null, errorMessage: null },
    });
    return claim.count === 1 ? this.db.knowledgeProcessingBatch.findUnique({ where: { id: candidate.id } }) : null;
  }

  async recoverAbandonedBatches(lease: KnowledgeLease): Promise<number> {
    return this.db.$transaction(async (tx) => {
      const active = await tx.knowledgeProcessingRun.findFirst({
        where: { id: lease.runId, status: KnowledgeProcessingRunStatus.RUNNING, leaseOwner: lease.owner, leaseExpiresAt: { gt: new Date() } },
        select: { id: true },
      });
      if (!active) return 0;
      const result = await tx.knowledgeProcessingBatch.updateMany({
        where: { runId: lease.runId, status: KnowledgeProcessingBatchStatus.RUNNING },
        data: { status: KnowledgeProcessingBatchStatus.FAILED, completedAt: new Date(), errorMessage: 'Worker interrompido antes de confirmar checkpoint.' },
      });
      return result.count;
    });
  }

  async completeBatch(lease: KnowledgeLease, batchId: string, artifact: { path: string; checksum: string; manifest: Prisma.InputJsonValue; durationMs: number }) {
    return this.db.$transaction(async (tx) => {
      const run = await tx.knowledgeProcessingRun.findFirst({
        where: { id: lease.runId, status: KnowledgeProcessingRunStatus.RUNNING, leaseOwner: lease.owner, leaseExpiresAt: { gt: new Date() } },
        select: { id: true },
      });
      if (!run) return false;
      const changed = await tx.knowledgeProcessingBatch.updateMany({
        where: { id: batchId, runId: lease.runId, status: KnowledgeProcessingBatchStatus.RUNNING },
        data: {
          status: KnowledgeProcessingBatchStatus.COMPLETED,
          artifactPath: artifact.path,
          artifactChecksum: artifact.checksum,
          manifest: artifact.manifest,
          durationMs: artifact.durationMs,
          completedAt: new Date(),
          errorMessage: null,
        },
      });
      if (changed.count !== 1) return false;
      const remaining = await tx.knowledgeProcessingBatch.count({ where: { runId: lease.runId, status: { not: KnowledgeProcessingBatchStatus.COMPLETED } } });
      if (remaining === 0) {
        await tx.knowledgeProcessingRun.updateMany({
          where: { id: lease.runId, leaseOwner: lease.owner, status: KnowledgeProcessingRunStatus.RUNNING },
          data: { status: KnowledgeProcessingRunStatus.READY_TO_PUBLISH, leaseOwner: null, leaseExpiresAt: null, heartbeatAt: new Date() },
        });
      }
      return true;
    });
  }

  async failBatch(lease: KnowledgeLease, batchId: string, message: string) {
    const result = await this.db.knowledgeProcessingBatch.updateMany({
      where: {
        id: batchId,
        runId: lease.runId,
        status: KnowledgeProcessingBatchStatus.RUNNING,
        run: { is: { id: lease.runId, status: KnowledgeProcessingRunStatus.RUNNING, leaseOwner: lease.owner, leaseExpiresAt: { gt: new Date() } } },
      },
      data: { status: KnowledgeProcessingBatchStatus.FAILED, errorMessage: message.slice(0, 2000), completedAt: new Date() },
    });
    return result.count === 1;
  }

  async finishRun(lease: KnowledgeLease, status: KnowledgeProcessingRunStatus, errorMessage?: string) {
    const result = await this.db.knowledgeProcessingRun.updateMany({
      where: { id: lease.runId, status: KnowledgeProcessingRunStatus.RUNNING, leaseOwner: lease.owner },
      data: { status, errorMessage: errorMessage?.slice(0, 2000) ?? null, leaseOwner: null, leaseExpiresAt: null, heartbeatAt: new Date() },
    });
    return result.count === 1;
  }

  async releaseRunLease(lease: KnowledgeLease): Promise<boolean> {
    const result = await this.db.knowledgeProcessingRun.updateMany({
      where: { id: lease.runId, leaseOwner: lease.owner, status: KnowledgeProcessingRunStatus.RUNNING },
      data: { status: KnowledgeProcessingRunStatus.QUEUED, leaseOwner: null, leaseExpiresAt: null, heartbeatAt: new Date() },
    });
    return result.count === 1;
  }

  async findRunProgress(runId: string) {
    return this.db.knowledgeProcessingRun.findUnique({
      where: { id: runId },
      select: {
        id: true, status: true, consumedSeconds: true, pageBudgetSeconds: true,
        batches: { orderBy: { pageStart: 'asc' }, select: { id: true, pageStart: true, pageEnd: true, status: true, attempts: true } },
      },
    });
  }

  private async ensureBatches(runId: string, input: CreateKnowledgeRunInput, schemaVersion: string, db: Pick<typeof prisma, 'knowledgeProcessingBatch'> = this.db) {
    for (let pageStart = 1; pageStart <= input.pageCount; pageStart += input.batchSize) {
      const pageEnd = Math.min(pageStart + input.batchSize - 1, input.pageCount);
      const batchKey = createHash('sha256').update([
        input.teacherId, input.documentId, input.contentHash, input.parserVersion,
        input.configurationHash, pageStart, pageEnd, schemaVersion,
      ].join(':')).digest('hex');
      const batch = await db.knowledgeProcessingBatch.upsert({
        where: { runId_batchKey: { runId, batchKey } },
        create: { runId, documentId: input.documentId, teacherId: input.teacherId, monitorId: input.monitorId, pageStart, pageEnd, batchKey },
        update: {},
      });
      if (batch.runId !== runId || batch.documentId !== input.documentId || batch.teacherId !== input.teacherId || batch.monitorId !== input.monitorId) {
        throw new Error('A chave determinística do lote já está vinculada a outra execução ou tenant.');
      }
    }
  }
}

function validateCreateInput(input: CreateKnowledgeRunInput) {
  if (!/^[a-f0-9]{64}$/i.test(input.contentHash) || !/^[a-f0-9]{64}$/i.test(input.configurationHash)) throw new Error('Knowledge run hashes must be SHA-256 hex strings.');
  if (input.pageCount < 1 || !Number.isInteger(input.pageCount)) throw new Error('Knowledge run pageCount must be a positive integer.');
  if (input.batchSize < 1 || input.batchSize > 20 || !Number.isInteger(input.batchSize)) throw new Error('Knowledge batch size must be between 1 and 20.');
  if (input.pageBudgetSeconds < 1) throw new Error('Knowledge run budget must be positive.');
  if (input.explicitRestartKey !== undefined && (!input.explicitRestartKey.trim() || input.explicitRestartKey.length > 255)) throw new Error('Knowledge explicit restart key must contain 1 to 255 characters.');
  if (input.maxAttempts !== undefined && (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 2)) throw new Error('Knowledge batch maxAttempts must be between 1 and 2.');
}

function assertRunIdentity(run: { contentHash: string; configurationHash: string; parserVersion: string; schemaVersion: string; teacherId: string; documentId: string; monitorId: string }, input: CreateKnowledgeRunInput, schemaVersion: string) {
  if (run.contentHash !== input.contentHash || run.configurationHash !== input.configurationHash || run.parserVersion !== input.parserVersion
    || run.schemaVersion !== schemaVersion || run.teacherId !== input.teacherId || run.documentId !== input.documentId || run.monitorId !== input.monitorId) {
    throw new Error('A chave explícita de reprocessamento já pertence a outra identidade de documento.');
  }
}

export const knowledgeProcessingRepository = new KnowledgeProcessingRepository();
