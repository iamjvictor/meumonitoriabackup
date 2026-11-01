import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { prisma } from '../../../lib/prisma.js';
import { ClaimSponsoredSeatsUseCase } from '../application/commands/claim-sponsored-seats.use-case.js';
import { CreateSponsoredSeatBatchUseCase } from '../application/commands/create-sponsored-seat-batch.use-case.js';
import { PaymentEventRepository } from '../infrastructure/persistence/payment-event.repository.js';
import { PrismaSponsoredSeatBatchRepository } from '../infrastructure/persistence/sponsored-seat-batch.repository.js';
import { PrismaSponsoredSeatClaimRepository } from '../infrastructure/persistence/sponsored-seat-claim.repository.js';
import { PaymentEntitlementRepository } from '../../access/infrastructure/payment-entitlement.repository.js';
import { PrismaStudentAccessRepository } from '../../student-access/student-access.repository.js';

const databaseUrl = process.env.PAYMENTS_TEST_DATABASE_URL;
const canRun = Boolean(databaseUrl && process.env.DATABASE_URL === databaseUrl && databaseUrl.includes('mm_asaas_flow_test'));
after(async () => { await prisma.$disconnect(); });

test('checkout anual patrocinado → webhook → claim por email verificado → entitlement e guard', { skip: !canRun }, async () => {
  const runId = randomUUID();
  const userId = randomUUID();
  const email = `sponsored-${runId}@example.test`;
  const teacher = await prisma.teacher.create({ data: {
    userId: randomUUID(), fullName: 'Professor patrocinador', email: `teacher-${runId}@example.test`, username: `sponsor-${runId}`,
    area: 'Matemática', pageSlug: `sponsor-${runId}`, termsAcceptedAt: new Date(), teacherPercentage: 40,
  } });
  const monitor = await prisma.monitor.create({ data: {
    teacherId: teacher.id, name: `Monitor patrocinado ${runId}`, status: 'PUBLISHED', priceCents: 10000,
  } });
  const student = await prisma.student.create({ data: { userId, fullName: 'Aluno patrocinado', email } });
  const repository = new PrismaSponsoredSeatBatchRepository();
  const checkoutProvider = {
    async createHostedCheckout() { return { providerCheckoutId: `checkout-${runId}`, checkoutUrl: 'https://sandbox.asaas.com/checkout-test', expiresAt: null }; },
  };
  const createBatch = new CreateSponsoredSeatBatchUseCase(repository, checkoutProvider as any);
  const eventRepository = new PaymentEventRepository();
  try {
    const quote = await createBatch.quote(teacher.userId, { monitorId: monitor.id, interval: 'ANNUAL', beneficiaryEmails: [email] });
    assert.equal(quote.grossPriceCents, 96000);
    assert.equal(quote.totalAmountCents, 57600);
    const checkout = await createBatch.execute(teacher.userId, {
      monitorId: monitor.id, interval: 'ANNUAL', billingType: 'CREDIT_CARD', beneficiaryEmails: [email], expectedTotalAmountCents: quote.totalAmountCents,
      idempotencyKey: `sponsored-${runId}`, returnBaseUrl: 'https://app.example.test',
    });
    assert.equal(checkout.amountCents, 57600);

    const paid = await eventRepository.applyCheckoutEvent({
      environment: 'SANDBOX', eventId: `evt-${runId}`, eventType: 'CHECKOUT_PAID', payload: { checkout: { id: `checkout-${runId}` } }, occurredAt: new Date(),
    });
    assert.equal(paid.updatedRows, 1);
    await eventRepository.applyCheckoutEvent({
      environment: 'SANDBOX', eventId: `evt-duplicate-${runId}`, eventType: 'CHECKOUT_PAID', payload: { checkout: { id: `checkout-${runId}` } }, occurredAt: new Date(),
    });
    const claim = new ClaimSponsoredSeatsUseCase(new PrismaSponsoredSeatClaimRepository());
    const claimed = await claim.execute(userId, email.toUpperCase(), true);
    assert.equal(claimed.claimedCount, 1);

    const seat = await prisma.sponsoredSeat.findFirstOrThrow({ where: { batchId: checkout.batchId } });
    assert.equal(seat.studentId, student.id);
    assert.equal(seat.status, 'ACTIVE');
    assert.equal(Math.round((seat.endsAt!.getTime() - seat.startsAt!.getTime()) / (24 * 60 * 60 * 1000)), 365);
    assert.equal(await new PrismaStudentAccessRepository().hasActiveEnrollment(student.id, monitor.id), true);
    const entitlements = await new PaymentEntitlementRepository().listForStudent(student.id);
    assert.equal(entitlements.length, 1);
    assert.equal(entitlements[0]?.monitorId, monitor.id);
    assert.equal(entitlements[0]?.subscriptionStatus, 'ACTIVE');

    const batch = await prisma.sponsoredSeatBatch.findUniqueOrThrow({ where: { id: checkout.batchId } });
    assert.equal(batch.status, 'ACTIVE');
    assert.equal(batch.totalAmountCents, 57600);
  } finally {
    await prisma.studentEnrollment.deleteMany({ where: { studentId: student.id } });
    await prisma.studentSubscription.deleteMany({ where: { studentId: student.id } });
    await prisma.sponsoredSeatBatch.deleteMany({ where: { monitorId: monitor.id } });
    await prisma.monitor.delete({ where: { id: monitor.id } });
    await prisma.student.delete({ where: { id: student.id } });
    await prisma.teacher.delete({ where: { id: teacher.id } });
  }
});

