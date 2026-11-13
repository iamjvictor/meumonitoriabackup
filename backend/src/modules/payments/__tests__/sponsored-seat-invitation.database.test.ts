import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { prisma } from '../../../lib/prisma.js';
import { PrismaSponsoredSeatInvitationRepository } from '../infrastructure/persistence/sponsored-seat-invitation.repository.js';
import { PrismaSponsoredSeatClaimRepository } from '../infrastructure/persistence/sponsored-seat-claim.repository.js';

const databaseUrl = process.env.PAYMENTS_TEST_DATABASE_URL;
const canRun = Boolean(databaseUrl && process.env.DATABASE_URL === databaseUrl && databaseUrl.includes('mm_asaas_flow_test'));
const repository = new PrismaSponsoredSeatInvitationRepository();
after(async () => { if (canRun) await prisma.$disconnect(); });

async function fixture(interval: 'MONTHLY' | 'ANNUAL', environment: 'SANDBOX' | 'PRODUCTION' = 'SANDBOX') {
  const runId = randomUUID();
  const userId = randomUUID();
  const now = new Date();
  const teacher = await prisma.teacher.create({ data: {
    userId, fullName: 'Professor Convite', email: `teacher-${runId}@example.test`, username: `invitation-${runId}`,
    area: 'Matemática', pageSlug: `invitation-${runId}`, termsAcceptedAt: now, teacherPercentage: 40,
  } });
  const monitor = await prisma.monitor.create({ data: { teacherId: teacher.id, name: 'Monitor Convite', status: 'PUBLISHED', priceCents: 10000 } });
  const batch = await prisma.sponsoredSeatBatch.create({ data: {
    teacherId: teacher.id, monitorId: monitor.id, environment, billingInterval: interval, billingType: 'CREDIT_CARD', serviceMonths: interval === 'MONTHLY' ? 1 : 12,
    status: 'ACTIVE', seatCount: 1, grossPriceCents: 10000, platformAmountCents: 6000, teacherPercentage: 40, totalAmountCents: 6000,
    externalReference: randomUUID(), idempotencyKey: randomUUID(), requestFingerprint: randomUUID(), paidAt: now,
    currentPeriodStart: new Date(now.getTime() - 60_000), currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
  } });
  const email = `student-${runId}@example.test`;
  const seat = await prisma.sponsoredSeat.create({ data: {
    batchId: batch.id, emailNormalized: email, status: 'PAID_UNCLAIMED',
    startsAt: new Date(now.getTime() - 60_000), endsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
  } });
  const student = await prisma.student.create({ data: { userId: randomUUID(), fullName: 'Aluno Convite', email } });
  return { teacher, monitor, batch, seat, student, email, userId, now };
}

async function cleanup(data: Awaited<ReturnType<typeof fixture>>) {
  await prisma.sponsoredSeatBatch.deleteMany({ where: { id: data.batch.id } });
  await prisma.student.deleteMany({ where: { id: data.student.id } });
  await prisma.monitor.deleteMany({ where: { id: data.monitor.id } });
  await prisma.teacher.deleteMany({ where: { id: data.teacher.id } });
}

test('resolve lotes mensais e anuais ativos usando os dados reais da vaga', { skip: !canRun }, async () => {
  for (const interval of ['MONTHLY', 'ANNUAL'] as const) {
    const data = await fixture(interval);
    try {
      const tokenHash = `hash-${randomUUID()}`;
      await repository.issue({ teacherUserId: data.userId, batchId: data.batch.id, seatId: data.seat.id, tokenHash, expiresAt: new Date(data.now.getTime() + 30 * 24 * 60 * 60 * 1000), now: data.now });
      const resolved = await repository.resolve(tokenHash, data.now);
      assert.equal(resolved?.email, data.email);
      assert.equal(resolved?.teacherName, 'Professor Convite');
      assert.equal(resolved?.monitorName, 'Monitor Convite');
      assert.equal(resolved?.interval, interval);
    } finally { await cleanup(data); }
  }
});

