import assert from 'node:assert/strict';
import test from 'node:test';
import { QuestionBankMaterializationRecoveryService } from '../question-bank-materialization-recovery.service.js';

test('recovery re-enqueues durable pending runs with a stable retry generation', async () => {
  const enqueued: Array<{ id: string; generation?: number }> = [];
  const service = new QuestionBankMaterializationRecoveryService(
    { async findRecoverableQuestionBankMaterializationRuns() { return [{ id: 'run-a', attempts: 0 }, { id: 'run-b', attempts: 4 }]; } },
    { async enqueue(id, generation) { enqueued.push({ id, generation }); } },
  );

  assert.deepEqual(await service.recover(), { found: 2, enqueued: 2 });
  assert.deepEqual(enqueued, [{ id: 'run-a', generation: 0 }, { id: 'run-b', generation: 1 }]);
});

test('recovery continues after a temporary enqueue failure', async () => {
  const enqueued: string[] = [];
  const service = new QuestionBankMaterializationRecoveryService(
    { async findRecoverableQuestionBankMaterializationRuns() { return [{ id: 'run-a', attempts: 0 }, { id: 'run-b', attempts: 0 }]; } },
    { async enqueue(id) { if (id === 'run-a') throw new Error('redis down'); enqueued.push(id); } },
  );

  assert.deepEqual(await service.recover(), { found: 2, enqueued: 1 });
  assert.deepEqual(enqueued, ['run-b']);
});
