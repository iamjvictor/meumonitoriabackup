import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { CreateCheckoutUseCase } from '../application/commands/create-checkout.use-case.js';
import type { CheckoutMonitor, CreateCheckoutRepository } from '../infrastructure/persistence/payment-checkout.repository.js';
import { createCheckoutBodySchema } from '../http/payments.controller.js';

const monitor: CheckoutMonitor = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Monitor de Matemática',
  priceCents: 5990,
  teacher: {
    id: '22222222-2222-4222-8222-222222222222',
    teacherPercentage: new Prisma.Decimal('50'),
    currentPaymentAccount: { walletId: 'wallet_teacher', status: 'APPROVED', generalStatus: 'APPROVED' },
    referralReceived: null,
  },
};

function makeRepository(overrides: Partial<CreateCheckoutRepository> = {}): CreateCheckoutRepository {
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

const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('cria as quatro combinações de cobrança permitidas sem chamar o Asaas real', async () => {
  const commands: any[] = [];
  const intentFingerprints: string[] = [];
  const repo = makeRepository({
    createIntent: async (input) => {
      intentFingerprints.push(input.requestFingerprint);
      return {
        order: { id: `order-${intentFingerprints.length}`, subscriptionId: `sub-${intentFingerprints.length}`, status: 'PENDING', amountCents: input.interval === 'ANNUAL' ? 57504 : monitor.priceCents },
        checkout: null,
        payout: { walletId: 'wallet_teacher', percentage: '50.0000' },
      };
    },
    saveCheckout: async (_orderId, checkout) => ({
      order: { id: 'order_saved', subscriptionId: 'sub_saved', status: 'PENDING', amountCents: 57504 },
      checkout: { checkoutUrl: checkout.checkoutUrl, expiresAt: checkout.expiresAt },
      payout: { walletId: 'wallet_teacher', percentage: '50.0000' },
    }),
  });
  const provider = {
    async createHostedCheckout(command: any) {
      commands.push(command);
      return { providerCheckoutId: `checkout-${commands.length}`, checkoutUrl: `https://hosted.test/${commands.length}`, expiresAt: null };
    },
  } as any;
  const useCase = new CreateCheckoutUseCase(repo, provider);
  const combinations = [
    { interval: 'MONTHLY' as const, billingType: 'CREDIT_CARD' as const, chargeType: 'RECURRENT', cycle: 'MONTHLY', chargeTypes: undefined, maxInstallmentCount: undefined },
    { interval: 'MONTHLY' as const, billingType: 'PIX' as const, chargeType: 'DETACHED', cycle: undefined, chargeTypes: undefined, maxInstallmentCount: undefined },
    { interval: 'ANNUAL' as const, billingType: 'PIX' as const, chargeType: 'DETACHED', cycle: undefined, chargeTypes: undefined, maxInstallmentCount: undefined },
    { interval: 'ANNUAL' as const, billingType: 'CREDIT_CARD' as const, chargeType: 'DETACHED', cycle: undefined, chargeTypes: ['DETACHED', 'INSTALLMENT'], maxInstallmentCount: 12 },
  ];

  for (const [index, combination] of combinations.entries()) {
    await useCase.execute('user_1', {
      monitorId: monitor.id,
      interval: combination.interval,
      billingType: combination.billingType,
      idempotencyKey: `method-key-${index}`,
      returnBaseUrl: 'https://frontend.test',
    });
    const command = commands[index];
    assert.equal(command.billingType, combination.billingType);
    assert.equal(command.chargeType, combination.chargeType);
    assert.equal(command.cycle, combination.cycle);
    assert.deepEqual(command.chargeTypes, combination.chargeTypes);
    assert.equal(command.maxInstallmentCount, combination.maxInstallmentCount);
    assert.deepEqual(command.splits, [{ walletId: 'wallet_teacher', percentage: '50.0000' }]);
  }

  assert.deepEqual(intentFingerprints, [
    fingerprint({ monitorId: monitor.id }),
    fingerprint({ monitorId: monitor.id, interval: 'MONTHLY', billingType: 'PIX' }),
    fingerprint({ monitorId: monitor.id, interval: 'ANNUAL', billingType: 'PIX' }),
    fingerprint({ monitorId: monitor.id, interval: 'ANNUAL' }),
  ]);
});

test('rejeita billingType fora do contrato HTTP', () => {
  assert.equal(createCheckoutBodySchema.safeParse({ monitorId: monitor.id, interval: 'MONTHLY', billingType: 'BOLETO' }).success, false);
  assert.equal(createCheckoutBodySchema.safeParse({ monitorId: monitor.id, interval: 'ANNUAL', billingType: 'PIX' }).success, true);
});

test('mantém a diferença de fingerprint entre cartão legado e Pix do mesmo plano mensal', async () => {
  const fingerprints: string[] = [];
  const commands: any[] = [];
  const repo = makeRepository({
    createIntent: async (input) => {
      fingerprints.push(input.requestFingerprint);
      return { order: { id: 'order_1', subscriptionId: 'sub_1', status: 'PENDING', amountCents: monitor.priceCents }, checkout: null, payout: { walletId: null, percentage: '0.0000' } };
    },
  });
  const provider = { async createHostedCheckout(command: any) { commands.push(command); return { providerCheckoutId: 'checkout_1', checkoutUrl: 'https://hosted.test', expiresAt: null }; } } as any;
  const useCase = new CreateCheckoutUseCase(repo, provider);

  await useCase.execute('user_1', { monitorId: monitor.id, billingType: 'CREDIT_CARD', idempotencyKey: 'card-key', returnBaseUrl: 'https://frontend.test' });
  await useCase.execute('user_1', { monitorId: monitor.id, billingType: 'PIX', idempotencyKey: 'pix-key', returnBaseUrl: 'https://frontend.test' });

  assert.equal(fingerprints[0], fingerprint({ monitorId: monitor.id }));
  assert.equal(fingerprints[1], fingerprint({ monitorId: monitor.id, interval: 'MONTHLY', billingType: 'PIX' }));
  assert.notEqual(fingerprints[0], fingerprints[1]);
  assert.deepEqual(commands.map((command) => command.splits), [[], []]);
});
