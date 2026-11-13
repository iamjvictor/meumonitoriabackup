import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { prisma } from '../../../lib/prisma.js';
import { EmailOutboxCipher } from '../../email/outbox-crypto.js';
import { EmailOutboxRepository } from '../../email/outbox.repository.js';
import { SponsoredSeatEmailIntents } from '../infrastructure/persistence/sponsored-seat-email-intents.js';
import { PrismaSponsoredSeatInvitationRepository } from '../infrastructure/persistence/sponsored-seat-invitation.repository.js';

const databaseUrl = process.env.PAYMENTS_TEST_DATABASE_URL;
const canRun = Boolean(databaseUrl && process.env.DATABASE_URL === databaseUrl && databaseUrl.includes('mm_asaas_flow_test'));
after(async () => { if (canRun) await prisma.$disconnect(); });

test('concurrent same-key reissues commit one matching encrypted email and invitation token hash', { skip: !canRun }, async () => {
  const runId = randomUUID();
  const now = new Date();
  const teacher = await prisma.teacher.create({ data: {
    userId: randomUUID(), fullName: 'Professor Reenvio Concorrente', email: `teacher-${runId}@example.test`, username: `invite-race-${runId}`,
    area: 'Matemática', pageSlug: `invite-race-${runId}`, termsAcceptedAt: now, teacherPercentage: 40,
  } });
  const monitor = await prisma.monitor.create({ data: { teacherId: teacher.id, name: 'Monitor Reenvio Concorrente', status: 'PUBLISHED', priceCents: 10000 } });
  const batch = await prisma.sponsoredSeatBatch.create({ data: {
    teacherId: teacher.id, monitorId: monitor.id, billingInterval: 'MONTHLY', billingType: 'CREDIT_CARD', serviceMonths: 1,
    status: 'ACTIVE', seatCount: 1, grossPriceCents: 10000, platformAmountCents: 6000, teacherPercentage: 40, totalAmountCents: 6000,
    externalReference: randomUUID(), idempotencyKey: randomUUID(), requestFingerprint: randomUUID(), paidAt: now,
    currentPeriodStart: new Date(now.getTime() - 60_000), currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
  } });
  const seat = await prisma.sponsoredSeat.create({ data: {
    batchId: batch.id, emailNormalized: `student-${runId}@example.test`, status: 'PAID_UNCLAIMED',
    startsAt: new Date(now.getTime() - 60_000), endsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
  } });
  const requestKey = `concurrent-reissue-${runId}`;
  const outboxIdempotencyKey = `sponsored-seat-invite-reissue:SANDBOX:${seat.id}:${createHash('sha256').update(requestKey).digest('hex')}`;
  const cipher = new EmailOutboxCipher(randomBytes(32).toString('base64'));
  const intents = new SponsoredSeatEmailIntents(new EmailOutboxRepository(cipher, undefined, 'SANDBOX'), {
    from: 'MeuMonitor <noreply@example.test>', frontBaseUrl: 'https://app.example.test', environment: 'SANDBOX',
  });
  const repository = new PrismaSponsoredSeatInvitationRepository(intents, prisma, 'SANDBOX');
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const tokenA = `token-a-${runId}`;
  const tokenB = `token-b-${runId}`;
  try {
    const results = await Promise.all([
      repository.issue({ teacherUserId: teacher.userId, batchId: batch.id, seatId: seat.id, token: tokenA, tokenHash: createHash('sha256').update(tokenA).digest('hex'), idempotencyKey: requestKey, expiresAt, now }),
      repository.issue({ teacherUserId: teacher.userId, batchId: batch.id, seatId: seat.id, token: tokenB, tokenHash: createHash('sha256').update(tokenB).digest('hex'), idempotencyKey: requestKey, expiresAt, now }),
    ]);

    assert.deepEqual(results.map((result) => result.duplicate).sort(), [false, true]);
    const messages = await prisma.emailOutboxMessage.findMany({ where: { idempotencyKey: outboxIdempotencyKey } });
    assert.equal(messages.length, 1);
    const payload = cipher.decrypt(messages[0]!.encryptedPayload);
    const emailUrl = payload.text?.match(/https:\/\/\S+/)?.[0];
    assert.ok(emailUrl);
    const token = decodeURIComponent(new URL(emailUrl).hash.slice('#token='.length));
    const invitation = await prisma.sponsoredSeatInvitation.findUniqueOrThrow({ where: { seatId: seat.id } });
    assert.equal(invitation.tokenHash, createHash('sha256').update(token).digest('hex'));
    assert.ok([tokenA, tokenB].includes(token));
  } finally {
    await prisma.emailOutboxMessage.deleteMany({ where: { idempotencyKey: outboxIdempotencyKey } });
    await prisma.sponsoredSeatBatch.deleteMany({ where: { id: batch.id } });
    await prisma.monitor.deleteMany({ where: { id: monitor.id } });
    await prisma.teacher.deleteMany({ where: { id: teacher.id } });
  }
});
