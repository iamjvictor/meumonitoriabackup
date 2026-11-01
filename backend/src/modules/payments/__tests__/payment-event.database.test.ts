import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { prisma } from '../../../lib/prisma.js';
import { getSponsoredPaymentEventStatus, isSponsoredAnnualPeriodAlreadyGranted, PaymentEventRepository } from '../infrastructure/persistence/payment-event.repository.js';

const databaseUrl = process.env.PAYMENTS_TEST_DATABASE_URL;
const canRun = Boolean(databaseUrl && process.env.DATABASE_URL === databaseUrl && databaseUrl.includes('mm_asaas_flow_test'));

test('eventos de parcela patrocinada são classificados sem promover pagamento a confirmação', () => {
  assert.equal(getSponsoredPaymentEventStatus('PAYMENT_CREATED'), 'PENDING');
  assert.equal(getSponsoredPaymentEventStatus('PAYMENT_OVERDUE'), 'OVERDUE');
  assert.equal(getSponsoredPaymentEventStatus('PAYMENT_CONFIRMED'), null);
  assert.equal(getSponsoredPaymentEventStatus('PAYMENT_RECEIVED'), null);
});

test('período anual patrocinado pago permanece idempotente mesmo após o lote ficar PAST_DUE', () => {
  assert.equal(isSponsoredAnnualPeriodAlreadyGranted('ANNUAL', new Date('2026-10-20T12:00:00.000Z')), true);
  assert.equal(isSponsoredAnnualPeriodAlreadyGranted('ANNUAL', null), false);
  assert.equal(isSponsoredAnnualPeriodAlreadyGranted('MONTHLY', new Date('2026-10-20T12:00:00.000Z')), false);
});

after(async () => { await prisma.$disconnect(); });

async function createFixture() {
  const runId = randomUUID();
  const student = await prisma.student.create({ data: {
    userId: randomUUID(), fullName: 'Aluno de teste', email: `payment-${runId}@example.test`,
  } });
  const teacher = await prisma.teacher.create({ data: {
    userId: randomUUID(), fullName: 'Professor de teste', email: `teacher-${runId}@example.test`,
    username: `payment-${runId}`, area: 'Matemática', pageSlug: `payment-${runId}`, termsAcceptedAt: new Date(),
  } });
  const monitor = await prisma.monitor.create({ data: { teacherId: teacher.id, name: `Monitor ${runId}`, status: 'PUBLISHED' } });
  const externalReference = `order-${runId}`;
  const order = await prisma.paymentOrder.create({ data: {
    studentId: student.id, environment: 'SANDBOX', status: 'PENDING', grossCents: 5990,
    externalReference, requestFingerprint: `fingerprint-${runId}`,
    items: { create: {
      monitorId: monitor.id, teacherId: teacher.id, descriptionSnapshot: monitor.name,
      priceCentsSnapshot: 5990, teacherPercentageSnapshot: 50,
    } },
  }, include: { items: true } });
  const subscriptionId = randomUUID();
  const subscription = await prisma.paymentSubscription.create({ data: {
    id: subscriptionId, studentId: student.id, orderId: order.id, environment: 'SANDBOX',
    status: 'PENDING', providerSubscriptionId: `sub-${runId}`,
    currentPeriodStart: new Date('2026-09-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
    items: { create: {
      studentId: student.id, monitorId: monitor.id, teacherId: teacher.id,
      priceCentsSnapshot: 5990, teacherPercentageSnapshot: 50,
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

test('webhook de renovação avança o período de acesso sem reiniciar a data inicial', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  try {
    const result = await repository.applyPaymentEvent({
      environment: 'SANDBOX', eventId: `evt-renew-${fixture.runId}`, eventType: 'PAYMENT_RECEIVED',
      occurredAt: new Date('2026-10-01T00:05:00.000Z'),
      payload: { payment: {
        id: `pay-renew-${fixture.runId}`, externalReference: fixture.externalReference,
        subscription: fixture.subscription.providerSubscriptionId, value: 59.9,
        paymentDate: '2026-10-01T00:00:00.000Z', netValue: 58.5,
      } },
    });

    assert.equal(result.updatedRows, 1);
    const subscription = await prisma.paymentSubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
    const studentSubscription = await prisma.studentSubscription.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } });
    const enrollment = await prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } });
    assert.equal(subscription.currentPeriodStart?.toISOString(), '2026-10-01T00:00:00.000Z');
    assert.equal(subscription.currentPeriodEnd?.toISOString(), '2026-11-01T00:00:00.000Z');
    assert.equal(studentSubscription.startsAt.toISOString(), '2026-09-01T00:00:00.000Z');
    assert.equal(studentSubscription.expiresAt?.toISOString(), '2026-11-01T00:00:00.000Z');
    assert.equal(enrollment.startsAt.toISOString(), '2026-09-01T00:00:00.000Z');
    assert.equal(enrollment.endsAt?.toISOString(), '2026-11-01T00:00:00.000Z');
  } finally {
    await removeFixture(fixture);
  }
});

