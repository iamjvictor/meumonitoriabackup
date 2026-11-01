import assert from 'node:assert/strict';
import test from 'node:test';
import { QuestionBankMaterializationWorkerService } from '../question-bank-materialization-worker.service.js';

function work(status: 'QUEUED' | 'PROCESSING' | 'RETRYING' | 'COMPLETED' | 'FAILED' = 'QUEUED') {
  return {
    id: 'run-1', status,
    monitor: {
      id: 'monitor-1', teacherId: 'teacher-1',
      subjects: [{ id: 'subject-1', name: 'Matemática', topics: [{
        id: 'topic-1', name: 'Álgebra', questionBankSelections: [{
          monitorSubtopicId: null, monitorSubsubtopicId: null, examType: 'ENEM', board: null, subtopic: null, subsubtopic: null,
        }],
      }] }],
    },
  } as const;
}

function setup(materialize: (callback?: (progress: never) => Promise<unknown>) => Promise<unknown>) {
  const calls: Array<{ name: string; value?: unknown }> = [];
  const repository = {
    async findQuestionBankMaterializationWork() { return work(); },
    async markQuestionBankMaterializationProcessing() { calls.push({ name: 'processing' }); return { count: 1 }; },
    async updateQuestionBankMaterializationProgress(_runId: string, progress: unknown) { calls.push({ name: 'progress', value: progress }); },
    async finishQuestionBankMaterialization(_runId: string, result: unknown) { calls.push({ name: 'finish', value: result }); },
    async markQuestionBankMaterializationRetrying(_runId: string, error: string) { calls.push({ name: 'retrying', value: error }); },
  };
  const materializer = { async materialize(_input: unknown, callback: (progress: never) => Promise<unknown>) { return materialize(callback); } };
  return { service: new QuestionBankMaterializationWorkerService(repository as never, materializer as never), calls };
}

test('materializa em segundo plano, grava checkpoints e conclui com contagens', async () => {
  const { service, calls } = setup(async (callback) => {
    await callback?.({ totalEligible: 4, processed: 0, created: 0, updated: 0, skipped: 0, failed: 0 } as never);
    await callback?.({ totalEligible: 4, processed: 4, created: 3, updated: 0, skipped: 1, failed: 0 } as never);
    return { processed: 4, created: 3, updated: 0, skipped: 1, failures: [{ reason: 'INVALID' }] };
  });

  await service.process('run-1', 1, 3);

  assert.deepEqual(calls.map(({ name }) => name), ['processing', 'progress', 'progress', 'finish']);
  assert.deepEqual(calls.at(-1)?.value, {
    status: 'COMPLETED_WITH_WARNINGS', processed: 4, created: 3, updated: 0, skipped: 1, failed: 0,
    errorMessage: '1 questão(ões) não foram importadas.',
  });
});

test('falha transitória fica RETRYING e é propagada para BullMQ', async () => {
  const { service, calls } = setup(async () => { throw new Error('redis/database transient'); });

  await assert.rejects(service.process('run-1', 1, 3), /redis\/database transient/);
  assert.equal(calls.at(-1)?.name, 'retrying');
});

test('falha após a última tentativa persiste FAILED antes de propagar', async () => {
  const { service, calls } = setup(async () => { throw new Error('permanent'); });

  await assert.rejects(service.process('run-1', 3, 3), /permanent/);
  assert.equal(calls.at(-1)?.name, 'finish');
  assert.deepEqual(calls.at(-1)?.value, { status: 'FAILED', errorMessage: 'permanent' });
});
