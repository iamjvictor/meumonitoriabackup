import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { CreateSponsoredSeatBatchUseCase } from '../application/commands/create-sponsored-seat-batch.use-case.js';
import { AsaasCheckoutProvider } from '../infrastructure/providers/asaas/asaas-checkout.provider.js';

function emailList(count: number) {
  return Array.from({ length: count }, (_, index) => `aluno${index + 1}@preenem.test`);
}
function createHarness() {
  const state: { saved: unknown[]; requests: Array<{ path: string; body: any }>; batches: unknown[] } = { saved: [], requests: [], batches: [] };
  const repository = {
    findTeacherMonitor: async () => ({ teacherId: 'teacher-qa', teacherPercentage: 40, monitor: { id: 'monitor-qa', name: 'Exatas ENEM', status: 'PUBLISHED', priceCents: 10000 } }),
    findBatchByIdempotency: async () => null,
    findBlockingSeat: async () => false,
    createPendingBatch: async (input: unknown) => { state.batches.push(input); return { id: `batch-${state.batches.length}`, externalReference: `batch-${state.batches.length}` }; },
    saveCheckout: async (_id: string, checkout: unknown) => { state.saved.push(checkout); },
    markCheckoutCreationFailed: async () => {},
  };
  const client = { request: async <T>(path: string, request: { method: 'POST'; body?: any }) => {
    state.requests.push({ path, body: request.body });
    return { id: `asaas-${state.requests.length}`, link: `https://checkout.example/${state.requests.length}` } as T;
  } };
  const provider = new AsaasCheckoutProvider(client, 'sandbox');
  return { state, useCase: new CreateSponsoredSeatBatchUseCase(repository as any, provider) };
}

const cases = [
  { interval: 'MONTHLY', billingType: 'PIX', amountPerStudent: 6000, chargeTypes: ['DETACHED'], cycle: undefined },
  { interval: 'MONTHLY', billingType: 'CREDIT_CARD', amountPerStudent: 6000, chargeTypes: ['RECURRENT'], cycle: 'MONTHLY' },
  { interval: 'ANNUAL', billingType: 'PIX', amountPerStudent: 57600, chargeTypes: ['DETACHED'], cycle: undefined },
  { interval: 'ANNUAL', billingType: 'CREDIT_CARD', amountPerStudent: 57600, chargeTypes: ['DETACHED', 'INSTALLMENT'], maxInstallmentCount: 12, cycle: undefined },
] as const;

for (const scenario of cases) {
  for (const count of [1, 10]) {
    test(`QA batch ${count} alunos ${scenario.interval} ${scenario.billingType}: preço, payload Asaas, callbacks e sem split`, async () => {
      const { state, useCase } = createHarness();
      const emails = emailList(count);
      const base = 'https://app.example.test/';
      const result = await useCase.execute('teacher-user-qa', {
        monitorId: 'monitor-qa', interval: scenario.interval, billingType: scenario.billingType,
        beneficiaryEmails: emails, idempotencyKey: `${scenario.interval}-${scenario.billingType}-${count}`,
        returnBaseUrl: base,
      });
      const { body, path } = state.requests[0]!;
      const totalCents = scenario.amountPerStudent * count;
      assert.equal(result.amountCents, totalCents);
      assert.equal(path, '/checkouts');
      assert.deepEqual(body.billingTypes, [scenario.billingType]);
      assert.deepEqual(body.chargeTypes, scenario.chargeTypes);
      assert.deepEqual(body.splits, []);
      assert.deepEqual(body.items, [{ name: 'Exatas ENEM', description: `${count} vagas patrocinadas`, quantity: count, value: scenario.amountPerStudent / 100 }]);
      assert.deepEqual(body.callback, {
        successUrl: `https://app.example.test/checkout/retorno?batchId=batch-1&status=success`,
        cancelUrl: `https://app.example.test/checkout/retorno?batchId=batch-1&status=cancelled`,
        expiredUrl: `https://app.example.test/checkout/retorno?batchId=batch-1&status=expired`,
        autoRedirect: true,
      });
      if (scenario.cycle) assert.deepEqual(body.subscription, { cycle: scenario.cycle, nextDueDate: body.subscription.nextDueDate });
      else assert.equal(body.subscription, undefined);
      if ('maxInstallmentCount' in scenario) assert.deepEqual(body.installment, { maxInstallmentCount: 12 });
      else assert.equal(body.installment, undefined);
      const persisted = state.batches[0] as any;
      assert.equal(persisted.totalAmountCents, totalCents);
      assert.equal(persisted.billingType, scenario.billingType);
      assert.equal(persisted.beneficiaryEmails.length, count);
      assert.equal(state.saved.length, 1);
      assert.equal(result.checkoutUrl, 'https://checkout.example/1');
    });
  }
}

test('QA idempotência: repetição idêntica reutiliza checkout; alteração de quantidade ou método conflita', async () => {
  const fingerprint = createHash('sha256').update(JSON.stringify({ monitorId: 'monitor-qa', interval: 'MONTHLY', billingType: 'PIX', emails: ['aluno1@preenem.test'] })).digest('hex');
  const existing = { fingerprint, batch: { id: 'batch-prior', amountCents: 6000, status: 'PENDING', checkoutUrl: 'https://checkout.example/prior', expiresAt: null } };
  const repository = {
    findTeacherMonitor: async () => ({ teacherId: 'teacher-qa', teacherPercentage: 40, monitor: { id: 'monitor-qa', name: 'Exatas ENEM', status: 'PUBLISHED', priceCents: 10000 } }),
    findBatchByIdempotency: async () => existing,
    findBlockingSeat: async () => false,
  };
  let providerCalls = 0;
  const useCase = new CreateSponsoredSeatBatchUseCase(repository as any, { createHostedCheckout: async () => { providerCalls++; return { providerCheckoutId: 'x', checkoutUrl: 'https://checkout.example/new', expiresAt: null }; } } as any);
  const common = { monitorId: 'monitor-qa', interval: 'MONTHLY' as const, idempotencyKey: 'same-key', returnBaseUrl: 'https://app.example.test', beneficiaryEmails: ['aluno1@preenem.test'] };
  assert.equal((await useCase.execute('teacher-user-qa', { ...common, billingType: 'PIX' })).checkoutUrl, existing.batch.checkoutUrl);
  await assert.rejects(() => useCase.execute('teacher-user-qa', { ...common, billingType: 'CREDIT_CARD' }), /IDEMPOTENCY_KEY_REUSED/);
  await assert.rejects(() => useCase.execute('teacher-user-qa', { ...common, billingType: 'PIX', beneficiaryEmails: emailList(10) }), /IDEMPOTENCY_KEY_REUSED/);
  assert.equal(providerCalls, 0);
});
