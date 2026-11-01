import { prisma } from '../../../../lib/prisma.js';
import { randomUUID } from 'node:crypto';
import type { CreatedSubaccount } from '../providers/asaas/asaas-account.provider.js';
import type { CreateSubaccountCommand } from '../providers/asaas/asaas-account.provider.js';
import { LocalPaymentAccountCredentialStore, type PaymentAccountCredentialStore } from '../credentials/payment-account-credential.store.js';
import { mapAsaasAccountStatusSnapshot } from '../providers/asaas/asaas-account-status.mapper.js';

export type PaymentAccountInput = {
  name: string;
  email: string;
  cpfCnpj: string;
  birthDate?: string;
  companyType?: 'MEI' | 'LIMITED' | 'INDIVIDUAL' | 'ASSOCIATION';
  mobilePhone: string;
  incomeValue: number;
  address: string;
  addressNumber: string;
  complement?: string;
  province: string;
  postalCode: string;
  site?: string;
};

export class PaymentAccountRepository {
  constructor(
    private readonly credentialStore: PaymentAccountCredentialStore = new LocalPaymentAccountCredentialStore(),
    private readonly database: typeof prisma = prisma,
  ) {}
  async findCurrentByUserId(userId: string, environment = process.env.ASAAS_ENV?.toUpperCase() ?? 'SANDBOX') {
    console.log('Buscando conta de recebimento atual', { event: 'payments.account_lookup_started', userId });
    const teacher = await this.database.teacher.findUnique({
      where: { userId },
      select: {
        id: true,
        paymentAccounts: {
          where: { environment },
          orderBy: { revision: 'desc' },
          take: 1,
          select: {
            id: true,
            providerAccountId: true,
            providerWebhookId: true,
            webhookSyncState: true,
            webhookSyncAttempts: true,
            webhookSyncNextAttemptAt: true,
            webhookSyncLeaseUntil: true,
            webhookSyncErrorCode: true,
            walletId: true,
            revision: true,
            status: true,
            generalStatus: true,
            commercialInfoStatus: true,
            bankAccountStatus: true,
            documentationStatus: true,
            onboardingUrl: true,
            credentialRef: true,
            rejectionReason: true,
            verifiedAt: true,
            lastEventAt: true,
            paymentProfile: {
              select: {
                name: true,
                email: true,
                cpfCnpj: true,
                birthDate: true,
                companyType: true,
                mobilePhone: true,
                incomeValue: true,
                address: true,
                addressNumber: true,
                complement: true,
                province: true,
                postalCode: true,
                site: true,
              },
            },
          },
        },
      },
    });
    if (!teacher) return null;
    const { paymentAccounts, ...teacherData } = teacher;
    return { ...teacherData, currentPaymentAccount: paymentAccounts[0] ?? null };
  }

  async findCredentialByUserIdAndAccountId(userId: string, accountId: string) {
    const account = await this.database.paymentAccount.findFirst({
      where: { id: accountId, teacher: { userId } },
      select: { credential: true },
    });
    const credential = account?.credential;
    return credential ? { id: credential.id, accountId, environment: credential.environment, ciphertext: credential.ciphertext, nonce: credential.nonce, authTag: credential.authTag, keyVersion: credential.keyVersion } : null;
  }

