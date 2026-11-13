import assert from 'node:assert/strict';
import test from 'node:test';

test('returns batch progress in the existing processing endpoint after document ownership check', async (t) => {
  await t.mock.module('../../lib/prisma.js', { namedExports: { prisma: {} } });
  await t.mock.module('../../services/document.service.js', { namedExports: { DocumentQueueError: class extends Error {}, DocumentService: class {} } });
  await t.mock.module('../../repositories/document.repository.js', { namedExports: { DocumentRepositoryError: class extends Error {} } });
  const { DocumentController } = await import('../document.controller.js');
  let readerScope: unknown;
  let response: unknown;
  const progress = {
    runId: 'run-1', status: 'RUNNING', pageCount: 354, completedPages: 20, failedPages: 0,
    progressPercent: 6, consumedSeconds: 900, pageBudgetSeconds: 14_400, heartbeatAt: new Date('2026-11-09T10:00:00Z'),
    updatedAt: new Date('2026-11-09T10:00:00Z'), activeBatch: { pageStart: 21, pageEnd: 30, attempts: 1 },
    batches: [], lastCompletedPage: 20, totalBatches: 36, completedBatches: 2,
  };
  const controller = new DocumentController({
    findProcessingStatus: async () => ({ id: 'doc-1', monitorId: 'monitor-1', tag: 'KNOWLEDGE_BASE', processingJobs: [] }),
  } as never, async (scope) => { readerScope = scope; return progress; });
  await controller.processingStatus({
    user: { id: 'user-1' }, params: { monitorId: 'monitor-1', documentId: 'doc-1' },
  } as never, { send: (value: unknown) => { response = value; return value; } } as never);

  assert.deepEqual(readerScope, { userId: 'user-1', monitorId: 'monitor-1', documentId: 'doc-1' });
  assert.deepEqual(response, { data: {
    id: 'doc-1', monitorId: 'monitor-1', tag: 'KNOWLEDGE_BASE', processingJobs: [], knowledgeProcessing: progress,
  } });
});

test('does not query batch progress for other document types', async (t) => {
  await t.mock.module('../../lib/prisma.js', { namedExports: { prisma: {} } });
  await t.mock.module('../../services/document.service.js', { namedExports: { DocumentQueueError: class extends Error {}, DocumentService: class {} } });
  await t.mock.module('../../repositories/document.repository.js', { namedExports: { DocumentRepositoryError: class extends Error {} } });
  const { DocumentController } = await import('../document.controller.js');
  let progressQueries = 0;
  let response: unknown;
  const controller = new DocumentController({
    findProcessingStatus: async () => ({ id: 'doc-2', monitorId: 'monitor-1', tag: 'QUESTIONS', processingJobs: [] }),
  } as never, async () => { progressQueries += 1; return null; });
  await controller.processingStatus({
    user: { id: 'user-1' }, params: { monitorId: 'monitor-1', documentId: 'doc-2' },
  } as never, { send: (value: unknown) => { response = value; return value; } } as never);

  assert.equal(progressQueries, 0);
  assert.deepEqual(response, { data: { id: 'doc-2', monitorId: 'monitor-1', tag: 'QUESTIONS', processingJobs: [] } });
});
