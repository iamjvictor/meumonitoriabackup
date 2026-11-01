import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { CreateSponsoredSeatBatchUseCase } from '../application/commands/create-sponsored-seat-batch.use-case.js';

function setup(overrides: Record<string, unknown> = {}) {
  const calls: any = { created: [], provider: [], saved: [] };
  const repository = {
    findTeacherMonitor: async () => ({
      teacherId: 'teacher-1', teacherPercentage: 40,
      monitor: { id: 'monitor-1', name: 'Física', status: 'PUBLISHED', priceCents: 10000 },
    }),
    findBatchByIdempotency: async () => null,
    findBlockingSeat: async () => null,
    createPendingBatch: async (input: unknown) => { calls.created.push(input); return { id: 'batch-1', externalReference: 'batch-1' }; },
    saveCheckout: async (_id: string, checkout: unknown) => { calls.saved.push(checkout); },
    markCheckoutCreationFailed: async () => {},
    ...overrides,
  };
  const provider = { createHostedCheckout: async (command: unknown) => { calls.provider.push(command); return { providerCheckoutId: 'co-1', checkoutUrl: 'https://sandbox.asaas.com/co-1', expiresAt: null }; } };
  return { calls, useCase: new CreateSponsoredSeatBatchUseCase(repository as any, provider as any) };
}

test('cobra somente o complemento da plataforma, normaliza emails e nunca envia split', async () => {
  const { calls, useCase } = setup();
  const result = await useCase.execute('teacher-user', {
    monitorId: 'monitor-1', interval: 'MONTHLY', billingType: 'CREDIT_CARD', beneficiaryEmails: [' Aluno@Exemplo.com '],
    idempotencyKey: 'batch-key', returnBaseUrl: 'https://app.example',
  });
  const provider = calls.provider[0];

  assert.equal(result.amountCents, 6000);
  assert.equal(calls.created[0].beneficiaryEmails[0], 'aluno@exemplo.com');
  assert.deepEqual(provider.splits, []);
  assert.equal(provider.amountCents, 6000);
  assert.equal(provider.chargeType, 'RECURRENT');
});

test('usa preço calculado (12 mensalidades menos 20%) no checkout detached anual', async () => {
  const { calls, useCase } = setup();
  const result = await useCase.execute('teacher-user', {
    monitorId: 'monitor-1', interval: 'ANNUAL', billingType: 'CREDIT_CARD', beneficiaryEmails: ['a@exemplo.com', 'b@exemplo.com'],
    idempotencyKey: 'annual-key', returnBaseUrl: 'https://app.example',
  });
  const provider = calls.provider[0];

  assert.equal(result.amountCents, 115200);
  assert.equal(calls.created[0].serviceMonths, 12);
  assert.equal(calls.created[0].grossPriceCents, 96000);
  assert.equal(provider.chargeType, 'DETACHED');
  assert.equal(provider.items[0].quantity, 2);
  assert.equal(provider.items[0].unitAmountCents, 57600);
  assert.deepEqual(provider.splits, []);
});

test('checkout anual por Pix preserva o preço anual atual sem desconto adicional', async () => {
  const { calls, useCase } = setup();
  const quote = await useCase.quote('teacher-user', {
    monitorId: 'monitor-1', interval: 'ANNUAL', beneficiaryEmails: ['a@example.com'],
  });
  assert.equal(quote.platformAmountCents, 57600);
  assert.equal(quote.totalAmountCents, 57600);

  const checkout = await useCase.execute('teacher-user', {
    monitorId: 'monitor-1', interval: 'ANNUAL', billingType: 'PIX', beneficiaryEmails: ['a@example.com'],
    expectedTotalAmountCents: quote.totalAmountCents, idempotencyKey: 'annual-pix-key', returnBaseUrl: 'https://app.example',
  });
  assert.equal(checkout.amountCents, 57600);
  assert.equal(calls.provider[0].amountCents, 57600);
  assert.equal(calls.provider[0].items[0].unitAmountCents, 57600);
});

test('rejeita duplicatas normalizadas antes de criar checkout', async () => {
  const { calls, useCase } = setup();
  await assert.rejects(() => useCase.execute('teacher-user', {
    monitorId: 'monitor-1', interval: 'MONTHLY', billingType: 'CREDIT_CARD', beneficiaryEmails: [' A@exemplo.com', 'a@EXEMPLO.com '],
    idempotencyKey: 'dup-key', returnBaseUrl: 'https://app.example',
  }), /DUPLICATE_BENEFICIARY_EMAIL/);
  assert.equal(calls.provider.length, 0);
});

