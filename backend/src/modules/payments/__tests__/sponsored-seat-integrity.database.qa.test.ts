import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { prisma } from '../../../lib/prisma.js';
import { DailyChallengeRepository } from '../../daily_challgens/repositories/daily-challenge.repository.js';
import { PrismaChatAccessRepository } from '../../chat/repositories/prisma-chat-access.repository.js';
import { PaymentEntitlementRepository } from '../../access/infrastructure/payment-entitlement.repository.js';
import { PrismaStudentAccessRepository } from '../../student-access/student-access.repository.js';
import { createStudentAccessService } from '../../student-access/student-access.service.js';
import { SponsoredSeatInvitationUseCase } from '../application/commands/sponsored-seat-invitation.use-case.js';
import { PrismaSponsoredSeatInvitationRepository } from '../infrastructure/persistence/sponsored-seat-invitation.repository.js';

const databaseUrl = process.env.PAYMENTS_TEST_DATABASE_URL;
const isolatedDatabase = Boolean(databaseUrl && process.env.DATABASE_URL === databaseUrl && databaseUrl.includes('mm_asaas_flow_test'));
const environment = (process.env.ASAAS_ENV || 'sandbox').toUpperCase();
const repository = new PrismaSponsoredSeatInvitationRepository(undefined, prisma, environment);
after(async () => { if (isolatedDatabase) await prisma.$disconnect(); });

async function requireRealConstraint() {
  assert.equal(isolatedDatabase, true, 'refusing any database not explicitly configured as isolated payment-test DB');
  const constraints = await prisma.$queryRaw<Array<{ convalidated: boolean; definition: string }>>`
    SELECT convalidated, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'student_enrollments'::regclass
      AND conname = 'student_enrollments_one_payment_bridge_check'
  `;
  assert.equal(constraints.length, 1, 'the manually installed production check constraint must be present');
  assert.equal(constraints[0]!.convalidated, true);
  assert.match(constraints[0]!.definition, /subscription_item_id IS NOT NULL/);
  assert.match(constraints[0]!.definition, /payment_subscription_item_id IS NOT NULL/);
}

async function fixture(batchEnvironment: 'SANDBOX' | 'PRODUCTION' = 'SANDBOX', createInitialStudent = true) {
  const runId = randomUUID();
  const now = new Date();
  const teacher = await prisma.teacher.create({ data: {
    userId: randomUUID(), fullName: 'QA Professor', email: `teacher-${runId}@example.test`, username: `qa-${runId}`,
    area: 'Matemática', pageSlug: `qa-${runId}`, termsAcceptedAt: now, teacherPercentage: 40,
  } });
  const monitor = await prisma.monitor.create({ data: { teacherId: teacher.id, name: `QA Monitor ${runId}`, status: 'PUBLISHED', priceCents: 10000 } });
  const batch = await prisma.sponsoredSeatBatch.create({ data: {
    teacherId: teacher.id, monitorId: monitor.id, environment: batchEnvironment, billingInterval: 'ANNUAL', billingType: 'PIX', serviceMonths: 12,
    status: 'ACTIVE', seatCount: 1, grossPriceCents: 10000, platformAmountCents: 6000, teacherPercentage: 40, totalAmountCents: 6000,
    externalReference: randomUUID(), idempotencyKey: randomUUID(), requestFingerprint: randomUUID(), paidAt: now,
    currentPeriodStart: new Date(now.getTime() - 60_000), currentPeriodEnd: new Date(now.getTime() + 360 * 24 * 60 * 60 * 1000),
  } });
  const email = `student-${runId}@example.test`;
  const seat = await prisma.sponsoredSeat.create({ data: {
    batchId: batch.id, emailNormalized: email, status: 'PAID_UNCLAIMED',
    startsAt: new Date(now.getTime() - 60_000), endsAt: new Date(now.getTime() + 360 * 24 * 60 * 60 * 1000),
  } });
  const student = createInitialStudent ? await prisma.student.create({ data: { userId: randomUUID(), fullName: 'QA Student', email } }) : null;
  const token = `qa-invite-${runId}`;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const scopedRepository = new PrismaSponsoredSeatInvitationRepository(undefined, prisma, batchEnvironment);
  await scopedRepository.issue({ teacherUserId: teacher.userId, batchId: batch.id, seatId: seat.id, tokenHash, expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), now });
  return { teacher, monitor, batch, seat, student, email, token, tokenHash, now, scopedRepository };
}

