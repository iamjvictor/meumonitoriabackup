import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../../lib/prisma.js';

test('persists the active processing stage without discarding its original input snapshot', { concurrency: false }, async () => {
  const repository = await import('../document-processing-job.repository.js');
  const originalFindUnique = prisma.documentProcessingJob.findUnique;
  const originalUpdate = prisma.documentProcessingJob.update;
  let updateArgs: any;
  try {
    (prisma.documentProcessingJob as any).findUnique = async () => ({ inputSnapshot: { documentTextId: 'text-1', sourceMode: 'docling' } });
    (prisma.documentProcessingJob as any).update = async (args: any) => { updateArgs = args; return {}; };
    await repository.updateDocumentProcessingStage('doc-1', 'CREATE_RETRIEVAL_CHUNKS', 'DOC_CHUNKER_HTTP', 'request-1', 600_000);
    assert.equal(updateArgs.data.inputSnapshot.documentTextId, 'text-1');
    assert.equal(updateArgs.data.inputSnapshot.sourceMode, 'docling');
    assert.equal(updateArgs.data.inputSnapshot.currentStage, 'DOC_CHUNKER_HTTP');
    assert.equal(updateArgs.data.inputSnapshot.requestId, 'request-1');
    assert.equal(updateArgs.data.inputSnapshot.timeoutMs, 600_000);
    assert.equal(updateArgs.data.inputSnapshot.stallEventKey, null);
  } finally {
    (prisma.documentProcessingJob as any).findUnique = originalFindUnique;
    (prisma.documentProcessingJob as any).update = originalUpdate;
  }
});

test('claims a stalled event once for a processing attempt', { concurrency: false }, async () => {
  const repository = await import('../document-processing-job.repository.js');
  const originalExecuteRaw = prisma.$executeRaw;
  try {
    (prisma as any).$executeRaw = async () => 1;
    assert.equal(await repository.claimDocumentProcessingStallEvent({ id: '00000000-0000-4000-8000-000000000001', attempts: 2 }, 'job:2:convert'), true);
    (prisma as any).$executeRaw = async () => 0;
    assert.equal(await repository.claimDocumentProcessingStallEvent({ id: '00000000-0000-4000-8000-000000000001', attempts: 2 }, 'job:2:convert'), false);
  } finally {
    (prisma as any).$executeRaw = originalExecuteRaw;
  }
});
