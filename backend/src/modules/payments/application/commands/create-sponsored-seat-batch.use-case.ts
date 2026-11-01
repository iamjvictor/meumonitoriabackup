import { createHash } from 'node:crypto';
import type { HostedCheckoutResult, PaymentProvider } from '../../domain/ports/payment-provider.port.js';
import { calculateAnnualPriceCents } from '../../domain/annual-plan-price.js';

export type SponsoredInterval = 'MONTHLY' | 'ANNUAL';
export type SponsoredMonitor = {
  id: string;
  name: string;
  status: string;
  priceCents: number;
};
export type SponsoredTeacherMonitor = {
  teacherId: string;
  teacherPercentage: number | string;
  monitor: SponsoredMonitor;
};
export type SponsoredBatchRecord = {
  id: string;
  amountCents: number;
  status: string;
  checkoutUrl: string | null;
  expiresAt: Date | null;
};

export interface SponsoredSeatBatchRepository {
  findTeacherMonitor(teacherUserId: string, monitorId: string): Promise<SponsoredTeacherMonitor | null>;
  findBatchByIdempotency(teacherId: string, idempotencyKey: string): Promise<{ fingerprint: string; batch: SponsoredBatchRecord } | null>;
  findBlockingSeat(monitorId: string, normalizedEmail: string, excludeBatchId?: string): Promise<boolean>;
  createPendingBatch(input: {
    teacherId: string;
    monitor: SponsoredMonitor;
    interval: SponsoredInterval;
    billingType: 'PIX' | 'CREDIT_CARD';
    serviceMonths: number;
    beneficiaryEmails: string[];
    grossPriceCents: number;
    teacherPercentage: string;
    platformAmountCents: number;
    totalAmountCents: number;
    environment: string;
    idempotencyKey: string;
    requestFingerprint: string;
  }): Promise<{ id: string; externalReference: string }>;
  saveCheckout(batchId: string, checkout: HostedCheckoutResult): Promise<void>;
  markCheckoutCreationFailed(batchId: string, message: string): Promise<void>;
  findBatchForEditing(teacherUserId: string, batchId: string): Promise<{ id: string; monitorId: string; interval: SponsoredInterval; billingType: 'PIX' | 'CREDIT_CARD'; status: string; providerCheckoutId: string | null; paidAt: Date | null } | null>;
  replacePendingBatch(input: { batchId: string; previousCheckoutId: string | null; emails: string[]; grossPriceCents: number; platformAmountCents: number; totalAmountCents: number; teacherPercentage: string; fingerprint: string; checkout: HostedCheckoutResult }): Promise<boolean>;
  markEditedCheckoutFailed(batchId: string, previousCheckoutId: string | null): Promise<void>;
}

export type CreateSponsoredSeatBatchInput = {
  billingType: 'PIX' | 'CREDIT_CARD';
  monitorId: string;
  interval: SponsoredInterval;
  beneficiaryEmails: string[];
  expectedTotalAmountCents?: number;
  idempotencyKey: string;
  returnBaseUrl: string;
};

export type SponsoredSeatBatchQuoteInput = Pick<CreateSponsoredSeatBatchInput, 'monitorId' | 'interval' | 'beneficiaryEmails'>;

export class SponsoredBatchValidationError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export class CreateSponsoredSeatBatchUseCase {
  constructor(private readonly repository: SponsoredSeatBatchRepository, private readonly provider: PaymentProvider) {}

  async quote(teacherUserId: string, input: SponsoredSeatBatchQuoteInput) {
    const prepared = await this.prepare(teacherUserId, input);
    return {
      monitorId: prepared.monitor.id,
      monitorName: prepared.monitor.name,
      interval: input.interval,
      serviceMonths: prepared.serviceMonths,
      seatCount: prepared.emails.length,
      beneficiaryEmails: prepared.emails,
      grossPriceCents: prepared.grossPriceCents,
      platformAmountCents: prepared.platformAmountCents,
      totalAmountCents: prepared.totalAmountCents,
    };
  }

