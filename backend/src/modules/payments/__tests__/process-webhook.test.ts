import assert from 'node:assert/strict';
import test from 'node:test';
import { ProcessPaymentWebhookUseCase } from '../application/commands/process-webhook.use-case.js';

function repositoryFor(event: Record<string, unknown>, calls: string[]) {
  return {
    async claim() { return event; },
    async markWaitingCorrelation() { calls.push('waiting'); },
    async markProcessed(_eventId: string, state: string) { calls.push(`processed:${state}`); },
    async markIgnored() { calls.push('ignored'); },
    async markFailed(_eventId: string, code: string) { calls.push(`failed:${code}`); },
  } as never;
}

test('webhook de status aguarda correlação quando a conta local ainda não existe', async () => {
  const calls: string[] = [];
  const accounts = {
    async applyAccountStatusEvent() { return { count: 0 }; },
  } as never;
  const useCase = new ProcessPaymentWebhookUseCase(repositoryFor({
    id: 'event_1',
    eventType: 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED',
    providerAccountId: 'asaas_subaccount_123',
    payload: { account: { id: 'asaas_subaccount_123' } },
    createdAt: new Date(),
  }, calls), accounts);

  const result = await useCase.execute('event_1');

  assert.deepEqual(result, { skipped: false, state: 'WAITING_CORRELATION' });
  assert.deepEqual(calls, ['waiting']);
});

test('webhook de status só é concluído quando a conta local foi atualizada', async () => {
  const calls: string[] = [];
  const accounts = {
    async applyAccountStatusEvent() { return { count: 1 }; },
  } as never;
  const useCase = new ProcessPaymentWebhookUseCase(repositoryFor({
    id: 'event_2',
    eventType: 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED',
    providerAccountId: 'asaas_subaccount_123',
    payload: { account: { id: 'asaas_subaccount_123' } },
    createdAt: new Date(),
  }, calls), accounts);

  const result = await useCase.execute('event_2');

  assert.deepEqual(result, { skipped: false, state: 'ACCOUNT_STATUS_APPLIED' });
  assert.deepEqual(calls, ['processed:ACCOUNT_STATUS_APPLIED']);
});

test('webhook de status usa dateCreated do Asaas como ordem do evento', async () => {
  const occurredAt = new Date('2026-10-20T10:00:00.000Z');
  const calls: string[] = [];
  const accounts = {
    async applyAccountStatusEvent(_providerAccountId: string, _eventType: string, receivedAt: Date) {
      calls.push(receivedAt.toISOString());
      return { count: 1 };
    },
  } as never;
  const useCase = new ProcessPaymentWebhookUseCase(repositoryFor({
    id: 'event_ordered',
    eventType: 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED',
    providerAccountId: 'asaas_subaccount_123',
    payload: { dateCreated: occurredAt.toISOString(), account: { id: 'asaas_subaccount_123' } },
    createdAt: new Date('2026-10-26T10:00:00.000Z'),
  }, calls), accounts);

  await useCase.execute('event_ordered');

  assert.deepEqual(calls, [occurredAt.toISOString(), 'processed:ACCOUNT_STATUS_APPLIED']);
});

