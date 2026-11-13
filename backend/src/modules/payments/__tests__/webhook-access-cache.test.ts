import assert from 'node:assert/strict';
import test from 'node:test';
import { RedisEntitlementCache, type EntitlementCacheClient } from '../../access/infrastructure/redis-entitlement-cache.js';
import { ProcessPaymentWebhookUseCase } from '../application/commands/process-webhook.use-case.js';

function inbox(eventType: string, calls: string[]) {
  return {
    async claim() { calls.push('claim'); return { id: `event_${eventType}`, eventType, environment: 'PRODUCTION', payload: { payment: { id: 'pay_1' }, checkout: { id: 'checkout_1' } }, createdAt: new Date() }; },
    async markProcessed(_id: string, state: string) { calls.push(`processed:${state}`); },
    async markWaitingCorrelation() { calls.push('waiting'); },
    async markIgnored() { calls.push('ignored'); },
    async markFailed(_id: string, failureCode: string) { calls.push(`failed:${failureCode}`); },
  } as never;
}

test('invalida snapshot do aluno depois da confirmação e antes de marcar o webhook como processado', async () => {
  const calls: string[] = [];
  const payments = { async applyPaymentEvent() { calls.push('persist:payment'); return { updatedRows: 1, studentId: 'student_1', accessGranted: true }; } } as never;
  const invalidate = async (studentId: string, reason: string) => { calls.push(`invalidate:${studentId}:${reason}`); };
  const useCase = new ProcessPaymentWebhookUseCase(inbox('PAYMENT_CONFIRMED', calls), undefined, payments, invalidate);

  const result = await useCase.execute('event_PAYMENT_CONFIRMED');

  assert.deepEqual(result, { skipped: false, state: 'PAYMENT_ACCESS_APPLIED' });
  assert.deepEqual(calls, ['claim', 'persist:payment', 'invalidate:student_1:ASAAS_WEBHOOK:PAYMENT_CONFIRMED', 'processed:PAYMENT_ACCESS_APPLIED']);
});

test('invalida snapshot após estorno correlacionado que revoga acesso', async () => {
  const calls: string[] = [];
  const payments = { async applySubscriptionEvent() { calls.push('persist:refund'); return { updatedRows: 1, studentId: 'student_2' }; } } as never;
  const invalidate = async (studentId: string, reason: string) => { calls.push(`invalidate:${studentId}:${reason}`); };
  const useCase = new ProcessPaymentWebhookUseCase(inbox('PAYMENT_REFUNDED', calls), undefined, payments, invalidate);

  const result = await useCase.execute('event_PAYMENT_REFUNDED');

  assert.deepEqual(result, { skipped: false, state: 'SUBSCRIPTION_STATE_APPLIED' });
  assert.deepEqual(calls, ['claim', 'persist:refund', 'invalidate:student_2:ASAAS_WEBHOOK:PAYMENT_REFUNDED', 'processed:SUBSCRIPTION_STATE_APPLIED']);
});

test('não invalida nem marca como aplicado um evento financeiro sem correlação', async () => {
  const calls: string[] = [];
  const payments = { async applyPaymentEvent() { calls.push('persist:unmatched'); return { updatedRows: 0, accessGranted: false }; } } as never;
  const invalidate = async (studentId: string) => { calls.push(`invalidate:${studentId}`); };
  const useCase = new ProcessPaymentWebhookUseCase(inbox('PAYMENT_CONFIRMED', calls), undefined, payments, invalidate);

  const result = await useCase.execute('event_PAYMENT_CONFIRMED');

  assert.deepEqual(result, { skipped: false, state: 'WAITING_CORRELATION' });
  assert.deepEqual(calls, ['claim', 'persist:unmatched', 'waiting']);
});

test('CHECKOUT_PAID mensal marca estado mas não invalida nem libera acesso antes da confirmação financeira', async () => {
  const calls: string[] = [];
  const payments = { async applyCheckoutEvent() { calls.push('persist:checkout'); return { updatedRows: 1 }; } } as never;
  const invalidate = async (studentId: string) => { calls.push(`invalidate:${studentId}`); };
  const useCase = new ProcessPaymentWebhookUseCase(inbox('CHECKOUT_PAID', calls), undefined, payments, invalidate);

  const result = await useCase.execute('event_CHECKOUT_PAID');

  assert.deepEqual(result, { skipped: false, state: 'CHECKOUT_STATE_APPLIED' });
  assert.deepEqual(calls, ['claim', 'persist:checkout', 'processed:CHECKOUT_STATE_APPLIED']);
});

test('falha ao invalidar impede marcar o evento como processado e permite retry', async () => {
  const calls: string[] = [];
  const payments = { async applyPaymentEvent() { calls.push('persist:payment'); return { updatedRows: 1, studentId: 'student_3', accessGranted: true }; } } as never;
  const redis: EntitlementCacheClient = {
    async get() { return null; },
    async set() { return undefined; },
    async del(key) { calls.push(`redis:del:${key}`); throw new Error('redis unavailable'); },
  };
  const cache = new RedisEntitlementCache(redis, 'SANDBOX');
  const useCase = new ProcessPaymentWebhookUseCase(
    inbox('PAYMENT_CONFIRMED', calls),
    undefined,
    payments,
    async (studentId) => cache.invalidateOrThrow(studentId),
  );

  await assert.rejects(useCase.execute('event_PAYMENT_CONFIRMED'), /redis unavailable/);

  assert.deepEqual(calls, ['claim', 'persist:payment', 'redis:del:entitlement:v1:sandbox:student_3', 'failed:Error']);
});