test('CHECKOUT_PAID atualiza a jornada mas deixa a liberação de acesso para o evento financeiro', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  const providerCheckoutId = `checkout-${fixture.runId}`;
  try {
    await prisma.paymentCheckout.create({ data: {
      orderId: fixture.order.id, environment: 'SANDBOX', providerCheckoutId,
      externalReference: fixture.externalReference, status: 'PENDING',
    } });
    await repository.applyCheckoutEvent({
      environment: 'SANDBOX', eventId: `evt-expired-${fixture.runId}`, eventType: 'CHECKOUT_EXPIRED',
      occurredAt: new Date(), payload: { checkout: { id: providerCheckoutId } },
    });
    await repository.applyCheckoutEvent({
      environment: 'SANDBOX', eventId: `evt-late-created-${fixture.runId}`, eventType: 'CHECKOUT_CREATED',
      occurredAt: new Date(), payload: { checkout: { id: providerCheckoutId } },
    });
    assert.equal((await prisma.paymentCheckout.findFirstOrThrow({ where: { providerCheckoutId } })).status, 'EXPIRED');
    const result = await repository.applyCheckoutEvent({
      environment: 'SANDBOX', eventId: `evt-checkout-${fixture.runId}`, eventType: 'CHECKOUT_PAID',
      occurredAt: new Date(), payload: { checkout: { id: providerCheckoutId, status: 'PAID' } },
    });

    assert.equal(result.updatedRows, 1);
    assert.equal((await prisma.paymentCheckout.findFirstOrThrow({ where: { providerCheckoutId } })).status, 'PAID');
    await repository.applyCheckoutEvent({
      environment: 'SANDBOX', eventId: `evt-late-expired-${fixture.runId}`, eventType: 'CHECKOUT_EXPIRED',
      occurredAt: new Date(), payload: { checkout: { id: providerCheckoutId } },
    });
    assert.equal((await prisma.paymentCheckout.findFirstOrThrow({ where: { providerCheckoutId } })).status, 'PAID');
    assert.equal((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: fixture.order.id } })).status, 'PENDING');
    assert.equal((await prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } })).status, 'ACTIVE');
  } finally {
    await prisma.paymentCheckout.deleteMany({ where: { providerCheckoutId } });
    await removeFixture(fixture);
  }
});

test('CHECKOUT_PAID anual direto concede doze meses uma vez e evento financeiro complementar não estende novamente', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const providerCheckoutId = `checkout-annual-${fixture.runId}`;
  const paidAt = new Date('2026-10-20T12:00:00.000Z');
  try {
    await prisma.paymentOrder.update({ where: { id: fixture.order.id }, data: { billingInterval: 'ANNUAL', serviceMonths: 12, grossCents: 48000 } });
    await prisma.paymentOrderItem.update({ where: { id: fixture.order.items[0]!.id }, data: { priceCentsSnapshot: 48000 } });
    await prisma.paymentSubscription.update({ where: { id: fixture.subscription.id }, data: { currentPeriodStart: null, currentPeriodEnd: null } });
    await prisma.paymentCheckout.create({ data: { orderId: fixture.order.id, environment: 'SANDBOX', providerCheckoutId, externalReference: fixture.externalReference, status: 'PENDING' } });
    const input = { environment: 'SANDBOX', eventId: `evt-annual-${fixture.runId}`, eventType: 'CHECKOUT_PAID', occurredAt: paidAt, payload: { checkout: { id: providerCheckoutId } } };
    await new PaymentEventRepository().applyCheckoutEvent(input);
    await new PaymentEventRepository().applyCheckoutEvent({ ...input, eventId: `evt-annual-duplicate-${fixture.runId}`, occurredAt: new Date(paidAt.getTime() + 1000) });
    const subscription = await prisma.paymentSubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
    const projection = await prisma.studentSubscription.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } });
    assert.equal(subscription.currentPeriodEnd?.toISOString(), '2027-10-20T12:00:00.000Z');
    assert.equal(projection.expiresAt?.toISOString(), '2027-10-20T12:00:00.000Z');
    await new PaymentEventRepository().applyPaymentEvent({
      environment: 'SANDBOX', eventId: `evt-annual-financial-${fixture.runId}`, eventType: 'PAYMENT_CONFIRMED', occurredAt: paidAt,
      payload: { payment: { id: `pay-annual-${fixture.runId}`, externalReference: fixture.externalReference, checkoutSession: providerCheckoutId, value: 480, paymentDate: paidAt.toISOString() } },
    });
    const afterFinancial = await prisma.paymentSubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
    assert.equal(afterFinancial.currentPeriodEnd?.toISOString(), '2027-10-20T12:00:00.000Z');
  } finally {
    await prisma.paymentCheckout.deleteMany({ where: { orderId: fixture.order.id } });
    await removeFixture(fixture);
  }
});

test('CHECKOUT_PAID anual patrocinado ativa todas as vagas sem criar cobranças ou split de professor', { skip: !canRun }, async () => {
  const runId = randomUUID();
  const teacher = await prisma.teacher.create({ data: { userId: randomUUID(), fullName: 'Professor patrocinador', email: `sponsor-${runId}@example.test`, username: `sponsor-${runId}`, area: 'Física', pageSlug: `sponsor-${runId}`, termsAcceptedAt: new Date() } });
  const monitor = await prisma.monitor.create({ data: { teacherId: teacher.id, name: `Monitor patrocinado ${runId}`, status: 'PUBLISHED' } });
  const providerCheckoutId = `checkout-sponsored-${runId}`;
  const batch = await prisma.sponsoredSeatBatch.create({ data: {
    teacherId: teacher.id, monitorId: monitor.id, environment: 'SANDBOX', billingInterval: 'ANNUAL', serviceMonths: 12,
    seatCount: 2, grossPriceCents: 90000, platformAmountCents: 45000, teacherPercentage: 50, totalAmountCents: 90000,
    externalReference: `sponsored-${runId}`, idempotencyKey: `key-${runId}`, requestFingerprint: `fingerprint-${runId}`, providerCheckoutId,
    seats: { create: [{ emailNormalized: `one-${runId}@example.test` }, { emailNormalized: `two-${runId}@example.test` }] },
  } });
  try {
    const result = await new PaymentEventRepository().applyCheckoutEvent({ environment: 'SANDBOX', eventId: `evt-sponsored-${runId}`, eventType: 'CHECKOUT_PAID', occurredAt: new Date('2026-10-20T12:00:00.000Z'), payload: { checkout: { id: providerCheckoutId } } });
    const updated = await prisma.sponsoredSeatBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { seats: true } });
    assert.equal(result.updatedRows, 1);
    assert.equal(updated.status, 'ACTIVE');
    assert.equal(updated.seats.length, 2);
    assert.ok(updated.seats.every((seat) => seat.status === 'PAID_UNCLAIMED' && seat.endsAt?.toISOString() === '2027-10-20T12:00:00.000Z'));
    assert.equal(await prisma.sponsoredSeatPayment.count({ where: { batchId: batch.id } }), 0);
  } finally {
    await prisma.sponsoredSeatBatch.delete({ where: { id: batch.id } });
    await prisma.monitor.delete({ where: { id: monitor.id } });
    await prisma.teacher.delete({ where: { id: teacher.id } });
  }
});

