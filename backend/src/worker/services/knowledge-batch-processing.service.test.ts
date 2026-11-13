import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { KnowledgeProcessingRepository } from '../../repositories/knowledge-processing.repository.js';
import { KnowledgeBatchProcessingService } from './knowledge-batch-processing.service.js';

test('explicit restart adopts a source checkpoint only after storage, package, manifest, and page coverage validation', async () => {
  const documentId = 'b66c921e-20c9-4fc1-81da-a24b7f5e98fa';
  const teacherId = '1c5bf912-8b08-44df-92b5-a791f15f4d51';
  const monitorId = 'cf16a4ef-9f82-4701-8890-8bc39c8077ee';
  const sourceRunId = '2bd061c8-9b86-46b4-904f-d0fac1d8e057';
  const sourceBatchId = 'b271c853-48ab-4362-9d9e-37288f124773';
  const artifactFile = Buffer.from('{"pages":[1,2]}');
  const file = { path: 'batch.json', sha256: sha(artifactFile), contentBase64: artifactFile.toString('base64') };
  const bytes = Buffer.from(JSON.stringify([file]));
  const checksum = sha(bytes);
  const sourceBatch = {
    id: sourceBatchId, runId: sourceRunId, batchKey: 'c'.repeat(64), documentId, teacherId, monitorId,
    pageStart: 1, pageEnd: 2, artifactPath: `knowledge-batches/${teacherId}/${documentId}/${sourceRunId}/${'c'.repeat(64)}.json`,
    artifactChecksum: checksum,
    manifest: {
      schemaVersion: 'knowledge-batch-v1', documentId, runId: sourceRunId, contentHash: 'a'.repeat(64),
      configurationHash: 'b'.repeat(64), parserVersion: 'docling-test', pageStart: 1, pageEnd: 2,
      pages: [1, 2].map((pageNumber) => ({ pageNumber, status: 'CONVERTED', characterCount: 12, layoutItemCount: 2, imageCount: 0, errors: [] })),
      files: [{ path: file.path, sha256: file.sha256 }],
    },
    run: { id: sourceRunId },
  };
  let adopted = 0;
  const repository = {
    async createOrResumeRun() { return { id: 'new-run', status: 'QUEUED' }; },
    async findReusableCheckpoints() { return [{ targetBatchId: 'new-batch', sourceBatch }]; },
    async adoptReusableCheckpoint() { adopted += 1; return true; },
    async markRunReadyIfAllCheckpointsComplete() { return true; },
    async acquireRunLease() { return null; },
    async findRunProgress() { return { id: 'new-run', status: 'READY_TO_PUBLISH', consumedSeconds: 0, pageBudgetSeconds: 100, batches: [{ id: 'new-batch', pageStart: 1, pageEnd: 2, status: 'COMPLETED', attempts: 0 }] }; },
  };
  const service = new KnowledgeBatchProcessingService({
    repository: repository as unknown as KnowledgeProcessingRepository,
    featureEnabled: true,
    client: { async convert() { throw new Error('no conversion expected'); } },
    storage: { async upload() { return { error: null }; }, async download() { return { data: new Blob([bytes]), error: null }; } },
  });

  const result = await service.process({
    documentId, teacherId, monitorId, contentHash: 'a'.repeat(64), configurationHash: 'b'.repeat(64), parserVersion: 'docling-test',
    profile: {}, pageCount: 2, pageBudgetSeconds: 100, explicitRestartKey: 'reprocess-job-1',
    fileName: 'book.pdf', mimeType: 'application/pdf', fileBytes: Buffer.from('%PDF-test'),
  });

  assert.equal(adopted, 1);
  assert.equal(result.status, 'READY_TO_PUBLISH');
  assert.equal(result.completedPages, 2);
});

test('periodic lease heartbeat durably accounts elapsed budget before a worker interruption', async () => {
  const state = { consumedSeconds: 0, status: 'RUNNING', claimed: false, heartbeatCount: 0 };
  const repository = {
    async createOrResumeRun() { return { id: 'run-1' }; },
    async acquireRunLease() { return { runId: 'run-1', owner: 'worker-1', expiresAt: new Date(Date.now() + 30_000) }; },
    async recoverAbandonedBatches() { return 0; },
    async claimNextBatch() {
      if (state.claimed) return null;
      state.claimed = true;
      return { id: 'batch-1', batchKey: 'c'.repeat(64), pageStart: 1, pageEnd: 2, attempts: 1 };
    },
    async heartbeat(_lease: unknown, _seconds: number, delta = 0) { state.consumedSeconds += delta; state.heartbeatCount += 1; return true; },
    async failBatch() { return true; },
    async finishRun(_lease: unknown, status: string) { state.status = status; return true; },
    async releaseRunLease() { state.status = 'QUEUED'; return true; },
    async completeBatch() { return true; },
    async findRunProgress() {
      return {
        id: 'run-1', status: state.status, consumedSeconds: state.consumedSeconds, pageBudgetSeconds: 10_000,
        batches: [{ id: 'batch-1', pageStart: 1, pageEnd: 2, status: 'FAILED', attempts: 1 }],
      };
    },
  };
  const abort = new AbortController();
  let fakeTime = Date.now();
  const service = new KnowledgeBatchProcessingService({
    repository: repository as unknown as KnowledgeProcessingRepository,
    featureEnabled: true,
    heartbeatIntervalMs: 10,
    now: () => { fakeTime += 2_000; return new Date(fakeTime); },
    storage: {
      async upload() { return { error: null }; },
      async download() { return { data: null, error: new Error('should not download') }; },
    },
    client: {
      async convert({ signal }) {
        await new Promise<never>((_resolve, reject) => {
          if (signal?.aborted) reject(new Error('interrupted'));
          else signal?.addEventListener('abort', () => reject(new Error('interrupted')), { once: true });
        });
        throw new Error('unreachable');
      },
    },
  });

  const work = service.process({
    documentId: 'b66c921e-20c9-4fc1-81da-a24b7f5e98fa',
    teacherId: '1c5bf912-8b08-44df-92b5-a791f15f4d51',
    monitorId: 'cf16a4ef-9f82-4701-8890-8bc39c8077ee',
    contentHash: 'a'.repeat(64), configurationHash: 'b'.repeat(64), parserVersion: 'docling-test',
    profile: {}, pageCount: 2, fileName: 'book.pdf', mimeType: 'application/pdf', fileBytes: Buffer.from('%PDF-test'),
    signal: abort.signal,
  });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.ok(state.heartbeatCount > 0, 'heartbeat was committed while conversion remained in progress');
  assert.ok(state.consumedSeconds > 0, 'the execution budget was persisted before conversion ended');
  abort.abort();
  const result = await work;
  assert.equal(result.status, 'QUEUED');
  assert.ok(state.consumedSeconds > 0, 'a subsequent worker can resume with the consumed budget intact');
});

function sha(value: Uint8Array) { return createHash('sha256').update(value).digest('hex'); }