test('webhook de status sem identificador da conta não é marcado como aplicado', async () => {
  const calls: string[] = [];
  const useCase = new ProcessPaymentWebhookUseCase(repositoryFor({
    id: 'event_without_account',
    eventType: 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED',
    providerAccountId: null,
    payload: { id: 'evt_without_account', event: 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED' },
    createdAt: new Date(),
  }, calls), { async applyAccountStatusEvent() { throw new Error('não deveria aplicar'); } } as never);

  const result = await useCase.execute('event_without_account');

  assert.deepEqual(result, { skipped: false, state: 'WAITING_CORRELATION' });
  assert.deepEqual(calls, ['waiting']);
});

test('pagamento confirmado processa acesso e marca evento como aplicado', async () => {
  const calls: string[] = [];
  const payments = {
    async applyPaymentEvent(input: { eventType: string }) {
      assert.equal(input.eventType, 'PAYMENT_CONFIRMED');
      return { updatedRows: 1, chargeId: 'charge_1', studentId: 'student_1', monitorId: 'monitor_1', accessGranted: true };
    },
  } as never;
  const useCase = new ProcessPaymentWebhookUseCase(repositoryFor({
    id: 'event_payment_1',
    eventType: 'PAYMENT_CONFIRMED',
    providerAccountId: 'parent_1',
    payload: { payment: { id: 'pay_1', externalReference: 'order_1' } },
    createdAt: new Date(),
    environment: 'SANDBOX',
  }, calls), undefined, payments);

  const result = await useCase.execute('event_payment_1');

  assert.deepEqual(result, { skipped: false, state: 'PAYMENT_ACCESS_APPLIED' });
  assert.deepEqual(calls, ['processed:PAYMENT_ACCESS_APPLIED']);
});

test('pagamento sem pedido correspondente permanece aguardando correlação', async () => {
  const calls: string[] = [];
  const payments = { async applyPaymentEvent() { return { updatedRows: 0, accessGranted: false }; } } as never;
  const useCase = new ProcessPaymentWebhookUseCase(repositoryFor({
    id: 'event_payment_2',
    eventType: 'PAYMENT_CONFIRMED',
    payload: { payment: { id: 'pay_unknown' } },
    createdAt: new Date(),
    environment: 'SANDBOX',
  }, calls), undefined, payments);

  const result = await useCase.execute('event_payment_2');

  assert.deepEqual(result, { skipped: false, state: 'WAITING_CORRELATION' });
  assert.deepEqual(calls, ['waiting']);
});

test('cancelamento de assinatura é aplicado localmente e não fica aguardando correlação', async () => {
  const calls: string[] = [];
  const payments = {
    async applySubscriptionEvent(input: { eventType: string; environment: string }) {
      assert.equal(input.eventType, 'SUBSCRIPTION_DELETED');
      assert.equal(input.environment, 'SANDBOX');
      return { updatedRows: 1 };
    },
  } as never;
  const useCase = new ProcessPaymentWebhookUseCase(repositoryFor({
    id: 'event_subscription_deleted',
    eventType: 'SUBSCRIPTION_DELETED',
    payload: { subscription: { id: 'asaas_sub_1' } },
    createdAt: new Date(),
    environment: 'SANDBOX',
  }, calls), undefined, payments);

  const result = await useCase.execute('event_subscription_deleted');

  assert.deepEqual(result, { skipped: false, state: 'SUBSCRIPTION_STATE_APPLIED' });
  assert.deepEqual(calls, ['processed:SUBSCRIPTION_STATE_APPLIED']);
});

test('pagamento futuro removido pelo cancelamento atualiza o estado da assinatura', async () => {
  const calls: string[] = [];
  const payments = {
    async applyPaymentLifecycleEvent(input: { eventType: string; environment: string }) {
      assert.equal(input.eventType, 'PAYMENT_DELETED');
      assert.equal(input.environment, 'PRODUCTION');
      return { updatedRows: 1 };
    },
  } as never;
  const useCase = new ProcessPaymentWebhookUseCase(repositoryFor({
    id: 'event_payment_deleted',
    eventType: 'PAYMENT_DELETED',
    payload: { payment: { id: 'pay_future', subscription: 'sub_1', deleted: true, dueDate: '2026-10-26' } },
    createdAt: new Date(),
    environment: 'PRODUCTION',
  }, calls), undefined, payments);

  const result = await useCase.execute('event_payment_deleted');

  assert.deepEqual(result, { skipped: false, state: 'PAYMENT_STATE_APPLIED' });
  assert.deepEqual(calls, ['processed:PAYMENT_STATE_APPLIED']);
});

test('liquidação de split atualiza somente o split e nunca libera acesso', async () => {
  const calls: string[] = [];
  const payments = {
    async applyPaymentEvent() { calls.push('payment'); return { updatedRows: 1, accessGranted: true }; },
    async applySplitEvent(input: { eventType: string; environment: string; payload: unknown }) {
      calls.push(`split:${input.eventType}:${input.environment}`);
      return { updatedRows: 1 };
    },
  } as never;
  const useCase = new ProcessPaymentWebhookUseCase(repositoryFor({
    id: 'event_split_settled',
    eventType: 'PAYMENT_SPLIT_DONE',
    payload: { payment: { id: 'pay_1' }, additionalInfo: { splitId: 'split_1' } },
    createdAt: new Date(),
    environment: 'SANDBOX',
  }, calls), undefined, payments);

  const result = await useCase.execute('event_split_settled');

  assert.deepEqual(result, { skipped: false, state: 'SPLIT_STATE_APPLIED' });
  assert.deepEqual(calls, ['split:PAYMENT_SPLIT_DONE:SANDBOX', 'processed:SPLIT_STATE_APPLIED']);
});

test('eventos de checkout são aplicados sem tratar CHECKOUT_PAID como confirmação financeira', async () => {
  const calls: string[] = [];
  const payments = {
    async applyCheckoutEvent(input: { eventType: string; environment: string }) {
      calls.push(`${input.eventType}:${input.environment}`);
      return { updatedRows: 1 };
    },
    async applyPaymentEvent() { calls.push('payment'); return { updatedRows: 1, accessGranted: true }; },
  } as never;

  for (const eventType of ['CHECKOUT_CREATED', 'CHECKOUT_PAID', 'CHECKOUT_CANCELED', 'CHECKOUT_EXPIRED']) {
    const useCase = new ProcessPaymentWebhookUseCase(repositoryFor({
      id: `event_${eventType}`,
      eventType,
      payload: { checkout: { id: 'checkout_1' } },
      createdAt: new Date(),
      environment: 'SANDBOX',
    }, calls), undefined, payments);
    assert.deepEqual(await useCase.execute(`event_${eventType}`), { skipped: false, state: 'CHECKOUT_STATE_APPLIED' });
  }

  assert.deepEqual(calls, [
    'CHECKOUT_CREATED:SANDBOX', 'processed:CHECKOUT_STATE_APPLIED',
    'CHECKOUT_PAID:SANDBOX', 'processed:CHECKOUT_STATE_APPLIED',
    'CHECKOUT_CANCELED:SANDBOX', 'processed:CHECKOUT_STATE_APPLIED',
    'CHECKOUT_EXPIRED:SANDBOX', 'processed:CHECKOUT_STATE_APPLIED',
  ]);
});

test('criação e inativação de assinatura são encaminhadas ao handler de assinatura', async () => {
  const calls: string[] = [];
  const payments = {
    async applySubscriptionEvent(input: { eventType: string; environment: string }) {
      calls.push(`${input.eventType}:${input.environment}`);
      return { updatedRows: 1 };
    },
  } as never;

  for (const eventType of ['SUBSCRIPTION_CREATED', 'SUBSCRIPTION_UPDATED', 'SUBSCRIPTION_INACTIVATED', 'SUBSCRIPTION_DELETED']) {
    const useCase = new ProcessPaymentWebhookUseCase(repositoryFor({
      id: `event_${eventType}`,
      eventType,
      payload: { subscription: { id: 'sub_1' } },
      createdAt: new Date(),
      environment: 'SANDBOX',
    }, calls), undefined, payments);
    assert.deepEqual(await useCase.execute(`event_${eventType}`), { skipped: false, state: 'SUBSCRIPTION_STATE_APPLIED' });
  }

  assert.deepEqual(calls, [
    'SUBSCRIPTION_CREATED:SANDBOX', 'processed:SUBSCRIPTION_STATE_APPLIED',
    'SUBSCRIPTION_UPDATED:SANDBOX', 'processed:SUBSCRIPTION_STATE_APPLIED',
    'SUBSCRIPTION_INACTIVATED:SANDBOX', 'processed:SUBSCRIPTION_STATE_APPLIED',
    'SUBSCRIPTION_DELETED:SANDBOX', 'processed:SUBSCRIPTION_STATE_APPLIED',
  ]);
});