test('CHECKOUT_PAID duplicado após vencimento não estende o período anual patrocinado', { skip: !canRun }, async () => {
  const runId = randomUUID();
  const teacher = await prisma.teacher.create({ data: { userId: randomUUID(), fullName: 'Professor anual repetido', email: `annual-repeat-${runId}@example.test`, username: `annual-repeat-${runId}`, area: 'Física', pageSlug: `annual-repeat-${runId}`, termsAcceptedAt: new Date() } });
  const monitor = await prisma.monitor.create({ data: { teacherId: teacher.id, name: `Monitor anual ${runId}`, status: 'PUBLISHED' } });
  const providerCheckoutId = `checkout-annual-repeat-${runId}`;
  const paidAt = new Date('2026-10-20T12:00:00.000Z');
  const batch = await prisma.sponsoredSeatBatch.create({ data: {
    teacherId: teacher.id, monitorId: monitor.id, environment: 'SANDBOX', billingInterval: 'ANNUAL', serviceMonths: 12,
    seatCount: 1, grossPriceCents: 45000, platformAmountCents: 45000, teacherPercentage: 0, totalAmountCents: 45000,
    externalReference: `sponsored-repeat-${runId}`, idempotencyKey: `key-repeat-${runId}`, requestFingerprint: `fingerprint-repeat-${runId}`, providerCheckoutId,
    seats: { create: [{ emailNormalized: `repeat-${runId}@example.test` }] },
  } });
  try {
    const repository = new PaymentEventRepository();
    await repository.applyCheckoutEvent({ environment: 'SANDBOX', eventId: `evt-paid-${runId}`, eventType: 'CHECKOUT_PAID', occurredAt: paidAt, payload: { checkout: { id: providerCheckoutId } } });
    const originalSeat = await prisma.sponsoredSeat.findFirstOrThrow({ where: { batchId: batch.id } });
    await prisma.sponsoredSeatBatch.update({ where: { id: batch.id }, data: { status: 'PAST_DUE' } });
    await repository.applyCheckoutEvent({ environment: 'SANDBOX', eventId: `evt-paid-again-${runId}`, eventType: 'CHECKOUT_PAID', occurredAt: new Date('2027-10-22T12:00:00.000Z'), payload: { checkout: { id: providerCheckoutId } } });
    const afterBatch = await prisma.sponsoredSeatBatch.findUniqueOrThrow({ where: { id: batch.id } });
    const afterSeat = await prisma.sponsoredSeat.findUniqueOrThrow({ where: { id: originalSeat.id } });
    assert.equal(afterBatch.status, 'PAST_DUE');
    assert.equal(afterBatch.currentPeriodEnd?.toISOString(), '2027-10-20T12:00:00.000Z');
    assert.equal(afterSeat.endsAt?.toISOString(), '2027-10-20T12:00:00.000Z');
  } finally {
    await prisma.sponsoredSeatBatch.delete({ where: { id: batch.id } });
    await prisma.monitor.delete({ where: { id: monitor.id } });
    await prisma.teacher.delete({ where: { id: teacher.id } });
  }
});

test('PAYMENT_CREATED e PAYMENT_OVERDUE correlacionam parcelas patrocinadas sem liberar nem revogar acesso', { skip: !canRun }, async () => {
  const runId = randomUUID();
  const teacher = await prisma.teacher.create({ data: { userId: randomUUID(), fullName: 'Professor parcela', email: `installment-${runId}@example.test`, username: `installment-${runId}`, area: 'Física', pageSlug: `installment-${runId}`, termsAcceptedAt: new Date() } });
  const monitor = await prisma.monitor.create({ data: { teacherId: teacher.id, name: `Monitor parcela ${runId}`, status: 'PUBLISHED' } });
  const batch = await prisma.sponsoredSeatBatch.create({ data: {
    teacherId: teacher.id, monitorId: monitor.id, environment: 'SANDBOX', billingInterval: 'ANNUAL', serviceMonths: 12,
    seatCount: 1, grossPriceCents: 45000, platformAmountCents: 45000, teacherPercentage: 0, totalAmountCents: 45000,
    externalReference: `sponsored-installment-${runId}`, idempotencyKey: `key-installment-${runId}`, requestFingerprint: `fingerprint-installment-${runId}`, providerCheckoutId: `checkout-installment-${runId}`,
    status: 'ACTIVE', paidAt: new Date('2026-10-20T12:00:00.000Z'), currentPeriodStart: new Date('2026-10-20T12:00:00.000Z'), currentPeriodEnd: new Date('2027-10-20T12:00:00.000Z'),
    seats: { create: [{ emailNormalized: `installment-${runId}@example.test`, status: 'PAID_UNCLAIMED', startsAt: new Date('2026-10-20T12:00:00.000Z'), endsAt: new Date('2027-10-20T12:00:00.000Z') }] },
  } });
  const providerPaymentId = `pay-installment-${runId}`;
  const repository = new PaymentEventRepository();
  try {
    const paymentPayload = { payment: { id: providerPaymentId, externalReference: batch.externalReference, checkoutSession: batch.providerCheckoutId, value: 37.5, dueDate: '2026-11-20' } };
    const created = await repository.applyPaymentEvent({ environment: 'SANDBOX', eventId: `evt-created-${runId}`, eventType: 'PAYMENT_CREATED', occurredAt: new Date('2026-10-21T12:00:00.000Z'), payload: paymentPayload });
    assert.equal(created.accessGranted, false);
    assert.equal((await prisma.sponsoredSeatPayment.findUniqueOrThrow({ where: { environment_providerPaymentId: { environment: 'SANDBOX', providerPaymentId } } })).status, 'PENDING');
    const overdue = await repository.applySubscriptionEvent({ environment: 'SANDBOX', eventId: `evt-overdue-${runId}`, eventType: 'PAYMENT_OVERDUE', occurredAt: new Date('2026-11-21T12:00:00.000Z'), payload: paymentPayload });
    assert.equal(overdue.updatedRows, 1);
    assert.equal((await prisma.sponsoredSeatPayment.findUniqueOrThrow({ where: { environment_providerPaymentId: { environment: 'SANDBOX', providerPaymentId } } })).status, 'OVERDUE');
    assert.equal((await prisma.sponsoredSeatBatch.findUniqueOrThrow({ where: { id: batch.id } })).status, 'PAST_DUE');
    const installmentId = `pay-installment-next-${runId}`;
    await repository.applyPaymentEvent({ environment: 'SANDBOX', eventId: `evt-installment-paid-${runId}`, eventType: 'PAYMENT_CONFIRMED', occurredAt: new Date('2026-11-22T12:00:00.000Z'), payload: { payment: { ...paymentPayload.payment, id: installmentId } } });
    assert.equal((await prisma.sponsoredSeatPayment.findUniqueOrThrow({ where: { environment_providerPaymentId: { environment: 'SANDBOX', providerPaymentId: installmentId } } })).servicePeriodEnd?.toISOString(), '2027-10-20T12:00:00.000Z');
    const seat = await prisma.sponsoredSeat.findFirstOrThrow({ where: { batchId: batch.id } });
    const batchAfterInstallment = await prisma.sponsoredSeatBatch.findUniqueOrThrow({ where: { id: batch.id } });
    assert.equal(seat.status, 'PAID_UNCLAIMED');
    assert.equal(seat.endsAt?.toISOString(), '2027-10-20T12:00:00.000Z');
    assert.equal(batchAfterInstallment.status, 'PAST_DUE');
    assert.equal(batchAfterInstallment.currentPeriodEnd?.toISOString(), '2027-10-20T12:00:00.000Z');
  } finally {
    await prisma.sponsoredSeatBatch.delete({ where: { id: batch.id } });
    await prisma.monitor.delete({ where: { id: monitor.id } });
    await prisma.teacher.delete({ where: { id: teacher.id } });
  }
});

