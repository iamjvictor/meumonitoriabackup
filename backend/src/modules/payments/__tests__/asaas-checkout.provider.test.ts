import assert from 'node:assert/strict';
import test from 'node:test';
import { AsaasCheckoutProvider } from '../infrastructure/providers/asaas/asaas-checkout.provider.js';

test('serializa Pix mensal como checkout avulso sem payload de assinatura', async () => {
  let requestBody: any;
  const provider = new AsaasCheckoutProvider({
    async request<T>(_path: string, request: { method: 'POST'; body?: unknown }): Promise<T> {
      requestBody = request.body;
      return { id: 'checkout-pix-monthly', link: 'https://sandbox.asaas.com/checkout-pix-monthly' } as T;
    },
  }, 'sandbox');

  await provider.createHostedCheckout({
    externalReference: 'batch-pix-monthly', monitorName: 'Matemática ENEM', description: 'Acesso mensal', amountCents: 2995,
    successUrl: 'https://app.example/checkout/success', cancelUrl: 'https://app.example/checkout/cancel', expiredUrl: 'https://app.example/checkout/expired',
    nextDueDate: '2026-11-01', splits: [], billingType: 'PIX', chargeType: 'DETACHED',
  });

  assert.deepEqual(requestBody.billingTypes, ['PIX']);
  assert.deepEqual(requestBody.chargeTypes, ['DETACHED']);
  assert.equal(requestBody.subscription, undefined);
  assert.equal(requestBody.installment, undefined);
});

test('mantém ciclo de assinatura no checkout mensal recorrente de cartão', async () => {
  let requestBody: any;
  const provider = new AsaasCheckoutProvider({
    async request<T>(_path: string, request: { method: 'POST'; body?: unknown }): Promise<T> {
      requestBody = request.body;
      return { id: 'checkout-card-monthly', link: 'https://sandbox.asaas.com/checkout-card-monthly' } as T;
    },
  }, 'sandbox');

  await provider.createHostedCheckout({
    externalReference: 'batch-card-monthly', monitorName: 'Matemática ENEM', description: 'Acesso mensal', amountCents: 2995,
    successUrl: 'https://app.example/checkout/success', cancelUrl: 'https://app.example/checkout/cancel', expiredUrl: 'https://app.example/checkout/expired',
    nextDueDate: '2026-11-01', splits: [], billingType: 'CREDIT_CARD', chargeType: 'RECURRENT', cycle: 'MONTHLY',
  });

  assert.deepEqual(requestBody.billingTypes, ['CREDIT_CARD']);
  assert.deepEqual(requestBody.chargeTypes, ['RECURRENT']);
  assert.deepEqual(requestBody.subscription, { cycle: 'MONTHLY', nextDueDate: '2026-11-01' });
});
