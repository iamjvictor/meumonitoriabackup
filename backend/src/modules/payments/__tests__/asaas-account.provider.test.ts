import assert from 'node:assert/strict';
import test from 'node:test';
import { AsaasAccountProvider } from '../infrastructure/providers/asaas/asaas-account.provider.js';
import { ASAAS_SUBACCOUNT_WEBHOOK_EVENTS } from '../infrastructure/providers/asaas/asaas-webhook-events.js';

test('provider cria subconta Asaas sem expor a apiKey no resultado de domínio', async () => {
  let request: { path: string; body: unknown } | undefined;
  const provider = new AsaasAccountProvider({
    async request<T>(path: string, options: { method: 'GET' | 'POST' | 'PUT'; body?: unknown }) {
      if (path === '/accounts') {
        request = { path, body: options.body };
        return { id: 'acc_123', walletId: 'wal_123', apiKey: 'secret-once', status: 'PENDING', webhooks: [{ id: 'wh_subaccount_123' }] } as T;
      }
      throw new Error(`Unexpected request: ${path}`);
    },
  }, {
    webhookUrl: 'https://api.test/webhooks/asaas',
    webhookEmail: 'financeiro@test.com',
    webhookAuthToken: 'a'.repeat(32),
  });

  const result = await provider.createSubaccount({
    name: 'Professora Ana',
    email: 'ana@example.com',
    cpfCnpj: '12345678901',
    mobilePhone: '11999999999',
    incomeValue: 5000,
    address: 'Rua A',
    addressNumber: '10',
    province: 'Centro',
    postalCode: '01001000',
  });

  assert.deepEqual(result, { providerAccountId: 'acc_123', walletId: 'wal_123', status: 'PENDING', onboardingUrl: null, webhookId: 'wh_subaccount_123' });
  assert.equal(request?.path, '/accounts');
  assert.deepEqual(request?.body, {
    name: 'Professora Ana',
    email: 'ana@example.com',
    cpfCnpj: '12345678901',
    mobilePhone: '11999999999',
    incomeValue: 5000,
    address: 'Rua A',
    addressNumber: '10',
    province: 'Centro',
    postalCode: '01001000',
    webhooks: [{
      name: 'MeuMonitor AI - Status da Conta',
      url: 'https://api.test/webhooks/asaas',
      email: 'financeiro@test.com',
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      authToken: 'a'.repeat(32),
      sendType: 'SEQUENTIALLY',
      events: ASAAS_SUBACCOUNT_WEBHOOK_EVENTS,
    }],
  });
});

test('provider permite confirmar o webhook depois que a subconta já foi persistida', async () => {
  const requests: Array<{ path: string; method: string; credential?: string; body?: unknown }> = [];
  const provider = new AsaasAccountProvider({
    async request<T>(path: string, options: { method: 'GET' | 'POST' | 'PUT'; credential?: string; body?: unknown }) {
      requests.push({ path, ...options });
      if (path === '/accounts') {
        return { id: 'acc_123', walletId: 'wal_123', apiKey: 'subaccount-secret', status: 'PENDING' } as T;
      }
      if (path === '/webhooks?limit=100') return { data: [] } as T;
      if (path === '/webhooks') return { id: 'wh_subaccount_123' } as T;
      throw new Error(`Unexpected request: ${path}`);
    },
  }, {
    webhookUrl: 'https://api.test/webhooks/asaas',
    webhookEmail: 'financeiro@test.com',
    webhookAuthToken: 'a'.repeat(32),
  });

  const result = await provider.createSubaccount({
    name: 'Professora Ana', email: 'ana@example.com', cpfCnpj: '12345678901', mobilePhone: '11999999999',
    incomeValue: 5000, address: 'Rua A', addressNumber: '10', province: 'Centro', postalCode: '01001000',
  });

  const ensured = await provider.ensureAccountStatusWebhook('subaccount-secret');

  assert.equal(result.providerAccountId, 'acc_123');
  assert.equal(ensured.webhookId, 'wh_subaccount_123');
  assert.deepEqual(requests.map(({ path, method, credential }) => ({ path, method, credential })), [
    { path: '/accounts', method: 'POST', credential: undefined },
    { path: '/webhooks?limit=100', method: 'GET', credential: 'subaccount-secret' },
    { path: '/webhooks', method: 'POST', credential: 'subaccount-secret' },
  ]);
});
