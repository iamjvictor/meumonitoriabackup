import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentProcessingStageWatchdog } from '../document-processing-stage-watchdog.service.js';

test('emits one stalled event when a persisted processing stage exceeds timeout plus grace', async () => {
  const events: Array<Record<string, unknown>> = [];
  const watchdog = new DocumentProcessingStageWatchdog({
    async listProcessingJobs() { return [{ id: 'job-1', documentId: 'doc-1', attempts: 2, inputSnapshot: {
      currentStage: 'DOC_CHUNKER_HTTP', requestId: 'req-1', stageStartedAt: '2026-10-24T10:00:00.000Z', timeoutMs: 60_000,
    } }]; },
    emit(event) { events.push(event); },
    now: () => Date.parse('2026-10-24T10:01:31.000Z'), graceMs: 30_000,
  });
  await watchdog.scan();
  await watchdog.scan();
  assert.equal(events.length, 1);
  assert.equal(events[0]?.event, 'document_stage.stalled');
  assert.equal(events[0]?.request_id, 'req-1');
  assert.equal(events[0]?.stage, 'DOC_CHUNKER_HTTP');
});
