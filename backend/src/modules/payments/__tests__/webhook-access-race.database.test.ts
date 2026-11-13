import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { prisma } from '../../../lib/prisma.js';
import { RedisEntitlementCache, type EntitlementCacheClient } from '../../access/infrastructure/redis-entitlement-cache.js';
import { ProcessPaymentWebhookUseCase } from '../application/commands/process-webhook.use-case.js';
import { PaymentEventRepository } from '../infrastructure/persistence/payment-event.repository.js';
import { PrismaPaymentWebhookRepository } from '../infrastructure/persistence/prisma-webhook.repository.js';

const isolatedUrl = process.env.PAYMENTS_TEST_DATABASE_URL;
function isLocalDedicatedDatabaseUrl(value: string | undefined): value is string {
  if (!value || process.env.DATABASE_URL !== value || !value.includes('mm_asaas_flow_test')) return false;
  try {
    const hostname = new URL(value).hostname;
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
  } catch {
    return false;
  }
}
const canRun = isLocalDedicatedDatabaseUrl(isolatedUrl);

after(async () => { await prisma.$disconnect(); });

async function createFixture(billingInterval: 'MONTHLY' | 'ANNUAL') {
  const runId = randomUUID();
  const student = await prisma.student.create({ data: { userId: randomUUID(), fullName: 'Aluno QA webhook race', email: `webhook-race-${runId}@example.test` } });
  const teacher = await prisma.teacher.create({ data: { userId: randomUUID(), fullName: 'Professor QA webhook race', email: `webhook-teacher-${runId}@example.test`, username: `webhook-race-${runId}`, area: 'Matemática', pageSlug: `webhook-race-${runId}`, termsAcceptedAt: new Date() } });
  const monitor = await prisma.monitor.create({ data: { teacherId: teacher.id, name: `Monitor ${runId}`, status: 'PUBLISHED' } });
  const externalReference = `webhook-race-order-${runId}`;
  const serviceMonths = billingInterval === 'ANNUAL' ? 12 : 1;
  const grossCents = billingInterval === 'ANNUAL' ? 57504 : 5990;
  const order = await prisma.paymentOrder.create({ data: {
    studentId: student.id, environment: 'SANDBOX', status: 'PENDING', grossCents, billingInterval, serviceMonths,
    externalReference, requestFingerprint: `webhook-race-fingerprint-${runId}`,
    items: { create: { monitorId: monitor.id, teacherId: teacher.id, descriptionSnapshot: monitor.name, priceCentsSnapshot: grossCents, teacherPercentageSnapshot: 0 } },
  }, include: { items: true } });
  const subscription = await prisma.paymentSubscription.create({ data: {
    studentId: student.id, orderId: order.id, environment: 'SANDBOX', status: 'PENDING', providerSubscriptionId: `webhook-race-sub-${runId}`,
    currentPeriodStart: new Date('2026-09-01T00:00:00.000Z'), currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
    items: { create: { studentId: student.id, monitorId: monitor.id, teacherId: teacher.id, priceCentsSnapshot: grossCents, teacherPercentageSnapshot: 0 } },
  }, include: { items: true } });
  const subscriptionItem = subscription.items[0]!;
  await prisma.studentSubscription.create({ data: {
    studentId: student.id, monitorId: monitor.id, status: 'active', startsAt: new Date('2026-09-01T00:00:00.000Z'), expiresAt: new Date('2026-10-01T00:00:00.000Z'),
    currentPeriodStart: new Date('2026-09-01T00:00:00.000Z'), currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'), paymentSubscriptionItemId: subscriptionItem.id,
  } });
  await prisma.studentEnrollment.create({ data: {
    studentId: student.id, monitorId: monitor.id, status: 'ACTIVE', startsAt: new Date('2026-09-01T00:00:00.000Z'), endsAt: new Date('2026-10-01T00:00:00.000Z'), paymentSubscriptionItemId: subscriptionItem.id,
  } });
  return { runId, student, teacher, monitor, order, subscription, subscriptionItem, externalReference, serviceMonths };
}

