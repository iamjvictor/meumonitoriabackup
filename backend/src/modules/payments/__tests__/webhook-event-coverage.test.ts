import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ProcessPaymentWebhookUseCase } from '../application/commands/process-webhook.use-case.js';
import { ASAAS_PLATFORM_WEBHOOK_EVENTS, ASAAS_SUBACCOUNT_WEBHOOK_EVENTS } from '../infrastructure/providers/asaas/asaas-webhook-events.js';

const root = new URL('../../../../', import.meta.url);

test('registro e atualização usam o mesmo catálogo e assinam eventos cobertos do ciclo de pagamento', () => {
  const registerScript = readFileSync(new URL('src/scripts/register-asaas-webhook.ts', root), 'utf8');
  const updateScript = readFileSync(new URL('src/scripts/update-asaas-webhook.ts', root), 'utf8');
  const required = [
    'SUBSCRIPTION_INACTIVATED',
    'PAYMENT_UPDATED', 'PAYMENT_DELETED', 'PAYMENT_RESTORED',
    'PAYMENT_AWAITING_RISK_ANALYSIS', 'PAYMENT_APPROVED_BY_RISK_ANALYSIS',
    'PAYMENT_REPROVED_BY_RISK_ANALYSIS', 'PAYMENT_AUTHORIZED',
    'PAYMENT_REFUND_IN_PROGRESS', 'PAYMENT_REFUND_DENIED',
    'PAYMENT_CHARGEBACK_DISPUTE', 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
    'PAYMENT_SPLIT_CANCELLED', 'PAYMENT_SPLIT_DIVERGENCE_BLOCK',
    'PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED',
    'SUBSCRIPTION_SPLIT_DISABLED', 'SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK',
    'SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK_FINISHED',
  ];

  assert.match(registerScript, /ASAAS_PLATFORM_WEBHOOK_EVENTS/);
  assert.match(updateScript, /ASAAS_PLATFORM_WEBHOOK_EVENTS/);
  assert.equal(new Set(ASAAS_PLATFORM_WEBHOOK_EVENTS).size, ASAAS_PLATFORM_WEBHOOK_EVENTS.length, 'a lista não deve conter duplicatas');
  for (const event of required) assert.ok(ASAAS_PLATFORM_WEBHOOK_EVENTS.includes(event as never), `Evento não configurado: ${event}`);
});

test('webhook da subconta inclui os dois eventos de confirmação anual comercial', () => {
  const providerSource = readFileSync(new URL('src/modules/payments/infrastructure/providers/asaas/asaas-account.provider.ts', root), 'utf8');
  const configured = ASAAS_SUBACCOUNT_WEBHOOK_EVENTS;
  assert.match(providerSource, /ASAAS_SUBACCOUNT_WEBHOOK_EVENTS/);
  assert.ok(configured.includes('ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRING_SOON'));
  assert.ok(configured.includes('ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRED'));
});

async function runEvent(eventType: string, payments: Record<string, unknown>, accounts?: Record<string, unknown>) {
  const calls: string[] = [];
  const event = {
    id: `event_${eventType}`,
    eventType,
    environment: 'SANDBOX',
    attempts: 1,
    createdAt: new Date('2026-10-26T10:00:00.000Z'),
    payload: { event: eventType, dateCreated: '2026-10-26T10:00:00.000Z', payment: { id: 'pay_1', externalReference: 'order_1' }, subscription: { id: 'sub_1' }, account: { id: 'acc_1' } },
  };
  const repository = {
    async claim() { return event; },
    async markProcessed(_id: string, state: string) { calls.push(`processed:${state}`); },
    async markWaitingCorrelation() { calls.push('waiting'); },
    async markIgnored() { calls.push('ignored'); },
    async markFailed(_id: string, code: string) { calls.push(`failed:${code}`); },
  } as never;
  const useCase = new ProcessPaymentWebhookUseCase(repository, accounts as never, payments as never);
  const result = await useCase.execute(event.id);
  return { calls, result };
}

