import { createHash, randomUUID } from 'node:crypto';
import { KnowledgeProcessingRunStatus } from '@prisma/client';
import { env } from '../../config/env.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import {
  KnowledgeProcessingRepository,
  type CreateKnowledgeRunInput,
} from '../../repositories/knowledge-processing.repository.js';
import { KnowledgeBatchClient } from './doc-chunker/knowledge-batch.client.js';

const ARTIFACT_BUCKET = 'document-parser-artifacts';
const LEASE_SECONDS = 90;

type BatchClient = Pick<KnowledgeBatchClient, 'convert'>;
type Storage = {
  upload(path: string, body: Buffer, options: { contentType: string; upsert: boolean }): Promise<{ error: unknown | null }>;
  download(path: string): Promise<{ data: Blob | null; error: unknown | null }>;
};
type Logger = (event: string, fields: Record<string, unknown>) => void;

export type KnowledgeBatchProcessingInput = Omit<CreateKnowledgeRunInput, 'batchSize' | 'pageBudgetSeconds'> & {
  pageBudgetSeconds?: number;
  fileName: string;
  mimeType: string;
  fileBytes: Uint8Array;
  owner?: string;
  leaseSeconds?: number;
  signal?: AbortSignal;
};

export type KnowledgeBatchProcessingResult = {
  runId: string;
  status: 'QUEUED' | 'RUNNING' | 'PAUSED_TIMEOUT' | 'FAILED' | 'READY_TO_PUBLISH' | 'COMPLETED' | 'CANCELLED' | 'LOCKED';
  completedPages: number;
  totalPages: number;
  completedBatches: number;
  totalBatches: number;
  retryable: boolean;
};

/** Processes one bounded slice of a durable run; a queue retry resumes from committed batches. */
export class KnowledgeBatchProcessingService {
  constructor(private readonly dependencies: {
    repository?: KnowledgeProcessingRepository;
    client: BatchClient;
    storage?: Storage;
    logger?: Logger;
    now?: () => Date;
    heartbeatIntervalMs?: number;
    featureEnabled?: boolean;
  }) {}