async function cleanup(data: Awaited<ReturnType<typeof fixture>>) {
  await prisma.sponsoredSeatBatch.deleteMany({ where: { id: data.batch.id } });
  if (data.student) await prisma.student.deleteMany({ where: { id: data.student.id } });
  await prisma.monitor.deleteMany({ where: { id: data.monitor.id } });
  await prisma.teacher.deleteMany({ where: { id: data.teacher.id } });
}

test('QA DB: resgate e consumo real respeitam a check constraint e liberam acesso de aluno patrocinado', { skip: !isolatedDatabase }, async () => {
  await requireRealConstraint();
  const data = await fixture();
  assert.ok(data.student);
  const student = data.student;
  try {
    const result = await data.scopedRepository.redeem({ tokenHash: data.tokenHash, studentUserId: student.userId, email: data.email, now: data.now });
    assert.equal(result.claimedCount, 1);
    const seat = await prisma.sponsoredSeat.findUniqueOrThrow({ where: { id: data.seat.id } });
    assert.equal(seat.status, 'ACTIVE');
    assert.equal(seat.studentId, student.id);
    assert.ok(await prisma.sponsoredSeatInvitation.findFirst({ where: { seatId: data.seat.id, usedAt: { not: null } } }));
    assert.equal(await prisma.studentSubscription.count({ where: { studentId: student.id, monitorId: data.monitor.id } }), 0);
    assert.equal(await prisma.studentEnrollment.count({ where: { studentId: student.id, monitorId: data.monitor.id } }), 0);

    await assert.rejects(() => prisma.studentEnrollment.create({ data: { studentId: student.id, monitorId: data.monitor.id } }));
    assert.equal(await prisma.studentEnrollment.count({ where: { studentId: student.id, monitorId: data.monitor.id } }), 0);

    assert.equal(await new PrismaStudentAccessRepository().hasActiveEnrollment(student.id, data.monitor.id), true);
    const entitlements = await new PaymentEntitlementRepository().listForStudent(student.id);
    assert.equal(entitlements.some((row) => row.monitorId === data.monitor.id && row.itemStatus === 'ACTIVE'), true);
    const dailyChallengeRepository = new DailyChallengeRepository();
    assert.ok(await dailyChallengeRepository.findActiveEnrollment(student.id, data.monitor.id));
    assert.ok((await dailyChallengeRepository.findActiveEnrollmentMonitorIds(student.id)).includes(data.monitor.id));

    const subject = await prisma.monitorSubject.create({ data: { monitorId: data.monitor.id, name: 'QA Subject', position: 0 } });
    const chatScope = await new PrismaChatAccessRepository(prisma).resolveChatScope({ userId: student.userId, monitorId: data.monitor.id, subjectId: subject.id });
    assert.deepEqual(chatScope, { studentId: student.id, teacherId: data.teacher.id, monitorId: data.monitor.id, subjectId: subject.id });
  } finally { await cleanup(data); }
});

test('QA DB: dois resgates concorrentes do mesmo convite não duplicam acesso', { skip: !isolatedDatabase }, async () => {
  await requireRealConstraint();
  const data = await fixture();
  assert.ok(data.student);
  const student = data.student;
  try {
    const attempts = await Promise.allSettled([
      data.scopedRepository.redeem({ tokenHash: data.tokenHash, studentUserId: student.userId, email: data.email, now: data.now }),
      data.scopedRepository.redeem({ tokenHash: data.tokenHash, studentUserId: student.userId, email: data.email, now: data.now }),
    ]);
    assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(await prisma.sponsoredSeat.count({ where: { id: data.seat.id, studentId: student.id, status: 'ACTIVE' } }), 1);
    assert.equal(await prisma.sponsoredSeatInvitation.count({ where: { seatId: data.seat.id, usedAt: { not: null } } }), 1);
    assert.equal(await prisma.studentEnrollment.count({ where: { studentId: student.id, monitorId: data.monitor.id } }), 0);
    assert.equal(await prisma.studentSubscription.count({ where: { studentId: student.id, monitorId: data.monitor.id } }), 0);
  } finally { await cleanup(data); }
});

