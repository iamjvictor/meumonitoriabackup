import assert from 'node:assert/strict';
import test from 'node:test';
import { CreateSponsoredSeatBatchUseCase } from '../application/commands/create-sponsored-seat-batch.use-case.js';

function setup(status = 'CHECKOUT_PENDING', interval = 'MONTHLY', billingType = 'PIX') {
  const calls: string[] = [];
  let replacementBillingType: string | undefined;
  let replacementCheckout: any;
  const repository = {
    findTeacherMonitor: async () => ({ teacherId: 'teacher-1', teacherPercentage: 40, monitor: { id: 'monitor-1', name: 'Física', status: 'PUBLISHED', priceCents: 10000 } }),
    findBatchForEditing: async () => ({ id: 'batch-1', monitorId: 'monitor-1', interval, billingType, status, providerCheckoutId: 'old-checkout', paidAt: null }),
    findBlockingSeat: async () => null,
    replacePendingBatch: async (input: any) => { calls.push(`replace:${input.totalAmountCents}:${input.emails.join(',')}`); return true; },
    markEditedCheckoutFailed: async () => calls.push('failed'),
  };
  const provider = {
    cancelHostedCheckout: async (id: string) => calls.push(`cancel:${id}`),
    createHostedCheckout: async (input: any) => { replacementBillingType = input.billingType; replacementCheckout = input; calls.push(`create:${input.amountCents}:${input.items[0].quantity}:${input.splits.length}:${input.billingType}`); return { providerCheckoutId: 'new-checkout', checkoutUrl: 'https://pay.test/new', expiresAt: null }; },
  };
  return { calls, get replacementBillingType() { return replacementBillingType; }, get replacementCheckout() { return replacementCheckout; }, useCase: new CreateSponsoredSeatBatchUseCase(repository as any, provider as any) };
}

test('edita beneficiários não pagos só após cancelar checkout e recria valor/checkout sem split', async () => {
  const { calls, useCase } = setup();
  const result = await useCase.updatePending('teacher-user', 'batch-1', { beneficiaryEmails: ['new@test.com', 'other@test.com'], expectedTotalAmountCents: 12000, returnBaseUrl: 'https://app.test' });
  assert.deepEqual(calls, ['cancel:old-checkout', 'create:12000:2:0:PIX', 'replace:12000:new@test.com,other@test.com']);
  assert.equal(result.checkoutUrl, 'https://pay.test/new');
  assert.ok(calls.includes('create:12000:2:0:PIX')); 
});

test('não altera lote já pago ou em processamento', async () => {
  const { calls, useCase } = setup('CHECKOUT_PAID_PENDING_PAYMENT');
  await assert.rejects(() => useCase.updatePending('teacher-user', 'batch-1', { beneficiaryEmails: ['new@test.com'], expectedTotalAmountCents: 6000, returnBaseUrl: 'https://app.test' }), /BATCH_NOT_EDITABLE/);
  assert.deepEqual(calls, []);
});

test('edição de lote anual pendente mantém cartão à vista e parcelamento até 12x', async () => {
  const fixture = setup('CHECKOUT_PENDING', 'ANNUAL', 'CREDIT_CARD');
  await fixture.useCase.updatePending('teacher-user', 'batch-1', { beneficiaryEmails: ['new@test.com'], expectedTotalAmountCents: 57600, returnBaseUrl: 'https://app.test' });
  const replacementCheckout = fixture.replacementCheckout;
  assert.ok(replacementCheckout, `checkout replacement was not created: ${fixture.calls.join(',')}`);
  assert.equal(replacementCheckout.billingType, 'CREDIT_CARD');
  assert.equal(replacementCheckout.chargeType, 'DETACHED');
  assert.deepEqual(replacementCheckout.chargeTypes, ['DETACHED', 'INSTALLMENT']);
  assert.equal(replacementCheckout.maxInstallmentCount, 12);
  assert.deepEqual(replacementCheckout.splits, []);
});