  async process(input: KnowledgeBatchProcessingInput): Promise<KnowledgeBatchProcessingResult> {
    if (!(this.dependencies.featureEnabled ?? env.KNOWLEDGE_BATCH_PROCESSING_ENABLED)) throw new Error('O processamento em lotes da base de conhecimento está desativado.');
    const repository = this.dependencies.repository ?? new KnowledgeProcessingRepository();
    const storage = this.dependencies.storage ?? supabaseAdmin.storage.from(ARTIFACT_BUCKET) as unknown as Storage;
    const now = this.dependencies.now ?? (() => new Date());
    const owner = input.owner ?? randomUUID();
    const batchSize = env.KNOWLEDGE_BATCH_SIZE;
    const run = await repository.createOrResumeRun({
      ...input,
      batchSize,
      pageBudgetSeconds: input.pageBudgetSeconds ?? env.KNOWLEDGE_DOCUMENT_BUDGET_SECONDS,
    });
    if (input.explicitRestartKey && run.status === KnowledgeProcessingRunStatus.QUEUED) {
      const candidates = await repository.findReusableCheckpoints(run.id);
      for (const candidate of candidates) {
        try {
          const { targetBatchId, sourceBatch } = candidate;
          const sourcePath = buildArtifactPath(input.teacherId, input.documentId, sourceBatch.runId, sourceBatch.batchKey);
          if (sourceBatch.artifactPath !== sourcePath || !sourceBatch.artifactChecksum || !sourceBatch.manifest) continue;
          const artifactBytes = await verifyStoredArtifact(storage, sourcePath, sourceBatch.artifactChecksum);
          validateReusableArtifact(artifactBytes, sourceBatch.manifest, {
            documentId: input.documentId,
            runId: sourceBatch.run.id,
            contentHash: input.contentHash,
            configurationHash: input.configurationHash,
            parserVersion: input.parserVersion,
            pageStart: sourceBatch.pageStart,
            pageEnd: sourceBatch.pageEnd,
            schemaVersion: input.schemaVersion ?? 'knowledge-batch-v1',
          });
          await repository.adoptReusableCheckpoint(targetBatchId, sourceBatch.id);
        } catch (error) {
          this.log('knowledge.checkpoint.reuse_rejected', {
            run_id: run.id, batch_id: candidate.targetBatchId, stage: 'checkpoint_validation',
            error_code: errorCode(error), heartbeat_at: now().toISOString(),
          });
        }
      }
      await repository.markRunReadyIfAllCheckpointsComplete(run.id);
    }
    const lease = await repository.acquireRunLease(run.id, owner, input.leaseSeconds ?? LEASE_SECONDS);
    if (!lease) {
      const current = await repository.findRunProgress(run.id);
      const status = current && ['FAILED', 'READY_TO_PUBLISH', 'COMPLETED', 'CANCELLED'].includes(current.status)
        ? current.status
        : 'LOCKED';
      return await this.progress(repository, run.id, input.pageCount, status as KnowledgeBatchProcessingResult['status']);
    }

    try {
      await repository.recoverAbandonedBatches(lease);
      while (true) {
        if (input.signal?.aborted) {
          await repository.releaseRunLease(lease);
          return await this.progress(repository, run.id, input.pageCount, 'QUEUED');
        }
        const batch = await repository.claimNextBatch(lease);
        if (!batch) break;
        const startedAt = now().getTime();
        this.log('knowledge.batch.started', {
          run_id: run.id, batch_id: batch.id, page_start: batch.pageStart, page_end: batch.pageEnd,
          stage: 'conversion', heartbeat_at: now().toISOString(),
        });
        let heartbeatValid = true;
        let heartbeatCheck = Promise.resolve(true);
        const leaseSeconds = input.leaseSeconds ?? LEASE_SECONDS;
        let lastBudgetHeartbeatAt = startedAt;
        let uncommittedMilliseconds = 0;
        let stoppedHeartbeat: Promise<boolean> | undefined;
        const flushBudget = async () => {
          const at = now().getTime();
          const elapsedMilliseconds = Math.max(0, at - lastBudgetHeartbeatAt) + uncommittedMilliseconds;
          const wholeSeconds = Math.floor(elapsedMilliseconds / 1000);
          const valid = await repository.heartbeat(lease, leaseSeconds, wholeSeconds);
          if (valid) {
            lastBudgetHeartbeatAt = at;
            uncommittedMilliseconds = elapsedMilliseconds - wholeSeconds * 1000;
          }
          return valid;
        };
        const heartbeatTimer = setInterval(() => {
          heartbeatCheck = heartbeatCheck
            .then(async (valid) => valid && flushBudget())
            .catch(() => false);
        }, this.dependencies.heartbeatIntervalMs ?? Math.max(1_000, Math.floor(leaseSeconds * 1000 / 3)));
        const stopHeartbeat = () => {
          if (stoppedHeartbeat) return stoppedHeartbeat;
          clearInterval(heartbeatTimer);
          stoppedHeartbeat = heartbeatCheck.then(async (valid) => valid && flushBudget()).catch(() => false);
          return stoppedHeartbeat;
        };
        try {
          const beforeBatch = await repository.findRunProgress(run.id);
          if (!beforeBatch) throw new Error('Execução de conhecimento não encontrada antes da conversão.');
          const remainingBudgetSeconds = Math.max(1, beforeBatch.pageBudgetSeconds - beforeBatch.consumedSeconds);
          const documentDeadline = AbortSignal.timeout(remainingBudgetSeconds * 1000);
          const batchSignal = input.signal ? AbortSignal.any([input.signal, documentDeadline]) : documentDeadline;
          const result = await this.dependencies.client.convert({
            documentId: input.documentId, runId: run.id, contentHash: input.contentHash,
            configurationHash: input.configurationHash, pageStart: batch.pageStart, pageEnd: batch.pageEnd,
            profile: input.profile as Record<string, unknown>, fileName: input.fileName,
            mimeType: input.mimeType, fileBytes: input.fileBytes, signal: batchSignal,
          });
          if (result.manifest.parserVersion !== input.parserVersion) throw new Error('A versão do parser difere da identidade imutável da execução.');
          const artifactPath = buildArtifactPath(input.teacherId, input.documentId, run.id, batch.batchKey);
          const upload = await storage.upload(artifactPath, result.artifact, { contentType: 'application/json', upsert: true });
          if (upload.error) throw new Error('Falha ao enviar checkpoint para Storage privado.');
          await verifyStoredArtifact(storage, artifactPath, result.artifactChecksum);
          heartbeatValid = await stopHeartbeat();
          if (!heartbeatValid) throw new Error('Lease expirou antes da confirmação do checkpoint.');
          const completed = await repository.completeBatch(lease, batch.id, {
            path: artifactPath,
            checksum: result.artifactChecksum,
            manifest: result.manifest as never,
            durationMs: result.durationMs,
          });
          if (!completed) throw new Error('Lease perdeu validade antes da conclusão do lote.');
          this.log('knowledge.batch.completed', {
            run_id: run.id, batch_id: batch.id, page_start: batch.pageStart, page_end: batch.pageEnd,
            stage: 'checkpoint', duration_ms: result.durationMs, heartbeat_at: now().toISOString(),
          });
        } catch (error) {
          heartbeatValid = await stopHeartbeat();
          const elapsedSeconds = Math.max(0, Math.ceil((now().getTime() - startedAt) / 1000));
          await repository.failBatch(lease, batch.id, safeMessage(error));
          const afterFailure = await repository.findRunProgress(run.id);
          if (afterFailure && afterFailure.consumedSeconds >= afterFailure.pageBudgetSeconds) {
            await repository.finishRun(lease, KnowledgeProcessingRunStatus.PAUSED_TIMEOUT, 'Orçamento acumulado da execução foi atingido; os checkpoints anteriores foram preservados.');
            this.log('knowledge.run.paused_timeout', {
              run_id: run.id, batch_id: batch.id, page_start: batch.pageStart, page_end: batch.pageEnd,
              stage: 'document_budget', consumed_seconds: afterFailure.consumedSeconds,
              page_budget_seconds: afterFailure.pageBudgetSeconds, heartbeat_at: now().toISOString(),
            });
            return await this.progress(repository, run.id, input.pageCount, 'PAUSED_TIMEOUT', true);
          }
          const exhausted = batch.attempts >= env.KNOWLEDGE_BATCH_MAX_ATTEMPTS;
          const status = exhausted ? 'FAILED' : 'QUEUED';
          if (exhausted) await repository.finishRun(lease, KnowledgeProcessingRunStatus.FAILED, 'Uma ou mais páginas falharam após o limite de tentativas.');
          else await repository.releaseRunLease(lease);
          this.log('knowledge.batch.failed', {
            run_id: run.id, batch_id: batch.id, page_start: batch.pageStart, page_end: batch.pageEnd,
            stage: 'conversion', duration_ms: elapsedSeconds * 1000, retryable: !exhausted,
            error_code: errorCode(error), heartbeat_at: now().toISOString(),
          });
          return await this.progress(repository, run.id, input.pageCount, status, !exhausted);
        }
      }

      const refreshed = await repository.findRunProgress(run.id);
      if (!refreshed) throw new Error('Execução de conhecimento desapareceu durante o processamento.');
      if (refreshed.consumedSeconds >= refreshed.pageBudgetSeconds && refreshed.status === 'RUNNING') {
        await repository.finishRun(lease, KnowledgeProcessingRunStatus.PAUSED_TIMEOUT, 'Orçamento acumulado da execução foi atingido.');
      } else if (refreshed.status === 'RUNNING') {
        await repository.releaseRunLease(lease);
      }
      return await this.progress(repository, run.id, input.pageCount);
    } catch (error) {
      await repository.finishRun(lease, KnowledgeProcessingRunStatus.FAILED, safeMessage(error));
      throw error;
    }
  }

