import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { CreateCheckoutUseCase, CheckoutAnnualPlanUnavailableError, CheckoutPendingError, CheckoutStudentRoleError } from '../application/commands/create-checkout.use-case.js';
import type { CheckoutMonitor, CreateCheckoutRepository } from '../infrastructure/persistence/payment-checkout.repository.js';

const monitor: CheckoutMonitor = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Monitor de Matemática',
  priceCents: 5990,

  teacher: {
    id: '22222222-2222-4222-8222-222222222222',
    teacherPercentage: new Prisma.Decimal('50'),
    currentPaymentAccount: { walletId: 'wallet_teacher', status: 'APPROVED', generalStatus: 'APPROVED' },
    referralReceived: { indicatorTeacherId: '33333333-3333-4333-8333-333333333333', percentage: new Prisma.Decimal('5'), status: 'ACTIVE' },
  },
};

function repository(overrides: Partial<CreateCheckoutRepository> = {}): CreateCheckoutRepository {
  const order = { id: 'order_1', subscriptionId: 'subscription_1', status: 'PENDING', amountCents: 5990 };
  return {
    findStudentByUserId: async () => ({ id: 'student_1', role: 'student' }),
    findPublishedMonitor: async () => monitor,
    hasActiveSubscription: async () => false,
    findIdempotency: async () => null,
    resetFailedIdempotency: async () => undefined,
    createIntent: async () => ({ order, checkout: null, payout: { walletId: 'wallet_teacher', percentage: '50.0000' } }),
    saveCheckout: async (_orderId, checkout) => ({ order, checkout: { checkoutUrl: checkout.checkoutUrl, expiresAt: checkout.expiresAt }, payout: { walletId: 'wallet_teacher', percentage: '50.0000' } }),
    markCheckoutCreationFailed: async () => undefined,
    ...overrides,
  };
}

test('usa o preço do catálogo para criar o pedido e o checkout mensal', async () => {
  let command: any;
  let intentMonitorPrice: number | undefined;
  const provider = { async createHostedCheckout(input: any) { command = input; return { providerCheckoutId: 'co_1', checkoutUrl: 'https://sandbox.asaas.com/checkout/co_1', expiresAt: new Date('2026-10-01T00:00:00.000Z') }; } };
  const useCase = new CreateCheckoutUseCase(repository({ createIntent: async ({ monitor: inputMonitor }) => {
    intentMonitorPrice = inputMonitor.priceCents;
    return { order: { id: 'order_1', subscriptionId: 'subscription_1', status: 'PENDING', amountCents: inputMonitor.priceCents }, checkout: null, payout: { walletId: 'wallet_teacher', percentage: '50.0000' } };
  }, saveCheckout: async (_orderId, checkout) => ({
    order: { id: 'order_1', subscriptionId: 'subscription_1', status: 'PENDING', amountCents: 5990 },
    checkout: { checkoutUrl: checkout.checkoutUrl, expiresAt: checkout.expiresAt },
    payout: { walletId: 'wallet_teacher', percentage: '50.0000' },
  }) }), provider);

  const result = await useCase.execute('user_1', { monitorId: monitor.id, idempotencyKey: 'key_1', returnBaseUrl: 'http://localhost:3000' });

  assert.equal(intentMonitorPrice, monitor.priceCents);
  assert.equal(command.amountCents, monitor.priceCents);
  assert.equal(result.amountCents, monitor.priceCents);
  assert.equal(result.checkoutUrl, 'https://sandbox.asaas.com/checkout/co_1');
  assert.deepEqual(command.splits, [{ walletId: 'wallet_teacher', percentage: '50.0000' }]);
  assert.match(command.successUrl, /orderId=order_1/);
  assert.match(command.successUrl, /\/checkout\/retorno\?/);
});

