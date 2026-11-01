import { prisma } from '../../../../lib/prisma.js';

export function getStudentEnrollmentStatusForSubscriptionEvent(eventType: string): 'ACTIVE' | 'REMOVED' {
  return eventType === 'PAYMENT_REFUNDED' || eventType === 'PAYMENT_CHARGEBACK_REQUESTED' ? 'REMOVED' : 'ACTIVE';
}

export type PaymentEventRepositoryResult = {
  updatedRows: number;
  chargeId?: string;
  orderId?: string;
  subscriptionId?: string;
  studentId?: string;
  monitorId?: string;
  accessGranted: boolean;
  state?: string;
};

type SubscriptionEventResult = { updatedRows: number };

type CheckoutEventResult = { updatedRows: number };
type SplitEventResult = { updatedRows: number };
type PaymentLifecycleResult = { updatedRows: number; state: string; accessGranted: false };

export function getSponsoredPaymentEventStatus(eventType: string): 'PENDING' | 'OVERDUE' | null {
  if (eventType === 'PAYMENT_CREATED') return 'PENDING';
  if (eventType === 'PAYMENT_OVERDUE') return 'OVERDUE';
  return null;
}

export function isSponsoredAnnualPeriodAlreadyGranted(billingInterval: string, paidAt: Date | null): boolean {
  return billingInterval === 'ANNUAL' && paidAt !== null;
}

export class PaymentEventRepository {
  async applyCheckoutEvent(input: { environment: string; eventId: string; eventType: string; payload: unknown; occurredAt: Date }): Promise<CheckoutEventResult> {
    const payload = asRecord(input.payload);
    const checkoutPayload = asRecord(payload.checkout);
    const providerCheckoutId = readString(checkoutPayload.id) ?? readString(payload.checkoutId);
    if (!providerCheckoutId) return { updatedRows: 0 };

    const nextStatus = input.eventType === 'CHECKOUT_CREATED' ? 'ACTIVE'
      : input.eventType === 'CHECKOUT_PAID' ? 'PAID'
        : input.eventType === 'CHECKOUT_CANCELED' ? 'CANCELED'
          : input.eventType === 'CHECKOUT_EXPIRED' ? 'EXPIRED' : null;
    if (!nextStatus) return { updatedRows: 0 };

    const checkout = await prisma.paymentCheckout.findFirst({
      where: { environment: input.environment, providerCheckoutId },
      select: { id: true, status: true, order: { select: { id: true, billingInterval: true } } },
    });
    if (!checkout) return this.applySponsoredCheckoutEvent(input, providerCheckoutId, nextStatus);

    // Checkout notifications can arrive late or out of order. Never reopen a
    // checkout after any terminal state, and never downgrade a paid checkout.
    if (['PAID', 'CANCELED', 'EXPIRED'].includes(checkout.status) && nextStatus === 'ACTIVE') return { updatedRows: 1 };
    if (checkout.status === 'PAID' && nextStatus !== 'PAID') return { updatedRows: 1 };
    const updated = await prisma.paymentCheckout.updateMany({
      where: { id: checkout.id },
      data: { status: nextStatus },
    });
    if (input.eventType === 'CHECKOUT_PAID' && checkout.order.billingInterval === 'ANNUAL') {
      await this.grantDirectAnnualCheckout(checkout.order.id, input.eventId, input.occurredAt);
    }
    return { updatedRows: updated.count };
  }

