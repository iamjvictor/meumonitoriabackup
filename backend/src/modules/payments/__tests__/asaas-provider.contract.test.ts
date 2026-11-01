import assert from 'node:assert/strict';
import test from 'node:test';
import { AsaasCheckoutProvider } from '../infrastructure/providers/asaas/asaas-checkout.provider.js';

test('provider cria checkout hospedado mensal de cartão com snapshots e split', async () => {
  const calls: Array<{ path: string; options: unknown }> = [];
  const provider = new AsaasCheckoutProvider({
    async request<T>(path: string, options: { method: 'POST'; body: unknown }) {
      calls.push({ path, options });
      return { id: 'co_123', url: 'https://sandbox.asaas.com/checkout/co_123', expiresAt: '2026-10-01T00:00:00.000Z' } as T;
    },
  });

  const result = await provider.createHostedCheckout({
    externalReference: 'order-123',
    customerId: 'cus_123',
    monitorName: 'Monitor Matemática',
    description: 'Acesso mensal',
    amountCents: 5990,
    successUrl: 'https://app.test/checkout/retorno?status=success',
    cancelUrl: 'https://app.test/checkout/retorno?status=cancelled',
    expiredUrl: 'https://app.test/checkout/retorno?status=expired',
    nextDueDate: '2026-09-23',
    splits: [{ walletId: 'wal_teacher', percentage: '50.0000' }],
  });

  assert.deepEqual(result, {
    providerCheckoutId: 'co_123',
    checkoutUrl: 'https://sandbox.asaas.com/checkout/co_123',
    expiresAt: new Date('2026-10-01T00:00:00.000Z'),
  });
  assert.equal(calls[0]?.path, '/checkouts');
  assert.deepEqual(calls[0]?.options, {
    method: 'POST',
    body: {
      billingTypes: ['CREDIT_CARD'],
      chargeTypes: ['RECURRENT'],
      externalReference: 'order-123',
      customer: 'cus_123',
      items: [{ name: 'Monitor Matemática', description: 'Acesso mensal', quantity: 1, value: 59.9 }],
      subscription: { cycle: 'MONTHLY', nextDueDate: '2026-09-23' },
      callback: {
        successUrl: 'https://app.test/checkout/retorno?status=success',
        cancelUrl: 'https://app.test/checkout/retorno?status=cancelled',
        expiredUrl: 'https://app.test/checkout/retorno?status=expired',
        autoRedirect: true,
      },
      splits: [{ walletId: 'wal_teacher', percentageValue: 50 }],
    },
  });
});

test('provider normaliza link retornado pelo Asaas', async () => {
  const provider = new AsaasCheckoutProvider({
    async request<T>() {
      return { id: 'co_link', link: 'https://sandbox.asaas.com/checkoutSession/show/co_link' } as T;
    },
  });

  const result = await provider.createHostedCheckout({
    externalReference: 'order-link', monitorName: 'Monitor', description: 'Assinatura', amountCents: 5990,
    successUrl: 'https://app.test/success', cancelUrl: 'https://app.test/cancel', expiredUrl: 'https://app.test/expired',
    nextDueDate: '2026-09-23', splits: [],
  });

  assert.equal(result.checkoutUrl, 'https://sandbox.asaas.com/checkoutSession/show/co_link');
});

test('provider cancela o checkout Asaas anterior antes de permitir edição', async () => {
  const calls: Array<{ path: string; options: unknown }> = [];
  const provider = new AsaasCheckoutProvider({
    async request<T>(path: string, options: { method: 'POST'; body?: unknown }) {
      calls.push({ path, options });
      return {} as T;
    },
  });
  await provider.cancelHostedCheckout!('co antigo/1');
  assert.deepEqual(calls, [{ path: '/checkouts/co%20antigo%2F1/cancel', options: { method: 'POST' } }]);
});