test('CHECKOUT_PAID recorrente patrocinado não libera acesso antes da confirmação financeira', { skip: !canRun }, async () => {
  const runId = randomUUID();
  const teacher = await prisma.teacher.create({ data: { userId: randomUUID(), fullName: 'Professor recorrente', email: `monthly-${runId}@example.test`, username: `monthly-${runId}`, area: 'Física', pageSlug: `monthly-${runId}`, termsAcceptedAt: new Date() } });
  const monitor = await prisma.monitor.create({ data: { teacherId: teacher.id, name: `Monitor mensal ${runId}`, status: 'PUBLISHED' } });
  const batch = await prisma.sponsoredSeatBatch.create({ data: {
    teacherId: teacher.id, monitorId: monitor.id, environment: 'SANDBOX', billingInterval: 'MONTHLY', serviceMonths: 1,
    seatCount: 1, grossPriceCents: 5990, platformAmountCents: 2995, teacherPercentage: 50, totalAmountCents: 2995,
    externalReference: `sponsored-monthly-${runId}`, idempotencyKey: `key-${runId}`, requestFingerprint: `fingerprint-${runId}`, providerCheckoutId: `checkout-${runId}`,
    seats: { create: [{ emailNormalized: `only-${runId}@example.test` }] },
  } });
  try {
    await new PaymentEventRepository().applyCheckoutEvent({ environment: 'SANDBOX', eventId: `evt-monthly-${runId}`, eventType: 'CHECKOUT_PAID', occurredAt: new Date(), payload: { checkout: { id: `checkout-${runId}` } } });
    const updated = await prisma.sponsoredSeatBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { seats: true } });
    assert.equal(updated.status, 'CHECKOUT_PAID_PENDING_PAYMENT');
    assert.equal(updated.seats[0]?.status, 'PENDING_PAYMENT');
    assert.equal(updated.seats[0]?.endsAt, null);
  } finally {
    await prisma.sponsoredSeatBatch.delete({ where: { id: batch.id } });
    await prisma.monitor.delete({ where: { id: monitor.id } });
    await prisma.teacher.delete({ where: { id: teacher.id } });
  }
});

test('SUBSCRIPTION_CREATED correlaciona por externalReference e guarda o ID do Asaas', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  const providerSubscriptionId = `sub-provider-${fixture.runId}`;
  try {
    await prisma.paymentSubscription.update({ where: { id: fixture.subscription.id }, data: { providerSubscriptionId: null } });
    const result = await repository.applySubscriptionEvent({
      environment: 'SANDBOX', eventId: `evt-sub-${fixture.runId}`, eventType: 'SUBSCRIPTION_CREATED',
      occurredAt: new Date(),
      payload: { subscription: { id: providerSubscriptionId, externalReference: fixture.externalReference, nextDueDate: '2026-11-01' } },
    });

    assert.equal(result.updatedRows, 1);
    const saved = await prisma.paymentSubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
    assert.equal(saved.providerSubscriptionId, providerSubscriptionId);
    assert.equal(saved.status, 'PENDING');
  } finally {
    await removeFixture(fixture);
  }
});