  private async applySponsoredCheckoutEvent(input: { environment: string; eventId: string; eventType: string; occurredAt: Date }, providerCheckoutId: string, nextStatus: string): Promise<CheckoutEventResult> {
    const batch = await prisma.sponsoredSeatBatch.findFirst({ where: { environment: input.environment, providerCheckoutId }, select: { id: true, status: true, billingInterval: true, serviceMonths: true, monitorId: true, paidAt: true, seats: { select: { id: true, emailNormalized: true } } } });
    if (!batch) return { updatedRows: 0 };
    if (['ACTIVE', 'CANCELLED', 'EXPIRED'].includes(batch.status) && nextStatus === 'ACTIVE') return { updatedRows: 1 };
    if (batch.status === 'ACTIVE' && nextStatus !== 'PAID') return { updatedRows: 1 };
    if (input.eventType === 'CHECKOUT_CREATED') {
      await prisma.sponsoredSeatBatch.updateMany({ where: { id: batch.id, status: { notIn: ['ACTIVE', 'CANCELLED', 'EXPIRED'] } }, data: { status: 'CHECKOUT_PENDING' } });
      return { updatedRows: 1 };
    }
    if (input.eventType === 'CHECKOUT_PAID' && batch.billingInterval === 'MONTHLY') {
      await prisma.sponsoredSeatBatch.updateMany({ where: { id: batch.id, status: { not: 'ACTIVE' } }, data: { status: 'CHECKOUT_PAID_PENDING_PAYMENT' } });
      return { updatedRows: 1 };
    }
    if (input.eventType === 'CHECKOUT_PAID' && isSponsoredAnnualPeriodAlreadyGranted(batch.billingInterval, batch.paidAt)) return { updatedRows: 1 };
    if (input.eventType === 'CHECKOUT_PAID' && batch.billingInterval === 'ANNUAL') {
      await prisma.$transaction(async (transaction) => {
        const current = await transaction.sponsoredSeatBatch.findUniqueOrThrow({ where: { id: batch.id }, select: { status: true, currentPeriodEnd: true } });
        if (current.status === 'ACTIVE') return;
        const seatPeriods = await Promise.all(batch.seats.map(async (seat) => {
          const prior = await transaction.sponsoredSeat.findFirst({
            where: { batch: { monitorId: batch.monitorId }, emailNormalized: seat.emailNormalized, id: { not: seat.id }, status: { in: ['PAID_UNCLAIMED', 'ACTIVE'] }, endsAt: { gt: input.occurredAt } },
            orderBy: { endsAt: 'desc' }, select: { endsAt: true },
          });
          return { seatId: seat.id, ...calculateServicePeriod(input.occurredAt, prior?.endsAt ?? null, batch.serviceMonths) };
        }));
        for (const period of seatPeriods) await transaction.sponsoredSeat.update({ where: { id: period.seatId }, data: { status: 'PAID_UNCLAIMED', startsAt: period.startsAt, endsAt: period.endsAt } });
        const startsAt = seatPeriods.map((period) => period.startsAt).sort((a, b) => a.getTime() - b.getTime())[0] ?? input.occurredAt;
        const endsAt = seatPeriods.map((period) => period.endsAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? calculateServicePeriod(input.occurredAt, null, batch.serviceMonths).endsAt;
        await transaction.sponsoredSeatBatch.update({ where: { id: batch.id }, data: { status: 'ACTIVE', paidAt: input.occurredAt, currentPeriodStart: startsAt, currentPeriodEnd: endsAt } });
      });
      return { updatedRows: 1 };
    }
    const terminalStatus = input.eventType === 'CHECKOUT_CANCELED' ? 'CANCELLED' : input.eventType === 'CHECKOUT_EXPIRED' ? 'EXPIRED' : nextStatus;
    const updated = await prisma.sponsoredSeatBatch.updateMany({ where: { id: batch.id, status: { notIn: ['ACTIVE', 'CANCELLED', 'EXPIRED'] } }, data: { status: terminalStatus } });
    return { updatedRows: updated.count };
  }

  private async grantDirectAnnualCheckout(orderId: string, eventId: string, occurredAt: Date) {
    await prisma.$transaction(async (transaction) => {
      const order = await transaction.paymentOrder.findUnique({ where: { id: orderId }, select: {
        id: true, studentId: true, status: true, grossCents: true, serviceMonths: true,
        items: { take: 1, select: { monitorId: true } },
        subscription: { select: { id: true, currentPeriodStart: true, currentPeriodEnd: true, items: { take: 1, select: { id: true } } } },
      } });
      if (!order?.subscription || !order.items[0] || !order.subscription.items[0]) return;
      const claimed = await transaction.paymentOrder.updateMany({ where: { id: order.id, status: { not: 'PAYMENT_CONFIRMED' } }, data: { status: 'PAYMENT_CONFIRMED' } });
      if (claimed.count === 0) return;
      const { studentId } = order;
      const monitorId = order.items[0].monitorId;
      const priorAccess = await transaction.studentSubscription.findUnique({ where: { studentId_monitorId: { studentId, monitorId } }, select: { expiresAt: true, startsAt: true } });
      const period = calculateServicePeriod(occurredAt, priorAccess?.expiresAt ?? null, order.serviceMonths);
      const itemId = order.subscription.items[0].id;
      await transaction.paymentSubscription.update({ where: { id: order.subscription.id }, data: { status: 'ACTIVE', currentPeriodStart: period.startsAt, currentPeriodEnd: period.endsAt, nextDueDate: period.endsAt, lastProviderEventAt: occurredAt, lastProviderEventId: eventId } });
      await transaction.paymentSubscriptionItem.update({ where: { id: itemId }, data: { status: 'ACTIVE' } });
      await transaction.studentSubscription.upsert({
        where: { studentId_monitorId: { studentId, monitorId } },
        create: { studentId, monitorId, status: 'active', amountPaid: order.grossCents / 100, startsAt: period.startsAt, expiresAt: period.endsAt, currentPeriodStart: period.startsAt, currentPeriodEnd: period.endsAt, paymentSubscriptionItemId: itemId },
        update: { status: 'active', amountPaid: { increment: order.grossCents / 100 }, expiresAt: period.endsAt, currentPeriodStart: period.startsAt, currentPeriodEnd: period.endsAt, paymentSubscriptionItemId: itemId, cancelledAt: null, cancelAtPeriodEnd: false },
      });
      await transaction.studentEnrollment.upsert({
        where: { studentId_monitorId: { studentId, monitorId } },
        create: { studentId, monitorId, status: 'ACTIVE', startsAt: period.startsAt, endsAt: period.endsAt, paymentSubscriptionItemId: itemId },
        update: { status: 'ACTIVE', startsAt: period.startsAt, endsAt: period.endsAt, paymentSubscriptionItemId: itemId },
      });
    });
  }

  async applySplitEvent(input: { environment: string; eventId: string; eventType: string; payload: unknown; occurredAt: Date }): Promise<SplitEventResult> {
    const splitStatuses: Record<string, string> = {
      PAYMENT_SPLIT_DONE: 'SETTLED',
      PAYMENT_SPLIT_CANCELLED: 'CANCELLED',
      PAYMENT_SPLIT_DIVERGENCE_BLOCK: 'DIVERGENCE_BLOCKED',
      PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED: 'DIVERGENCE_BLOCK_FINISHED',
    };
    const nextStatus = splitStatuses[input.eventType];
    if (!nextStatus) return { updatedRows: 0 };
    const payload = asRecord(input.payload);
    const additionalInfo = asRecord(payload.additionalInfo);
    const splitId = readString(additionalInfo.splitId);
    const paymentPayload = asRecord(payload.payment);
    const providerPaymentId = readString(paymentPayload.id);
    if (!splitId) return { updatedRows: 0 };

    const split = await prisma.paymentSplit.findFirst({
      where: {
        providerSplitId: splitId,
        ...(providerPaymentId ? { charge: { is: { environment: input.environment, providerPaymentId } } } : {}),
      },
      select: { id: true, status: true, expectedCents: true },
    });
    if (!split) return { updatedRows: 0 };
    if (split.status === nextStatus
      || (split.status === 'SETTLED' && nextStatus !== 'SETTLED')
      || (split.status === 'DIVERGENCE_BLOCK_FINISHED' && nextStatus === 'DIVERGENCE_BLOCKED')) return { updatedRows: 1 };
    const updated = await prisma.paymentSplit.updateMany({
      where: { id: split.id },
      data: { status: nextStatus, settledCents: nextStatus === 'SETTLED' ? split.expectedCents ?? undefined : undefined },
    });
    return { updatedRows: updated.count };
  }

  async applyPaymentLifecycleEvent(input: { environment: string; eventId: string; eventType: string; payload: unknown; occurredAt: Date }): Promise<PaymentLifecycleResult> {
    const root = asRecord(input.payload);
    const payment = asRecord(root.payment);
    const providerPaymentId = readString(payment.id);
    if (!providerPaymentId) return { updatedRows: 0, state: 'PAYMENT_STATE_APPLIED', accessGranted: false };

    const externalReference = readString(payment.externalReference);
    const providerCheckoutId = readString(payment.checkoutSession) ?? readString(payment.checkoutId);
    if (getSponsoredPaymentEventStatus(input.eventType)) {
      const sponsored = await this.applySponsoredPaymentEvent({ ...input, providerPaymentId, externalReference, providerCheckoutId, payment });
      if (sponsored) return { updatedRows: sponsored.updatedRows, state: sponsored.state ?? 'PAYMENT_STATE_APPLIED', accessGranted: false };
    }
    const order = await prisma.paymentOrder.findFirst({
      where: { environment: input.environment, OR: [
        ...(externalReference ? [{ externalReference }] : []),
        ...(providerCheckoutId ? [{ checkouts: { some: { providerCheckoutId } } }] : []),
      ] },
      select: { id: true, items: { take: 1, select: { id: true, priceCentsSnapshot: true } }, subscription: { select: { id: true, status: true } } },
    });
    if (!order?.subscription || !order.items[0]) return { updatedRows: 0, state: 'PAYMENT_STATE_APPLIED', accessGranted: false };

    const eventStatuses: Record<string, string> = {
      PAYMENT_CREATED: 'PENDING',
      PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'CAPTURE_REFUSED',
      PAYMENT_UPDATED: payment.status ? String(payment.status).toUpperCase() : 'UPDATED',
      PAYMENT_DELETED: 'DELETED',
      PAYMENT_RESTORED: payment.status ? String(payment.status).toUpperCase() : 'PENDING',
      PAYMENT_AWAITING_RISK_ANALYSIS: 'AWAITING_RISK_ANALYSIS',
      PAYMENT_APPROVED_BY_RISK_ANALYSIS: 'APPROVED_BY_RISK_ANALYSIS',
      PAYMENT_REPROVED_BY_RISK_ANALYSIS: 'REPROVED_BY_RISK_ANALYSIS',
      PAYMENT_AUTHORIZED: 'AUTHORIZED',
      PAYMENT_REFUND_IN_PROGRESS: 'REFUND_IN_PROGRESS',
      PAYMENT_REFUND_DENIED: 'REFUND_DENIED',
      PAYMENT_CHARGEBACK_REQUESTED: 'CHARGEBACK',
      PAYMENT_CHARGEBACK_DISPUTE: 'CHARGEBACK',
      PAYMENT_AWAITING_CHARGEBACK_REVERSAL: 'CHARGEBACK_REVERSAL_PENDING',
    };
    const nextStatus = eventStatuses[input.eventType];
    if (!nextStatus) return { updatedRows: 0, state: 'PAYMENT_STATE_APPLIED', accessGranted: false };

    const existing = await prisma.paymentCharge.findUnique({
      where: { environment_providerPaymentId: { environment: input.environment, providerPaymentId } },
      select: { id: true, status: true, lastProviderEventAt: true },
    });
    if (existing?.status === 'REFUNDED' || (existing?.status === 'CHARGEBACK' && input.eventType !== 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL') || existing?.status === 'CHARGEBACK_REVERSAL_PENDING') {
      return { updatedRows: 1, state: 'PAYMENT_TERMINAL_NO_ACCESS', accessGranted: false };
    }
    if (existing?.lastProviderEventAt && existing.lastProviderEventAt > input.occurredAt) {
      return { updatedRows: 1, state: 'PAYMENT_STATE_APPLIED', accessGranted: false };
    }

    const amount = readMoneyInCents(payment.value) ?? order.items[0].priceCentsSnapshot;
    const dueDate = readDate(payment.dueDate);
    const netCents = readMoneyInCents(payment.netValue);
    await prisma.paymentCharge.upsert({
      where: { environment_providerPaymentId: { environment: input.environment, providerPaymentId } },
      create: {
        subscriptionId: order.subscription.id, environment: input.environment, providerPaymentId, providerCheckoutId,
        dueDate, servicePeriodStart: null, servicePeriodEnd: null, status: nextStatus, grossCents: amount,
        netCents, feeCents: netCents === null ? null : amount - netCents,
        lastProviderEventAt: input.occurredAt, lastProviderEventId: input.eventId,
      },
      update: {
        status: nextStatus, grossCents: amount, dueDate: dueDate ?? undefined, netCents: netCents ?? undefined,
        feeCents: netCents === null ? undefined : amount - netCents,
        lastProviderEventAt: input.occurredAt, lastProviderEventId: input.eventId,
      },
      select: { id: true },
    });

    if (input.eventType === 'PAYMENT_CHARGEBACK_REQUESTED' || input.eventType === 'PAYMENT_CHARGEBACK_DISPUTE') {
      await this.applySubscriptionEvent(input);
    } else if (input.eventType === 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL') {
      await this.applySubscriptionEvent(input);
    }
    return { updatedRows: 1, state: 'PAYMENT_STATE_APPLIED', accessGranted: false };
  }

  async applySubscriptionEvent(input: { environment: string; eventId: string; eventType: string; payload: unknown; occurredAt: Date }): Promise<SubscriptionEventResult> {
    const payload = asRecord(input.payload);
    const subscriptionPayload = asRecord(payload.subscription);
    const paymentPayload = asRecord(payload.payment);
    const providerSubscriptionId = readString(subscriptionPayload.id) ?? readString(payload.subscriptionId) ?? readString(paymentPayload.subscription);
    const paymentExternalReference = readString(paymentPayload.externalReference);
    const paymentId = readString(paymentPayload.id);
    if (input.eventType === 'PAYMENT_OVERDUE' && paymentId && paymentExternalReference) {
      const sponsored = await this.applySponsoredPaymentEvent({
        ...input,
        providerPaymentId: paymentId,
        externalReference: paymentExternalReference,
        providerCheckoutId: readString(paymentPayload.checkoutSession) ?? readString(paymentPayload.checkoutId),
        payment: paymentPayload,
      });
      if (sponsored) return { updatedRows: sponsored.updatedRows };
    }
    const externalReference = readString(subscriptionPayload.externalReference) ?? paymentExternalReference;
    if (!providerSubscriptionId && !externalReference) return { updatedRows: 0 };

    const sponsoredBatch = await prisma.sponsoredSeatBatch.findFirst({
      where: { environment: input.environment, OR: [
        ...(providerSubscriptionId ? [{ providerSubscriptionId }] : []),
        ...(externalReference ? [{ externalReference }] : []),
      ] },
      select: { id: true, status: true, currentPeriodEnd: true, seats: { select: { id: true } } },
    });
    if (sponsoredBatch) {
      const isAccessRevoked = input.eventType === 'PAYMENT_REFUNDED' || input.eventType === 'PAYMENT_CHARGEBACK_REQUESTED' || input.eventType === 'PAYMENT_CHARGEBACK_DISPUTE' || input.eventType === 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL';
      const isCancelled = input.eventType === 'SUBSCRIPTION_DELETED' || input.eventType === 'SUBSCRIPTION_INACTIVATED';
      const isOverdue = input.eventType === 'PAYMENT_OVERDUE';
      if (!isAccessRevoked && !isCancelled && !isOverdue) return { updatedRows: 0 };
      await prisma.$transaction(async (transaction) => {
        const nextStatus = isAccessRevoked ? 'REVOKED' : isCancelled ? 'CANCEL_PENDING' : 'PAST_DUE';
        await transaction.sponsoredSeatBatch.update({ where: { id: sponsoredBatch.id }, data: {
          status: nextStatus,
          ...(providerSubscriptionId ? { providerSubscriptionId } : {}),
          ...(isCancelled ? { cancelAtPeriodEnd: true } : {}),
          ...(isAccessRevoked ? { cancelledAt: input.occurredAt } : {}),
        } });
        if (isAccessRevoked) {
          await transaction.sponsoredSeat.updateMany({ where: { batchId: sponsoredBatch.id, status: { in: ['ACTIVE', 'PAID_UNCLAIMED'] } }, data: { status: 'REVOKED', accessRevokedAt: input.occurredAt, endsAt: input.occurredAt } });
          const providerPaymentId = readString(paymentPayload.id);
          if (providerPaymentId) await transaction.sponsoredSeatPayment.updateMany({ where: { batchId: sponsoredBatch.id, providerPaymentId }, data: { status: input.eventType === 'PAYMENT_REFUNDED' ? 'REFUNDED' : 'CHARGEBACK', lastProviderEventAt: input.occurredAt, lastProviderEventId: input.eventId } });
        }
        if (isOverdue) {
          await transaction.sponsoredSeatPayment.updateMany({ where: { batchId: sponsoredBatch.id, status: { in: ['CONFIRMED', 'RECEIVED'] } }, data: { status: 'OVERDUE', lastProviderEventAt: input.occurredAt, lastProviderEventId: input.eventId } });
        }
      });
      return { updatedRows: 1 };
    }

    const providerPeriodEnd = input.eventType === 'PAYMENT_DELETED' && paymentPayload.deleted === true
      ? readDate(paymentPayload.dueDate)
      : null;
    if (input.eventType === 'PAYMENT_DELETED' && !providerPeriodEnd) return { updatedRows: 0 };

    let subscription = providerSubscriptionId
      ? await prisma.paymentSubscription.findFirst({ where: { environment: input.environment, providerSubscriptionId }, include: { items: true } })
      : null;
    if (!subscription && externalReference) {
      const order = await prisma.paymentOrder.findFirst({
        where: { environment: input.environment, externalReference },
        select: { subscription: { select: { id: true } } },
      });
      if (order?.subscription) subscription = await prisma.paymentSubscription.findUnique({ where: { id: order.subscription.id }, include: { items: true } });
    }
    if (!subscription) return { updatedRows: 0 };

    const splitSubscriptionStatuses: Record<string, string> = {
      SUBSCRIPTION_SPLIT_DISABLED: 'DISABLED',
      SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK: 'DIVERGENCE_BLOCKED',
      SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK_FINISHED: 'DIVERGENCE_BLOCK_FINISHED',
    };
    const splitStatus = splitSubscriptionStatuses[input.eventType];
    if (splitStatus) {
      if (subscription.splitStatusEventAt && subscription.splitStatusEventAt > input.occurredAt) return { updatedRows: 1 };
      await prisma.$transaction(async (transaction) => {
        await transaction.paymentSubscription.update({ where: { id: subscription.id }, data: { splitStatus, splitStatusEventAt: input.occurredAt } });
        await transaction.paymentAuditEntry.create({ data: { origin: 'ASAAS_WEBHOOK', reason: input.eventType, studentId: subscription.studentId, after: { providerSubscriptionId: subscription.providerSubscriptionId, splitStatus, eventId: input.eventId } } });
      });
      return { updatedRows: 1 };
    }
    if (subscription.lastProviderEventAt && subscription.lastProviderEventAt > input.occurredAt) return { updatedRows: 1 };

    const end = providerPeriodEnd ?? subscription.currentPeriodEnd ?? input.occurredAt;
    const isAccessRevoked = input.eventType === 'PAYMENT_REFUNDED'
      || input.eventType === 'PAYMENT_CHARGEBACK_REQUESTED'
      || input.eventType === 'PAYMENT_CHARGEBACK_DISPUTE'
      || input.eventType === 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL';
    const isTerminal = input.eventType === 'SUBSCRIPTION_DELETED' || isAccessRevoked;
    const isInactivated = input.eventType === 'SUBSCRIPTION_INACTIVATED';
    const nextStatus = isTerminal ? 'CANCELLED' : isInactivated ? 'CANCEL_PENDING' : input.eventType === 'PAYMENT_OVERDUE' ? 'PAST_DUE' : subscription.status;
    const nextDueDate = readDate(subscriptionPayload.nextDueDate);
    const providerChargeStatus = input.eventType === 'PAYMENT_REFUNDED' ? 'REFUNDED'
      : input.eventType === 'PAYMENT_PARTIALLY_REFUNDED' ? 'PARTIALLY_REFUNDED'
        : input.eventType === 'PAYMENT_CHARGEBACK_REQUESTED' || input.eventType === 'PAYMENT_CHARGEBACK_DISPUTE' ? 'CHARGEBACK'
          : input.eventType === 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL' ? 'CHARGEBACK_REVERSAL_PENDING'
          : input.eventType === 'PAYMENT_OVERDUE' ? 'OVERDUE'
            : input.eventType === 'PAYMENT_DELETED' ? 'DELETED' : null;
    await prisma.$transaction(async (transaction) => {
      await transaction.paymentSubscription.update({ where: { id: subscription.id }, data: {
        ...(providerSubscriptionId ? { providerSubscriptionId } : {}),
        status: nextStatus,
        accessRevocationReason: isAccessRevoked ? (input.eventType === 'PAYMENT_REFUNDED' ? 'REFUND' : 'CHARGEBACK') : undefined,
        lastProviderEventAt: input.occurredAt,
        lastProviderEventId: input.eventId,
        cancelAtPeriodEnd: isTerminal || isInactivated || input.eventType === 'PAYMENT_DELETED' || subscription.cancelAtPeriodEnd,
        cancelledAt: isTerminal ? input.occurredAt : undefined,
        currentPeriodEnd: providerPeriodEnd ?? undefined,
        nextDueDate: providerPeriodEnd ?? nextDueDate ?? undefined,
      } });
      if (providerChargeStatus && readString(paymentPayload.id)) {
        await transaction.paymentCharge.updateMany({
          where: { environment: input.environment, providerPaymentId: readString(paymentPayload.id)! },
          data: { status: providerChargeStatus, lastProviderEventAt: input.occurredAt, lastProviderEventId: input.eventId },
        });
      }
      if (isTerminal) {
        await transaction.paymentSubscriptionItem.updateMany({ where: { subscriptionId: subscription.id, status: { in: ['ACTIVE', 'CANCEL_PENDING'] } }, data: { status: 'CANCELLED' } });
        for (const item of subscription.items) {
          await transaction.studentSubscription.updateMany({ where: { paymentSubscriptionItemId: item.id }, data: {
            status: isAccessRevoked ? 'cancelled' : 'active',
            cancelAtPeriodEnd: true,
            cancelledAt: input.occurredAt,
            expiresAt: isAccessRevoked ? input.occurredAt : end,
          } });
          await transaction.studentEnrollment.updateMany({ where: { paymentSubscriptionItemId: item.id }, data: {
            status: getStudentEnrollmentStatusForSubscriptionEvent(input.eventType),
            endsAt: isAccessRevoked ? input.occurredAt : end,
          } });
        }
      } else if (input.eventType === 'PAYMENT_DELETED') {
        await transaction.studentSubscription.updateMany({ where: { paymentSubscriptionItemId: { in: subscription.items.map((item) => item.id) } }, data: { status: 'active', cancelAtPeriodEnd: true, expiresAt: end ?? undefined } });
        await transaction.studentEnrollment.updateMany({ where: { paymentSubscriptionItemId: { in: subscription.items.map((item) => item.id) } }, data: { status: 'ACTIVE', endsAt: end ?? undefined } });
      }
      await transaction.paymentAuditEntry.create({ data: { origin: 'ASAAS_WEBHOOK', reason: input.eventType, studentId: subscription.studentId, after: { providerSubscriptionId: providerSubscriptionId ?? subscription.providerSubscriptionId, status: nextStatus, eventId: input.eventId } } });
    });
    return { updatedRows: 1 };
  }

  private async applySponsoredPaymentEvent(input: {
    environment: string; eventId: string; eventType: string; occurredAt: Date;
    providerPaymentId: string; externalReference?: string; providerCheckoutId?: string; payment: Record<string, unknown>;
  }): Promise<PaymentEventRepositoryResult | null> {
    const providerSubscriptionId = readString(input.payment.subscription);
    const batch = await prisma.sponsoredSeatBatch.findFirst({
      where: { environment: input.environment, OR: [
        ...(input.externalReference ? [{ externalReference: input.externalReference }] : []),
        ...(input.providerCheckoutId ? [{ providerCheckoutId: input.providerCheckoutId }] : []),
        ...(providerSubscriptionId ? [{ providerSubscriptionId }] : []),
      ] },
      select: { id: true, status: true, billingInterval: true, serviceMonths: true, totalAmountCents: true, currentPeriodStart: true, currentPeriodEnd: true },
    });
    if (!batch) return null;

    if (['CANCELLED', 'EXPIRED', 'REFUNDED', 'REVOKED'].includes(batch.status)) return { updatedRows: 1, accessGranted: false, state: 'PAYMENT_TERMINAL_NO_ACCESS' };
    const valueCents = readMoneyInCents(input.payment.value) ?? batch.totalAmountCents;
    const paidAt = readDate(input.payment.clientPaymentDate) ?? readDate(input.payment.paymentDate) ?? readDate(input.payment.dateCreated) ?? input.occurredAt;
    const requestedStatus = getSponsoredPaymentEventStatus(input.eventType)
      ?? (input.eventType === 'PAYMENT_RECEIVED' ? 'RECEIVED' : 'CONFIRMED');

    const result = await prisma.$transaction(async (transaction) => {
      const currentBatch = await transaction.sponsoredSeatBatch.findUniqueOrThrow({ where: { id: batch.id }, select: { status: true, billingInterval: true, serviceMonths: true, paidAt: true, currentPeriodStart: true, currentPeriodEnd: true } });
      const existing = await transaction.sponsoredSeatPayment.findUnique({
        where: { environment_providerPaymentId: { environment: input.environment, providerPaymentId: input.providerPaymentId } },
        select: { id: true, status: true, lastProviderEventAt: true },
      });
      if (existing?.lastProviderEventAt && existing.lastProviderEventAt > input.occurredAt) return { state: 'PAYMENT_STALE_EVENT_IGNORED', accessGranted: false };
      if (existing?.status === 'REFUNDED' || existing?.status === 'CHARGEBACK') return { state: 'PAYMENT_TERMINAL_NO_ACCESS', accessGranted: false };
      if (requestedStatus === 'PENDING' || requestedStatus === 'OVERDUE') {
        const paymentStatus = requestedStatus === 'OVERDUE'
          ? 'OVERDUE'
          : existing?.status === 'RECEIVED' || existing?.status === 'CONFIRMED' ? existing.status : requestedStatus;
        if (existing) {
          await transaction.sponsoredSeatPayment.update({ where: { id: existing.id }, data: {
            status: paymentStatus,
            lastProviderEventAt: input.occurredAt,
            lastProviderEventId: input.eventId,
          } });
        } else {
          await transaction.sponsoredSeatPayment.create({ data: {
            batchId: batch.id, environment: input.environment, providerPaymentId: input.providerPaymentId,
            providerCheckoutId: input.providerCheckoutId, status: paymentStatus, grossCents: valueCents,
            servicePeriodStart: currentBatch.currentPeriodStart, servicePeriodEnd: currentBatch.currentPeriodEnd,
            lastProviderEventAt: input.occurredAt, lastProviderEventId: input.eventId,
          } });
        }
        if (requestedStatus === 'OVERDUE') {
          await transaction.sponsoredSeatBatch.update({ where: { id: batch.id }, data: { status: 'PAST_DUE' } });
        }
        return { state: requestedStatus === 'OVERDUE' ? 'SPONSORED_PAYMENT_OVERDUE' : 'SPONSORED_PAYMENT_PENDING', accessGranted: false };
      }
      if (existing && !(currentBatch.billingInterval === 'MONTHLY' && existing.status === 'PENDING')) {
        const status = existing.status === 'RECEIVED' && requestedStatus === 'CONFIRMED' ? 'RECEIVED' : requestedStatus;
        if (isSponsoredAnnualPeriodAlreadyGranted(currentBatch.billingInterval, currentBatch.paidAt)) {
          await transaction.sponsoredSeatPayment.update({ where: { id: existing.id }, data: {
            status, ...(requestedStatus === 'RECEIVED' ? { receivedAt: input.occurredAt } : { confirmedAt: input.occurredAt }),
            servicePeriodStart: currentBatch.currentPeriodStart, servicePeriodEnd: currentBatch.currentPeriodEnd,
            lastProviderEventAt: input.occurredAt, lastProviderEventId: input.eventId,
          } });
          return { state: 'SPONSORED_ANNUAL_INSTALLMENT_RECORDED', accessGranted: false };
        }
        await transaction.sponsoredSeatPayment.update({
          where: { id: existing.id },
          data: {
            status,
            ...(requestedStatus === 'RECEIVED' ? { receivedAt: input.occurredAt } : { confirmedAt: input.occurredAt }),
            lastProviderEventAt: input.occurredAt,
            lastProviderEventId: input.eventId,
          },
        });
        return { state: 'SPONSORED_PAYMENT_DUPLICATE', accessGranted: true };
      }
      if (existing && currentBatch.billingInterval === 'MONTHLY' && existing.status === 'PENDING') {
        const period = calculateServicePeriod(paidAt, currentBatch.currentPeriodEnd, currentBatch.serviceMonths);
        await transaction.sponsoredSeatPayment.update({ where: { id: existing.id }, data: {
          status: requestedStatus, confirmedAt: requestedStatus === 'CONFIRMED' ? input.occurredAt : null,
          receivedAt: requestedStatus === 'RECEIVED' ? input.occurredAt : null,
          servicePeriodStart: period.startsAt, servicePeriodEnd: period.endsAt,
          lastProviderEventAt: input.occurredAt, lastProviderEventId: input.eventId,
        } });
        await transaction.sponsoredSeatBatch.update({ where: { id: batch.id }, data: {
          status: 'ACTIVE', ...(providerSubscriptionId ? { providerSubscriptionId } : {}),
          currentPeriodStart: period.startsAt, currentPeriodEnd: period.endsAt,
        } });
        await transaction.sponsoredSeat.updateMany({ where: { batchId: batch.id, studentId: null, status: { not: 'REVOKED' } }, data: { status: 'PAID_UNCLAIMED', startsAt: period.startsAt, endsAt: period.endsAt } });
        await transaction.sponsoredSeat.updateMany({ where: { batchId: batch.id, studentId: { not: null }, status: { not: 'REVOKED' } }, data: { status: 'ACTIVE', startsAt: period.startsAt, endsAt: period.endsAt } });
        return { state: 'SPONSORED_SEAT_PAYMENT_APPLIED', accessGranted: true };
      }
      if (isSponsoredAnnualPeriodAlreadyGranted(currentBatch.billingInterval, currentBatch.paidAt)) {
        await transaction.sponsoredSeatPayment.create({ data: {
          batchId: batch.id, environment: input.environment, providerPaymentId: input.providerPaymentId,
          providerCheckoutId: input.providerCheckoutId, status: requestedStatus, grossCents: valueCents,
          confirmedAt: requestedStatus === 'CONFIRMED' ? input.occurredAt : null,
          receivedAt: requestedStatus === 'RECEIVED' ? input.occurredAt : null,
          servicePeriodStart: currentBatch.currentPeriodStart, servicePeriodEnd: currentBatch.currentPeriodEnd,
          lastProviderEventAt: input.occurredAt, lastProviderEventId: input.eventId,
        } });
        return { state: 'SPONSORED_ANNUAL_INSTALLMENT_RECORDED', accessGranted: false };
      }
      const period = currentBatch.billingInterval === 'ANNUAL' && currentBatch.status === 'ACTIVE' && currentBatch.currentPeriodStart && currentBatch.currentPeriodEnd
        ? { startsAt: currentBatch.currentPeriodStart, endsAt: currentBatch.currentPeriodEnd }
        : calculateServicePeriod(paidAt, currentBatch.currentPeriodEnd, currentBatch.serviceMonths);
      await transaction.sponsoredSeatPayment.create({ data: {
        batchId: batch.id, environment: input.environment, providerPaymentId: input.providerPaymentId,
        providerCheckoutId: input.providerCheckoutId, status: requestedStatus, grossCents: valueCents,
        confirmedAt: requestedStatus === 'CONFIRMED' ? input.occurredAt : null,
        receivedAt: requestedStatus === 'RECEIVED' ? input.occurredAt : null,
        servicePeriodStart: period.startsAt, servicePeriodEnd: period.endsAt,
        lastProviderEventAt: input.occurredAt, lastProviderEventId: input.eventId,
      } });
      await transaction.sponsoredSeatBatch.update({ where: { id: batch.id }, data: {
        status: 'ACTIVE',
        ...(providerSubscriptionId ? { providerSubscriptionId } : {}),
        currentPeriodStart: period.startsAt,
        currentPeriodEnd: period.endsAt,
      } });
      await transaction.sponsoredSeat.updateMany({ where: { batchId: batch.id, studentId: null, status: { not: 'REVOKED' } }, data: { status: 'PAID_UNCLAIMED', startsAt: period.startsAt, endsAt: period.endsAt } });
      await transaction.sponsoredSeat.updateMany({ where: { batchId: batch.id, studentId: { not: null }, status: { not: 'REVOKED' } }, data: { status: 'ACTIVE', startsAt: period.startsAt, endsAt: period.endsAt } });
      return { state: 'SPONSORED_SEAT_PAYMENT_APPLIED', accessGranted: true };
    });
    return { updatedRows: 1, accessGranted: result.accessGranted, state: result.state };
  }

  async applyPaymentEvent(input: { environment: string; eventId: string; eventType: string; payload: unknown; occurredAt: Date }): Promise<PaymentEventRepositoryResult> {
    if (input.eventType !== 'PAYMENT_CONFIRMED' && input.eventType !== 'PAYMENT_RECEIVED') {
      const lifecycle = await this.applyPaymentLifecycleEvent(input);
      return { ...lifecycle };
    }
    const payload = asRecord(input.payload);
    const payment = asRecord(payload.payment);
    const providerPaymentId = readString(payment.id);
    if (!providerPaymentId) {
      console.warn('Webhook financeiro sem identificador de pagamento', { event: 'payments.payment_event_missing_provider_id', eventId: input.eventId, eventType: input.eventType });
      return { updatedRows: 0, accessGranted: false };
    }

    const externalReference = readString(payment.externalReference);
    const providerCheckoutId = readString(payment.checkoutSession) ?? readString(payment.checkoutId);
    console.log('Correlação de pagamento Asaas iniciada', { event: 'payments.payment_correlation_started', eventId: input.eventId, eventType: input.eventType, providerPaymentId, externalReference, providerCheckoutId });
    const sponsoredResult = await this.applySponsoredPaymentEvent({ ...input, providerPaymentId, externalReference, providerCheckoutId, payment });
    if (sponsoredResult) return sponsoredResult;
    const order = await prisma.paymentOrder.findFirst({
      where: {
        environment: input.environment,
        OR: [
          ...(externalReference ? [{ externalReference }] : []),
          ...(providerCheckoutId ? [{ checkouts: { some: { providerCheckoutId } } }] : []),
        ],
      },
      select: {
        id: true,
        studentId: true,
        status: true,
        billingInterval: true,
        serviceMonths: true,
        items: { take: 1, select: { id: true, monitorId: true, priceCentsSnapshot: true } },
        subscription: { select: { id: true, status: true, accessRevocationReason: true, providerSubscriptionId: true, currentPeriodStart: true, currentPeriodEnd: true, items: { take: 1, select: { id: true, monitorId: true, teacherId: true, teacherPercentageSnapshot: true, priceCentsSnapshot: true } } } },
      },
    });
    if (!order?.subscription || !order.items[0] || !order.subscription.items[0]) {
      console.log('Pagamento Asaas aguardando correlação com pedido', { event: 'payments.payment_correlation_waiting', eventId: input.eventId, providerPaymentId, externalReference, providerCheckoutId });
      return { updatedRows: 0, accessGranted: false };
    }

    const orderItem = order.items[0];
    const subscription = order.subscription;
    const subscriptionItem = subscription.items[0]!;
    const valueCents = readMoneyInCents(payment.value) ?? orderItem.priceCentsSnapshot;
    const providerPaymentDate = readDate(payment.clientPaymentDate) ?? readDate(payment.paymentDate) ?? readDate(payment.dateCreated);
    const paymentPeriodStart = providerPaymentDate ?? input.occurredAt;
    const serviceAlreadyGranted = order.billingInterval === 'ANNUAL' && order.status === 'PAYMENT_CONFIRMED' && Boolean(subscription.currentPeriodEnd);
    let periodStart: Date;
    let periodEnd: Date;
    if (serviceAlreadyGranted) {
      periodStart = subscription.currentPeriodStart ?? paymentPeriodStart;
      periodEnd = subscription.currentPeriodEnd!;
    } else if (order.billingInterval === 'ANNUAL') {
      const currentAccess = await prisma.studentSubscription.findUnique({ where: { studentId_monitorId: { studentId: order.studentId, monitorId: order.items[0]!.monitorId } }, select: { expiresAt: true } });
      ({ startsAt: periodStart, endsAt: periodEnd } = calculateServicePeriod(paymentPeriodStart, currentAccess?.expiresAt ?? null, order.serviceMonths));
    } else {
      const paymentPeriodEnd = addOneMonth(paymentPeriodStart);
      const advancesPeriod = !subscription.currentPeriodEnd || paymentPeriodEnd > subscription.currentPeriodEnd;
      periodStart = advancesPeriod ? paymentPeriodStart : subscription.currentPeriodStart ?? paymentPeriodStart;
      periodEnd = advancesPeriod ? paymentPeriodEnd : subscription.currentPeriodEnd ?? paymentPeriodEnd;
    }
    const status = input.eventType === 'PAYMENT_RECEIVED' ? 'RECEIVED' : 'CONFIRMED';
    const dueDate = readDate(payment.dueDate);
    const providerSubscriptionId = readString(payment.subscription);
    const netCents = readMoneyInCents(payment.netValue);
    const feeCents = netCents === null ? null : valueCents - netCents;

    console.log('Persistência financeira e liberação de acesso iniciadas', { event: 'payments.payment_access_persistence_started', eventId: input.eventId, tableNames: ['payment_charges', 'payment_subscriptions', 'payment_subscription_items', 'student_subscriptions', 'student_enrollments'], providerPaymentId, orderId: order.id, subscriptionId: subscription.id, studentId: order.studentId, monitorId: orderItem.monitorId, status, valueCents });
    const result = await prisma.$transaction(async (transaction) => {
      // Serialize confirmations for this provider charge. The lock must precede
      // the charge read so concurrent webhook workers observe the prior commit.
      const chargeLockKey = `${input.environment}:${providerPaymentId}`;
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${chargeLockKey}, 0))`;
      const existingCharge = await transaction.paymentCharge.findUnique({
        where: { environment_providerPaymentId: { environment: input.environment, providerPaymentId } },
        select: { id: true, status: true, lastProviderEventAt: true, servicePeriodStart: true, servicePeriodEnd: true },
      });
      if (existingCharge?.status === 'REFUNDED' || existingCharge?.status === 'CHARGEBACK') {
        return { charge: existingCharge, accessGranted: false, state: 'PAYMENT_TERMINAL_NO_ACCESS' };
      }
      if (existingCharge?.lastProviderEventAt && existingCharge.lastProviderEventAt > input.occurredAt) {
        return { charge: existingCharge, accessGranted: false, state: 'PAYMENT_STALE_EVENT_IGNORED' };
      }
      if (existingCharge?.servicePeriodStart && existingCharge.servicePeriodEnd) {
        periodStart = existingCharge.servicePeriodStart;
        periodEnd = existingCharge.servicePeriodEnd;
      }
      const recoveredFromChargeback = existingCharge?.status === 'CHARGEBACK_REVERSAL_PENDING';
      const chargeStatus = existingCharge?.status === 'RECEIVED' && status === 'CONFIRMED' ? 'RECEIVED' : status;
      const charge = await transaction.paymentCharge.upsert({
        where: { environment_providerPaymentId: { environment: input.environment, providerPaymentId } },
        create: { subscriptionId: subscription.id, environment: input.environment, providerPaymentId, providerCheckoutId, dueDate, servicePeriodStart: periodStart, servicePeriodEnd: periodEnd, status, grossCents: valueCents, netCents, feeCents, confirmedAt: status === 'CONFIRMED' ? input.occurredAt : null, receivedAt: status === 'RECEIVED' ? input.occurredAt : null, lastProviderEventAt: input.occurredAt, lastProviderEventId: input.eventId },
        update: { status: chargeStatus, dueDate, netCents: netCents ?? undefined, feeCents: feeCents ?? undefined, confirmedAt: status === 'CONFIRMED' ? input.occurredAt : undefined, receivedAt: status === 'RECEIVED' ? input.occurredAt : undefined, lastProviderEventAt: input.occurredAt, lastProviderEventId: input.eventId },
      });
      if ((subscription.accessRevocationReason === 'CHARGEBACK' && !recoveredFromChargeback) || subscription.accessRevocationReason === 'REFUND') {
        return { charge, accessGranted: false, state: 'PAYMENT_ACCESS_REVOKED' };
      }
      console.log('Cobrança Asaas persistida', { event: 'payments.payment_charge_persisted', tableName: 'payment_charges', eventId: input.eventId, chargeId: charge.id, providerPaymentId, status });

      const teacherPercentage = Number(subscriptionItem.teacherPercentageSnapshot);
      const existingTeacherSplit = await transaction.paymentSplit.findFirst({ where: { chargeId: charge.id, role: 'TEACHER' } });
      const splitData = { destination: teacherPercentage > 0 ? 'TEACHER' : 'PLATFORM', payoutMode: teacherPercentage > 0 ? 'TEACHER_ACCOUNT' as const : 'PLATFORM_FALLBACK' as const, contractedPercentage: teacherPercentage, effectivePercentage: teacherPercentage, expectedCents: Math.round(valueCents * teacherPercentage / 100), fallbackReason: teacherPercentage > 0 ? null : 'TEACHER_ACCOUNT_NOT_ELIGIBLE' };
      if (existingTeacherSplit) await transaction.paymentSplit.update({ where: { id: existingTeacherSplit.id }, data: splitData });
      else await transaction.paymentSplit.create({ data: { chargeId: charge.id, role: 'TEACHER', ...splitData, settledCents: null, status: 'PENDING' } });

      for (const [index, observed] of readEffectiveSplits(input.payload, valueCents, input.eventType).entries()) {
        const role = index === 0 ? 'TEACHER' : `SPLIT_${index + 1}`;
        const existing = await transaction.paymentSplit.findFirst({
          where: {
            chargeId: charge.id,
            OR: [
              ...(observed.providerSplitId ? [{ providerSplitId: observed.providerSplitId }] : []),
              ...(observed.walletId ? [{ walletId: observed.walletId, role }] : []),
            ],
          },
        });
        const observedData = {
          role,
          walletId: observed.walletId,
          providerSplitId: observed.providerSplitId,
          destination: 'TEACHER',
          payoutMode: 'TEACHER_ACCOUNT' as const,
          effectivePercentage: observed.effectivePercentage,
          expectedCents: observed.amountCents,
          settledCents: observed.settledCents,
          status: observed.status,
          fallbackReason: null,
        };
        if (existing) await transaction.paymentSplit.update({ where: { id: existing.id }, data: observedData });
        else await transaction.paymentSplit.create({ data: { chargeId: charge.id, contractedPercentage: index === 0 ? teacherPercentage : observed.effectivePercentage, ...observedData } });
      }

      await transaction.paymentSubscription.update({ where: { id: subscription.id }, data: { status: subscription.status === 'CANCELLED' && !recoveredFromChargeback ? 'CANCELLED' : 'ACTIVE', accessRevocationReason: recoveredFromChargeback ? null : undefined, cancelledAt: recoveredFromChargeback ? null : undefined, cancelAtPeriodEnd: recoveredFromChargeback ? false : undefined, providerSubscriptionId: providerSubscriptionId ?? undefined, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, nextDueDate: periodEnd, lastProviderEventAt: input.occurredAt, lastProviderEventId: input.eventId } });
      console.log('Assinatura financeira ativada', { event: 'payments.subscription_activated', tableName: 'payment_subscriptions', eventId: input.eventId, subscriptionId: subscription.id, providerSubscriptionId, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd });
      await transaction.paymentSubscriptionItem.update({ where: { id: subscriptionItem.id }, data: { status: 'ACTIVE' } });

      await transaction.studentSubscription.upsert({
        where: { studentId_monitorId: { studentId: order.studentId, monitorId: orderItem.monitorId } },
        create: { studentId: order.studentId, monitorId: orderItem.monitorId, status: 'active', amountPaid: valueCents / 100, startsAt: periodStart, expiresAt: periodEnd, gatewaySubscriptionId: providerSubscriptionId, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, paymentSubscriptionItemId: subscriptionItem.id, lastPaymentChargeId: charge.id },
        update: { status: 'active', amountPaid: valueCents / 100, expiresAt: periodEnd, gatewaySubscriptionId: providerSubscriptionId ?? undefined, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, paymentSubscriptionItemId: subscriptionItem.id, lastPaymentChargeId: charge.id, cancelledAt: subscription.status === 'CANCELLED' && !recoveredFromChargeback ? undefined : null, cancelAtPeriodEnd: subscription.status === 'CANCELLED' && !recoveredFromChargeback ? true : false },
      });
      console.log('Projeção de assinatura do aluno atualizada', { event: 'payments.student_subscription_access_upserted', tableName: 'student_subscriptions', eventId: input.eventId, studentId: order.studentId, monitorId: orderItem.monitorId, chargeId: charge.id, periodEnd });

      await transaction.studentEnrollment.upsert({
        where: { studentId_monitorId: { studentId: order.studentId, monitorId: orderItem.monitorId } },
        create: { studentId: order.studentId, monitorId: orderItem.monitorId, status: 'ACTIVE', startsAt: periodStart, endsAt: periodEnd, paymentSubscriptionItemId: subscriptionItem.id },
        update: { status: 'ACTIVE', endsAt: periodEnd, paymentSubscriptionItemId: subscriptionItem.id },
      });
      console.log('Enrollment do aluno atualizado', { event: 'payments.student_enrollment_upserted', tableName: 'student_enrollments', eventId: input.eventId, studentId: order.studentId, monitorId: orderItem.monitorId, paymentSubscriptionItemId: subscriptionItem.id });
      await transaction.paymentOrder.update({ where: { id: order.id }, data: { status: 'PAYMENT_CONFIRMED' } });
      return { charge, accessGranted: true, state: 'PAYMENT_ACCESS_APPLIED' };
    });
    if (!result.accessGranted) {
      console.warn('Pagamento recebido após estorno ou contestação; acesso permanece revogado', { event: 'payments.payment_terminal_state_preserved', eventId: input.eventId, chargeId: result.charge.id, providerPaymentId, priorStatus: result.charge.status });
      return { updatedRows: 1, chargeId: result.charge.id, orderId: order.id, subscriptionId: subscription.id, studentId: order.studentId, monitorId: orderItem.monitorId, accessGranted: false, state: result.state };
    }
    console.log('Acesso do aluno liberado por confirmação financeira', { event: 'payments.student_access_granted', eventId: input.eventId, chargeId: result.charge.id, orderId: order.id, subscriptionId: subscription.id, studentId: order.studentId, monitorId: orderItem.monitorId, periodStart, periodEnd });
    return { updatedRows: 1, chargeId: result.charge.id, orderId: order.id, subscriptionId: subscription.id, studentId: order.studentId, monitorId: orderItem.monitorId, accessGranted: true, state: result.state };
  }
}

export type EffectivePaymentSplit = {
  providerSplitId: string | null;
  walletId: string | null;
  effectivePercentage: number;
  amountCents: number;
  settledCents: number | null;
  status: string;
};

export function readEffectiveSplits(payload: unknown, grossCents: number, eventType: string): EffectivePaymentSplit[] {
  const root = asRecord(payload);
  const payment = asRecord(root.payment);
  const rawSplits = Array.isArray(payment.split)
    ? payment.split
    : Array.isArray(payment.splits)
      ? payment.splits
      : Array.isArray(root.split)
        ? root.split
        : Array.isArray(root.splits)
          ? root.splits
          : [];
  return rawSplits.flatMap((value) => {
    const split = asRecord(value);
    const amountCents = readMoneyInCents(split.totalValue) ?? readMoneyInCents(split.value) ?? readMoneyInCents(split.fixedValue);
    const percentage = readNumber(split.percentualValue) ?? (amountCents === null || grossCents <= 0 ? null : amountCents / grossCents * 100);
    const providerSplitId = readString(split.id) ?? null;
    const walletId = readString(split.walletId) ?? null;
    if (amountCents === null || percentage === null || (!providerSplitId && !walletId)) return [];
    const rawStatus = readString(split.status)?.toUpperCase();
    const settled = eventType === 'PAYMENT_SPLIT_DONE' || rawStatus === 'DONE' || rawStatus === 'SETTLED' || rawStatus === 'RECEIVED';
    return [{
      providerSplitId,
      walletId,
      effectivePercentage: percentage,
      amountCents,
      settledCents: settled ? amountCents : null,
      status: settled ? 'SETTLED' : 'PENDING',
    }];
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readMoneyInCents(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Math.round(Number(value) * 100);
  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function readDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addOneMonth(date: Date) {
  return addMonths(date, 1);
}

export function calculateServicePeriod(start: Date, existingPeriodEnd: Date | null, serviceMonths: number) {
  if (!Number.isInteger(serviceMonths) || serviceMonths <= 0) throw new Error('SERVICE_MONTHS_MUST_BE_POSITIVE');
  const startsAt = existingPeriodEnd && existingPeriodEnd > start ? new Date(existingPeriodEnd) : new Date(start);
  return { startsAt, endsAt: addMonths(startsAt, serviceMonths) };
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}