  private async progress(repository: KnowledgeProcessingRepository, runId: string, pageCount: number, forcedStatus?: KnowledgeBatchProcessingResult['status'], retryable = false): Promise<KnowledgeBatchProcessingResult> {
    const progress = await repository.findRunProgress(runId);
    if (!progress) throw new Error('Execução de conhecimento não encontrada.');
    const completedBatches = progress.batches.filter((batch) => batch.status === 'COMPLETED').length;
    const completedPages = progress.batches.filter((batch) => batch.status === 'COMPLETED').reduce((sum, batch) => sum + batch.pageEnd - batch.pageStart + 1, 0);
    return {
      runId,
      status: forcedStatus ?? progress.status,
      completedPages: Math.min(completedPages, pageCount),
      totalPages: pageCount,
      completedBatches,
      totalBatches: progress.batches.length,
      retryable,
    };
  }

  private log(event: string, fields: Record<string, unknown>) {
    this.dependencies.logger?.(event, { timestamp: new Date().toISOString(), service: 'worker', ...fields });
  }
}

export function createKnowledgeBatchProcessingService() {
  if (env.KNOWLEDGE_BATCH_PROCESSING_ENABLED && !env.KNOWLEDGE_BATCH_SERVICE_TOKEN?.trim()) {
    throw new Error('KNOWLEDGE_BATCH_SERVICE_TOKEN é obrigatório com processamento em lotes habilitado.');
  }
  return new KnowledgeBatchProcessingService({
    client: new KnowledgeBatchClient({
      baseUrl: env.DOCUMENT_CHUNKER_BASE_URL ?? 'http://127.0.0.1:8080',
      serviceToken: env.KNOWLEDGE_BATCH_SERVICE_TOKEN ?? '',
      requestTimeoutMs: Math.max(env.KNOWLEDGE_BATCH_REQUEST_TIMEOUT_MS, env.KNOWLEDGE_BATCH_TIMEOUT_MS + 30_000),
    }),
  });
}

