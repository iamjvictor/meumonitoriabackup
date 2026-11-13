import { prisma } from '../../../../lib/prisma.js';
import { env } from '../../../../config/env.js';
import type { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { SponsoredSeatInvitationError } from '../../application/commands/sponsored-seat-invitation.use-case.js';
import type { SponsoredSeatInvitationRepository } from '../../application/commands/sponsored-seat-invitation.use-case.js';
import type { SponsoredSeatEmailIntents } from './sponsored-seat-email-intents.js';

export class PrismaSponsoredSeatInvitationRepository implements SponsoredSeatInvitationRepository {
  private readonly environment: 'SANDBOX' | 'PRODUCTION';

  constructor(
    private readonly emails?: SponsoredSeatEmailIntents,
    private readonly database: PrismaClient = prisma,
    environment: string = env.ASAAS_ENV.toUpperCase(),
  ) {
    if (environment !== 'SANDBOX' && environment !== 'PRODUCTION') throw new Error('Sponsored invitation environment is required and must be SANDBOX or PRODUCTION');
    this.environment = environment;
  }

  async issue(input: Parameters<SponsoredSeatInvitationRepository['issue']>[0]) {
    // The application use case blocks issuance when email is disabled; this legacy branch keeps repository-level DB fixtures compatible.
    if (!this.emails) {
      const eligible = await this.database.sponsoredSeat.findFirst({
        where: { id: input.seatId, batchId: input.batchId, studentId: null, status: 'PAID_UNCLAIMED', startsAt: { lte: input.now }, endsAt: { gt: input.now }, batch: { environment: this.environment, teacher: { userId: input.teacherUserId }, status: 'ACTIVE', currentPeriodEnd: { gt: input.now } } },
        select: { id: true },
      });
      if (!eligible) {
        const owned = await this.database.sponsoredSeatBatch.findFirst({ where: { id: input.batchId, teacher: { userId: input.teacherUserId } }, select: { id: true } });
        if (!owned) throw new SponsoredSeatInvitationError('FORBIDDEN');
        throw new SponsoredSeatInvitationError('SEAT_NOT_ELIGIBLE');
      }
      const invitation = await this.database.sponsoredSeatInvitation.upsert({
        where: { seatId: input.seatId },
        create: { seatId: input.seatId, tokenHash: input.tokenHash, expiresAt: input.expiresAt, usedAt: null },
        update: { tokenHash: input.tokenHash, expiresAt: input.expiresAt, usedAt: null },
        select: { expiresAt: true },
      });
      return { duplicate: false, expiresAt: invitation.expiresAt };
    }
    if (!input.token || !input.idempotencyKey) throw new SponsoredSeatInvitationError('IDEMPOTENCY_KEY_REQUIRED');
    const emails = this.emails;
    const rawToken = input.token;
    const requestKey = input.idempotencyKey;
    return this.database.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sponsored-invitation-reissue:${input.batchId}:${input.seatId}`}, 0)) IS NULL`;
      const eligible = await tx.sponsoredSeat.findFirst({
        where: {
          id: input.seatId,
          batchId: input.batchId,
          studentId: null,
          status: 'PAID_UNCLAIMED',
          startsAt: { lte: input.now },
          endsAt: { gt: input.now },
          batch: { environment: this.environment, teacher: { userId: input.teacherUserId }, status: 'ACTIVE', currentPeriodEnd: { gt: input.now } },
        },
        select: {
          id: true, emailNormalized: true, startsAt: true, endsAt: true,
          batch: { select: { environment: true, billingInterval: true, monitor: { select: { name: true } }, teacher: { select: { fullName: true } } } },
        },
      });
      if (!eligible || !eligible.startsAt || !eligible.endsAt) {
        const owned = await tx.sponsoredSeatBatch.findFirst({ where: { id: input.batchId, teacher: { userId: input.teacherUserId } }, select: { id: true } });
        if (!owned) throw new SponsoredSeatInvitationError('FORBIDDEN');
        throw new SponsoredSeatInvitationError('SEAT_NOT_ELIGIBLE');
      }

      const outboxIdempotencyKey = `sponsored-seat-invite-reissue:${eligible.batch.environment}:${input.seatId}:${createHash('sha256').update(requestKey).digest('hex')}`;
      const existing = await tx.emailOutboxMessage.findUnique({ where: { environment_idempotencyKey: { environment: eligible.batch.environment, idempotencyKey: outboxIdempotencyKey } }, select: { id: true } });
      if (existing) {
        const invitation = await tx.sponsoredSeatInvitation.findUnique({ where: { seatId: input.seatId }, select: { expiresAt: true } });
        if (!invitation) throw new Error('Invitation outbox row exists without its invitation record');
        return { duplicate: true, expiresAt: invitation.expiresAt };
      }

      await emails.enqueueInvitationReissue(tx, {
        batchEnvironment: eligible.batch.environment, token: rawToken, idempotencyKey: outboxIdempotencyKey,
        email: eligible.emailNormalized, teacherName: eligible.batch.teacher.fullName,
        monitorName: eligible.batch.monitor.name, interval: eligible.batch.billingInterval,
        startsAt: eligible.startsAt, endsAt: eligible.endsAt,
      });
      await tx.sponsoredSeatInvitation.upsert({
        where: { seatId: input.seatId },
        create: { seatId: input.seatId, tokenHash: input.tokenHash, expiresAt: input.expiresAt, usedAt: null },
        update: { tokenHash: input.tokenHash, expiresAt: input.expiresAt, usedAt: null },
      });
      return { duplicate: false, expiresAt: input.expiresAt };
    }, { isolationLevel: 'ReadCommitted' });
  }

  async resolve(tokenHash: string, now: Date) {
    const invitation = await this.database.sponsoredSeatInvitation.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: now },
        seat: {
          studentId: null,
          status: 'PAID_UNCLAIMED',
          startsAt: { lte: now },
          endsAt: { gt: now },
          batch: { environment: this.environment, status: 'ACTIVE', currentPeriodEnd: { gt: now } },
        },
      },
      select: {
        id: true,
        seat: {
          select: {
            id: true,
            emailNormalized: true,
            startsAt: true,
            endsAt: true,
            batch: { select: { billingInterval: true, monitor: { select: { name: true }, }, teacher: { select: { fullName: true } } } },
          },
        },
      },
    });
    if (!invitation?.seat.startsAt || !invitation.seat.endsAt) return null;
    return {
      invitationId: invitation.id,
      seatId: invitation.seat.id,
      email: invitation.seat.emailNormalized,
      teacherName: invitation.seat.batch.teacher.fullName,
      monitorName: invitation.seat.batch.monitor.name,
      interval: invitation.seat.batch.billingInterval,
      startsAt: invitation.seat.startsAt,
      endsAt: invitation.seat.endsAt,
    };
  }

  async isEmailRegistered(email: string) {
    const student = await this.database.student.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
    return Boolean(student);
  }

  async redeem(input: Parameters<SponsoredSeatInvitationRepository['redeem']>[0]) {
    return this.database.$transaction(async (transaction) => {
      const invitation = await transaction.sponsoredSeatInvitation.findFirst({
        where: {
          tokenHash: input.tokenHash,
          usedAt: null,
          expiresAt: { gt: input.now },
          seat: { emailNormalized: input.email.trim().toLowerCase(), studentId: null, status: 'PAID_UNCLAIMED', startsAt: { lte: input.now }, endsAt: { gt: input.now }, batch: { environment: this.environment, status: 'ACTIVE', currentPeriodEnd: { gt: input.now } } },
        },
        select: { id: true, seatId: true, seat: { select: { startsAt: true, endsAt: true, batch: { select: { monitorId: true } } } } },
      });
      if (!invitation?.seat.startsAt || !invitation.seat.endsAt) throw new SponsoredSeatInvitationError('INVALID_INVITATION');
      const consumed = await transaction.sponsoredSeatInvitation.updateMany({ where: { id: invitation.id, usedAt: null, expiresAt: { gt: input.now } }, data: { usedAt: input.now } });
      if (!consumed.count) throw new SponsoredSeatInvitationError('INVALID_INVITATION');
      const studentId = await findStudentId(transaction, input.studentUserId);
      const claimed = await transaction.sponsoredSeat.updateMany({
        where: { id: invitation.seatId, emailNormalized: input.email.trim().toLowerCase(), studentId: null, status: 'PAID_UNCLAIMED' },
        data: { studentId, status: 'ACTIVE' },
      });
      if (!claimed.count) throw new SponsoredSeatInvitationError('INVALID_INVITATION');

      const monitorId = invitation.seat.batch.monitorId;
      const startsAt = invitation.seat.startsAt;
      const endsAt = invitation.seat.endsAt;
      // Sponsored seats have no BillingSubscriptionItem/PaymentSubscriptionItem bridge;
      // StudentEnrollment requires one. SponsoredSeat is the canonical entitlement.
      // StudentSubscription has no payment environment column. Never project a SANDBOX
      // seat into this shared legacy table, where it would grant production access.
      // SponsoredSeat itself is the source of truth for sponsored entitlements.
      if (this.environment === 'PRODUCTION') {
        await transaction.studentSubscription.upsert({
          where: { studentId_monitorId: { studentId, monitorId } },
          create: { studentId, monitorId, status: 'active', amountPaid: 0, startsAt, expiresAt: endsAt, currentPeriodStart: startsAt, currentPeriodEnd: endsAt },
          update: { status: 'active', startsAt, expiresAt: endsAt, currentPeriodStart: startsAt, currentPeriodEnd: endsAt, cancelledAt: null, cancelAtPeriodEnd: false },
        });
      }
      return { claimedCount: 1, monitorIds: [monitorId] };
    }, { isolationLevel: 'Serializable' });
  }
}

async function findStudentId(transaction: Prisma.TransactionClient, userId: string) {
  const student = await transaction.student.findUnique({ where: { userId }, select: { id: true } });
  if (!student) throw new SponsoredSeatInvitationError('INVALID_INVITATION');
  return student.id;
}