async function removeFixture(f: Awaited<ReturnType<typeof createFixture>>) {
  await prisma.paymentCheckout.deleteMany({ where: { orderId: f.order.id } });
  await prisma.paymentAuditEntry.deleteMany({ where: { studentId: f.student.id } });
  await prisma.studentEnrollment.deleteMany({ where: { studentId: f.student.id } });
  await prisma.studentSubscription.deleteMany({ where: { studentId: f.student.id } });
  await prisma.paymentCharge.deleteMany({ where: { subscriptionId: f.subscription.id } });
  await prisma.paymentSubscriptionItem.deleteMany({ where: { id: f.subscriptionItem.id } });
  await prisma.paymentSubscription.deleteMany({ where: { id: f.subscription.id } });
  await prisma.paymentOrder.deleteMany({ where: { id: f.order.id } });
  await prisma.monitor.deleteMany({ where: { id: f.monitor.id } });
  await prisma.teacher.deleteMany({ where: { id: f.teacher.id } });
  await prisma.student.deleteMany({ where: { id: f.student.id } });
}

test('confirmação concorrente com estorno ou chargeback mantém cobrança terminal e acesso revogado', { skip: !canRun }, async () => {
  const repository = new PaymentEventRepository();
  for (const eventType of ['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'] as const) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const f = await createFixture('MONTHLY');
      const paymentId = `pay-race-${eventType}-${attempt}-${f.runId}`;
      const payment = { id: paymentId, externalReference: f.externalReference, value: 59.9, paymentDate: '2026-11-01T00:00:00.000Z' };
      try {
        await Promise.all([
          repository.applyPaymentEvent({ environment: 'SANDBOX', eventId: `evt-confirm-${f.runId}`, eventType: 'PAYMENT_CONFIRMED', occurredAt: new Date('2026-11-01T00:00:00.000Z'), payload: { payment } }),
          repository.applySubscriptionEvent({ environment: 'SANDBOX', eventId: `evt-terminal-${f.runId}`, eventType, occurredAt: new Date('2026-11-02T00:00:00.000Z'), payload: { payment } }),
        ]);
        const [charge, subscription, item, access, enrollment] = await Promise.all([
          prisma.paymentCharge.findUniqueOrThrow({ where: { environment_providerPaymentId: { environment: 'SANDBOX', providerPaymentId: paymentId } } }),
          prisma.paymentSubscription.findUniqueOrThrow({ where: { id: f.subscription.id } }),
          prisma.paymentSubscriptionItem.findUniqueOrThrow({ where: { id: f.subscriptionItem.id } }),
          prisma.studentSubscription.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: f.student.id, monitorId: f.monitor.id } } }),
          prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: f.student.id, monitorId: f.monitor.id } } }),
        ]);
        assert.equal(charge.status, eventType === 'PAYMENT_REFUNDED' ? 'REFUNDED' : 'CHARGEBACK');
        assert.equal(subscription.status, 'CANCELLED');
        assert.equal(subscription.accessRevocationReason, eventType === 'PAYMENT_REFUNDED' ? 'REFUND' : 'CHARGEBACK');
        assert.equal(item.status, 'CANCELLED');
        assert.equal(access.status, 'cancelled');
        assert.equal(enrollment.status, 'REMOVED');
      } finally { await removeFixture(f); }
    }
  }
});

test('PAYMENT_CONFIRMED e PAYMENT_RECEIVED mensais concorrentes convergem para um único mês', { skip: !canRun }, async () => {
  const f = await createFixture('MONTHLY');
  const paymentId = `pay-monthly-events-${f.runId}`;
  const payment = { id: paymentId, externalReference: f.externalReference, value: 59.9 };
  const confirmedAt = new Date('2026-11-01T00:00:00.000Z');
  const receivedAt = new Date('2026-11-08T00:00:00.000Z');
  const repository = new PaymentEventRepository();
  try {
    await Promise.all([
      repository.applyPaymentEvent({ environment: 'SANDBOX', eventId: `evt-confirm-monthly-${f.runId}`, eventType: 'PAYMENT_CONFIRMED', occurredAt: confirmedAt, payload: { payment } }),
      repository.applyPaymentEvent({ environment: 'SANDBOX', eventId: `evt-received-monthly-${f.runId}`, eventType: 'PAYMENT_RECEIVED', occurredAt: receivedAt, payload: { payment } }),
    ]);
    const [subscription, access, enrollment, charge] = await Promise.all([
      prisma.paymentSubscription.findUniqueOrThrow({ where: { id: f.subscription.id } }),
      prisma.studentSubscription.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: f.student.id, monitorId: f.monitor.id } } }),
      prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: f.student.id, monitorId: f.monitor.id } } }),
      prisma.paymentCharge.findUniqueOrThrow({ where: { environment_providerPaymentId: { environment: 'SANDBOX', providerPaymentId: paymentId } } }),
    ]);
    const winningStart = subscription.currentPeriodStart;
    assert.ok(winningStart, 'um dos eventos precisa gravar o início do período');
    assert.ok([confirmedAt.toISOString(), receivedAt.toISOString()].includes(winningStart.toISOString()), 'deve prevalecer um dos eventos que concorreram pelo lock');
    const expectedEnd = new Date(winningStart);
    expectedEnd.setUTCMonth(expectedEnd.getUTCMonth() + 1);
    assert.equal(subscription.currentPeriodEnd?.toISOString(), expectedEnd.toISOString());
    assert.equal(access.currentPeriodStart?.toISOString(), winningStart.toISOString());
    assert.equal(access.expiresAt?.toISOString(), expectedEnd.toISOString());
    assert.equal(enrollment.endsAt?.toISOString(), expectedEnd.toISOString());
    assert.equal(charge.servicePeriodStart?.toISOString(), winningStart.toISOString());
    assert.equal(charge.servicePeriodEnd?.toISOString(), expectedEnd.toISOString());
  } finally { await removeFixture(f); }
});

