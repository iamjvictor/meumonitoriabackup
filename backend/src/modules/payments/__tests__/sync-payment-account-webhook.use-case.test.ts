import assert from 'node:assert/strict';
import test from 'node:test';
import { SyncPaymentAccountWebhookUseCase } from '../application/commands/sync-payment-account-webhook.use-case.js';

test('sincroniza o webhook da subconta e persiste o identificador retornado pelo Asaas', async () => {
  const persisted: Array<{ accountId: string; webhookId: string }> = [];
  const useCase = new SyncPaymentAccountWebhookUseCase({
    async findForWebhookSync() {
      return {
        id: 'payment-account-1', environment: 'PRODUCTION', providerWebhookId: null,
        credential: { ciphertext: 'ciphertext', nonce: 'nonce', authTag: 'tag', keyVersion: 1 },
      };
    },
    async setProviderWebhookId(accountId, webhookId) { persisted.push({ accountId, webhookId }); },
    async claimProviderWebhookSync() { return true; },
    async recordProviderWebhookSyncFailure() {},
    async findPendingWebhookSync() { return []; },
  }, {
    encrypt() { throw new Error('not used'); },
    decrypt(accountId, environment, credential) {
      assert.equal(accountId, 'payment-account-1');
      assert.equal(environment, 'PRODUCTION');
      assert.equal(credential.ciphertext, 'ciphertext');
      return 'subaccount-secret';
    },
  }, {
    async ensureAccountStatusWebhook(credential) {
      assert.equal(credential, 'subaccount-secret');
      return { webhookId: 'wh_subaccount_123' };
    },
  });

  const result = await useCase.execute('payment-account-1', 'PRODUCTION');

  assert.deepEqual(result, { accountId: 'payment-account-1', webhookId: 'wh_subaccount_123' });
  assert.deepEqual(persisted, [{ accountId: 'payment-account-1', webhookId: 'wh_subaccount_123' }]);
});

test('recupera sincronização pendente usando a credencial cifrada salva', async () => {
  const persisted: string[] = [];
  const useCase = new SyncPaymentAccountWebhookUseCase({
    async findForWebhookSync() { return { id: 'pending-account', environment: 'SANDBOX', providerWebhookId: null, credential: { ciphertext: 'cipher', nonce: 'n', authTag: 't', keyVersion: 1 } }; },
    async setProviderWebhookId(accountId) { persisted.push(accountId); },
    async claimProviderWebhookSync() { return true; },
    async recordProviderWebhookSyncFailure() { throw new Error('not expected'); },
    async findPendingWebhookSync(environment) {
      assert.equal(environment, 'SANDBOX');
      return [{ id: 'pending-account', environment, credential: { ciphertext: 'cipher', nonce: 'n', authTag: 't', keyVersion: 1 } }];
    },
  }, {
    encrypt() { throw new Error('not used'); },
    decrypt(accountId) { assert.equal(accountId, 'pending-account'); return 'stored-subaccount-secret'; },
  }, {
    async ensureAccountStatusWebhook(credential) { assert.equal(credential, 'stored-subaccount-secret'); return { webhookId: 'wh-recovered' }; },
  });

  assert.equal(await useCase.recoverPending('SANDBOX'), 1);
  assert.deepEqual(persisted, ['pending-account']);
});

test('erro de sincronização é gravado como tentativa retomável sem expor mensagem do provider', async () => {
  const failureCodes: string[] = [];
  const useCase = new SyncPaymentAccountWebhookUseCase({
    async findForWebhookSync() { return { id: 'pending-account', environment: 'SANDBOX', providerWebhookId: null, credential: { ciphertext: 'cipher', nonce: 'n', authTag: 't', keyVersion: 1 } }; },
    async setProviderWebhookId() {},
    async claimProviderWebhookSync() { return true; },
    async recordProviderWebhookSyncFailure(_accountId, code) { failureCodes.push(code); },
    async findPendingWebhookSync() { return []; },
  }, { encrypt() { throw new Error('not used'); }, decrypt() { return 'credential'; } }, {
    async ensureAccountStatusWebhook() { throw Object.assign(new Error('message with private details'), { code: 'ASAAS_RATE_LIMIT' }); },
  });

  await assert.rejects(() => useCase.execute('pending-account', 'SANDBOX'), /private details/);
  assert.deepEqual(failureCodes, ['ASAAS_RATE_LIMIT']);
});