export function buildArtifactPath(teacherId: string, documentId: string, runId: string, batchKey: string) {
  if (![teacherId, documentId, runId].every(isUuid) || !/^[a-f0-9]{64}$/i.test(batchKey)) throw new Error('Identidade inválida para caminho de checkpoint.');
  return `knowledge-batches/${teacherId}/${documentId}/${runId}/${batchKey}.json`;
}

async function verifyStoredArtifact(storage: Storage, path: string, expectedChecksum: string) {
  const downloaded = await storage.download(path);
  if (downloaded.error || !downloaded.data) throw new Error('Checkpoint enviado não pôde ser verificado no Storage.');
  const bytes = Buffer.from(await downloaded.data.arrayBuffer());
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expectedChecksum) throw new Error('Checksum do checkpoint no Storage não confere.');
  return bytes;
}

function validateReusableArtifact(
  bytes: Buffer,
  storedManifest: unknown,
  expected: { documentId: string; runId: string; contentHash: string; configurationHash: string; parserVersion: string; pageStart: number; pageEnd: number; schemaVersion: string },
) {
  let artifact: unknown;
  try { artifact = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('Checkpoint reutilizável não contém JSON válido.'); }
  if (!Array.isArray(artifact) || !artifact.every((entry) => isRecord(entry)
    && typeof entry.path === 'string' && safeArtifactPath(entry.path)
    && typeof entry.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(entry.sha256)
    && typeof entry.contentBase64 === 'string')) throw new Error('Pacote de checkpoint reutilizável inválido.');
  for (const entry of artifact) {
    const content = Buffer.from(entry.contentBase64 as string, 'base64');
    if (content.toString('base64') !== entry.contentBase64 || createHash('sha256').update(content).digest('hex') !== (entry.sha256 as string).toLowerCase()) {
      throw new Error('Checksum interno do checkpoint reutilizável inválido.');
    }
  }
  if (!isRecord(storedManifest)
    || storedManifest.documentId !== expected.documentId || storedManifest.runId !== expected.runId
    || storedManifest.contentHash !== expected.contentHash || storedManifest.configurationHash !== expected.configurationHash
    || storedManifest.parserVersion !== expected.parserVersion || storedManifest.schemaVersion !== expected.schemaVersion
    || storedManifest.pageStart !== expected.pageStart || storedManifest.pageEnd !== expected.pageEnd
    || !Array.isArray(storedManifest.pages) || storedManifest.pages.length !== expected.pageEnd - expected.pageStart + 1
    || !Array.isArray(storedManifest.files)) throw new Error('Manifest do checkpoint reutilizável diverge da identidade esperada.');
  const seenPages = new Set<number>();
  for (const page of storedManifest.pages) {
    if (!isRecord(page) || typeof page.pageNumber !== 'number' || !Number.isInteger(page.pageNumber)) throw new Error('Cobertura de páginas do checkpoint reutilizável é incompleta ou inválida.');
    const pageNumber = page.pageNumber;
    if (pageNumber < expected.pageStart || pageNumber > expected.pageEnd
      || seenPages.has(pageNumber) || !['CONVERTED', 'VERIFIED_BLANK'].includes(page.status as string)
      || (page.status === 'VERIFIED_BLANK' && (typeof page.blankEvidence !== 'string' || !page.blankEvidence.trim()))) {
      throw new Error('Cobertura de páginas do checkpoint reutilizável é incompleta ou inválida.');
    }
    seenPages.add(pageNumber);
  }
  for (let page = expected.pageStart; page <= expected.pageEnd; page++) if (!seenPages.has(page)) throw new Error('Checkpoint reutilizável possui lacuna de páginas.');
  if (storedManifest.files.length !== artifact.length) throw new Error('Lista de arquivos do manifest diverge do pacote do checkpoint.');
  for (let index = 0; index < artifact.length; index += 1) {
    const file = storedManifest.files[index];
    const packaged = artifact[index];
    if (!isRecord(file) || !isRecord(packaged) || file.path !== packaged.path || file.sha256 !== packaged.sha256) {
      throw new Error('Manifest e pacote do checkpoint reutilizável não correspondem.');
    }
  }
}

function safeArtifactPath(path: string) {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\') && path.split('/').every((part) => part && part !== '.' && part !== '..');
}
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }

function safeMessage(error: unknown) { return (error instanceof Error ? error.message : 'Falha desconhecida no lote').slice(0, 2000); }
function errorCode(error: unknown) { return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'KNOWLEDGE_BATCH_FAILED'; }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
