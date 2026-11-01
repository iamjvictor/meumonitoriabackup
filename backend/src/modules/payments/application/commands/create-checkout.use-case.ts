import { createHash } from 'node:crypto';
import type { HostedCheckoutResult, PaymentProvider } from '../../domain/ports/payment-provider.port.js';
import type { CheckoutIntent, CreateCheckoutRepository } from '../../infrastructure/persistence/payment-checkout.repository.js';
import { calculateAnnualPriceCents } from '../../domain/annual-plan-price.js';

export class CheckoutStudentNotFoundError extends Error {}
export class CheckoutStudentRoleError extends Error {}
export class CheckoutMonitorNotFoundError extends Error {}
export class CheckoutAnnualPlanUnavailableError extends Error {}
// Kept as a typed legacy error for callers/tests; the direct checkout no longer throws it.
export class CheckoutTeacherPayoutUnavailableError extends Error {
  constructor() {
    super('A conta de recebimento do professor ainda não permite repasse.');
    this.name = 'CheckoutTeacherPayoutUnavailableError';
  }
}
export class CheckoutIdempotencyKeyRequiredError extends Error {}
export class CheckoutIdempotencyKeyReusedError extends Error {}
export class CheckoutPendingError extends Error {}

export type CreateCheckoutInput = { monitorId: string; interval?: 'MONTHLY' | 'ANNUAL'; billingType?: 'PIX' | 'CREDIT_CARD'; idempotencyKey: string; returnBaseUrl: string };

export class CreateCheckoutUseCase {
  constructor(private readonly repository: CreateCheckoutRepository, private readonly provider: PaymentProvider) {}

