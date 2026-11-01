import type { AsaasAccountProvider, CreateSubaccountCommand } from '../../infrastructure/providers/asaas/asaas-account.provider.js';
import type { PaymentAccountRepository } from '../../infrastructure/persistence/payment-account.repository.js';
import { AsaasApiError } from '../../infrastructure/providers/asaas/asaas-http.client.js';

export class PaymentAccountAlreadyExistsError extends Error {}
export class PaymentAccountCreationInProgressError extends Error {}
export class PaymentAccountReconciliationRequiredError extends Error {}

export class StartPaymentAccountUseCase {
  constructor(private readonly repository: PaymentAccountRepository, private readonly provider: AsaasAccountProvider) {}

  async execute(userId: string, input: CreateSubaccountCommand) {
    const startedAt = Date.now();
    console.log('Início do caso de uso de conta de recebimento', {
      event: 'payments.account_use_case_started',
      userId,
      provider: 'ASAAS',
      environment: process.env.ASAAS_ENV?.toUpperCase() ?? 'SANDBOX',
    });
    const current = await this.repository.findCurrentByUserId(userId);
    if (!current) {
      console.warn('Perfil de professor não encontrado para conta de recebimento', { event: 'payments.account_teacher_not_found', userId });
      throw new Error('TEACHER_PROFILE_NOT_FOUND');
    }
    if (current.currentPaymentAccount) {
      console.warn('Professor já possui conta de recebimento atual', {
        event: 'payments.account_already_exists',
        userId,
        accountId: current.currentPaymentAccount.id,
        status: current.currentPaymentAccount.status,
      });
      throw new PaymentAccountAlreadyExistsError();
    }

    const environment = process.env.ASAAS_ENV?.toUpperCase() ?? 'SANDBOX';
    const operation = await this.repository.reserveSubaccountCreation(userId, environment);
    if (!operation.acquired) {
      if (operation.status === 'RECONCILIATION_REQUIRED' || operation.status === 'REMOTE_CREATED') throw new PaymentAccountReconciliationRequiredError();
      throw new PaymentAccountCreationInProgressError();
    }
    console.log('Enviando solicitação de subconta ao Asaas', { event: 'payments.asaas_subaccount_create_started', userId, operationId: operation.id });
    let created;
    try {
      created = await this.provider.createSubaccount(input);
    } catch (error) {
      const definitiveRejection = error instanceof AsaasApiError && error.status >= 400 && error.status < 500;
      const errorCode = error instanceof AsaasApiError ? `ASAAS_HTTP_${error.status}` : error instanceof Error ? error.name : 'ASAAS_CREATE_UNKNOWN_FAILURE';
      await this.repository.updateSubaccountCreation(operation.id, definitiveRejection ? 'FAILED' : 'RECONCILIATION_REQUIRED', { failureCode: errorCode });
      if (!definitiveRejection) {
        console.error('Resultado da criação no Asaas é incerto; operação bloqueada para reconciliação', {
          event: 'payments.asaas_subaccount_creation_reconciliation_required',
          operationId: operation.id,
          errorType: error instanceof Error ? error.name : 'UnknownError',
        });
        throw new PaymentAccountReconciliationRequiredError();
      }
      throw error;
    }
    await this.repository.updateSubaccountCreation(operation.id, 'REMOTE_CREATED', { providerAccountId: created.providerAccountId });
    console.log('Subconta criada pelo Asaas', {
      event: 'payments.asaas_subaccount_create_completed',
      userId,
      providerAccountId: created.providerAccountId,
      walletId: created.walletId,
      status: created.status,
      hasOnboardingUrl: Boolean(created.onboardingUrl),
      apiKeyReceived: Boolean(created.apiKey),
      durationMs: Date.now() - startedAt,
    });
    console.log('Persistindo vínculo local da subconta', { event: 'payments.account_persistence_started', userId, providerAccountId: created.providerAccountId });
    try {
      const account = await this.repository.persistCreatedAccount(userId, input, created);
      await this.repository.updateSubaccountCreation(operation.id, 'COMPLETED', { providerAccountId: created.providerAccountId });
      console.log('Vínculo local da subconta persistido', {
        event: 'payments.account_persistence_completed',
        userId,
        accountId: account.id,
        providerAccountId: account.providerAccountId,
        durationMs: Date.now() - startedAt,
      });
      if (!created.apiKey) {
        try { await this.repository.recordProviderWebhookSyncFailure(account.id, 'ASAAS_ACCOUNT_CREDENTIAL_MISSING'); }
        catch (syncStateError) { console.error('Não foi possível persistir o estado de sincronização do webhook', { event: 'payments.asaas_subaccount_webhook_sync_state_write_failed', accountId: account.id, errorType: syncStateError instanceof Error ? syncStateError.name : 'UnknownError' }); }
        return { ...account, webhookSyncState: 'FAILED' };
      }
      if (!await this.repository.claimProviderWebhookSync(account.id)) return account;
      try {
        const { webhookId } = await this.provider.ensureAccountStatusWebhook(created.apiKey);
        await this.repository.setProviderWebhookId(account.id, webhookId);
        return { ...account, providerWebhookId: webhookId, webhookSyncState: 'ACTIVE' };
      } catch (error) {
        const errorCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          ? error.code
          : error instanceof Error ? error.name : 'ASAAS_WEBHOOK_SYNC_FAILED';
        try { await this.repository.recordProviderWebhookSyncFailure(account.id, errorCode); }
        catch (syncStateError) { console.error('Não foi possível persistir o estado de sincronização do webhook', { event: 'payments.asaas_subaccount_webhook_sync_state_write_failed', accountId: account.id, errorType: syncStateError instanceof Error ? syncStateError.name : 'UnknownError' }); }
        console.warn('Webhook da subconta aguardando sincronização', {
          event: 'payments.asaas_subaccount_webhook_sync_failed',
          accountId: account.id,
          providerAccountId: created.providerAccountId,
          errorCode,
        });
        return { ...account, webhookSyncState: 'PENDING' };
      }
    } catch (error) {
      await this.repository.updateSubaccountCreation(operation.id, 'RECONCILIATION_REQUIRED', {
        providerAccountId: created.providerAccountId,
        failureCode: error instanceof Error ? error.name : 'LOCAL_PERSISTENCE_FAILED',
      });
      console.warn('Persistência local da subconta falhou', {
        event: 'payments.account_persistence_failed',
        userId,
        providerAccountId: created.providerAccountId,
        errorType: error instanceof Error ? error.name : 'UnknownError',
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }
}
