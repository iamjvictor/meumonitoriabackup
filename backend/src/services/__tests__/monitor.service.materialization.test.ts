import assert from 'node:assert/strict';
import test from 'node:test';
import type { CreateMonitorInput } from '../../models/monitor.model.js';
import type { MonitorRepository } from '../../repositories/monitor.repository.js';
import { MonitorService } from '../monitor.service.js';
import type { QuestionBankMaterializationService } from '../../modules/question-bank/services/question-bank-materialization.service.js';

const input: CreateMonitorInput = {
  name: 'Monitor de Matemática',
  subjects: [{ name: 'Matemática', topics: [{ name: 'Álgebra > Equações' }] }],
};

function createdMonitor() {
  return {
    id: 'monitor-1',
    status: 'DRAFT',
    teacher: { id: 'teacher-1' },
    subjects: [{
      id: 'subject-1',
      name: 'Matemática',
      topics: [{
        id: 'topic-1',
        name: 'Álgebra > Equações',
        questionBankSelections: [{
          examType: 'ENEM',
          board: null,
          subtopic: 'Equações',
          subsubtopic: null,
        }],
      }],
    }],
  };
}

function repository(monitor = createdMonitor(), materializationRun: { id: string; status: string; totalSelected: number } | null = { id: 'run-1', status: 'QUEUED', totalSelected: 73 }) {
  return {
    async createDraft() { return { kind: 'CREATED' as const, monitor, materializationRun }; },
  } as unknown as MonitorRepository;
}

function queue(received: { runId?: string }) {
  return {
    async enqueue(runId: string) {
      received.runId = runId;
    },
  };
}

test('criação somente própria não executa materialização', async () => {
  let called = false;
  const service = new MonitorService(
    repository({ ...createdMonitor(), subjects: [{ id: 'subject-1', name: 'Matemática', topics: [{ id: 'topic-1', name: 'Álgebra', questionBankSelections: [] }] }] }, null),
    { materialize: async () => { called = true; return { processed: 0, created: 0, updated: 0, skipped: 0, failures: [] }; } } as unknown as QuestionBankMaterializationService,
  );

  const result = await service.createDraft('user-1', input);

  assert.equal(called, false);
  assert.equal(result.kind, 'CREATED');
  assert.equal(result.materialization, null);
});

test('criação com seleção enfileira execução persistida e retorna sem materializar', async () => {
  const received: { runId?: string } = {};
  let materializerCalled = false;
  const service = new MonitorService(
    repository(),
    { materialize: async () => { materializerCalled = true; throw new Error('não deve executar no request'); } } as unknown as QuestionBankMaterializationService,
    undefined,
    queue(received) as never,
  );

  const result = await service.createDraft('user-1', input);

  assert.equal(result.kind, 'CREATED');
  assert.equal(result.monitor.status, 'DRAFT');
  assert.deepEqual(result.materialization, { id: 'run-1', status: 'QUEUED', totalSelected: 73 });
  assert.equal(received.runId, 'run-1');
  assert.equal(materializerCalled, false);
});

test('falha do Redis não invalida criação e run permanece consultável', async () => {
  const service = new MonitorService(repository(), undefined, undefined, {
    async enqueue() { throw new Error('redis indisponível'); },
  } as never);

  const result = await service.createDraft('user-1', input);

  assert.equal(result.kind, 'CREATED');
  assert.equal(result.monitor.status, 'DRAFT');
  assert.equal(result.materialization?.status, 'QUEUED');
});

test('retry usa uma nova geração da fila somente após falha terminal', async () => {
  const received: { generation?: number } = {};
  const monitorRepository = {
    async findQuestionBankMaterializationRunOwnedByUser() { return { id: 'run-1', status: 'FAILED', attempts: 3 }; },
    async reserveQuestionBankMaterializationRetry() { return { id: 'run-1', status: 'QUEUED', attempts: 3 }; },
  } as unknown as MonitorRepository;
  const service = new MonitorService(monitorRepository, undefined, undefined, {
    async enqueue(_runId, generation) { received.generation = generation; },
  });

  const result = await service.retryQuestionBankMaterialization('user-1', 'monitor-1');

  assert.equal(result?.kind, 'QUEUED');
  assert.equal(received.generation, 1);
});

test('retry não cria job concorrente enquanto a execução não estiver em falha final', async () => {
  let enqueueCalled = false;
  const service = new MonitorService({
    async findQuestionBankMaterializationRunOwnedByUser() { return { id: 'run-1', status: 'PROCESSING', attempts: 1 }; },
  } as unknown as MonitorRepository, undefined, undefined, {
    async enqueue() { enqueueCalled = true; },
  });

  const result = await service.retryQuestionBankMaterialization('user-1', 'monitor-1');

  assert.equal(result?.kind, 'NOT_RETRYABLE');
  assert.equal(enqueueCalled, false);
});