test('QA DB: resgate de convite é delimitado ao ambiente e a projeção patrocinada não atravessa ambientes', { skip: !isolatedDatabase }, async () => {
  await requireRealConstraint();
  const sandbox = await fixture('SANDBOX');
  const production = await fixture('PRODUCTION');
  assert.ok(sandbox.student);
  assert.ok(production.student);
  const sandboxStudent = sandbox.student;
  const productionStudent = production.student;
  try {
    await assert.rejects(() => production.scopedRepository.redeem({ tokenHash: sandbox.tokenHash, studentUserId: sandbox.student!.userId, email: sandbox.email, now: sandbox.now }));
    await assert.rejects(() => sandbox.scopedRepository.redeem({ tokenHash: production.tokenHash, studentUserId: production.student!.userId, email: production.email, now: production.now }));
    assert.equal(await prisma.sponsoredSeat.count({ where: { id: sandbox.seat.id, studentId: null, status: 'PAID_UNCLAIMED' } }), 1);
    assert.equal(await prisma.sponsoredSeat.count({ where: { id: production.seat.id, studentId: null, status: 'PAID_UNCLAIMED' } }), 1);
    assert.equal(await prisma.sponsoredSeatInvitation.count({ where: { seatId: { in: [sandbox.seat.id, production.seat.id] }, usedAt: { not: null } } }), 0);

    await sandbox.scopedRepository.redeem({ tokenHash: sandbox.tokenHash, studentUserId: sandboxStudent.userId, email: sandbox.email, now: sandbox.now });
    await production.scopedRepository.redeem({ tokenHash: production.tokenHash, studentUserId: production.student.userId, email: production.email, now: production.now });
    const sandboxEntitlements = await new PaymentEntitlementRepository().listForStudent(sandboxStudent.id);
    const productionEntitlements = await new PaymentEntitlementRepository().listForStudent(production.student.id);
    assert.equal(sandboxEntitlements.some((item) => item.monitorId === sandbox.monitor.id), environment === 'SANDBOX');
    assert.equal(sandboxEntitlements.some((item) => item.monitorId === production.monitor.id), false);
    assert.equal(productionEntitlements.some((item) => item.monitorId === production.monitor.id), environment === 'PRODUCTION');
    const accessService = createStudentAccessService(new PrismaStudentAccessRepository());
    if (environment === 'SANDBOX') {
      await assert.rejects(() => accessService.assertMonitorAccess({ userId: productionStudent.userId, monitorId: production.monitor.id }), (error: unknown) => error instanceof Error && error.message.includes('não possui acesso'), 'SANDBOX must not authorize a PRODUCTION SponsoredSeat');
      await accessService.assertMonitorAccess({ userId: sandboxStudent.userId, monitorId: sandbox.monitor.id });
    } else {
      await accessService.assertMonitorAccess({ userId: productionStudent.userId, monitorId: production.monitor.id });
      await assert.rejects(() => accessService.assertMonitorAccess({ userId: sandboxStudent.userId, monitorId: sandbox.monitor.id }), (error: unknown) => error instanceof Error && error.message.includes('não possui acesso'), 'PRODUCTION must not authorize a SANDBOX SponsoredSeat');
    }
  } finally {
    await cleanup(sandbox);
    await cleanup(production);
  }
});

test('QA DB: StudentSubscription legado sem ambiente segue acessível em PRODUCTION e é ignorado em SANDBOX', { skip: !isolatedDatabase }, async () => {
  await requireRealConstraint();
  const data = await fixture('SANDBOX');
  assert.ok(data.student);
  const student = data.student;
  try {
    await prisma.studentSubscription.create({ data: {
      studentId: student.id,
      monitorId: data.monitor.id,
      status: 'active',
      amountPaid: 100,
      startsAt: new Date(data.now.getTime() - 60_000),
      expiresAt: new Date(data.now.getTime() + 30 * 24 * 60 * 60 * 1000),
      paymentSubscriptionItemId: null,
    } });
    const access = new PrismaStudentAccessRepository();
    assert.equal(await access.hasActiveSubscription(student.id, data.monitor.id), environment === 'PRODUCTION');
    assert.equal((await access.listSubscribedMonitorIds(student.id)).includes(data.monitor.id), environment === 'PRODUCTION');
  } finally { await cleanup(data); }
});