test('CHECKOUT_PAID anual concorrente com PAYMENT_CONFIRMED converge para um período único de doze meses', { skip: !canRun }, async () => {
  const checkoutPaidAt = '2026-11-01T00:00:00.000Z';
  const paymentConfirmedAt = '2026-11-02T00:00:00.000Z';
  const repository = new PaymentEventRepository();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const f = await createFixture('ANNUAL');
    const checkoutId = `checkout-race-${attempt}-${f.runId}`;
    const paymentId = `pay-annual-race-${attempt}-${f.runId}`;
    try {
      await prisma.paymentCheckout.create({ data: { orderId: f.order.id, environment: 'SANDBOX', providerCheckoutId: checkoutId, externalReference: f.externalReference, status: 'PENDING' } });
      await Promise.all([
        repository.applyCheckoutEvent({ environment: 'SANDBOX', eventId: `evt-checkout-paid-${f.runId}`, eventType: 'CHECKOUT_PAID', occurredAt: new Date(checkoutPaidAt), payload: { checkout: { id: checkoutId } } }),
        repository.applyPaymentEvent({ environment: 'SANDBOX', eventId: `evt-payment-confirmed-${f.runId}`, eventType: 'PAYMENT_CONFIRMED', occurredAt: new Date(paymentConfirmedAt), payload: { payment: { id: paymentId, externalReference: f.externalReference, value: 575.04, paymentDate: paymentConfirmedAt } } }),
      ]);
      const [subscription, access, enrollment, charge, order] = await Promise.all([
        prisma.paymentSubscription.findUniqueOrThrow({ where: { id: f.subscription.id } }),
        prisma.studentSubscription.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: f.student.id, monitorId: f.monitor.id } } }),
        prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: f.student.id, monitorId: f.monitor.id } } }),
        prisma.paymentCharge.findUniqueOrThrow({ where: { environment_providerPaymentId: { environment: 'SANDBOX', providerPaymentId: paymentId } } }),
        prisma.paymentOrder.findUniqueOrThrow({ where: { id: f.order.id } }),
      ]);
      const winningStart = subscription.currentPeriodStart;
      assert.ok(winningStart, 'algum dos eventos precisa gravar o início do período');
      assert.ok([checkoutPaidAt, paymentConfirmedAt].includes(winningStart.toISOString()), 'o período deve usar a data do evento que confirmou primeiro sob o lock');
      const expectedEnd = new Date(winningStart);
      expectedEnd.setUTCFullYear(expectedEnd.getUTCFullYear() + 1);
      assert.equal(order.status, 'PAYMENT_CONFIRMED');
      assert.equal(subscription.currentPeriodEnd?.toISOString(), expectedEnd.toISOString());
      assert.equal(access.currentPeriodStart?.toISOString(), winningStart.toISOString());
      assert.equal(access.expiresAt?.toISOString(), expectedEnd.toISOString());
      assert.equal(enrollment.startsAt?.toISOString(), winningStart.toISOString());
      assert.equal(enrollment.endsAt?.toISOString(), expectedEnd.toISOString());
      assert.equal(charge.servicePeriodStart?.toISOString(), winningStart.toISOString());
      assert.equal(charge.servicePeriodEnd?.toISOString(), expectedEnd.toISOString());
    } finally { await removeFixture(f); }
  }
});