  async findAccountByUserAndEnvironment(userId: string, environment: string) {
    return this.database.paymentAccount.findFirst({ where: { environment, teacher: { userId } }, select: { id: true, environment: true } });
  }
  async reserveSubaccountCreation(userId: string, environment: string) {
    const teacher = await this.database.teacher.findUnique({ where: { userId }, select: { id: true } });
    if (!teacher) throw new Error('TEACHER_PROFILE_NOT_FOUND');
    try {
      const operation = await this.database.paymentAccountCreationOperation.create({
        data: { teacherId: teacher.id, environment, status: 'STARTED' },
        select: { id: true, status: true },
      });
      return { acquired: true, ...operation };
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const where = { teacherId_environment: { teacherId: teacher.id, environment } };
      const existing = await this.database.paymentAccountCreationOperation.findUniqueOrThrow({ where, select: { id: true, status: true } });
      if (existing.status === 'FAILED') {
        const acquired = await this.database.paymentAccountCreationOperation.updateMany({
          where: { id: existing.id, status: 'FAILED' },
          data: { status: 'STARTED', providerAccountId: null, failureCode: null },
        });
        if (acquired.count === 1) return { acquired: true, id: existing.id, status: 'STARTED' };
      }
      const latest = await this.database.paymentAccountCreationOperation.findUniqueOrThrow({ where, select: { id: true, status: true } });
      return { acquired: false, ...latest };
    }
  }
  async updateSubaccountCreation(operationId: string, status: string, options: { providerAccountId?: string; failureCode?: string } = {}) {
    await this.database.paymentAccountCreationOperation.update({
      where: { id: operationId },
      data: { status, providerAccountId: options.providerAccountId, failureCode: options.failureCode?.slice(0, 80) ?? null },
    });
  }
  async markStaleSubaccountCreations(olderThanMs = 5 * 60_000) {
    const result = await this.database.paymentAccountCreationOperation.updateMany({
      where: {
        status: { in: ['STARTED', 'REMOTE_CREATED'] },
        updatedAt: { lt: new Date(Date.now() - olderThanMs) },
      },
      data: { status: 'RECONCILIATION_REQUIRED', failureCode: 'CREATION_OPERATION_STALE' },
    });
    if (result.count > 0) console.error('Criações de subconta sem conclusão exigem reconciliação', { event: 'payments.asaas_subaccount_creation_stale', count: result.count });
    return result.count;
  }
  async findForWebhookSync(accountId: string, environment: string) {
    return this.database.paymentAccount.findFirst({
      where: { id: accountId, environment },
      select: {
        id: true,
        environment: true,
        providerWebhookId: true,
        credential: { select: { ciphertext: true, nonce: true, authTag: true, keyVersion: true } },
      },
    });
  }
  async setProviderWebhookId(accountId: string, webhookId: string) {
    await this.database.paymentAccount.update({ where: { id: accountId }, data: { providerWebhookId: webhookId, webhookSyncState: 'ACTIVE', webhookSyncNextAttemptAt: null, webhookSyncLeaseUntil: null, webhookSyncErrorCode: null } });
  }
  async claimProviderWebhookSync(accountId: string) {
    const now = new Date();
    const result = await this.database.paymentAccount.updateMany({
      where: {
        id: accountId,
        webhookSyncAttempts: { lt: 10 },
        OR: [
          { webhookSyncState: 'PENDING', webhookSyncNextAttemptAt: { lte: now } },
          { webhookSyncState: 'SYNCING', webhookSyncLeaseUntil: { lt: now } },
        ],
      },
      data: { webhookSyncState: 'SYNCING', webhookSyncLeaseUntil: new Date(now.getTime() + 5 * 60_000) },
    });
    return result.count === 1;
  }
  async recordProviderWebhookSyncFailure(accountId: string, errorCode: string) {
    const current = await this.database.paymentAccount.findUnique({ where: { id: accountId }, select: { webhookSyncAttempts: true } });
    if (!current) return;
    const attempts = current.webhookSyncAttempts + 1;
    const terminal = attempts >= 10;
    const delayMs = Math.min(60 * 60_000, 60_000 * 2 ** Math.min(attempts - 1, 6));
    await this.database.paymentAccount.update({
      where: { id: accountId },
      data: {
        webhookSyncAttempts: attempts,
        webhookSyncState: terminal ? 'FAILED' : 'PENDING',
        webhookSyncLeaseUntil: null,
        webhookSyncErrorCode: errorCode.slice(0, 80),
        webhookSyncNextAttemptAt: terminal ? null : new Date(Date.now() + delayMs),
      },
    });
  }
  async findPendingWebhookSync(environment: string, limit = 100) {
    return this.database.paymentAccount.findMany({
      where: {
        environment,
        webhookSyncAttempts: { lt: 10 },
        OR: [
          { webhookSyncState: 'PENDING', webhookSyncNextAttemptAt: { lte: new Date() } },
          { webhookSyncState: 'SYNCING', webhookSyncLeaseUntil: { lt: new Date() } },
        ],
      },
      orderBy: { webhookSyncNextAttemptAt: 'asc' },
      take: limit,
      select: { id: true, environment: true, credential: { select: { ciphertext: true, nonce: true, authTag: true, keyVersion: true } } },
    });
  }
  async findCredentialOperation(userId: string, environment: string, operation: string, operationKey: string) {
    return this.database.paymentAccountCredentialOperation.findFirst({ where: { teacher: { userId }, environment, operation, operationKey }, select: { result: true } });
  }
  async persistCredentialOperation(userId: string, environment: string, operation: string, operationKey: string, result: unknown) {
    const teacher = await this.database.teacher.findUniqueOrThrow({ where: { userId }, select: { id: true } });
    try { return await this.database.paymentAccountCredentialOperation.create({ data: { teacherId: teacher.id, environment, operation, operationKey, result: result as any }, select: { result: true } }); }
    catch (error: any) { if (error?.code !== 'P2002') throw error; return this.findCredentialOperation(userId, environment, operation, operationKey); }
  }
  async rotateCredentialWithOperation(userId: string, environment: string, operationKey: string, encrypted: { ciphertext: string; nonce: string; authTag: string; keyVersion: number }, credentialId: string, result: unknown) {
    return this.database.$transaction(async (tx) => { const account = await tx.paymentAccount.findFirstOrThrow({ where: { environment, teacher: { userId } } }); await tx.paymentAccountCredential.deleteMany({ where: { paymentAccountId: account.id } }); await tx.paymentAccountCredential.create({ data: { id: credentialId, paymentAccountId: account.id, environment, ...encrypted } }); await tx.paymentAccount.update({ where: { id: account.id }, data: { credentialRef: credentialId } }); await tx.paymentAccountCredentialOperation.create({ data: { teacherId: account.teacherId, environment, operation: 'ROTATE', operationKey, result: result as any } }); return result; });
  }
  async revokeCredentialWithOperation(userId: string, environment: string, operationKey: string, result: unknown) {
    return this.database.$transaction(async (tx) => { const account = await tx.paymentAccount.findFirstOrThrow({ where: { environment, teacher: { userId } } }); await tx.paymentAccountCredential.deleteMany({ where: { paymentAccountId: account.id } }); await tx.paymentAccount.update({ where: { id: account.id }, data: { credentialRef: null } }); await tx.paymentAccountCredentialOperation.create({ data: { teacherId: account.teacherId, environment, operation: 'REVOKE', operationKey, result: result as any } }); return result; });
  }

