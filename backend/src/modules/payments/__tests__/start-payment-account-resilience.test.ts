import assert from 'node:assert/strict';
import test from 'node:test';
import { PaymentAccountCreationInProgressError, PaymentAccountReconciliationRequiredError, StartPaymentAccountUseCase } from '../application/commands/start-payment-account.use-case.js';
import { AsaasApiError } from '../infrastructure/providers/asaas/asaas-http.client.js';
import { AsaasAccountProvider } from '../infrastructure/providers/asaas/asaas-account.provider.js';
import type { PaymentAccountRepository } from '../infrastructure/persistence/payment-account.repository.js';

const input = {
  name: 'Professora Ana', email: 'ana@example.test', cpfCnpj: '52998224725', birthDate: '1990-01-01',
  mobilePhone: '11999998888', incomeValue: 5000, address: 'Rua A', addressNumber: '10', province: 'Centro', postalCode: '01001000',
};

test('falha ao confirmar webhook após criação remota mantém a subconta vinculada localmente', async () => {
  let remoteCreations = 0;
  let persisted = false;
  const syncFailures: string[] = [];
  const provider = new AsaasAccountProvider({
    async request<T>(path: string) {
      if (path === '/accounts') {
        remoteCreations += 1;
        return { id: 'acc_ana', walletId: 'wal_ana', apiKey: 'subaccount-secret', status: 'PENDING' } as T;
      }
      if (path === '/webhooks?limit=100') throw new Error('Asaas webhook endpoint unavailable');
      throw new Error(`Unexpected request: ${path}`);
    },
  }, { webhookUrl: 'https://test.example/webhooks/asaas', webhookEmail: 'alerts@example.test', webhookAuthToken: 'a'.repeat(32) });
  const repository = {
    async findCurrentByUserId() { return { id: 'teacher_ana', currentPaymentAccount: null }; },
    async reserveSubaccountCreation() { return { acquired: true, id: 'op-ana', status: 'STARTED' }; },
    async updateSubaccountCreation() {},
    async claimProviderWebhookSync() { return true; },
    async persistCreatedAccount() {
      persisted = true;
      return { id: 'local_account_ana', providerAccountId: 'acc_ana', status: 'PENDING', providerWebhookId: null };
    },
    async recordProviderWebhookSyncFailure(_accountId: string, code: string) { syncFailures.push(code); },
  } as unknown as PaymentAccountRepository;

  const result = await new StartPaymentAccountUseCase(repository, provider).execute('user_ana', input);

  assert.equal(persisted, true);
  assert.equal(remoteCreations, 1);
  assert.equal(result.providerAccountId, 'acc_ana');
  assert.equal(result.providerWebhookId, null);
  assert.equal(result.webhookSyncState, 'PENDING');
  assert.deepEqual(syncFailures, ['Error']);
});

test('duas solicitações concorrentes do mesmo professor só chamam POST accounts uma vez', async () => {
  let reservationCreated = false;
  let createCalls = 0;
  const repository = {
    async findCurrentByUserId() { return { id: 'teacher', currentPaymentAccount: null }; },
    async reserveSubaccountCreation() {
      if (reservationCreated) return { acquired: false, status: 'STARTED' };
      reservationCreated = true;
      return { acquired: true, id: 'operation-1', status: 'STARTED' };
    },
    async updateSubaccountCreation() {},
    async persistCreatedAccount() { return { id: 'local-account', providerAccountId: 'acc_once' }; },
    async setProviderWebhookId() {},
    async claimProviderWebhookSync() { return true; },
    async recordProviderWebhookSyncFailure() {},
  } as unknown as PaymentAccountRepository;
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const provider = {
    async createSubaccount() { createCalls += 1; await wait; return { providerAccountId: 'acc_once', walletId: 'wal_once', status: 'PENDING', onboardingUrl: null, webhookId: null, apiKey: 'secret' }; },
    async ensureAccountStatusWebhook() { return { webhookId: 'wh_once' }; },
  } as never;
  const useCase = new StartPaymentAccountUseCase(repository, provider);
  const first = useCase.execute('user_ana', input);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = useCase.execute('user_ana', input);
  const settled = Promise.allSettled([first, second]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  release();
  const results = await settled;

  assert.equal(createCalls, 1);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
  assert.ok(rejected.reason instanceof PaymentAccountCreationInProgressError);
});

test('resposta ambígua do Asaas bloqueia nova criação e deixa operação para reconciliação', async () => {
  let status = 'FAILED';
  let createCalls = 0;
  const updates: string[] = [];
  const repository = {
    async findCurrentByUserId() { return { currentPaymentAccount: null }; },
    async reserveSubaccountCreation() {
      if (status === 'FAILED') { status = 'STARTED'; return { acquired: true, id: 'operation-ambiguous', status }; }
      return { acquired: false, id: 'operation-ambiguous', status };
    },
    async updateSubaccountCreation(_id: string, nextStatus: string) { status = nextStatus; updates.push(nextStatus); },
  } as unknown as PaymentAccountRepository;
  const provider = { async createSubaccount() { createCalls += 1; throw new AsaasApiError(500); } } as never;
  const useCase = new StartPaymentAccountUseCase(repository, provider);

  await assert.rejects(() => useCase.execute('user_ana', input), PaymentAccountReconciliationRequiredError);
  await assert.rejects(() => useCase.execute('user_ana', input), PaymentAccountReconciliationRequiredError);
  assert.equal(createCalls, 1);
  assert.deepEqual(updates, ['RECONCILIATION_REQUIRED']);
});