test('permite iniciar nova compra mesmo com assinatura ativa do mesmo monitor', async () => {
  let providerCalled = false;
  const repo = repository({ hasActiveSubscription: async () => true });
  const useCase = new CreateCheckoutUseCase(repo, {
    async createHostedCheckout() {
      providerCalled = true;
      return { providerCheckoutId: 'co_duplicate_allowed', checkoutUrl: 'https://sandbox.asaas.com/checkout/co_duplicate_allowed', expiresAt: null };
    },
  });

  const result = await useCase.execute('user_1', { monitorId: monitor.id, idempotencyKey: 'key_duplicate_allowed', returnBaseUrl: 'https://frontend.test' });

  assert.equal(providerCalled, true);
  assert.equal(result.checkoutUrl, 'https://sandbox.asaas.com/checkout/co_duplicate_allowed');
});

test('não permite iniciar checkout com papel diferente de student', async () => {
  const repo = repository({ findStudentByUserId: async () => ({ id: 'teacher_1', role: 'teacher' }) });
  const useCase = new CreateCheckoutUseCase(repo, { async createHostedCheckout() { throw new Error('não deveria chamar o Asaas'); } });
  await assert.rejects(() => useCase.execute('user_1', { monitorId: monitor.id, idempotencyKey: 'key_1', returnBaseUrl: 'http://localhost:3000' }), CheckoutStudentRoleError);
});

test('recusa compra mensal ou anual do aluno se o professor não puder receber split', async () => {
  let intentCreated = false;
  let providerCalled = false;
  const repo = repository({
    findPublishedMonitor: async () => ({ ...monitor, teacher: { ...monitor.teacher, currentPaymentAccount: { walletId: 'wallet_teacher', status: 'PENDING', generalStatus: 'PENDING' } } }),
    createIntent: async () => { intentCreated = true; throw new Error('intent should not be created'); },
  });
  const provider = { async createHostedCheckout() { providerCalled = true; throw new Error('provider should not be called'); } };
  for (const interval of ['MONTHLY', 'ANNUAL'] as const) {
    await assert.rejects(
      () => new CreateCheckoutUseCase(repo, provider).execute('user_1', { monitorId: monitor.id, interval, idempotencyKey: `key_${interval}`, returnBaseUrl: 'http://localhost:3000' }),
      { name: 'CheckoutTeacherPayoutUnavailableError' },
    );
  }
  assert.equal(intentCreated, false);
  assert.equal(providerCalled, false);
});

test('não cria outro checkout quando a mesma intenção ainda não tem URL conciliada', async () => {
  const fingerprint = createHash('sha256').update(JSON.stringify({ monitorId: monitor.id })).digest('hex');
  const repo = repository({ findIdempotency: async () => ({ requestFingerprint: fingerprint, state: 'IN_PROGRESS', order: { id: 'order_3', subscriptionId: 'subscription_3', status: 'PENDING', amountCents: 5990 }, checkout: null }) });
  const useCase = new CreateCheckoutUseCase(repo, { async createHostedCheckout() { throw new Error('não deveria chamar o Asaas'); } });
  await assert.rejects(() => useCase.execute('user_1', { monitorId: monitor.id, idempotencyKey: 'key_3', returnBaseUrl: 'http://localhost:3000' }), CheckoutPendingError);
});

test('permite retry quando a tentativa anterior falhou', async () => {
  const fingerprint = createHash('sha256').update(JSON.stringify({ monitorId: monitor.id })).digest('hex');
  let resetCalled = false;
  let providerCalled = false;
  const repo = repository({
    findIdempotency: async () => ({ requestFingerprint: fingerprint, state: 'FAILED', order: { id: 'order_failed', subscriptionId: 'subscription_failed', status: 'CHECKOUT_CREATION_FAILED', amountCents: 5990 }, checkout: null }),
    resetFailedIdempotency: async () => { resetCalled = true; },
  });
  const useCase = new CreateCheckoutUseCase(repo, { async createHostedCheckout() { providerCalled = true; return { providerCheckoutId: 'co_retry', checkoutUrl: 'https://sandbox.asaas.com/checkout/co_retry', expiresAt: null }; } });

  const result = await useCase.execute('user_1', { monitorId: monitor.id, idempotencyKey: 'key_failed_retry', returnBaseUrl: 'https://frontend.test' });

  assert.equal(resetCalled, true);
  assert.equal(providerCalled, true);
  assert.equal(result.checkoutUrl, 'https://sandbox.asaas.com/checkout/co_retry');
});

