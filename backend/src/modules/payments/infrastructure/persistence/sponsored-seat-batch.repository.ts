import { randomUUID } from 'node:crypto';
import { prisma } from '../../../../lib/prisma.js';
import type { SponsoredSeatBatchRepository } from '../../application/commands/create-sponsored-seat-batch.use-case.js';
import type { HostedCheckoutResult } from '../../domain/ports/payment-provider.port.js';

export class PrismaSponsoredSeatBatchRepository implements SponsoredSeatBatchRepository {
  async findTeacherMonitor(teacherUserId: string, monitorId: string) {
    const row = await prisma.monitor.findFirst({
      where: { id: monitorId, status: 'PUBLISHED', teacher: { userId: teacherUserId } },
      select: { id: true, name: true, status: true, priceCents: true, teacher: { select: { id: true, teacherPercentage: true } } },
    });
    if (!row) return null;
    return { teacherId: row.teacher.id, teacherPercentage: row.teacher.teacherPercentage.toString(), monitor: row };
  }

  async findBatchByIdempotency(teacherId: string, idempotencyKey: string) {
    const batch = await prisma.sponsoredSeatBatch.findUnique({
      where: { teacherId_idempotencyKey: { teacherId, idempotencyKey } },
      select: { id: true, requestFingerprint: true, totalAmountCents: true, status: true, checkoutUrl: true, checkoutExpiresAt: true },
    });
    return batch ? {
      fingerprint: batch.requestFingerprint,
      batch: { id: batch.id, amountCents: batch.totalAmountCents, status: batch.status, checkoutUrl: batch.checkoutUrl, expiresAt: batch.checkoutExpiresAt },
    } : null;
  }

