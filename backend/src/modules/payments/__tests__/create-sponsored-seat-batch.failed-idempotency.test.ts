import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { CreateSponsoredSeatBatchUseCase } from '../application/commands/create-sponsored-seat-batch.use-case.js';

function setup(status: string, checkoutUrl: string | null = null) {
  const calls = { provider: 0 };
  const fingerprint = createHash('sha256').update(JSON.stringify({ monitorId: 'monitor-1', interval: 'ANNUAL', billingType: 'PIX', emails: ['student@example.test'] })).digest('hex');
  const repository = {
    findTeacherMonitor: async () => ({ teacherId: 'teacher-1', teacherPercentage: 40, monitor: { id: 'monitor-1', name: 'Matemática enem', status: 'PUBLISHED', priceCents: 30000 } }),
    findBatchByIdempotency: async () => ({ fingerprint, batch: { id: 'batch-1', amountCents: 28752, status, checkoutUrl, expiresAt: null } }),
    findBlockingSeat: async () => false,
  };
  const provider = { createHostedCheckout: async () => { calls.provider += 1; return { providerCheckoutId: 'checkout-new', checkoutUrl: 'https://pay.test/new', expiresAt: null }; } };
  return { calls, useCase: new CreateSponsoredSeatBatchUseCase(repository as any, provider as any) };
}

const request = { monitorId: 'monitor-1', interval: 'ANNUAL' as const, billingType: 'PIX' as const, beneficiaryEmails: ['student@example.test'], idempotencyKey: 'same-key', returnBaseUrl: 'https://app.test' };

test('falha anterior de criação não é apresentada como checkout em processamento nem reenvia ao provider', async () => {
  const { calls, useCase } = setup('CHECKOUT_CREATION_FAILED');
  await assert.rejects(() => useCase.execute('teacher-user', request), /CHECKOUT_CREATION_FAILED/);
  assert.equal(calls.provider, 0);
});

test('checkout realmente pendente continua bloqueado sem chamar o provider', async () => {
  const { calls, useCase } = setup('PENDING');
  await assert.rejects(() => useCase.execute('teacher-user', request), /CHECKOUT_PENDING/);
  assert.equal(calls.provider, 0);
});

test('checkout com URL já persistida continua sendo reutilizado', async () => {
  const { calls, useCase } = setup('PENDING', 'https://pay.test/existing');
  const result = await useCase.execute('teacher-user', request);
  assert.equal(result.checkoutUrl, 'https://pay.test/existing');
  assert.equal(calls.provider, 0);
});
