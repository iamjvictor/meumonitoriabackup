import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { prisma } from '../../../lib/prisma.js';
import { EmailOutboxCipher } from '../../email/outbox-crypto.js';
import { EmailOutboxRepository } from '../../email/outbox.repository.js';
import { SponsoredSeatEmailIntents } from '../infrastructure/persistence/sponsored-seat-email-intents.js';
import { PaymentEventRepository } from '../infrastructure/persistence/payment-event.repository.js';

const databaseUrl = process.env.PAYMENTS_TEST_DATABASE_URL;
const canRun = Boolean(databaseUrl && process.env.DATABASE_URL === databaseUrl && databaseUrl.includes('mm_asaas_flow_test'));
const cipher = new EmailOutboxCipher(Buffer.alloc(32, 15).toString('base64'));
const outbox = new EmailOutboxRepository(cipher);
after(async () => { if (canRun) await prisma.$disconnect(); });

test('CHECKOUT_PAID anual grava convites cifrados e hash de token na mesma transação e não duplica por período', { skip: !canRun }, async () => {
  const runId = randomUUID();
  const now = new Date();
  const teacher = await prisma.teacher.create({ data: {
    userId: randomUUID(), fullName: 'Professora de Email', email: `teacher-${runId}@example.test`, username: `email-${runId}`,
    area: 'Matemática', pageSlug: `email-${runId}`, termsAcceptedAt: now, teacherPercentage: 40,
  } });
  const monitor = await prisma.monitor.create({ data: { teacherId: teacher.id, name: 'Monitor Email', status: 'PUBLISHED', priceCents: 10000 } });
  const providerCheckoutId = `checkout-email-${runId}`;
  const batch = await prisma.sponsoredSeatBatch.create({ data: {
    teacherId: teacher.id, monitorId: monitor.id, environment: 'SANDBOX', billingInterval: 'ANNUAL', billingType: 'CREDIT_CARD', serviceMonths: 12,
    status: 'PENDING', seatCount: 2, grossPriceCents: 20000, platformAmountCents: 12000, teacherPercentage: 40, totalAmountCents: 12000,
    externalReference: `sponsored-email-${runId}`, idempotencyKey: `email-${runId}`, requestFingerprint: `email-${runId}`,
    providerCheckoutId, paidAt: null,
  } });
  const seat = await prisma.sponsoredSeat.create({ data: { batchId: batch.id, emailNormalized: `student-${runId}@example.test`, status: 'PENDING_PAYMENT' } });
  const emailIntents = new SponsoredSeatEmailIntents(outbox, { from: 'MeuMonitor <noreply@example.test>', frontBaseUrl: 'https://app.example.test', environment: 'SANDBOX' });
  const paymentEvents = new PaymentEventRepository(emailIntents);
  try {
    const paidAt = new Date(now.getTime() + 1000);
    const event = { environment: 'SANDBOX', eventId: `evt-paid-${runId}`, eventType: 'CHECKOUT_PAID', occurredAt: paidAt, payload: { checkout: { id: providerCheckoutId } } };
    assert.equal((await paymentEvents.applyCheckoutEvent(event)).updatedRows, 1);
    assert.equal((await paymentEvents.applyCheckoutEvent({ ...event, eventId: `evt-paid-duplicate-${runId}`, occurredAt: new Date(paidAt.getTime() + 1000) })).updatedRows, 1);

    const period = await prisma.sponsoredSeat.findUniqueOrThrow({ where: { id: seat.id } });
    const invitation = await prisma.sponsoredSeatInvitation.findUniqueOrThrow({ where: { seatId: seat.id } });
    const inviteKey = `sponsored-seat-invite:SANDBOX:${seat.id}:${period.startsAt!.toISOString()}`;
    const inviteRow = await prisma.emailOutboxMessage.findUniqueOrThrow({ where: { environment_idempotencyKey: { environment: 'SANDBOX', idempotencyKey: inviteKey } } });
    const payload = cipher.decrypt(inviteRow.encryptedPayload);
    const token = decodeURIComponent(new URL(payload.text!.match(/https:\/\/\S+/)![0]).hash.slice('#token='.length));
    assert.equal(invitation.tokenHash, createHash('sha256').update(token).digest('hex'));
    assert.equal(inviteRow.encryptedPayload.includes(token), false);
    assert.equal(await prisma.emailOutboxMessage.count({ where: { idempotencyKey: { startsWith: `sponsored-teacher:SANDBOX:${batch.id}:paid:` } } }), 1);
    assert.equal(await prisma.emailOutboxMessage.count({ where: { idempotencyKey: { startsWith: `sponsored-seat-invite:SANDBOX:${seat.id}:` } } }), 1);
  } finally {
    await prisma.emailOutboxMessage.deleteMany({ where: { idempotencyKey: { contains: batch.id } } });
    await prisma.emailOutboxMessage.deleteMany({ where: { idempotencyKey: { startsWith: `sponsored-seat-invite:SANDBOX:${seat.id}:` } } });
    await prisma.sponsoredSeatBatch.delete({ where: { id: batch.id } });
    await prisma.monitor.delete({ where: { id: monitor.id } });
    await prisma.teacher.delete({ where: { id: teacher.id } });
  }
});