test('PAYMENT_SPLIT_DONE liquida só o split vinculado e não altera o estado da cobrança nem do aluno', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  const providerPaymentId = `pay-split-${fixture.runId}`;
  const providerSplitId = `split-${fixture.runId}`;
  try {
    await repository.applyPaymentEvent({
      environment: 'SANDBOX', eventId: `evt-charge-${fixture.runId}`, eventType: 'PAYMENT_RECEIVED',
      occurredAt: new Date('2026-10-01T00:00:00.000Z'),
      payload: { payment: {
        id: providerPaymentId, externalReference: fixture.externalReference,
        subscription: fixture.subscription.providerSubscriptionId, value: 59.9, paymentDate: '2026-10-01',
        split: [{ id: providerSplitId, walletId: 'wallet-test', totalValue: 29.95, status: 'PENDING' }],
      } },
    });
    const beforeCharge = await prisma.paymentCharge.findFirstOrThrow({ where: { environment: 'SANDBOX', providerPaymentId } });
    const beforeSubscription = await prisma.paymentSubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });

    const result = await repository.applySplitEvent({
      environment: 'SANDBOX', eventId: `evt-split-${fixture.runId}`, eventType: 'PAYMENT_SPLIT_DONE',
      occurredAt: new Date(), payload: { payment: { id: providerPaymentId }, additionalInfo: { splitId: providerSplitId } },
    });

    assert.equal(result.updatedRows, 1);
    const afterSplit = await prisma.paymentSplit.findFirstOrThrow({ where: { providerSplitId } });
    const afterCharge = await prisma.paymentCharge.findUniqueOrThrow({ where: { id: beforeCharge.id } });
    const afterSubscription = await prisma.paymentSubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
    assert.equal(afterSplit.status, 'SETTLED');
    assert.equal(afterSplit.settledCents, 2995);
    assert.equal(afterCharge.status, beforeCharge.status);
    assert.equal(afterSubscription.status, beforeSubscription.status);
    assert.equal((await prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } })).status, 'ACTIVE');
  } finally {
    await removeFixture(fixture);
  }
});

test('recebimento atrasado não desfaz estorno nem reabre o acesso do aluno', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  const providerPaymentId = `pay-refunded-${fixture.runId}`;
  const paymentPayload = { payment: {
    id: providerPaymentId, externalReference: fixture.externalReference,
    subscription: fixture.subscription.providerSubscriptionId, value: 59.9,
    paymentDate: '2026-09-10T00:00:00.000Z',
  } };
  try {
    await repository.applyPaymentEvent({
      environment: 'SANDBOX', eventId: `evt-paid-${fixture.runId}`, eventType: 'PAYMENT_RECEIVED',
      occurredAt: new Date('2026-09-10T00:01:00.000Z'), payload: paymentPayload,
    });
    await repository.applySubscriptionEvent({
      environment: 'SANDBOX', eventId: `evt-refund-${fixture.runId}`, eventType: 'PAYMENT_REFUNDED',
      occurredAt: new Date('2026-09-12T00:00:00.000Z'), payload: paymentPayload,
    });
    const lateReceipt = await repository.applyPaymentEvent({
      environment: 'SANDBOX', eventId: `evt-late-paid-${fixture.runId}`, eventType: 'PAYMENT_RECEIVED',
      occurredAt: new Date('2026-09-10T00:01:00.000Z'), payload: paymentPayload,
    });

    assert.equal(lateReceipt.accessGranted, false);
    assert.equal(lateReceipt.state, 'PAYMENT_TERMINAL_NO_ACCESS');
    assert.equal((await prisma.paymentCharge.findFirstOrThrow({ where: { environment: 'SANDBOX', providerPaymentId } })).status, 'REFUNDED');
    assert.equal((await prisma.studentSubscription.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } })).status, 'cancelled');
    assert.equal((await prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } })).status, 'REMOVED');
  } finally {
    await removeFixture(fixture);
  }
});

test('PAYMENT_CREATED registra cobrança pendente sem liberar o acesso', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  const providerPaymentId = `pay-created-${fixture.runId}`;
  try {
    await prisma.studentSubscription.update({
      where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } },
      data: { status: 'cancelled' },
    });
    await prisma.studentEnrollment.update({
      where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } },
      data: { status: 'REMOVED' },
    });
    const result = await repository.applyPaymentEvent({
      environment: 'SANDBOX', eventId: `evt-created-${fixture.runId}`, eventType: 'PAYMENT_CREATED',
      occurredAt: new Date('2026-10-26T10:00:00.000Z'),
      payload: { payment: { id: providerPaymentId, externalReference: fixture.externalReference, subscription: fixture.subscription.providerSubscriptionId, value: 59.9, dueDate: '2026-10-30' } },
    });

    assert.equal(result.accessGranted, false);
    assert.equal(result.state, 'PAYMENT_STATE_APPLIED');
    assert.equal((await prisma.paymentCharge.findFirstOrThrow({ where: { environment: 'SANDBOX', providerPaymentId } })).status, 'PENDING');
    assert.equal((await prisma.studentSubscription.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } })).status, 'cancelled');
    assert.equal((await prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } })).status, 'REMOVED');
  } finally {
    await removeFixture(fixture);
  }
});

test('recusa da captura de cartão não libera acesso nem marca a cobrança recebida', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  const providerPaymentId = `pay-refused-${fixture.runId}`;
  try {
    await prisma.studentSubscription.update({
      where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } },
      data: { status: 'cancelled' },
    });
    await prisma.studentEnrollment.update({
      where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } },
      data: { status: 'REMOVED' },
    });
    const result = await repository.applyPaymentEvent({
      environment: 'SANDBOX', eventId: `evt-refused-${fixture.runId}`, eventType: 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
      occurredAt: new Date('2026-10-26T10:00:00.000Z'),
      payload: { payment: { id: providerPaymentId, externalReference: fixture.externalReference, subscription: fixture.subscription.providerSubscriptionId, value: 59.9 } },
    });

    assert.equal(result.accessGranted, false);
    assert.equal(result.state, 'PAYMENT_STATE_APPLIED');
    assert.equal((await prisma.paymentCharge.findFirstOrThrow({ where: { environment: 'SANDBOX', providerPaymentId } })).status, 'CAPTURE_REFUSED');
    assert.equal((await prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } })).status, 'REMOVED');
  } finally {
    await removeFixture(fixture);
  }
});

