import type { PaymentAccountCredentialStore, PaymentEnvironment } from '../../infrastructure/credentials/payment-account-credential.store.js';

type StoredCredential = {
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: number;
};

export type PaymentAccountWebhookSyncRepository = {
  findForWebhookSync(accountId: string, environment: string): Promise<{
    id: string;
    environment: string;
    providerWebhookId: string | null;
    credential: StoredCredential | null;
  } | null>;
  setProviderWebhookId(accountId: string, webhookId: string): Promise<void>;
  claimProviderWebhookSync(accountId: string): Promise<boolean>;
  recordProviderWebhookSyncFailure(accountId: string, errorCode: string): Promise<void>;
  findPendingWebhookSync(environment: string, limit?: number): Promise<Array<{
    id: string;
    environment: string;
    credential: StoredCredential | null;
  }>>;
};

export type AccountStatusWebhookProvider = {
  ensureAccountStatusWebhook(credential: string): Promise<{ webhookId: string }>;
};

export class PaymentAccountWebhookSyncAlreadyClaimedError extends Error {}

export class SyncPaymentAccountWebhookUseCase {
  constructor(
    private readonly repository: PaymentAccountWebhookSyncRepository,
    private readonly credentialStore: PaymentAccountCredentialStore,
    private readonly provider: AccountStatusWebhookProvider,
  ) {}

  async execute(accountId: string, environment: string) {
    const account = await this.repository.findForWebhookSync(accountId, environment);
    if (!account) throw new Error('PAYMENT_ACCOUNT_NOT_FOUND_FOR_ENVIRONMENT');
    if (!account.credential) throw new Error('PAYMENT_ACCOUNT_CREDENTIAL_MISSING');
    if (!await this.repository.claimProviderWebhookSync(account.id)) throw new PaymentAccountWebhookSyncAlreadyClaimedError();

    try {
      const credential = this.credentialStore.decrypt(account.id, account.environment as PaymentEnvironment, account.credential);
      const { webhookId } = await this.provider.ensureAccountStatusWebhook(credential);
      await this.repository.setProviderWebhookId(account.id, webhookId);
      return { accountId: account.id, webhookId };
    } catch (error) {
      const errorCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : error instanceof Error ? error.name : 'ASAAS_WEBHOOK_SYNC_FAILED';
      await this.repository.recordProviderWebhookSyncFailure(account.id, errorCode);
      throw error;
    }
  }

  async recoverPending(environment: string, limit = 100) {
    const accounts = await this.repository.findPendingWebhookSync(environment, limit);
    for (const account of accounts) {
      if (!account.credential) {
        await this.repository.recordProviderWebhookSyncFailure(account.id, 'PAYMENT_ACCOUNT_CREDENTIAL_MISSING');
        console.error('Subconta sem credencial não pode sincronizar o webhook', { event: 'payments.asaas_subaccount_webhook_sync_dead_letter', accountId: account.id });
        continue;
      }
      try {
        await this.execute(account.id, environment);
      } catch (error) {
        console.warn('Tentativa automática de sincronização do webhook falhou', {
          event: 'payments.asaas_subaccount_webhook_sync_retry_failed',
          accountId: account.id,
          errorType: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }
    return accounts.length;
  }
}