test('replay de CHECKOUT_PAID anual após falha de invalidação retorna aluno sem estender período', { skip: !canRun }, async () => {
  const f = await createFixture('ANNUAL');
  const checkoutId = `checkout-retry-${f.runId}`;
  const repository = new PaymentEventRepository();
  try {
    await prisma.paymentCheckout.create({ data: { orderId: f.order.id, environment: 'SANDBOX', providerCheckoutId: checkoutId, externalReference: f.externalReference, status: 'PENDING' } });
    const event = { environment: 'SANDBOX', eventId: `evt-checkout-retry-${f.runId}`, eventType: 'CHECKOUT_PAID', occurredAt: new Date('2026-11-01T00:00:00.000Z'), payload: { checkout: { id: checkoutId } } };
    const firstResult = await repository.applyCheckoutEvent(event);
    const firstSubscription = await prisma.paymentSubscription.findUniqueOrThrow({ where: { id: f.subscription.id } });
    const retryResult = await repository.applyCheckoutEvent(event);
    const [subscription, access, enrollment] = await Promise.all([
      prisma.paymentSubscription.findUniqueOrThrow({ where: { id: f.subscription.id } }),
      prisma.studentSubscription.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: f.student.id, monitorId: f.monitor.id } } }),
      prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: f.student.id, monitorId: f.monitor.id } } }),
    ]);

    assert.equal(firstResult.studentId, f.student.id);
    assert.equal(retryResult.studentId, f.student.id, 'retry precisa fornecer o studentId para invalidar o cache novamente');
    assert.equal(retryResult.updatedRows, 1);
    assert.equal(subscription.currentPeriodStart?.toISOString(), firstSubscription.currentPeriodStart?.toISOString());
    assert.equal(subscription.currentPeriodEnd?.toISOString(), firstSubscription.currentPeriodEnd?.toISOString());
    assert.equal(access.currentPeriodStart?.toISOString(), firstSubscription.currentPeriodStart?.toISOString());
    assert.equal(access.expiresAt?.toISOString(), firstSubscription.currentPeriodEnd?.toISOString());
    assert.equal(enrollment.startsAt?.toISOString(), firstSubscription.currentPeriodStart?.toISOString());
    assert.equal(enrollment.endsAt?.toISOString(), firstSubscription.currentPeriodEnd?.toISOString());
  } finally { await removeFixture(f); }
});

test('replay anual atrasado depois de estorno mantém cobrança terminal e acesso revogado', { skip: !canRun }, async () => {
  const f = await createFixture('ANNUAL');
  const checkoutId = `checkout-refund-replay-${f.runId}`;
  const paymentId = `pay-refund-replay-${f.runId}`;
  const payment = { id: paymentId, externalReference: f.externalReference, value: 575.04, paymentDate: '2026-11-01T00:00:00.000Z' };
  const repository = new PaymentEventRepository();
  try {
    await prisma.paymentCheckout.create({ data: { orderId: f.order.id, environment: 'SANDBOX', providerCheckoutId: checkoutId, externalReference: f.externalReference, status: 'PENDING' } });
    await repository.applyCheckoutEvent({ environment: 'SANDBOX', eventId: `evt-checkout-paid-${f.runId}`, eventType: 'CHECKOUT_PAID', occurredAt: new Date('2026-11-01T00:00:00.000Z'), payload: { checkout: { id: checkoutId } } });
    await repository.applySubscriptionEvent({ environment: 'SANDBOX', eventId: `evt-refund-${f.runId}`, eventType: 'PAYMENT_REFUNDED', occurredAt: new Date('2026-11-03T00:00:00.000Z'), payload: { payment } });

    await repository.applyCheckoutEvent({ environment: 'SANDBOX', eventId: `evt-checkout-replay-${f.runId}`, eventType: 'CHECKOUT_PAID', occurredAt: new Date('2026-11-04T00:00:00.000Z'), payload: { checkout: { id: checkoutId } } });
    await repository.applyPaymentEvent({ environment: 'SANDBOX', eventId: `evt-late-confirmation-${f.runId}`, eventType: 'PAYMENT_CONFIRMED', occurredAt: new Date('2026-11-05T00:00:00.000Z'), payload: { payment } });

    const [charge, subscription, item, access, enrollment] = await Promise.all([
      prisma.paymentCharge.findUniqueOrThrow({ where: { environment_providerPaymentId: { environment: 'SANDBOX', providerPaymentId: paymentId } } }),
      prisma.paymentSubscription.findUniqueOrThrow({ where: { id: f.subscription.id } }),
      prisma.paymentSubscriptionItem.findUniqueOrThrow({ where: { id: f.subscriptionItem.id } }),
      prisma.studentSubscription.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: f.student.id, monitorId: f.monitor.id } } }),
      prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: f.student.id, monitorId: f.monitor.id } } }),
    ]);
    assert.equal(charge.status, 'REFUNDED');
    assert.equal(subscription.status, 'CANCELLED');
    assert.equal(subscription.accessRevocationReason, 'REFUND');
    assert.equal(item.status, 'CANCELLED');
    assert.equal(access.status, 'cancelled');
    assert.equal(enrollment.status, 'REMOVED');
    assert.equal(access.expiresAt?.toISOString(), '2026-11-03T00:00:00.000Z');
    assert.equal(enrollment.endsAt?.toISOString(), '2026-11-03T00:00:00.000Z');
  } finally { await removeFixture(f); }
});