test('chargeback vencido em favor da integração permite restaurar acesso após novo recebimento', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  const providerPaymentId = `pay-chargeback-${fixture.runId}`;
  const payload = { payment: {
    id: providerPaymentId, externalReference: fixture.externalReference,
    subscription: fixture.subscription.providerSubscriptionId, value: 59.9,
    paymentDate: '2026-10-01T00:00:00.000Z',
  } };
  try {
    await repository.applyPaymentEvent({
      environment: 'SANDBOX', eventId: `evt-received-${fixture.runId}`, eventType: 'PAYMENT_RECEIVED',
      occurredAt: new Date('2026-10-01T00:01:00.000Z'), payload,
    });
    await repository.applySubscriptionEvent({
      environment: 'SANDBOX', eventId: `evt-chargeback-${fixture.runId}`, eventType: 'PAYMENT_CHARGEBACK_REQUESTED',
      occurredAt: new Date('2026-10-05T00:00:00.000Z'), payload,
    });
    await repository.applySubscriptionEvent({
      environment: 'SANDBOX', eventId: `evt-dispute-${fixture.runId}`, eventType: 'PAYMENT_CHARGEBACK_DISPUTE',
      occurredAt: new Date('2026-10-06T00:00:00.000Z'), payload,
    });
    await repository.applySubscriptionEvent({
      environment: 'SANDBOX', eventId: `evt-reversal-pending-${fixture.runId}`, eventType: 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
      occurredAt: new Date('2026-10-08T00:00:00.000Z'), payload,
    });
    const recovered = await repository.applyPaymentEvent({
      environment: 'SANDBOX', eventId: `evt-recovered-${fixture.runId}`, eventType: 'PAYMENT_RECEIVED',
      occurredAt: new Date('2026-10-10T00:00:00.000Z'), payload,
    });

    assert.equal(recovered.accessGranted, true);
    assert.equal(recovered.state, 'PAYMENT_ACCESS_APPLIED');
    assert.equal((await prisma.paymentCharge.findFirstOrThrow({ where: { environment: 'SANDBOX', providerPaymentId } })).status, 'RECEIVED');
    assert.equal((await prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } })).status, 'ACTIVE');
  } finally {
    await removeFixture(fixture);
  }
});

test('recebimento não reabre acesso após chargeback sem evento de reversão', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  const providerPaymentId = `pay-chargeback-pending-${fixture.runId}`;
  const payload = { payment: {
    id: providerPaymentId, externalReference: fixture.externalReference,
    subscription: fixture.subscription.providerSubscriptionId, value: 59.9,
    paymentDate: '2026-10-01T00:00:00.000Z',
  } };
  try {
    await repository.applyPaymentEvent({ environment: 'SANDBOX', eventId: `evt-paid-${fixture.runId}`, eventType: 'PAYMENT_RECEIVED', occurredAt: new Date('2026-10-01T00:01:00Z'), payload });
    await repository.applySubscriptionEvent({ environment: 'SANDBOX', eventId: `evt-chargeback-${fixture.runId}`, eventType: 'PAYMENT_CHARGEBACK_REQUESTED', occurredAt: new Date('2026-10-05T00:00:00Z'), payload });
    const lateReceipt = await repository.applyPaymentEvent({ environment: 'SANDBOX', eventId: `evt-late-paid-${fixture.runId}`, eventType: 'PAYMENT_RECEIVED', occurredAt: new Date('2026-10-06T00:00:00Z'), payload });

    assert.equal(lateReceipt.accessGranted, false);
    assert.equal((await prisma.paymentCharge.findFirstOrThrow({ where: { environment: 'SANDBOX', providerPaymentId } })).status, 'CHARGEBACK');
    assert.equal((await prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } })).status, 'REMOVED');
  } finally {
    await removeFixture(fixture);
  }
});

test('pagamento diferente não reabre assinatura bloqueada por chargeback', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  const disputedPayment = { payment: {
    id: `pay-disputed-${fixture.runId}`, externalReference: fixture.externalReference,
    subscription: fixture.subscription.providerSubscriptionId, value: 59.9,
  } };
  try {
    await repository.applyPaymentEvent({ environment: 'SANDBOX', eventId: `evt-paid-${fixture.runId}`, eventType: 'PAYMENT_RECEIVED', occurredAt: new Date('2026-10-01T00:00:00Z'), payload: disputedPayment });
    await repository.applySubscriptionEvent({ environment: 'SANDBOX', eventId: `evt-chargeback-${fixture.runId}`, eventType: 'PAYMENT_CHARGEBACK_REQUESTED', occurredAt: new Date('2026-10-02T00:00:00Z'), payload: disputedPayment });
    const unrelatedPayment = await repository.applyPaymentEvent({
      environment: 'SANDBOX', eventId: `evt-other-payment-${fixture.runId}`, eventType: 'PAYMENT_RECEIVED', occurredAt: new Date('2026-10-03T00:00:00Z'),
      payload: { payment: { ...disputedPayment.payment, id: `pay-other-${fixture.runId}` } },
    });

    assert.equal(unrelatedPayment.accessGranted, false);
    assert.equal((await prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } })).status, 'REMOVED');
  } finally {
    await removeFixture(fixture);
  }
});

test('PAYMENT_SPLIT_CANCELLED atualiza somente o split correspondente', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  const providerPaymentId = `pay-split-cancel-${fixture.runId}`;
  const providerSplitId = `split-cancel-${fixture.runId}`;
  try {
    await repository.applyPaymentEvent({
      environment: 'SANDBOX', eventId: `evt-charge-${fixture.runId}`, eventType: 'PAYMENT_RECEIVED',
      occurredAt: new Date('2026-10-01T00:00:00.000Z'),
      payload: { payment: {
        id: providerPaymentId, externalReference: fixture.externalReference,
        subscription: fixture.subscription.providerSubscriptionId, value: 59.9,
        split: [{ id: providerSplitId, walletId: 'wallet-test', totalValue: 29.95, status: 'PENDING' }],
      } },
    });
    const result = await repository.applySplitEvent({
      environment: 'SANDBOX', eventId: `evt-split-cancel-${fixture.runId}`, eventType: 'PAYMENT_SPLIT_CANCELLED',
      occurredAt: new Date(), payload: { payment: { id: providerPaymentId }, additionalInfo: { splitId: providerSplitId } },
    });

    assert.equal(result.updatedRows, 1);
    assert.equal((await prisma.paymentSplit.findFirstOrThrow({ where: { providerSplitId } })).status, 'CANCELLED');
    assert.equal((await prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } })).status, 'ACTIVE');
  } finally {
    await removeFixture(fixture);
  }
});