test('Pix mensal patrocinado libera um mês após confirmação financeira sem criar assinatura recorrente', { skip: !canRun }, async () => {
  const runId = randomUUID();
  const teacher = await prisma.teacher.create({ data: {
    userId: randomUUID(), fullName: 'Professor Pix mensal', email: `teacher-pix-${runId}@example.test`, username: `pix-month-${runId}`,
    area: 'Matemática', pageSlug: `pix-month-${runId}`, termsAcceptedAt: new Date(), teacherPercentage: 40,
  } });
  const monitor = await prisma.monitor.create({ data: {
    teacherId: teacher.id, name: `Monitor Pix mensal ${runId}`, status: 'PUBLISHED', priceCents: 10000,
  } });
  const email = `student-pix-${runId}@example.test`;
  const providerCheckoutId = `checkout-pix-${runId}`;
  const repository = new PrismaSponsoredSeatBatchRepository();
  const createBatch = new CreateSponsoredSeatBatchUseCase(repository, {
    async createHostedCheckout(command: any) {
      assert.equal(command.billingType, 'PIX');
      assert.equal(command.chargeType, 'DETACHED');
      assert.equal(command.cycle, undefined);
      return { providerCheckoutId, checkoutUrl: 'https://sandbox.asaas.com/checkout-test', expiresAt: null };
    },
  } as any);
  try {
    const quote = await createBatch.quote(teacher.userId, { monitorId: monitor.id, interval: 'MONTHLY', beneficiaryEmails: [email] });
    const checkout = await createBatch.execute(teacher.userId, {
      monitorId: monitor.id, interval: 'MONTHLY', billingType: 'PIX', beneficiaryEmails: [email], expectedTotalAmountCents: quote.totalAmountCents,
      idempotencyKey: `sponsored-pix-${runId}`, returnBaseUrl: 'https://app.example.test',
    });
    const events = new PaymentEventRepository();
    const occurredAt = new Date('2026-11-01T12:00:00.000Z');
    await events.applyCheckoutEvent({ environment: 'SANDBOX', eventId: `evt-checkout-paid-${runId}`, eventType: 'CHECKOUT_PAID', occurredAt, payload: { checkout: { id: providerCheckoutId } } });
    const payment = { payment: { id: `payment-pix-${runId}`, externalReference: checkout.batchId, checkout: providerCheckoutId, value: quote.totalAmountCents / 100, paymentDate: occurredAt.toISOString() } };
    await events.applyPaymentEvent({ environment: 'SANDBOX', eventId: `evt-payment-created-${runId}`, eventType: 'PAYMENT_CREATED', occurredAt, payload: payment });
    const confirmed = await events.applyPaymentEvent({ environment: 'SANDBOX', eventId: `evt-payment-confirmed-${runId}`, eventType: 'PAYMENT_CONFIRMED', occurredAt, payload: payment });

    const batch = await prisma.sponsoredSeatBatch.findUniqueOrThrow({ where: { id: checkout.batchId } });
    const seat = await prisma.sponsoredSeat.findFirstOrThrow({ where: { batchId: checkout.batchId } });
    assert.equal(confirmed.accessGranted, true);
    assert.equal(confirmed.state, 'SPONSORED_SEAT_PAYMENT_APPLIED');
    assert.equal(batch.status, 'ACTIVE');
    assert.equal(batch.billingType, 'PIX');
    assert.equal(batch.providerSubscriptionId, null);
    assert.equal(batch.serviceMonths, 1);
    assert.equal(seat.status, 'PAID_UNCLAIMED');
    assert.equal(seat.startsAt?.toISOString(), occurredAt.toISOString());
    assert.equal(seat.endsAt?.toISOString(), '2026-12-01T12:00:00.000Z');
  } finally {
    await prisma.sponsoredSeatBatch.deleteMany({ where: { providerCheckoutId } });
    await prisma.monitor.delete({ where: { id: monitor.id } });
    await prisma.teacher.delete({ where: { id: teacher.id } });
  }
});