test('guarda somente hash, reemissão invalida o anterior e repetição do resgate não duplica vínculo', { skip: !canRun }, async () => {
  const data = await fixture('MONTHLY');
  try {
    const oldHash = `old-${randomUUID()}`;
    const currentHash = `current-${randomUUID()}`;
    const expiresAt = new Date(data.now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await repository.issue({ teacherUserId: data.userId, batchId: data.batch.id, seatId: data.seat.id, tokenHash: oldHash, expiresAt, now: data.now });
    await repository.issue({ teacherUserId: data.userId, batchId: data.batch.id, seatId: data.seat.id, tokenHash: currentHash, expiresAt, now: data.now });
    const persisted = await prisma.sponsoredSeatInvitation.findUniqueOrThrow({ where: { seatId: data.seat.id } });
    assert.equal(persisted.tokenHash, currentHash);
    assert.notEqual(persisted.tokenHash, 'current-token');
    assert.equal(await repository.resolve(oldHash, data.now), null);
    assert.ok(await repository.resolve(currentHash, data.now));

    const first = await repository.redeem({ tokenHash: currentHash, studentUserId: data.student.userId, email: data.email, now: data.now });
    assert.equal(first.claimedCount, 1);
    await assert.rejects(() => repository.redeem({ tokenHash: currentHash, studentUserId: data.student.userId, email: data.email, now: data.now }));
    const seat = await prisma.sponsoredSeat.findUniqueOrThrow({ where: { id: data.seat.id } });
    assert.equal(seat.studentId, data.student.id);
    assert.equal(seat.status, 'ACTIVE');
    assert.equal(await prisma.studentSubscription.count({ where: { studentId: data.student.id, monitorId: data.monitor.id } }), 0);
    assert.equal(await prisma.studentEnrollment.count({ where: { studentId: data.student.id, monitorId: data.monitor.id } }), 0);
  } finally { await cleanup(data); }
});

test('claim legado vincula vaga patrocinada sem criar enrollment incompatível com a constraint de pagamento', { skip: !canRun }, async () => {
  const data = await fixture('MONTHLY');
  try {
    const result = await new PrismaSponsoredSeatClaimRepository().claimPaidSeats({ studentUserId: data.student.userId, emailNormalized: data.email });
    assert.deepEqual(result, { claimedCount: 1, monitorIds: [data.monitor.id] });
    const seat = await prisma.sponsoredSeat.findUniqueOrThrow({ where: { id: data.seat.id } });
    assert.equal(seat.studentId, data.student.id);
    assert.equal(seat.status, 'ACTIVE');
    assert.equal(await prisma.studentSubscription.count({ where: { studentId: data.student.id, monitorId: data.monitor.id } }), 0);
    assert.equal(await prisma.studentEnrollment.count({ where: { studentId: data.student.id, monitorId: data.monitor.id } }), 0);
  } finally { await cleanup(data); }
});

test('preserva a projeção StudentSubscription para vagas de produção', { skip: !canRun }, async () => {
  const data = await fixture('ANNUAL', 'PRODUCTION');
  try {
    const tokenHash = `production-${randomUUID()}`;
    const repository = new PrismaSponsoredSeatInvitationRepository(undefined, prisma, 'PRODUCTION');
    await repository.issue({ teacherUserId: data.userId, batchId: data.batch.id, seatId: data.seat.id, tokenHash, expiresAt: new Date(data.now.getTime() + 30 * 24 * 60 * 60 * 1000), now: data.now });
    const result = await repository.redeem({ tokenHash, studentUserId: data.student.userId, email: data.email, now: data.now });
    assert.equal(result.claimedCount, 1);
    assert.equal(await prisma.studentSubscription.count({ where: { studentId: data.student.id, monitorId: data.monitor.id } }), 1);
    assert.equal(await prisma.studentEnrollment.count({ where: { studentId: data.student.id, monitorId: data.monitor.id } }), 0);
  } finally { await cleanup(data); }
});

test('não emite convite para lote de outro professor ou vaga não paga', { skip: !canRun }, async () => {
  const data = await fixture('MONTHLY');
  try {
    await assert.rejects(() => repository.issue({ teacherUserId: randomUUID(), batchId: data.batch.id, seatId: data.seat.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 100_000), now: new Date() }));
    await prisma.sponsoredSeat.update({ where: { id: data.seat.id }, data: { status: 'PENDING_PAYMENT' } });
    await assert.rejects(() => repository.issue({ teacherUserId: data.userId, batchId: data.batch.id, seatId: data.seat.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 100_000), now: new Date() }));
  } finally { await cleanup(data); }
});