  async execute(userId: string, input: CreateCheckoutInput) {
    const key = input.idempotencyKey.trim();
    if (!key) throw new CheckoutIdempotencyKeyRequiredError();
    const interval = input.interval ?? 'MONTHLY';
    if (interval !== 'MONTHLY' && interval !== 'ANNUAL') throw new CheckoutAnnualPlanUnavailableError();
    const billingType = input.billingType ?? 'CREDIT_CARD';
    if (billingType !== 'PIX' && billingType !== 'CREDIT_CARD') throw new CheckoutAnnualPlanUnavailableError();

    const student = await this.repository.findStudentByUserId(userId);
    if (!student) throw new CheckoutStudentNotFoundError();
    if (student.role.toLowerCase() !== 'student') throw new CheckoutStudentRoleError();

    // Retain the exact fingerprints used by prior card checkouts. New PIX
    // attempts carry the method in the fingerprint so they cannot reuse a card checkout.
    const fingerprintInput = billingType === 'CREDIT_CARD'
      ? (interval === 'MONTHLY' ? { monitorId: input.monitorId } : { monitorId: input.monitorId, interval })
      : { monitorId: input.monitorId, interval, billingType };
    const fingerprint = createHash('sha256').update(JSON.stringify(fingerprintInput)).digest('hex');
    const existing = await this.repository.findIdempotency(student.id, key);
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) throw new CheckoutIdempotencyKeyReusedError();
      if (existing.state === 'FAILED') {
        console.log('Tentativa anterior de checkout falhou; permitindo nova tentativa', {
          event: 'payments.checkout_failed_retry_allowed',
          studentId: student.id,
          monitorId: input.monitorId,
          idempotencyKey: key,
        });
        await this.repository.resetFailedIdempotency(student.id, key);
        console.log('Chave de idempotência FAILED removida para retry', {
          event: 'payments.checkout_failed_retry_reset_completed',
          studentId: student.id,
          monitorId: input.monitorId,
        });
      } else if (existing.order) {
        if (!existing.checkout?.checkoutUrl) throw new CheckoutPendingError();
        return formatResult(existing.order, existing.checkout);
      }
    }

    console.log('Buscando monitor publicado para checkout', {
      event: 'payments.checkout_monitor_lookup_started',
      studentId: student.id,
      monitorId: input.monitorId,
    });
    const monitor = await this.repository.findPublishedMonitor(input.monitorId);
    console.log('Busca de monitor para checkout concluída', {
      event: 'payments.checkout_monitor_lookup_completed',
      studentId: student.id,
      monitorId: input.monitorId,
      found: Boolean(monitor),
    });
    if (!monitor) throw new CheckoutMonitorNotFoundError();
    if (interval === 'ANNUAL' && (!Number.isInteger(monitor.priceCents) || monitor.priceCents <= 0)) throw new CheckoutAnnualPlanUnavailableError();
    const amountCents = interval === 'ANNUAL' ? calculateAnnualPriceCents(monitor.priceCents) : monitor.priceCents;
    if (!amountCents || amountCents <= 0) throw new CheckoutAnnualPlanUnavailableError();
    console.log('Criando intenção local de checkout', {
      event: 'payments.checkout_intent_creation_started',
      studentId: student.id,
      monitorId: monitor.id,
    });
    const intent = await this.repository.createIntent({
      studentId: student.id,
      monitor,
      interval,
      idempotencyKey: key,
      requestFingerprint: fingerprint,
    });
    console.log('Intenção local de checkout criada', {
      event: 'payments.checkout_intent_creation_completed',
      studentId: student.id,
      monitorId: monitor.id,
      orderId: intent.order.id,
      subscriptionId: intent.order.subscriptionId,
    });

    const callbackBase = input.returnBaseUrl.replace(/\/$/, '');
    let checkout: HostedCheckoutResult;
    try {
      checkout = await this.provider.createHostedCheckout({
        externalReference: intent.order.id,
        monitorName: monitor.name,
        description: interval === 'ANNUAL' ? 'Acesso anual do monitor' : 'Assinatura mensal do monitor',
        amountCents,
        successUrl: `${callbackBase}/checkout/retorno?orderId=${intent.order.id}&status=success`,
        cancelUrl: `${callbackBase}/checkout/retorno?orderId=${intent.order.id}&status=cancelled`,
        expiredUrl: `${callbackBase}/checkout/retorno?orderId=${intent.order.id}&status=expired`,
        nextDueDate: new Date().toISOString().slice(0, 10),
        splits: intent.payout.walletId && intent.payout.percentage !== '0.0000'
          ? [{ walletId: intent.payout.walletId, percentage: intent.payout.percentage }]
          : [],
        billingType,
        chargeType: interval === 'MONTHLY' && billingType === 'CREDIT_CARD' ? 'RECURRENT' : 'DETACHED',
        ...(interval === 'ANNUAL' && billingType === 'CREDIT_CARD' ? { chargeTypes: ['DETACHED', 'INSTALLMENT'] as const, maxInstallmentCount: 12 } : {}),
        ...(interval === 'MONTHLY' && billingType === 'CREDIT_CARD' ? { cycle: 'MONTHLY' as const } : {}),
      });
    } catch (error) {
      await this.repository.markCheckoutCreationFailed(intent.order.id, error instanceof Error ? error.message : 'CHECKOUT_CREATION_FAILED');
      throw error;
    }

    try {
      const saved = await this.repository.saveCheckout(intent.order.id, checkout);
      return formatResult(saved.order, saved.checkout);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Falha ao persistir checkout depois da criação no provedor', {
        event: 'payments.checkout_persistence_failed',
        orderId: intent.order.id,
        providerCheckoutId: checkout.providerCheckoutId,
        errorType: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: message,
      });
      try {
        await this.repository.markCheckoutCreationFailed(intent.order.id, message);
      } catch (markError) {
        console.error('Falha ao marcar pedido com erro de persistência do checkout', {
          event: 'payments.checkout_persistence_failure_mark_failed',
          orderId: intent.order.id,
          errorType: markError instanceof Error ? markError.name : 'UnknownError',
          errorMessage: markError instanceof Error ? markError.message : String(markError),
        });
      }
      throw error;
    }
  }
}

function formatResult(order: CheckoutIntent['order'], checkout: CheckoutIntent['checkout']) {
  return {
    orderId: order.id,
    subscriptionId: order.subscriptionId,
    status: order.status,
    checkoutUrl: checkout?.checkoutUrl ?? null,
    amountCents: order.amountCents,
    currency: 'BRL',
    expiresAt: checkout?.expiresAt ?? null,
  };
}