test('todo evento da configuração principal alcança seu handler por domínio', async () => {
  for (const eventType of ASAAS_PLATFORM_WEBHOOK_EVENTS) {
    const calls: string[] = [];
    const payments = {
      async applyCheckoutEvent() { calls.push('checkout'); return { updatedRows: 1 }; },
      async applyPaymentEvent() { calls.push('payment'); return { updatedRows: 1, accessGranted: true }; },
      async applyPaymentLifecycleEvent() { calls.push('lifecycle'); return { updatedRows: 1, accessGranted: false, state: 'PAYMENT_STATE_APPLIED' }; },
      async applySplitEvent() { calls.push('split'); return { updatedRows: 1 }; },
      async applySubscriptionEvent() { calls.push('subscription'); return { updatedRows: 1 }; },
    };
    const accounts = { async applyAccountStatusEvent() { calls.push('account'); return { count: 1 }; } };
    const { result } = await runEvent(eventType, payments, accounts);
    const expected = eventType.startsWith('ACCOUNT_STATUS_') ? 'account'
      : eventType.startsWith('CHECKOUT_') ? 'checkout'
        : eventType === 'PAYMENT_CONFIRMED' || eventType === 'PAYMENT_RECEIVED' ? 'payment'
          : eventType.startsWith('PAYMENT_SPLIT_') ? 'split'
            : eventType.startsWith('SUBSCRIPTION_') || ['PAYMENT_OVERDUE', 'PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'].includes(eventType) ? 'subscription'
              : 'lifecycle';
    assert.deepEqual(calls, [expected], `${eventType} deve alcançar ${expected}`);
    assert.equal(result.skipped, false, `${eventType} não deve ser ignorado`);
  }
});

for (const eventType of [
  'PAYMENT_CREATED',
  'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
  'PAYMENT_UPDATED',
  'PAYMENT_DELETED',
  'PAYMENT_RESTORED',
  'PAYMENT_AWAITING_RISK_ANALYSIS',
  'PAYMENT_APPROVED_BY_RISK_ANALYSIS',
  'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
  'PAYMENT_AUTHORIZED',
  'PAYMENT_REFUND_IN_PROGRESS',
  'PAYMENT_REFUND_DENIED',
  'PAYMENT_CHARGEBACK_DISPUTE',
  'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
]) {
  test(`${eventType} vai ao handler de ciclo financeiro sem concessão de acesso`, async () => {
    let called = '';
    const payments = {
      async applyPaymentLifecycleEvent(input: { eventType: string }) {
        called = input.eventType;
        return { updatedRows: 1, accessGranted: false, state: 'PAYMENT_STATE_APPLIED' };
      },
    };
    const { calls, result } = await runEvent(eventType, payments);
    assert.equal(called, eventType);
    assert.deepEqual(result, { skipped: false, state: 'PAYMENT_STATE_APPLIED' });
    assert.deepEqual(calls, ['processed:PAYMENT_STATE_APPLIED']);
  });
}

for (const eventType of [
  'PAYMENT_SPLIT_CANCELLED',
  'PAYMENT_SPLIT_DIVERGENCE_BLOCK',
  'PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED',
]) {
  test(`${eventType} altera apenas o estado do split`, async () => {
    let called = '';
    const payments = {
      async applySplitEvent(input: { eventType: string }) { called = input.eventType; return { updatedRows: 1 }; },
      async applyPaymentEvent() { assert.fail('evento de split não pode conceder acesso'); },
    };
    const { calls, result } = await runEvent(eventType, payments);
    assert.equal(called, eventType);
    assert.deepEqual(result, { skipped: false, state: 'SPLIT_STATE_APPLIED' });
    assert.deepEqual(calls, ['processed:SPLIT_STATE_APPLIED']);
  });
}

for (const eventType of [
  'SUBSCRIPTION_SPLIT_DISABLED',
  'SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK',
  'SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK_FINISHED',
]) {
  test(`${eventType} vai ao handler de assinatura sem alterar acesso do aluno`, async () => {
    let called = '';
    const payments = {
      async applySubscriptionEvent(input: { eventType: string }) { called = input.eventType; return { updatedRows: 1 }; },
      async applyPaymentEvent() { assert.fail('evento de assinatura não pode conceder acesso'); },
    };
    const { calls, result } = await runEvent(eventType, payments);
    assert.equal(called, eventType);
    assert.deepEqual(result, { skipped: false, state: 'SUBSCRIPTION_STATE_APPLIED' });
    assert.deepEqual(calls, ['processed:SUBSCRIPTION_STATE_APPLIED']);
  });
}

test('evento ainda desconhecido é ignorado, não fica em espera por correlação', async () => {
  const { calls, result } = await runEvent('PAYMENT_FUTURE_EVENT', {});
  assert.deepEqual(result, { skipped: false, state: 'IGNORED' });
  assert.deepEqual(calls, ['ignored']);
});