  async findBlockingSeat(monitorId: string, normalizedEmail: string, excludeBatchId?: string) {
    const now = new Date();
    const sponsored = await prisma.sponsoredSeat.findFirst({
      where: { emailNormalized: normalizedEmail, ...(excludeBatchId ? { batchId: { not: excludeBatchId } } : {}), status: { notIn: ['CANCELED', 'EXPIRED', 'REVOKED'] }, OR: [{ endsAt: null }, { endsAt: { gt: now } }], batch: { monitorId, status: { notIn: ['CANCELED', 'EXPIRED', 'REFUNDED', 'REVOKED'] } } },
      select: { id: true },
    });
    if (sponsored) return true;
    const student = await prisma.student.findFirst({ where: { email: { equals: normalizedEmail, mode: 'insensitive' } }, select: { id: true } });
    if (!student) return false;
    const [payment, legacy, enrollment, billing] = await Promise.all([
      prisma.paymentSubscriptionItem.findFirst({ where: { studentId: student.id, monitorId, status: 'ACTIVE', subscription: { status: { in: ['ACTIVE', 'TRIALING'] } } }, select: { id: true } }),
      prisma.studentSubscription.findFirst({ where: { studentId: student.id, monitorId, status: 'active', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { id: true } }),
      prisma.studentEnrollment.findFirst({ where: { studentId: student.id, monitorId, status: 'ACTIVE', OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select: { id: true } }),
      prisma.billingSubscriptionItem.findFirst({ where: { monitorId, status: 'ACTIVE', subscription: { studentId: student.id, status: { in: ['ACTIVE', 'TRIALING'] } } }, select: { id: true } }),
    ]);
    return Boolean(payment || legacy || enrollment || billing);
  }

  async createPendingBatch(input: Parameters<SponsoredSeatBatchRepository['createPendingBatch']>[0]) {
    const id = randomUUID();
    await prisma.sponsoredSeatBatch.create({
      data: {
        id,
        teacherId: input.teacherId,
        monitorId: input.monitor.id,
        environment: input.environment,
        billingInterval: input.interval,
        billingType: input.billingType,
        serviceMonths: input.serviceMonths,
        status: 'PENDING',
        seatCount: input.beneficiaryEmails.length,
        grossPriceCents: input.grossPriceCents,
        platformAmountCents: input.platformAmountCents,
        teacherPercentage: input.teacherPercentage,
        totalAmountCents: input.totalAmountCents,
        externalReference: id,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        seats: { create: input.beneficiaryEmails.map((emailNormalized) => ({ emailNormalized, status: 'PENDING_PAYMENT' })) },
      },
      select: { id: true, externalReference: true },
    });
    return { id, externalReference: id };
  }

  async saveCheckout(batchId: string, checkout: HostedCheckoutResult) {
    await prisma.sponsoredSeatBatch.update({ where: { id: batchId }, data: { providerCheckoutId: checkout.providerCheckoutId, checkoutUrl: checkout.checkoutUrl, checkoutExpiresAt: checkout.expiresAt } });
  }

  async markCheckoutCreationFailed(batchId: string, message: string) {
    await prisma.sponsoredSeatBatch.update({ where: { id: batchId }, data: { status: 'CHECKOUT_CREATION_FAILED' } });
    console.error('Falha ao criar checkout do lote patrocinado', { event: 'payments.sponsored_batch_checkout_failed', batchId, errorMessage: message.slice(0, 300) });
  }

  async findBatchForEditing(teacherUserId: string, batchId: string) {
    const batch = await prisma.sponsoredSeatBatch.findFirst({ where: { id: batchId, teacher: { userId: teacherUserId } }, select: { id: true, monitorId: true, billingInterval: true, billingType: true, status: true, providerCheckoutId: true, paidAt: true } });
    return batch ? { id: batch.id, monitorId: batch.monitorId, interval: batch.billingInterval as 'MONTHLY' | 'ANNUAL', billingType: batch.billingType as 'PIX' | 'CREDIT_CARD', status: batch.status, providerCheckoutId: batch.providerCheckoutId, paidAt: batch.paidAt } : null;
  }

  async replacePendingBatch(input: Parameters<SponsoredSeatBatchRepository['replacePendingBatch']>[0]) {
    return prisma.$transaction(async (transaction) => {
      const updated = await transaction.sponsoredSeatBatch.updateMany({
        where: { id: input.batchId, paidAt: null, status: { in: ['PENDING', 'CHECKOUT_PENDING', 'CANCELED', 'CANCELLED', 'EXPIRED', 'CHECKOUT_CREATION_FAILED'] }, providerCheckoutId: input.previousCheckoutId },
        data: { seatCount: input.emails.length, grossPriceCents: input.grossPriceCents, platformAmountCents: input.platformAmountCents, totalAmountCents: input.totalAmountCents, teacherPercentage: input.teacherPercentage, requestFingerprint: input.fingerprint, providerCheckoutId: input.checkout.providerCheckoutId, checkoutUrl: input.checkout.checkoutUrl, checkoutExpiresAt: input.checkout.expiresAt, status: 'PENDING' },
      });
      if (!updated.count) return false;
      await transaction.sponsoredSeat.deleteMany({ where: { batchId: input.batchId, status: 'PENDING_PAYMENT', studentId: null } });
      await transaction.sponsoredSeat.createMany({ data: input.emails.map((emailNormalized) => ({ batchId: input.batchId, emailNormalized, status: 'PENDING_PAYMENT' })) });
      return true;
    });
  }

  async markEditedCheckoutFailed(batchId: string, previousCheckoutId: string | null) {
    await prisma.sponsoredSeatBatch.updateMany({ where: { id: batchId, paidAt: null, providerCheckoutId: previousCheckoutId, status: { in: ['PENDING', 'CHECKOUT_PENDING', 'CANCELED', 'CANCELLED', 'EXPIRED'] } }, data: { status: 'CHECKOUT_CREATION_FAILED', providerCheckoutId: null, checkoutUrl: null, checkoutExpiresAt: null } });
  }

  async listForTeacher(teacherUserId: string) {
    const teacher = await prisma.teacher.findUnique({ where: { userId: teacherUserId }, select: { id: true } });
    if (!teacher) return [];
    const batches = await prisma.sponsoredSeatBatch.findMany({
      where: { teacherId: teacher.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, monitorId: true, billingInterval: true, billingType: true, serviceMonths: true, status: true, seatCount: true,
        grossPriceCents: true, platformAmountCents: true, totalAmountCents: true,
        currentPeriodStart: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, checkoutUrl: true,
        createdAt: true, monitor: { select: { name: true } },
        seats: { orderBy: { createdAt: 'asc' }, select: { id: true, emailNormalized: true, status: true, startsAt: true, endsAt: true, student: { select: { fullName: true } } } },
      },
    });
    return batches.map((batch) => ({
      id: batch.id,
      monitorId: batch.monitorId,
      monitorName: batch.monitor.name,
      interval: batch.billingInterval,
      billingType: batch.billingType,
      serviceMonths: batch.serviceMonths,
      status: batch.status,
      seatCount: batch.seatCount,
      grossPriceCents: batch.grossPriceCents,
      platformAmountCents: batch.platformAmountCents,
      totalAmountCents: batch.totalAmountCents,
      currentPeriodStart: batch.currentPeriodStart,
      currentPeriodEnd: batch.currentPeriodEnd,
      cancelAtPeriodEnd: batch.cancelAtPeriodEnd,
      checkoutUrl: batch.checkoutUrl,
      createdAt: batch.createdAt,
      seats: batch.seats.map((seat) => ({ id: seat.id, email: seat.emailNormalized, status: seat.status, startsAt: seat.startsAt, endsAt: seat.endsAt, studentName: seat.student?.fullName ?? null })),
    }));
  }

  async findBatchForTeacher(teacherUserId: string, batchId: string) {
    return prisma.sponsoredSeatBatch.findFirst({
      where: { id: batchId, teacher: { userId: teacherUserId } },
      select: { id: true, billingInterval: true, status: true, providerSubscriptionId: true, currentPeriodEnd: true },
    }).then((batch) => batch && ({ id: batch.id, interval: batch.billingInterval, status: batch.status, providerSubscriptionId: batch.providerSubscriptionId, currentPeriodEnd: batch.currentPeriodEnd }));
  }

  async markCancelAtPeriodEnd(batchId: string) {
    await prisma.sponsoredSeatBatch.update({ where: { id: batchId }, data: { cancelAtPeriodEnd: true, status: 'CANCEL_PENDING' } });
  }
}
