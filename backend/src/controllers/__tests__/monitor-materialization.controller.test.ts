import assert from 'node:assert/strict';
import test from 'node:test';
import { MonitorController } from '../monitor.controller.js';

function reply() {
  const state: { status?: number; body?: unknown } = {};
  return {
    state,
    code(status: number) { state.status = status; return this; },
    send(body: unknown) { state.body = body; return body; },
  };
}

const monitorId = '11566a78-16b0-4721-a00c-742f2b5e21e5';

test('status da materialização é protegido por propriedade do monitor', async () => {
  const controller = new MonitorController({
    async getQuestionBankMaterialization() { return null; },
  } as never);
  const response = reply();

  await controller.getQuestionBankMaterialization({ user: { id: 'teacher-1', role: 'teacher' }, params: { monitorId } } as never, response as never);

  assert.equal(response.state.status, 404);
  assert.equal((response.state.body as { error: string }).error, 'MATERIALIZATION_NOT_FOUND');
});

test('retry retorna conflito quando a execução ainda não está em falha terminal', async () => {
  const controller = new MonitorController({
    async retryQuestionBankMaterialization() { return { kind: 'NOT_RETRYABLE', run: { status: 'PROCESSING' } }; },
  } as never);
  const response = reply();

  await controller.retryQuestionBankMaterialization({ user: { id: 'teacher-1', role: 'teacher' }, params: { monitorId } } as never, response as never);

  assert.equal(response.state.status, 409);
  assert.equal((response.state.body as { error: string }).error, 'MATERIALIZATION_NOT_FAILED');
});

test('retry exige autenticação', async () => {
  const controller = new MonitorController({} as never);
  const response = reply();

  await controller.retryQuestionBankMaterialization({ params: { monitorId } } as never, response as never);

  assert.equal(response.state.status, 401);
});