test('provider monta link sandbox a partir do ID quando a API não retorna link', async () => {
  const provider = new AsaasCheckoutProvider({ async request<T>() { return { id: 'co_sandbox' } as T; } }, 'sandbox');
  const result = await provider.createHostedCheckout({
    externalReference: 'order-sandbox', monitorName: 'Monitor', description: 'Assinatura', amountCents: 5990,
    successUrl: 'https://app.test/success', cancelUrl: 'https://app.test/cancel', expiredUrl: 'https://app.test/expired',
    nextDueDate: '2026-09-23', splits: [],
  });
  assert.equal(result.checkoutUrl, 'https://sandbox.asaas.com/checkoutSession/show/co_sandbox');
});

test('provider cria checkout avulso com quantidade do lote e sem recorrência', async () => {
  let body: any;
  const provider = new AsaasCheckoutProvider({
    async request<T>(_path: string, request: { method: 'POST'; body: unknown }) {
      body = request.body;
      return { id: 'co_detached', link: 'https://sandbox.asaas.com/checkout/co_detached' } as T;
    },
  }, 'sandbox');

  await provider.createHostedCheckout({
    externalReference: 'batch-1', monitorName: 'Monitor anual', description: 'Acesso anual',
    amountCents: 3000, successUrl: 'https://app.test/success', cancelUrl: 'https://app.test/cancel',
    expiredUrl: 'https://app.test/expired', nextDueDate: '2026-10-27', splits: [],
    chargeType: 'DETACHED', items: [{ name: 'Monitor anual', description: '3 vagas', quantity: 3, unitAmountCents: 1000 }],
  });

  assert.deepEqual(body.chargeTypes, ['DETACHED']);
  assert.equal(body.subscription, undefined);
  assert.deepEqual(body.items, [{ name: 'Monitor anual', description: '3 vagas', quantity: 3, value: 10 }]);
  assert.deepEqual(body.splits, []);
});

test('provider envia split no checkout anual avulso comprado pelo aluno', async () => {
  let body: any;
  const provider = new AsaasCheckoutProvider({
    async request<T>(_path: string, request: { method: 'POST'; body: unknown }) {
      body = request.body;
      return { id: 'co_student_annual', link: 'https://sandbox.asaas.com/checkout/co_student_annual' } as T;
    },
  }, 'sandbox');

  await provider.createHostedCheckout({
    externalReference: 'student-order-annual', monitorName: 'Monitor Matemática', description: 'Acesso anual',
    amountCents: 57504, successUrl: 'https://app.test/success', cancelUrl: 'https://app.test/cancel',
    expiredUrl: 'https://app.test/expired', nextDueDate: '2026-10-27',
    splits: [{ walletId: 'wal_teacher', percentage: '50.0000' }], chargeType: 'DETACHED',
    chargeTypes: ['DETACHED', 'INSTALLMENT'], maxInstallmentCount: 12,
  });

  assert.deepEqual(body.chargeTypes, ['DETACHED', 'INSTALLMENT']);
  assert.deepEqual(body.installment, { maxInstallmentCount: 12 });
  assert.equal(body.subscription, undefined);
  assert.deepEqual(body.items, [{ name: 'Monitor Matemática', description: 'Acesso anual', quantity: 1, value: 575.04 }]);
  assert.deepEqual(body.splits, [{ walletId: 'wal_teacher', percentageValue: 50 }]);
});

test('provider restringe billingTypes ao método PIX solicitado', async () => {
  let body: any;
  const provider = new AsaasCheckoutProvider({
    async request<T>(_path: string, request: { method: 'POST'; body: unknown }) {
      body = request.body;
      return { id: 'co_pix', link: 'https://sandbox.asaas.com/checkout/co_pix' } as T;
    },
  }, 'sandbox');
  await provider.createHostedCheckout({
    externalReference: 'sponsored-pix', monitorName: 'Monitor', description: 'Lote', amountCents: 6000,
    successUrl: 'https://app.test/ok', cancelUrl: 'https://app.test/cancel', expiredUrl: 'https://app.test/expired',
    nextDueDate: '2026-11-01', splits: [], billingType: 'PIX', chargeType: 'RECURRENT', cycle: 'MONTHLY',
  });
  assert.deepEqual(body.billingTypes, ['PIX']);
});