test('retorna checkout já criado quando a mesma chave e fingerprint são repetidos', async () => {
  const fingerprint = createHash('sha256').update(JSON.stringify({ monitorId: 'monitor-1', interval: 'MONTHLY', billingType: 'CREDIT_CARD', emails: ['a@exemplo.com'] })).digest('hex');
  const { calls, useCase } = setup({
    findBatchByIdempotency: async () => ({
      fingerprint,
      batch: { id: 'batch-existing', amountCents: 6000, status: 'PENDING', checkoutUrl: 'https://sandbox.asaas.com/existing', expiresAt: null },
    }),
  });
  // The repository-provided fingerprint is compared to the normalized request fingerprint.
  const result = await useCase.execute('teacher-user', {
    monitorId: 'monitor-1', interval: 'MONTHLY', billingType: 'CREDIT_CARD', beneficiaryEmails: ['a@exemplo.com'],
    idempotencyKey: 'same-key', returnBaseUrl: 'https://app.example',
  });
  assert.equal(result.checkoutUrl, 'https://sandbox.asaas.com/existing');
  assert.equal(calls.provider.length, 0);
});

test('rejeita criação quando o total enviado pelo professor ficou desatualizado', async () => {
  const { calls, useCase } = setup();
  await assert.rejects(() => useCase.execute('teacher-user', {
    monitorId: 'monitor-1', interval: 'MONTHLY', billingType: 'CREDIT_CARD', beneficiaryEmails: ['a@exemplo.com'], expectedTotalAmountCents: 5999,
    idempotencyKey: 'stale-price-key', returnBaseUrl: 'https://app.example',
  }), /PRICE_CHANGED/);
  assert.equal(calls.provider.length, 0);
  assert.equal(calls.created.length, 0);
});


test('usa cobrança avulsa para Pix e recorrência somente para cartão mensal', async () => {
  for (const interval of ['MONTHLY', 'ANNUAL'] as const) {
    for (const billingType of ['PIX', 'CREDIT_CARD'] as const) {
      const { calls, useCase } = setup();
      await useCase.execute('teacher-user', { monitorId: 'monitor-1', interval, billingType, beneficiaryEmails: ['a@example.com'], idempotencyKey: `${interval}-${billingType}-key`, returnBaseUrl: 'https://app.example' });
      const checkout = calls.provider[0];
      assert.equal(checkout.chargeType, interval === 'MONTHLY' && billingType === 'CREDIT_CARD' ? 'RECURRENT' : 'DETACHED');
      assert.equal(checkout.billingType, billingType);
      assert.equal(checkout.cycle, interval === 'MONTHLY' && billingType === 'CREDIT_CARD' ? 'MONTHLY' : undefined);
      if (interval === 'ANNUAL' && billingType === 'CREDIT_CARD') {
        assert.deepEqual(checkout.chargeTypes, ['DETACHED', 'INSTALLMENT']);
        assert.equal(checkout.maxInstallmentCount, 12);
      } else {
        assert.equal(checkout.chargeTypes, undefined);
        assert.equal(checkout.maxInstallmentCount, undefined);
      }
    }
  }
});

test('mesma chave com outro método conflita, mesma combinação de método reutiliza lote', async () => {
  const fingerprint = createHash('sha256').update(JSON.stringify({ monitorId: 'monitor-1', interval: 'MONTHLY', billingType: 'CREDIT_CARD', emails: ['a@example.com'] })).digest('hex');
  const existing = { fingerprint, batch: { id: 'existing', amountCents: 6000, status: 'PENDING', checkoutUrl: 'https://pay.test/existing', expiresAt: null } };
  const same = setup({ findBatchByIdempotency: async () => existing });
  const request = { monitorId: 'monitor-1', interval: 'MONTHLY' as const, beneficiaryEmails: ['a@example.com'], idempotencyKey: 'reuse-key', returnBaseUrl: 'https://app.example' };
  const reused = await same.useCase.execute('teacher-user', { ...request, billingType: 'CREDIT_CARD' });
  assert.equal(reused.checkoutUrl, 'https://pay.test/existing');
  assert.equal(same.calls.provider.length, 0);
  const different = setup({ findBatchByIdempotency: async () => existing });
  await assert.rejects(() => different.useCase.execute('teacher-user', { ...request, billingType: 'PIX' }), /IDEMPOTENCY_KEY_REUSED/);
  assert.equal(different.calls.provider.length, 0);
});