test('evento antigo de bloqueio não regride um split cuja divergência terminou', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  const providerPaymentId = `pay-split-finished-${fixture.runId}`;
  const providerSplitId = `split-finished-${fixture.runId}`;
  try {
    await repository.applyPaymentEvent({
      environment: 'SANDBOX', eventId: `evt-charge-${fixture.runId}`, eventType: 'PAYMENT_RECEIVED', occurredAt: new Date(),
      payload: { payment: { id: providerPaymentId, externalReference: fixture.externalReference, subscription: fixture.subscription.providerSubscriptionId, value: 59.9, split: [{ id: providerSplitId, walletId: 'wallet-test', totalValue: 29.95 }] } },
    });
    for (const eventType of ['PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED', 'PAYMENT_SPLIT_DIVERGENCE_BLOCK']) {
      await repository.applySplitEvent({
        environment: 'SANDBOX', eventId: `evt-${eventType}-${fixture.runId}`, eventType,
        occurredAt: new Date(), payload: { payment: { id: providerPaymentId }, additionalInfo: { splitId: providerSplitId } },
      });
    }

    assert.equal((await prisma.paymentSplit.findFirstOrThrow({ where: { providerSplitId } })).status, 'DIVERGENCE_BLOCK_FINISHED');
  } finally {
    await removeFixture(fixture);
  }
});

test('estorno em progresso e negado não revogam o acesso', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  const providerPaymentId = `pay-refund-denied-${fixture.runId}`;
  const payload = { payment: {
    id: providerPaymentId, externalReference: fixture.externalReference,
    subscription: fixture.subscription.providerSubscriptionId, value: 59.9,
  } };
  try {
    await repository.applyPaymentLifecycleEvent({ environment: 'SANDBOX', eventId: `evt-refund-progress-${fixture.runId}`, eventType: 'PAYMENT_REFUND_IN_PROGRESS', payload, occurredAt: new Date('2026-10-01T00:00:00Z') });
    await repository.applyPaymentLifecycleEvent({ environment: 'SANDBOX', eventId: `evt-refund-denied-${fixture.runId}`, eventType: 'PAYMENT_REFUND_DENIED', payload, occurredAt: new Date('2026-10-02T00:00:00Z') });

    assert.equal((await prisma.paymentCharge.findFirstOrThrow({ where: { environment: 'SANDBOX', providerPaymentId } })).status, 'REFUND_DENIED');
    assert.equal((await prisma.studentSubscription.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } })).status, 'active');
    assert.equal((await prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } })).status, 'ACTIVE');
  } finally {
    await removeFixture(fixture);
  }
});

test('evento antigo não regride o estado financeiro mais recente', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  const providerPaymentId = `pay-out-of-order-${fixture.runId}`;
  const payload = { payment: { id: providerPaymentId, externalReference: fixture.externalReference, value: 59.9 } };
  try {
    await repository.applyPaymentLifecycleEvent({ environment: 'SANDBOX', eventId: `evt-new-${fixture.runId}`, eventType: 'PAYMENT_UPDATED', payload: { payment: { ...payload.payment, status: 'OVERDUE' } }, occurredAt: new Date('2026-10-10T00:00:00Z') });
    await repository.applyPaymentLifecycleEvent({ environment: 'SANDBOX', eventId: `evt-old-${fixture.runId}`, eventType: 'PAYMENT_CREATED', payload, occurredAt: new Date('2026-10-09T00:00:00Z') });

    const charge = await prisma.paymentCharge.findFirstOrThrow({ where: { environment: 'SANDBOX', providerPaymentId } });
    assert.equal(charge.status, 'OVERDUE');
    assert.equal(charge.lastProviderEventId, `evt-new-${fixture.runId}`);
  } finally {
    await removeFixture(fixture);
  }
});

test('PAYMENT_UPDATED sincroniza valor e vencimento sem modificar acesso', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  const providerPaymentId = `pay-updated-${fixture.runId}`;
  const basePayload = { payment: { id: providerPaymentId, externalReference: fixture.externalReference, value: 59.9, dueDate: '2026-10-30' } };
  try {
    await repository.applyPaymentLifecycleEvent({ environment: 'SANDBOX', eventId: `evt-created-${fixture.runId}`, eventType: 'PAYMENT_CREATED', payload: basePayload, occurredAt: new Date('2026-10-01T00:00:00Z') });
    await repository.applyPaymentLifecycleEvent({ environment: 'SANDBOX', eventId: `evt-updated-${fixture.runId}`, eventType: 'PAYMENT_UPDATED', payload: { payment: { ...basePayload.payment, value: 71.5, dueDate: '2026-11-01', status: 'PENDING' } }, occurredAt: new Date('2026-10-02T00:00:00Z') });

    const charge = await prisma.paymentCharge.findFirstOrThrow({ where: { environment: 'SANDBOX', providerPaymentId } });
    assert.equal(charge.grossCents, 7150);
    assert.equal(charge.dueDate?.toISOString(), '2026-11-01T00:00:00.000Z');
    assert.equal((await prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } })).status, 'ACTIVE');
  } finally {
    await removeFixture(fixture);
  }
});