test('edição de lote mensal por Pix recria checkout detached sem ciclo recorrente', async () => {
  const fixture = setup('CHECKOUT_PENDING', 'MONTHLY', 'PIX');
  await fixture.useCase.updatePending('teacher-user', 'batch-1', { beneficiaryEmails: ['new@test.com'], expectedTotalAmountCents: 6000, returnBaseUrl: 'https://app.test' });
  assert.equal(fixture.replacementCheckout.chargeType, 'DETACHED');
  assert.equal(fixture.replacementCheckout.billingType, 'PIX');
  assert.equal(fixture.replacementCheckout.cycle, undefined);
  assert.equal(fixture.replacementCheckout.chargeTypes, undefined);
});

test('não troca beneficiários quando cancelamento do checkout anterior falha', async () => {
  const { calls, useCase } = setup();
  const provider = (useCase as any).provider;
  provider.cancelHostedCheckout = async () => { calls.push('cancel-failed'); throw new Error('already paid'); };
  await assert.rejects(() => useCase.updatePending('teacher-user', 'batch-1', { beneficiaryEmails: ['new@test.com'], expectedTotalAmountCents: 6000, returnBaseUrl: 'https://app.test' }), /CHECKOUT_CANNOT_BE_CANCELLED/);
  assert.deepEqual(calls, ['cancel-failed']);
});

test('revalida o estado após cancelamento remoto e não cria substituto se pagamento avançou', async () => {
  const { calls, useCase } = setup();
  let reads = 0;
  (useCase as any).repository.findBatchForEditing = async () => ({ id: 'batch-1', monitorId: 'monitor-1', interval: 'MONTHLY', status: ++reads === 1 ? 'CHECKOUT_PENDING' : 'ACTIVE', providerCheckoutId: 'old-checkout', paidAt: null });
  await assert.rejects(() => useCase.updatePending('teacher-user', 'batch-1', { beneficiaryEmails: ['new@test.com'], expectedTotalAmountCents: 6000, returnBaseUrl: 'https://app.test' }), /BATCH_NOT_EDITABLE/);
  assert.deepEqual(calls, ['cancel:old-checkout']);
});

test('cancela checkout substituto se atualização condicional perde corrida', async () => {
  const { calls, useCase } = setup();
  (useCase as any).repository.replacePendingBatch = async () => false;
  await assert.rejects(() => useCase.updatePending('teacher-user', 'batch-1', { beneficiaryEmails: ['new@test.com'], expectedTotalAmountCents: 6000, returnBaseUrl: 'https://app.test' }), /BATCH_NOT_EDITABLE/);
  assert.deepEqual(calls, ['cancel:old-checkout', 'create:6000:1:0:PIX', 'cancel:new-checkout']);
});

test('registra checkout substituto para reconciliação se cancelamento compensatório falhar', async () => {
  const { calls, useCase } = setup();
  (useCase as any).repository.replacePendingBatch = async () => false;
  (useCase as any).provider.cancelHostedCheckout = async (id: string) => {
    calls.push(`cancel:${id}`);
    if (id === 'new-checkout') throw new Error('provider unavailable');
  };
  const originalError = console.error;
  let logged: any;
  console.error = (...args: any[]) => { logged = args; };
  try {
    await assert.rejects(() => useCase.updatePending('teacher-user', 'batch-1', { beneficiaryEmails: ['new@test.com'], expectedTotalAmountCents: 6000, returnBaseUrl: 'https://app.test' }), /BATCH_NOT_EDITABLE/);
  } finally { console.error = originalError; }
  assert.deepEqual(calls, ['cancel:old-checkout', 'create:6000:1:0:PIX', 'cancel:new-checkout']);
  assert.equal(logged?.[1]?.event, 'payments.sponsored_batch_replacement_checkout_orphaned');
  assert.equal(logged?.[1]?.checkoutId, 'new-checkout');
});