  async replaceCredential(accountId: string, environment: string, encrypted: { ciphertext: string; nonce: string; authTag: string; keyVersion: number }, credentialId: string) {
    return this.database.$transaction(async (transaction) => {
      const account = await transaction.paymentAccount.findFirstOrThrow({ where: { id: accountId, environment } });
      await transaction.paymentAccountCredential.deleteMany({ where: { paymentAccountId: account.id } });
      const credential = await transaction.paymentAccountCredential.create({ data: { id: credentialId, paymentAccountId: account.id, environment, ...encrypted } });
      await transaction.paymentAccount.update({ where: { id: account.id }, data: { credentialRef: credential.id } });
      return { id: credential.id };
    });
  }

  async revokeCredential(accountId: string, environment: string) {
    return this.database.$transaction(async (transaction) => {
      const account = await transaction.paymentAccount.findFirstOrThrow({ where: { id: accountId, environment } });
      await transaction.paymentAccountCredential.deleteMany({ where: { paymentAccountId: account.id } });
      await transaction.paymentAccount.update({ where: { id: account.id }, data: { credentialRef: null } });
    });
  }

  async persistCreatedAccount(userId: string, input: CreateSubaccountCommand, created: CreatedSubaccount) {
    return this.database.$transaction(async (transaction) => {
      const teacher = await transaction.teacher.findUniqueOrThrow({ where: { userId }, select: { id: true } });
      const previous = await transaction.paymentAccount.findFirst({ where: { teacherId: teacher.id, environment: process.env.ASAAS_ENV?.toUpperCase() ?? 'SANDBOX' }, orderBy: { revision: 'desc' }, select: { revision: true } });
      console.log('Salvando conta de recebimento', {
        event: 'payments.persistence_write_started',
        tableName: 'payment_accounts',
        userId,
        teacherId: teacher.id,
        providerAccountId: created.providerAccountId,
        status: created.status,
      });
      const account = await transaction.paymentAccount.create({
        data: {
          teacherId: teacher.id,
          environment: process.env.ASAAS_ENV?.toUpperCase() ?? 'SANDBOX',
          providerAccountId: created.providerAccountId,
          providerWebhookId: created.webhookId,
          walletId: created.walletId,
          revision: (previous?.revision ?? 0) + 1,
          status: created.status,
          onboardingUrl: created.onboardingUrl,
          activationChannel: created.onboardingUrl ? 'ONBOARDING_URL' : 'EMAIL_ACTIVATION',
        },
      });
      if (!created.apiKey) throw new Error('ASAAS_ACCOUNT_CREDENTIAL_MISSING');
      const environment = (process.env.ASAAS_ENV?.toUpperCase() ?? 'SANDBOX') as 'SANDBOX' | 'PRODUCTION';
      const encryptedCredential = this.credentialStore.encrypt(account.id, environment, created.apiKey);
      const credentialId = randomUUID();
      await transaction.paymentAccountCredential.create({
        data: {
          id: credentialId,
          paymentAccountId: account.id,
          environment,
          ciphertext: encryptedCredential.ciphertext,
          nonce: encryptedCredential.nonce,
          authTag: encryptedCredential.authTag,
          keyVersion: encryptedCredential.keyVersion,
        },
      });
      await transaction.paymentAccount.update({
        where: { id: account.id },
        data: { credentialRef: credentialId },
      });
      console.log('Conta de recebimento salva', {
        event: 'payments.persistence_write_completed',
        tableName: 'payment_accounts',
        accountId: account.id,
        providerAccountId: account.providerAccountId,
      });
      console.log('Salvando dados cadastrais do professor', {
        event: 'payments.persistence_write_started',
        tableName: 'teacher_payment_profiles',
        userId,
        teacherId: teacher.id,
        paymentAccountId: account.id,
        fields: ['name', 'email', 'cpfCnpj', 'birthDate', 'companyType', 'mobilePhone', 'incomeValue', 'address', 'addressNumber', 'complement', 'province', 'postalCode', 'site'],
      });
      await transaction.teacherPaymentProfile.create({
        data: {
          teacherId: teacher.id,
          paymentAccountId: account.id,
          name: input.name,
          email: input.email,
          cpfCnpj: input.cpfCnpj,
          birthDate: input.birthDate ?? null,
          companyType: input.companyType ?? null,
          mobilePhone: input.mobilePhone,
          incomeValue: input.incomeValue,
          address: input.address,
          addressNumber: input.addressNumber,
          complement: input.complement ?? null,
          province: input.province,
          postalCode: input.postalCode,
          site: input.site ?? null,
        },
      });
      console.log('Dados cadastrais do professor salvos', {
        event: 'payments.persistence_write_completed',
        tableName: 'teacher_payment_profiles',
        paymentAccountId: account.id,
      });
      console.log('Vinculando conta atual ao professor', {
        event: 'payments.persistence_write_started',
        tableName: 'teachers',
        column: 'current_payment_account_id',
        teacherId: teacher.id,
        paymentAccountId: account.id,
      });
      await transaction.teacher.update({ where: { id: teacher.id }, data: { currentPaymentAccountId: account.id } });
      console.log('Conta atual vinculada ao professor', {
        event: 'payments.persistence_write_completed',
        tableName: 'teachers',
        column: 'current_payment_account_id',
        teacherId: teacher.id,
      });
      console.log('Conta de recebimento persistida e vinculada ao professor', {
        event: 'payments.account_persistence_completed',
        userId,
        teacherId: teacher.id,
        accountId: account.id,
        providerAccountId: account.providerAccountId,
        walletId: account.walletId,
        revision: account.revision,
        status: account.status,
        environment: account.environment,
        profilePersisted: true,
      });
      return account;
    });
  }