test('remoção e restauração de cobrança não concedem nem removem acesso por si', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  const providerPaymentId = `pay-restored-${fixture.runId}`;
  const payload = { payment: { id: providerPaymentId, externalReference: fixture.externalReference, value: 59.9 } };
  try {
    await prisma.studentSubscription.update({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } }, data: { status: 'cancelled' } });
    await prisma.studentEnrollment.update({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } }, data: { status: 'REMOVED' } });
    await repository.applyPaymentLifecycleEvent({ environment: 'SANDBOX', eventId: `evt-deleted-${fixture.runId}`, eventType: 'PAYMENT_DELETED', payload, occurredAt: new Date('2026-10-01T00:00:00Z') });
    await repository.applyPaymentLifecycleEvent({ environment: 'SANDBOX', eventId: `evt-restored-${fixture.runId}`, eventType: 'PAYMENT_RESTORED', payload, occurredAt: new Date('2026-10-02T00:00:00Z') });

    assert.equal((await prisma.paymentCharge.findFirstOrThrow({ where: { environment: 'SANDBOX', providerPaymentId } })).status, 'PENDING');
    assert.equal((await prisma.studentSubscription.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } })).status, 'cancelled');
    assert.equal((await prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } })).status, 'REMOVED');
  } finally {
    await removeFixture(fixture);
  }
});

test('estorno parcial marca a cobrança sem revogar a assinatura inteira', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  const providerPaymentId = `pay-partial-refund-${fixture.runId}`;
  const payload = { payment: { id: providerPaymentId, externalReference: fixture.externalReference, subscription: fixture.subscription.providerSubscriptionId, value: 59.9 } };
  try {
    await repository.applyPaymentEvent({ environment: 'SANDBOX', eventId: `evt-paid-${fixture.runId}`, eventType: 'PAYMENT_RECEIVED', payload, occurredAt: new Date('2026-10-01T00:00:00Z') });
    await repository.applySubscriptionEvent({ environment: 'SANDBOX', eventId: `evt-partial-refund-${fixture.runId}`, eventType: 'PAYMENT_PARTIALLY_REFUNDED', payload, occurredAt: new Date('2026-10-02T00:00:00Z') });

    assert.equal((await prisma.paymentCharge.findFirstOrThrow({ where: { environment: 'SANDBOX', providerPaymentId } })).status, 'PARTIALLY_REFUNDED');
    assert.equal((await prisma.paymentSubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } })).status, 'ACTIVE');
    assert.equal((await prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } })).status, 'ACTIVE');
  } finally {
    await removeFixture(fixture);
  }
});

test('divergência de split de assinatura persiste em dimensão separada do acesso', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  try {
    await repository.applySubscriptionEvent({
      environment: 'SANDBOX', eventId: `evt-sub-split-${fixture.runId}`, eventType: 'SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK',
      occurredAt: new Date(), payload: { subscription: { id: fixture.subscription.providerSubscriptionId } },
    });

    const subscription = await prisma.paymentSubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
    assert.equal(subscription.splitStatus, 'DIVERGENCE_BLOCKED');
    assert.equal(subscription.status, 'PENDING');
    assert.equal((await prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } })).status, 'ACTIVE');
  } finally {
    await removeFixture(fixture);
  }
});

test('evento antigo de assinatura não reabre estado cancelado', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  try {
    await repository.applySubscriptionEvent({
      environment: 'SANDBOX', eventId: `evt-sub-deleted-new-${fixture.runId}`, eventType: 'SUBSCRIPTION_DELETED',
      occurredAt: new Date('2026-10-10T00:00:00Z'), payload: { subscription: { id: fixture.subscription.providerSubscriptionId } },
    });
    await repository.applySubscriptionEvent({
      environment: 'SANDBOX', eventId: `evt-sub-updated-old-${fixture.runId}`, eventType: 'SUBSCRIPTION_UPDATED',
      occurredAt: new Date('2026-10-09T00:00:00Z'), payload: { subscription: { id: fixture.subscription.providerSubscriptionId, nextDueDate: '2026-11-01' } },
    });

    const subscription = await prisma.paymentSubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
    assert.equal(subscription.status, 'CANCELLED');
    assert.equal(subscription.lastProviderEventId, `evt-sub-deleted-new-${fixture.runId}`);
  } finally {
    await removeFixture(fixture);
  }
});

test('remoção de assinatura preserva acesso até o período pago terminar e estorno revoga acesso na hora', { skip: !canRun }, async () => {
  const fixture = await createFixture();
  const repository = new PaymentEventRepository();
  try {
    await repository.applySubscriptionEvent({
      environment: 'SANDBOX', eventId: `evt-delete-${fixture.runId}`, eventType: 'SUBSCRIPTION_DELETED',
      occurredAt: new Date('2026-09-20T00:00:00.000Z'),
      payload: { subscription: { id: fixture.subscription.providerSubscriptionId } },
    });
    let studentSubscription = await prisma.studentSubscription.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } });
    let enrollment = await prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } });
    assert.equal(studentSubscription.status, 'active');
    assert.equal(studentSubscription.expiresAt?.toISOString(), '2026-10-01T00:00:00.000Z');
    assert.equal(enrollment.status, 'ACTIVE');
    assert.equal(enrollment.endsAt?.toISOString(), '2026-10-01T00:00:00.000Z');

    await prisma.paymentSubscription.update({ where: { id: fixture.subscription.id }, data: { providerSubscriptionId: `sub-refund-${fixture.runId}` } });
    await repository.applySubscriptionEvent({
      environment: 'SANDBOX', eventId: `evt-refund-${fixture.runId}`, eventType: 'PAYMENT_REFUNDED',
      occurredAt: new Date('2026-09-21T00:00:00.000Z'),
      payload: { payment: { id: `pay-refund-${fixture.runId}`, subscription: `sub-refund-${fixture.runId}` } },
    });
    studentSubscription = await prisma.studentSubscription.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } });
    enrollment = await prisma.studentEnrollment.findUniqueOrThrow({ where: { studentId_monitorId: { studentId: fixture.student.id, monitorId: fixture.monitor.id } } });
    assert.equal(studentSubscription.status, 'cancelled');
    assert.equal(studentSubscription.expiresAt?.toISOString(), '2026-09-21T00:00:00.000Z');
    assert.equal(enrollment.status, 'REMOVED');
    assert.equal(enrollment.endsAt?.toISOString(), '2026-09-21T00:00:00.000Z');
  } finally {
    await removeFixture(fixture);
  }
});