test('falha na invalidação marca webhook FAILED e retry invalida sem duplicar período mensal', { skip: !canRun }, async () => {
  const f = await createFixture('MONTHLY');
  const providerPaymentId = `pay-cache-retry-${f.runId}`;
  const providerEventId = `evt-cache-retry-${f.runId}`;
  const paymentPeriodEnd = new Date('2026-12-01T00:00:00.000Z');
  const event = await prisma.paymentWebhookEvent.create({ data: {
    environment: 'SANDBOX', providerEventId, eventType: 'PAYMENT_CONFIRMED',
    payload: { payment: { id: providerPaymentId, externalReference: f.externalReference, value: 59.9, paymentDate: '2026-11-01T00:00:00.000Z' } },
  } });
  let invalidationAttempts = 0;
  const redis: EntitlementCacheClient = {
    async get() { return null; },
    async set() { return undefined; },
    async del() {
      invalidationAttempts += 1;
      if (invalidationAttempts === 1) throw new Error('redis unavailable');
      return 1;
    },
  };
  const cache = new RedisEntitlementCache(redis, 'SANDBOX');
  const useCase = new ProcessPaymentWebhookUseCase(
    new PrismaPaymentWebhookRepository('SANDBOX'),
    undefined,
    new PaymentEventRepository(),
    (studentId) => cache.invalidateOrThrow(studentId),
  );
  try {
    await assert.rejects(useCase.execute(event.id), /redis unavailable/);
    const failedEvent = await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { id: event.id } });
    assert.equal(failedEvent.state, 'FAILED');
    assert.equal(failedEvent.attempts, 1);
    assert.ok(failedEvent.nextAttemptAt && failedEvent.nextAttemptAt > new Date(), 'evento deve ficar agendado para retry');

    await prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { nextAttemptAt: new Date(Date.now() - 1_000) } });
    const retryResult = await useCase.execute(event.id);
    const [processedEvent, charge, subscription, access, enrollment] = await Promise.all([
      prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { id: event.id } }),
      prisma.paymentCharge.findUniqueOrThrow({ where: { environment_providerPaymentId: { environment: 'SANDBOX', providerPaymentId } } }),
      prisma.paymentSubscription.findUniqueOrThrow({ where: { id: f.subscription.id } }),
      prisma.studentSubscription.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: f.student.id, monitorId: f.monitor.id } } }),
      prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: f.student.id, monitorId: f.monitor.id } } }),
    ]);
    assert.deepEqual(retryResult, { skipped: false, state: 'PAYMENT_ACCESS_APPLIED' });
    assert.equal(processedEvent.state, 'PAYMENT_ACCESS_APPLIED');
    assert.ok(processedEvent.processedAt);
    assert.equal(processedEvent.nextAttemptAt, null);
    assert.equal(invalidationAttempts, 2);
    assert.equal(charge.servicePeriodEnd?.toISOString(), paymentPeriodEnd.toISOString());
    assert.equal(subscription.currentPeriodEnd?.toISOString(), paymentPeriodEnd.toISOString());
    assert.equal(access.expiresAt?.toISOString(), paymentPeriodEnd.toISOString());
    assert.equal(enrollment.endsAt?.toISOString(), paymentPeriodEnd.toISOString());
    assert.equal(await prisma.paymentCharge.count({ where: { subscriptionId: f.subscription.id } }), 1);
  } finally {
    await prisma.paymentWebhookEvent.deleteMany({ where: { id: event.id } });
    await removeFixture(f);
  }
});