  async applyAccountStatusEvent(providerAccountId: string, eventType: string, occurredAt = new Date(), accountStatus?: unknown) {
    const normalized = eventType.toUpperCase();
    const mirror = mapAsaasAccountStatusSnapshot(normalized, accountStatus);
    console.log('Atualizando status da conta Asaas', { event: 'payments.account_status_update_started', tableName: 'payment_accounts', providerAccountId, eventType: normalized, derivedStatus: mirror?.status ?? null });
    if (!mirror) return null;
    const existing = await this.database.paymentAccount.findUnique({ where: { providerAccountId }, select: { id: true } });
    if (!existing) {
      console.log('Conta de recebimento ainda não encontrada para evento Asaas', { event: 'payments.account_status_update_not_correlated', providerAccountId, eventType: normalized });
      return { count: 0, updatedDimensions: 0 };
    }
    const dimensions = [
      ['generalStatus', 'generalStatusEventAt'],
      ['commercialInfoStatus', 'commercialInfoStatusEventAt'],
      ['bankAccountStatus', 'bankAccountStatusEventAt'],
      ['documentationStatus', 'documentationStatusEventAt'],
    ] as const;
    const updatedDimensions = await this.database.$transaction(async (transaction) => {
      let updated = 0;
      for (const [statusField, timestampField] of dimensions) {
        const value = mirror[statusField];
        if (typeof value !== 'string') continue;
        const result = await transaction.paymentAccount.updateMany({
          where: {
            id: existing.id,
            OR: [{ [timestampField]: null }, { [timestampField]: { lte: occurredAt } }],
          },
          data: { [statusField]: value, [timestampField]: occurredAt },
        });
        updated += result.count;
      }
      if (mirror.status !== undefined) {
        await transaction.paymentAccount.updateMany({
          where: { id: existing.id, OR: [{ generalStatusEventAt: null }, { generalStatusEventAt: { lte: occurredAt } }] },
          data: { status: mirror.status, verifiedAt: mirror.verified === true ? occurredAt : null },
        });
      }
      await transaction.paymentAccount.updateMany({
        where: { id: existing.id, OR: [{ lastEventAt: null }, { lastEventAt: { lte: occurredAt } }] },
        data: { lastEventAt: occurredAt },
      });
      return updated;
    });
    console.log('Status da conta Asaas atualizado', { event: 'payments.account_status_update_persisted', tableName: 'payment_accounts', providerAccountId, eventType: normalized, status: mirror.status ?? null, updatedDimensions, updatedRows: 1 });
    // A recognized stale event is correlated and should be acknowledged, not retried as missing.
    return { count: 1, updatedDimensions };
  }

}