test('QA DB: processo SANDBOX não cancela StudentSubscription legado de PRODUCTION', { skip: !isolatedDatabase || environment !== 'SANDBOX' }, async () => {
  await requireRealConstraint();
  const data = await fixture('PRODUCTION');
  assert.ok(data.student);
  const student = data.student;
  try {
    const legacy = await prisma.studentSubscription.create({ data: {
      studentId: student.id,
      monitorId: data.monitor.id,
      status: 'active',
      amountPaid: 100,
      startsAt: new Date(data.now.getTime() - 60_000),
      expiresAt: new Date(data.now.getTime() + 30 * 24 * 60 * 60 * 1000),
      paymentSubscriptionItemId: null,
    } });
    await createStudentAccessService(new PrismaStudentAccessRepository()).cancelMonitorAccess({ userId: student.userId, monitorId: data.monitor.id });
    const after = await prisma.studentSubscription.findUniqueOrThrow({ where: { id: legacy.id } });
    assert.equal(after.status, 'active', 'sandbox cancellation must not mutate an unscoped legacy production subscription');
  } finally { await cleanup(data); }
});

test('QA DB: conta criada antes de falha transacional pode resgatar o mesmo convite em retry autenticado', { skip: !isolatedDatabase }, async () => {
  await requireRealConstraint();
  const data = await fixture('SANDBOX', false);
  const triggerName = `qa_fail_invite_${data.seat.id.replaceAll('-', '')}`;
  const functionName = `${triggerName}_fn`;
  try {
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.used_at IS NOT NULL AND OLD.used_at IS NULL THEN RAISE EXCEPTION 'QA injected transaction rollback'; END IF; RETURN NEW; END; $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE UPDATE ON sponsored_seat_invitations FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);

    const useCase = new SponsoredSeatInvitationUseCase(data.scopedRepository, {
      async createStudent(input) {
        // Simulate identity-provider account creation, which is outside the DB redeem transaction.
        const student = await prisma.student.create({ data: { userId: randomUUID(), fullName: input.name, email: input.email } });
        data.student = student;
        return { userId: student.userId, email: student.email, role: 'student', session: { accessToken: 'qa-access', refreshToken: 'qa-refresh', expiresIn: 3600 } };
      },
    }, { frontBaseUrl: 'https://qa.invalid' });

    await assert.rejects(() => useCase.activate(data.token, { name: 'QA Student', password: 'QaPassword123' }));
    assert.ok(data.student);
    const recoveredStudent = data.student;
    assert.equal(await prisma.student.count({ where: { id: recoveredStudent.id } }), 1);
    assert.equal(await prisma.sponsoredSeat.count({ where: { id: data.seat.id, studentId: null, status: 'PAID_UNCLAIMED' } }), 1);
    assert.equal(await prisma.sponsoredSeatInvitation.count({ where: { seatId: data.seat.id, usedAt: null } }), 1);

    await prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON sponsored_seat_invitations`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`);
    const result = await useCase.redeemExistingAccount(data.token, { studentUserId: recoveredStudent.userId, email: data.email, emailVerified: true });
    assert.equal(result.claimedCount, 1);
    assert.equal(await prisma.sponsoredSeat.count({ where: { id: data.seat.id, studentId: recoveredStudent.id, status: 'ACTIVE' } }), 1);
    assert.equal(await prisma.student.count({ where: { email: data.email } }), 1, 'only the externally provisioned account exists after retry');
    assert.equal(await prisma.studentEnrollment.count({ where: { studentId: recoveredStudent.id, monitorId: data.monitor.id } }), 0);
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON sponsored_seat_invitations`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`).catch(() => undefined);
    await cleanup(data);
  }
});