test('falha na invalidação de estorno permite retry sem reabrir acesso', { skip: !canRun }, async () => {
  const f = await createFixture('MONTHLY');
  const providerPaymentId = `pay-refund-cache-retry-${f.runId}`;
  const providerEventId = `evt-refund-cache-retry-${f.runId}`;
  const payment = { id: providerPaymentId, externalReference: f.externalReference, value: 59.9, paymentDate: '2026-11-01T00:00:00.000Z' };
  const repository = new PaymentEventRepository();
  try {
    await repository.applyPaymentEvent({ environment: 'SANDBOX', eventId: `evt-confirm-before-refund-${f.runId}`, eventType: 'PAYMENT_CONFIRMED', occurredAt: new Date('2026-11-01T00:00:00.000Z'), payload: { payment } });
    const event = await prisma.paymentWebhookEvent.create({ data: {
      environment: 'SANDBOX', providerEventId, eventType: 'PAYMENT_REFUNDED',
      payload: { dateCreated: '2026-11-03T00:00:00.000Z', payment },
    } });
    let invalidationAttempts = 0;
    const redis: EntitlementCacheClient = {
      async get() { return null; },
      async set() { return undefined; },
      async del() {
        invalidationAttempts += 1;
        if (invalidationAttempts === 1) throw new Error('redis unavailable');
        return 1;
      },
    };
    const cache = new RedisEntitlementCache(redis, 'SANDBOX');
    const useCase = new ProcessPaymentWebhookUseCase(
      new PrismaPaymentWebhookRepository('SANDBOX'),
      undefined,
      repository,
      (studentId) => cache.invalidateOrThrow(studentId),
    );
    try {
      await assert.rejects(useCase.execute(event.id), /redis unavailable/);
      const failedEvent = await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { id: event.id } });
      assert.equal(failedEvent.state, 'FAILED');
      assert.equal(failedEvent.attempts, 1);
      const revokedAccess = await prisma.studentSubscription.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: f.student.id, monitorId: f.monitor.id } } });
      assert.equal(revokedAccess.status, 'cancelled');

      await prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { nextAttemptAt: new Date(Date.now() - 1_000) } });
      const retryResult = await useCase.execute(event.id);
      const [processedEvent, charge, subscription, access, enrollment] = await Promise.all([
        prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { id: event.id } }),
        prisma.paymentCharge.findUniqueOrThrow({ where: { environment_providerPaymentId: { environment: 'SANDBOX', providerPaymentId } } }),
        prisma.paymentSubscription.findUniqueOrThrow({ where: { id: f.subscription.id } }),
        prisma.studentSubscription.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: f.student.id, monitorId: f.monitor.id } } }),
        prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: f.student.id, monitorId: f.monitor.id } } }),
      ]);
      assert.deepEqual(retryResult, { skipped: false, state: 'SUBSCRIPTION_STATE_APPLIED' });
      assert.equal(processedEvent.state, 'SUBSCRIPTION_STATE_APPLIED');
      assert.ok(processedEvent.processedAt);
      assert.equal(processedEvent.nextAttemptAt, null);
      assert.equal(invalidationAttempts, 2);
      assert.equal(charge.status, 'REFUNDED');
      assert.equal(subscription.status, 'CANCELLED');
      assert.equal(subscription.accessRevocationReason, 'REFUND');
      assert.equal(access.status, 'cancelled');
      assert.equal(enrollment.status, 'REMOVED');
      assert.equal(access.expiresAt?.toISOString(), '2026-11-03T00:00:00.000Z');
      assert.equal(enrollment.endsAt?.toISOString(), '2026-11-03T00:00:00.000Z');
    } finally {
      await prisma.paymentWebhookEvent.deleteMany({ where: { id: event.id } });
    }
  } finally { await removeFixture(f); }
});
