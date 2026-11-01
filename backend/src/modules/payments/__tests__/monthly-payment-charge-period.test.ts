import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { prisma } from '../../../lib/prisma.js';
import { PaymentEventRepository } from '../infrastructure/persistence/payment-event.repository.js';

const databaseUrl = process.env.PAYMENTS_TEST_DATABASE_URL;
const canRun = Boolean(databaseUrl && process.env.DATABASE_URL === databaseUrl && databaseUrl.includes('mm_asaas_flow_test'));

after(async () => { await prisma.$disconnect(); });

async function createFixture() {
  const runId = randomUUID();
  const student = await prisma.student.create({ data: {
    userId: randomUUID(), fullName: 'Aluno teste idempotência', email: `monthly-period-${runId}@example.test`,
  } });
  const teacher = await prisma.teacher.create({ data: {
    userId: randomUUID(), fullName: 'Professor teste idempotência', email: `monthly-teacher-${runId}@example.test`,
    username: `monthly-period-${runId}`, area: 'Matemática', pageSlug: `monthly-period-${runId}`, termsAcceptedAt: new Date(),
  } });
  const monitor = await prisma.monitor.create({ data: { teacherId: teacher.id, name: `Monitor ${runId}`, status: 'PUBLISHED' } });
  const externalReference = `monthly-order-${runId}`;
  const order = await prisma.paymentOrder.create({ data: {
    studentId: student.id, environment: 'SANDBOX', status: 'PENDING', grossCents: 5990,
    externalReference, requestFingerprint: `monthly-fingerprint-${runId}`,
    items: { create: {
      monitorId: monitor.id, teacherId: teacher.id, descriptionSnapshot: monitor.name,
      priceCentsSnapshot: 5990, teacherPercentageSnapshot: 0,
    } },
  }, include: { items: true } });
  const subscription = await prisma.paymentSubscription.create({ data: {
    studentId: student.id, orderId: order.id, environment: 'SANDBOX', status: 'PENDING',
    providerSubscriptionId: `sub-${runId}`, currentPeriodStart: new Date('2026-09-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
    items: { create: {
      studentId: student.id, monitorId: monitor.id, teacherId: teacher.id,
      priceCentsSnapshot: 5990, teacherPercentageSnapshot: 0,
    } },
  }, include: { items: true } });
  const subscriptionItem = subscription.items[0]!;
  await prisma.studentSubscription.create({ data: {
    studentId: student.id, monitorId: monitor.id, status: 'active',
    startsAt: new Date('2026-09-01T00:00:00.000Z'), expiresAt: new Date('2026-10-01T00:00:00.000Z'),
    currentPeriodStart: new Date('2026-09-01T00:00:00.000Z'), currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
    paymentSubscriptionItemId: subscriptionItem.id,
  } });
  await prisma.studentEnrollment.create({ data: {
    studentId: student.id, monitorId: monitor.id, status: 'ACTIVE',
    startsAt: new Date('2026-09-01T00:00:00.000Z'), endsAt: new Date('2026-10-01T00:00:00.000Z'),
    paymentSubscriptionItemId: subscriptionItem.id,
  } });

  return { runId, student, teacher, monitor, order, subscription, subscriptionItem, externalReference };
}

async function removeFixture(fixture: Awaited<ReturnType<typeof createFixture>>) {
  const { student, teacher, monitor, order, subscription, subscriptionItem } = fixture;
  await prisma.paymentAuditEntry.deleteMany({ where: { studentId: student.id } });
  await prisma.studentEnrollment.deleteMany({ where: { studentId: student.id } });
  await prisma.studentSubscription.deleteMany({ where: { studentId: student.id } });
  await prisma.paymentCharge.deleteMany({ where: { subscriptionId: subscription.id } });
  await prisma.paymentSubscriptionItem.deleteMany({ where: { id: subscriptionItem.id } });
  await prisma.paymentSubscription.deleteMany({ where: { id: subscription.id } });
  await prisma.paymentOrder.deleteMany({ where: { id: order.id } });
  await prisma.monitor.deleteMany({ where: { id: monitor.id } });
  await prisma.teacher.deleteMany({ where: { id: teacher.id } });
  await prisma.student.deleteMany({ where: { id: student.id } });
}

async function assertSingleMonthlyPeriod(fixture: Awaited<ReturnType<typeof createFixture>>, providerPaymentId: string) {
  const updatedSubscription = await prisma.paymentSubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
  const access = await prisma.studentSubscription.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } });
  const enrollment = await prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } });
  const charge = await prisma.paymentCharge.findUniqueOrThrow({ where: { environment_providerPaymentId: { environment: 'SANDBOX', providerPaymentId } } });
  assert.equal(updatedSubscription.currentPeriodEnd?.toISOString(), '2026-12-01T00:00:00.000Z');
  assert.equal(access.expiresAt?.toISOString(), '2026-12-01T00:00:00.000Z');
  assert.equal(enrollment.endsAt?.toISOString(), '2026-12-01T00:00:00.000Z');
  assert.equal(charge.servicePeriodEnd?.toISOString(), '2026-12-01T00:00:00.000Z');
}

function makePaymentPayload(fixture: Awaited<ReturnType<typeof createFixture>>, providerPaymentId: string) {
  return { payment: {
    id: providerPaymentId, externalReference: fixture.externalReference, value: 59.9,
    // Deliberately omit paymentDate/dateCreated to exercise occurredAt fallback.
  } };
}

test('PAYMENT_CONFIRMED e PAYMENT_RECEIVED sequenciais da mesma cobrança não estendem o mês duas vezes', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const providerPaymentId = `pay-monthly-${fixture.runId}`;
  const payload = makePaymentPayload(fixture, providerPaymentId);
  try {
    const repository = new PaymentEventRepository();
    await repository.applyPaymentEvent({
      environment: 'SANDBOX', eventId: `evt-confirmed-${fixture.runId}`, eventType: 'PAYMENT_CONFIRMED',
      occurredAt: new Date('2026-11-01T00:00:00.000Z'), payload,
    });
    await repository.applyPaymentEvent({
      environment: 'SANDBOX', eventId: `evt-received-${fixture.runId}`, eventType: 'PAYMENT_RECEIVED',
      occurredAt: new Date('2026-11-08T00:00:00.000Z'), payload,
    });
    await assertSingleMonthlyPeriod(fixture, providerPaymentId);
  } finally {
    await removeFixture(fixture);
  }
});

test('PAYMENT_CONFIRMED e PAYMENT_RECEIVED simultâneos da mesma cobrança não estendem o mês duas vezes', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const providerPaymentId = `pay-monthly-race-${fixture.runId}`;
  const payload = makePaymentPayload(fixture, providerPaymentId);
  try {
    const repository = new PaymentEventRepository();
    await Promise.all([
      repository.applyPaymentEvent({
        environment: 'SANDBOX', eventId: `evt-race-confirmed-${fixture.runId}`, eventType: 'PAYMENT_CONFIRMED',
        occurredAt: new Date('2026-11-01T00:00:00.000Z'), payload,
      }),
      repository.applyPaymentEvent({
        environment: 'SANDBOX', eventId: `evt-race-received-${fixture.runId}`, eventType: 'PAYMENT_RECEIVED',
        occurredAt: new Date('2026-11-08T00:00:00.000Z'), payload,
      }),
    ]);
    await assertSingleMonthlyPeriod(fixture, providerPaymentId);
  } finally {
    await removeFixture(fixture);
  }
});