  async execute(teacherUserId: string, input: CreateSponsoredSeatBatchInput) {
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) throw new SponsoredBatchValidationError('IDEMPOTENCY_KEY_REQUIRED');
    const prepared = await this.prepare(teacherUserId, input);
    const { teacherMonitor, monitor, serviceMonths, emails, grossPriceCents, teacherPercentage, platformAmountCents, totalAmountCents } = prepared;
    if (input.expectedTotalAmountCents !== undefined && input.expectedTotalAmountCents !== totalAmountCents) throw new SponsoredBatchValidationError('PRICE_CHANGED');

    const fingerprint = createHash('sha256').update(JSON.stringify({ monitorId: monitor.id, interval: input.interval, billingType: input.billingType, emails: [...emails].sort() })).digest('hex');
    const previous = await this.repository.findBatchByIdempotency(teacherMonitor.teacherId, idempotencyKey);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new SponsoredBatchValidationError('IDEMPOTENCY_KEY_REUSED');
      if (!previous.batch.checkoutUrl) {
        if (previous.batch.status === 'CHECKOUT_CREATION_FAILED') {
          throw new SponsoredBatchValidationError('CHECKOUT_CREATION_FAILED');
        }
        throw new SponsoredBatchValidationError('CHECKOUT_PENDING');
      }
      return formatResult(previous.batch, totalAmountCents);
    }

    const batch = await this.repository.createPendingBatch({
      teacherId: teacherMonitor.teacherId,
      monitor,
      interval: input.interval,
      billingType: input.billingType,
      serviceMonths,
      beneficiaryEmails: emails,
      grossPriceCents,
      teacherPercentage: teacherPercentage.toFixed(4),
      platformAmountCents,
      totalAmountCents,
      environment: (process.env.ASAAS_ENV ?? 'SANDBOX').toUpperCase(),
      idempotencyKey,
      requestFingerprint: fingerprint,
    });
    const callbackBase = input.returnBaseUrl.replace(/\/$/, '');

    try {
      const checkout = await this.provider.createHostedCheckout({
        externalReference: batch.externalReference,
        monitorName: monitor.name,
        description: `Acesso ${input.interval === 'ANNUAL' ? 'anual' : 'mensal'} patrocinado (${emails.length} ${emails.length === 1 ? 'vaga' : 'vagas'})`,
        amountCents: totalAmountCents,
        successUrl: `${callbackBase}/checkout/retorno?batchId=${batch.id}&status=success`,
        cancelUrl: `${callbackBase}/checkout/retorno?batchId=${batch.id}&status=cancelled`,
        expiredUrl: `${callbackBase}/checkout/retorno?batchId=${batch.id}&status=expired`,
        nextDueDate: new Date().toISOString().slice(0, 10),
        splits: [],
        billingType: input.billingType,
        chargeType: sponsoredChargeType(input.interval, input.billingType),
        ...annualCreditCardInstallments(input.interval, input.billingType),
        ...(input.interval === 'MONTHLY' && input.billingType === 'CREDIT_CARD' ? { cycle: 'MONTHLY' as const } : {}),
        items: [{ name: monitor.name, description: `${emails.length} vagas patrocinadas`, quantity: emails.length, unitAmountCents: platformAmountCents }],
      });
      await this.repository.saveCheckout(batch.id, checkout);
      return { batchId: batch.id, amountCents: totalAmountCents, checkoutUrl: checkout.checkoutUrl, expiresAt: checkout.expiresAt };
    } catch (error) {
      await this.repository.markCheckoutCreationFailed(batch.id, error instanceof Error ? error.message : 'CHECKOUT_CREATION_FAILED');
      throw error;
    }
  }

  async updatePending(teacherUserId: string, batchId: string, input: { beneficiaryEmails: string[]; expectedTotalAmountCents: number; returnBaseUrl: string }) {
    const batch = await this.repository.findBatchForEditing(teacherUserId, batchId);
    if (!batch || !['PENDING', 'CHECKOUT_PENDING', 'CHECKOUT_CREATION_FAILED', 'CANCELED', 'CANCELLED', 'EXPIRED'].includes(batch.status) || batch.paidAt) throw new SponsoredBatchValidationError('BATCH_NOT_EDITABLE');
    const prepared = await this.prepare(teacherUserId, { monitorId: batch.monitorId, interval: batch.interval, beneficiaryEmails: input.beneficiaryEmails }, batch.id);
    if (prepared.totalAmountCents !== input.expectedTotalAmountCents) throw new SponsoredBatchValidationError('PRICE_CHANGED');
    if (batch.providerCheckoutId) {
      if (!this.provider.cancelHostedCheckout) throw new SponsoredBatchValidationError('CHECKOUT_CANNOT_BE_CANCELLED');
      try { await this.provider.cancelHostedCheckout(batch.providerCheckoutId); }
      catch { throw new SponsoredBatchValidationError('CHECKOUT_CANNOT_BE_CANCELLED'); }
      const afterCancel = await this.repository.findBatchForEditing(teacherUserId, batch.id);
      if (!afterCancel || afterCancel.paidAt || afterCancel.providerCheckoutId !== batch.providerCheckoutId || !['PENDING', 'CHECKOUT_PENDING', 'CANCELED', 'CANCELLED', 'EXPIRED'].includes(afterCancel.status)) {
        throw new SponsoredBatchValidationError('BATCH_NOT_EDITABLE');
      }
    }
    const callbackBase = input.returnBaseUrl.replace(/\/$/, '');
    let checkout: HostedCheckoutResult;
    try {
      checkout = await this.provider.createHostedCheckout({
        externalReference: batch.id,
        monitorName: prepared.monitor.name,
        description: `Acesso ${batch.interval === 'ANNUAL' ? 'anual' : 'mensal'} patrocinado (${prepared.emails.length} ${prepared.emails.length === 1 ? 'vaga' : 'vagas'})`,
        amountCents: prepared.totalAmountCents,
        successUrl: `${callbackBase}/checkout/retorno?batchId=${batch.id}&status=success`,
        cancelUrl: `${callbackBase}/checkout/retorno?batchId=${batch.id}&status=cancelled`,
        expiredUrl: `${callbackBase}/checkout/retorno?batchId=${batch.id}&status=expired`,
        nextDueDate: new Date().toISOString().slice(0, 10), splits: [], billingType: batch.billingType,
        chargeType: sponsoredChargeType(batch.interval, batch.billingType),
        ...annualCreditCardInstallments(batch.interval, batch.billingType),
        ...(batch.interval === 'MONTHLY' && batch.billingType === 'CREDIT_CARD' ? { cycle: 'MONTHLY' as const } : {}),
        items: [{ name: prepared.monitor.name, description: `${prepared.emails.length} vagas patrocinadas`, quantity: prepared.emails.length, unitAmountCents: prepared.platformAmountCents }],
      });
    } catch (error) {
      await this.repository.markEditedCheckoutFailed(batch.id, batch.providerCheckoutId);
      throw error;
    }
    const fingerprint = createHash('sha256').update(JSON.stringify({ monitorId: batch.monitorId, interval: batch.interval, billingType: batch.billingType, emails: [...prepared.emails].sort() })).digest('hex');
    let saved: boolean;
    try {
      saved = await this.repository.replacePendingBatch({ batchId: batch.id, previousCheckoutId: batch.providerCheckoutId, emails: prepared.emails, grossPriceCents: prepared.grossPriceCents, platformAmountCents: prepared.platformAmountCents, totalAmountCents: prepared.totalAmountCents, teacherPercentage: prepared.teacherPercentage.toFixed(4), fingerprint, checkout });
    } catch (error) {
      await this.cancelReplacementCheckout(batch.id, checkout.providerCheckoutId);
      throw error;
    }
    if (!saved) {
      await this.cancelReplacementCheckout(batch.id, checkout.providerCheckoutId);
      throw new SponsoredBatchValidationError('BATCH_NOT_EDITABLE');
    }
    return { batchId: batch.id, amountCents: prepared.totalAmountCents, checkoutUrl: checkout.checkoutUrl, expiresAt: checkout.expiresAt };
  }

  private async cancelReplacementCheckout(batchId: string, checkoutId: string) {
    try {
      await this.provider.cancelHostedCheckout?.(checkoutId);
    } catch (error) {
      console.error('Checkout substituto órfão após conflito ao editar lote patrocinado', {
        event: 'payments.sponsored_batch_replacement_checkout_orphaned',
        batchId,
        checkoutId,
        errorMessage: error instanceof Error ? error.message.slice(0, 300) : 'UNKNOWN',
      });
    }
  }

  private async prepare(teacherUserId: string, input: SponsoredSeatBatchQuoteInput, excludeBatchId?: string) {
    if (input.interval !== 'MONTHLY' && input.interval !== 'ANNUAL') throw new SponsoredBatchValidationError('INVALID_BILLING_INTERVAL');
    if (!Array.isArray(input.beneficiaryEmails) || input.beneficiaryEmails.length === 0) throw new SponsoredBatchValidationError('BENEFICIARY_EMAIL_REQUIRED');

    const emails = input.beneficiaryEmails.map(normalizeEmail);
    if (emails.some((email) => !isValidEmail(email))) throw new SponsoredBatchValidationError('INVALID_BENEFICIARY_EMAIL');
    if (new Set(emails).size !== emails.length) throw new SponsoredBatchValidationError('DUPLICATE_BENEFICIARY_EMAIL');

    const teacherMonitor = await this.repository.findTeacherMonitor(teacherUserId, input.monitorId);
    if (!teacherMonitor || teacherMonitor.monitor.status !== 'PUBLISHED') throw new SponsoredBatchValidationError('MONITOR_NOT_AVAILABLE');
    const monitor = teacherMonitor.monitor;
    const serviceMonths = input.interval === 'ANNUAL' ? 12 : 1;
    if (input.interval === 'ANNUAL' && (!Number.isInteger(monitor.priceCents) || monitor.priceCents <= 0)) throw new SponsoredBatchValidationError('PLAN_NOT_AVAILABLE');
    const grossPriceCents = input.interval === 'ANNUAL' ? calculateAnnualPriceCents(monitor.priceCents) : monitor.priceCents;
    if (!grossPriceCents || grossPriceCents <= 0) throw new SponsoredBatchValidationError('PLAN_NOT_AVAILABLE');

    const teacherPercentage = Number(teacherMonitor.teacherPercentage);
    if (!Number.isFinite(teacherPercentage) || teacherPercentage < 0 || teacherPercentage > 100) throw new SponsoredBatchValidationError('INVALID_TEACHER_PERCENTAGE');
    const platformAmountCents = Math.round(grossPriceCents * (100 - teacherPercentage) / 100);
    const totalAmountCents = platformAmountCents * emails.length;
    for (const email of emails) {
      if (input.interval === 'MONTHLY' && await this.repository.findBlockingSeat(monitor.id, email, excludeBatchId)) throw new SponsoredBatchValidationError('BENEFICIARY_ALREADY_HAS_ACCESS');
    }
    return { teacherMonitor, monitor, serviceMonths, emails, grossPriceCents, teacherPercentage, platformAmountCents, totalAmountCents };
  }
}

function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
function isValidEmail(email: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function formatResult(batch: SponsoredBatchRecord, fallbackAmount: number) {
  return { batchId: batch.id, amountCents: batch.amountCents ?? fallbackAmount, checkoutUrl: batch.checkoutUrl, expiresAt: batch.expiresAt };
}

function annualCreditCardInstallments(interval: SponsoredInterval, billingType: 'PIX' | 'CREDIT_CARD') {
  return interval === 'ANNUAL' && billingType === 'CREDIT_CARD'
    ? { chargeTypes: ['DETACHED', 'INSTALLMENT'] as const, maxInstallmentCount: 12 }
    : {};
}

function sponsoredChargeType(interval: SponsoredInterval, billingType: 'PIX' | 'CREDIT_CARD') {
  return interval === 'MONTHLY' && billingType === 'CREDIT_CARD' ? 'RECURRENT' as const : 'DETACHED' as const;
}