test('registra falha quando não consegue salvar o checkout depois da resposta do provedor', async () => {
  let failedOrderId: string | undefined;
  let failedMessage: string | undefined;
  const repo = repository({
    saveCheckout: async () => { throw new Error('payment_checkouts indisponível'); },
    markCheckoutCreationFailed: async (orderId, message) => {
      failedOrderId = orderId;
      failedMessage = message;
    },
  });
  const useCase = new CreateCheckoutUseCase(repo, {
    async createHostedCheckout() {
      return { providerCheckoutId: 'co_persistence_failure', checkoutUrl: 'https://sandbox.asaas.com/checkout/co_persistence_failure', expiresAt: null };
    },
  });

  await assert.rejects(
    () => useCase.execute('user_1', { monitorId: monitor.id, idempotencyKey: 'key_persistence_failure', returnBaseUrl: 'https://frontend.test' }),
    { message: 'payment_checkouts indisponível' },
  );
  assert.equal(failedOrderId, 'order_1');
  assert.equal(failedMessage, 'payment_checkouts indisponível');
});

test('cria checkout anual à vista ou em até 12 parcelas com desconto e split preservados', async () => {
  let command: any;
  let intentInterval: string | undefined;
  const repo = repository({
    createIntent: async (input: any) => {
      intentInterval = input.interval;
      return { order: { id: 'annual-order', subscriptionId: 'annual-local-sub', status: 'PENDING', amountCents: input.interval === 'ANNUAL' ? Math.round(input.monitor.priceCents * 12 * 0.8) : input.monitor.priceCents }, checkout: null, payout: { walletId: 'wallet_teacher', percentage: '50.0000' } };
    },
    saveCheckout: async (_id, checkout) => ({ order: { id: 'annual-order', subscriptionId: 'annual-local-sub', status: 'PENDING', amountCents: 57504 }, checkout: { checkoutUrl: checkout.checkoutUrl, expiresAt: checkout.expiresAt }, payout: { walletId: 'wallet_teacher', percentage: '50.0000' } }),
  });
  const useCase = new CreateCheckoutUseCase(repo, { async createHostedCheckout(input: any) { command = input; return { providerCheckoutId: 'annual-co', checkoutUrl: 'https://checkout/annual', expiresAt: null }; } });
  const result = await useCase.execute('user_1', { monitorId: monitor.id, interval: 'ANNUAL', idempotencyKey: 'annual-12345678', returnBaseUrl: 'https://app.test' });

  assert.equal(intentInterval, 'ANNUAL');
  assert.equal(command.amountCents, 57504);
  assert.equal(command.chargeType, 'DETACHED');
  assert.deepEqual(command.chargeTypes, ['DETACHED', 'INSTALLMENT']);
  assert.equal(command.maxInstallmentCount, 12);
  assert.deepEqual(command.splits, [{ walletId: 'wallet_teacher', percentage: '50.0000' }]);
  assert.equal(result.amountCents, 57504);
});

test('não cria checkout anual quando o preço mensal é inválido', async () => {
  let providerCalled = false;
  const repo = repository({ findPublishedMonitor: async () => ({ ...monitor, priceCents: 0 }) });
  const useCase = new CreateCheckoutUseCase(repo, { async createHostedCheckout() { providerCalled = true; throw new Error('not expected'); } });
  await assert.rejects(() => useCase.execute('user_1', { monitorId: monitor.id, interval: 'ANNUAL', idempotencyKey: 'annual-no-price-key', returnBaseUrl: 'https://app.test' }), CheckoutAnnualPlanUnavailableError);
  assert.equal(providerCalled, false);
});
