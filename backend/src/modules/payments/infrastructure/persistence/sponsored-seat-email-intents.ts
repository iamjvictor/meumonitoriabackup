import { createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { EmailOutboxRepository } from '../../../email/outbox.repository.js';
import { buildSponsoredSeatInviteEmail, buildSponsoredTeacherNotice, type SponsoredTeacherNoticeKind } from '../../../email/templates/sponsored-seat-emails.js';

export type SponsoredSeatEmailTransaction = Prisma.TransactionClient;

export class SponsoredSeatEmailIntents {
  constructor(
    private readonly outbox: Pick<EmailOutboxRepository, 'enqueue'>,
    private readonly options: { from: string; frontBaseUrl: string; environment: string; now?: () => Date; generateToken?: () => string },
  ) {
    if (!options.from.trim() || !options.frontBaseUrl.trim() || !options.environment.trim()) throw new Error('Sponsored email sender, frontend URL and environment are required');
  }

  async enqueuePaidSeatInvitations(tx: SponsoredSeatEmailTransaction, input: { batchId: string; periodStart: Date; periodEnd: Date; occurredAt: Date }) {
    const periodId = input.periodStart.toISOString();
    // Serialize a batch/period so an idempotent outbox row and its token hash can never diverge.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sponsored-email:${this.options.environment}:${input.batchId}:${periodId}`}, 0)) IS NULL`;
    const batch = await tx.sponsoredSeatBatch.findUnique({
      where: { id: input.batchId },
      select: {
        environment: true,
        billingInterval: true,
        seatCount: true,
        monitor: { select: { name: true } },
        teacher: { select: { fullName: true, email: true } },
        seats: { where: { studentId: null, status: 'PAID_UNCLAIMED', startsAt: input.periodStart, endsAt: input.periodEnd }, select: { id: true, emailNormalized: true } },
      },
    });
    if (!batch) throw new Error('Sponsored batch missing while building paid invitation emails');
    if (batch.environment !== this.options.environment) throw new Error('Sponsored batch environment does not match the configured email environment');

    for (const seat of batch.seats) {
      const idempotencyKey = `sponsored-seat-invite:${this.options.environment}:${seat.id}:${periodId}`;
      const prior = await tx.emailOutboxMessage.findUnique({ where: { environment_idempotencyKey: { environment: this.options.environment, idempotencyKey } }, select: { id: true } });
      if (prior) continue;
      const existingStudent = await tx.student.findFirst({ where: { email: { equals: seat.emailNormalized, mode: 'insensitive' } }, select: { id: true } });
      const token = (this.options.generateToken ?? (() => randomBytes(32).toString('base64url')))();
      const now = (this.options.now ?? (() => new Date()))();
      const invitationUrl = `${this.options.frontBaseUrl.replace(/\/+$/, '')}/convite/aluno#token=${encodeURIComponent(token)}`;
      const tokenHash = createHash('sha256').update(token).digest('hex');
      await tx.sponsoredSeatInvitation.upsert({
        where: { seatId: seat.id },
        create: { seatId: seat.id, tokenHash, expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), usedAt: null },
        update: { tokenHash, expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), usedAt: null },
      });
      const payload = buildSponsoredSeatInviteEmail({
        from: this.options.from, recipient: seat.emailNormalized, teacherName: batch.teacher.fullName,
        monitorName: batch.monitor.name, interval: batch.billingInterval, startsAt: input.periodStart, endsAt: input.periodEnd,
        invitationUrl, existingAccount: Boolean(existingStudent),
      });
      await this.outbox.enqueue(tx, { idempotencyKey, purpose: 'SPONSORED_SEAT_INVITATION', recipient: seat.emailNormalized, payload });
    }

    await this.enqueueTeacherNotice(tx, {
      batchId: input.batchId,
      kind: 'PAID',
      eventKey: `paid:${periodId}`,
      occurredAt: input.occurredAt,
      seatCount: batch.seatCount,
    });
  }

  async enqueueInvitationReissue(tx: SponsoredSeatEmailTransaction, input: {
    batchEnvironment: string; token: string; idempotencyKey: string;
    email: string; teacherName: string; monitorName: string; interval: string; startsAt: Date; endsAt: Date;
  }) {
    if (input.batchEnvironment !== this.options.environment) throw new Error('Sponsored batch environment does not match the configured email environment');
    const existingStudent = await tx.student.findFirst({ where: { email: { equals: input.email, mode: 'insensitive' } }, select: { id: true } });
    const invitationUrl = `${this.options.frontBaseUrl.replace(/\/+$/, '')}/convite/aluno#token=${encodeURIComponent(input.token)}`;
    const payload = buildSponsoredSeatInviteEmail({
      from: this.options.from, recipient: input.email, teacherName: input.teacherName,
      monitorName: input.monitorName, interval: input.interval, startsAt: input.startsAt,
      endsAt: input.endsAt, invitationUrl, existingAccount: Boolean(existingStudent),
    });
    return this.outbox.enqueue(tx, {
      idempotencyKey: input.idempotencyKey,
      purpose: 'SPONSORED_SEAT_INVITATION_REISSUE',
      recipient: input.email,
      payload,
    });
  }

  async enqueueTeacherNotice(tx: SponsoredSeatEmailTransaction, input: { batchId: string; kind: SponsoredTeacherNoticeKind; eventKey: string; occurredAt: Date; seatCount?: number }) {
    const batch = await tx.sponsoredSeatBatch.findUnique({
      where: { id: input.batchId },
      select: { environment: true, billingInterval: true, seatCount: true, monitor: { select: { name: true } }, teacher: { select: { fullName: true, email: true } } },
    });
    if (!batch) throw new Error('Sponsored batch missing while building teacher notification');
    if (batch.environment !== this.options.environment) throw new Error('Sponsored batch environment does not match the configured email environment');
    const idempotencyKey = `sponsored-teacher:${batch.environment}:${input.batchId}:${input.eventKey}`;
    const prior = await tx.emailOutboxMessage.findUnique({ where: { environment_idempotencyKey: { environment: this.options.environment, idempotencyKey } }, select: { id: true } });
    if (prior) return;
    const payload = buildSponsoredTeacherNotice({
      from: this.options.from, recipient: batch.teacher.email, teacherName: batch.teacher.fullName,
      monitorName: batch.monitor.name, interval: batch.billingInterval, kind: input.kind,
      seatCount: input.seatCount ?? batch.seatCount, occurredAt: input.occurredAt,
    });
    await this.outbox.enqueue(tx, { idempotencyKey, purpose: `SPONSORED_TEACHER_${input.kind}`, recipient: batch.teacher.email, payload });
  }
}
