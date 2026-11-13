import { prisma } from '../../../../lib/prisma.js';
import { env } from '../../../../config/env.js';
import type { PrismaClient } from '@prisma/client';
import type { SponsoredSeatClaimRepository } from '../../application/commands/claim-sponsored-seats.use-case.js';
import { SponsoredSeatClaimError } from '../../application/commands/claim-sponsored-seats.use-case.js';

export class PrismaSponsoredSeatClaimRepository implements SponsoredSeatClaimRepository {
  private readonly environment: 'SANDBOX' | 'PRODUCTION';

  constructor(private readonly database: PrismaClient = prisma, environment: string = env.ASAAS_ENV.toUpperCase()) {
    if (environment !== 'SANDBOX' && environment !== 'PRODUCTION') throw new Error('Sponsored seat environment is required and must be SANDBOX or PRODUCTION');
    this.environment = environment;
  }

  async claimPaidSeats(input: { studentUserId: string; emailNormalized: string }) {
    const student = await this.database.student.findUnique({ where: { userId: input.studentUserId }, select: { id: true, email: true } });
    if (!student) throw new SponsoredSeatClaimError('STUDENT_NOT_FOUND');
    if (student.email.trim().toLowerCase() !== input.emailNormalized) return { claimedCount: 0, monitorIds: [] };
    const now = new Date();

    return this.database.$transaction(async (transaction) => {
      const seats = await transaction.sponsoredSeat.findMany({
        where: {
          emailNormalized: input.emailNormalized, studentId: null, status: 'PAID_UNCLAIMED',
          batch: { environment: this.environment, status: 'ACTIVE', currentPeriodEnd: { gt: now } },
        },
        orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, startsAt: true, endsAt: true, batch: { select: { monitorId: true } } },
      });
      let claimedCount = 0;
      const monitorIds = new Set<string>();
      for (const seat of seats) {
        const claimed = await transaction.sponsoredSeat.updateMany({
          where: { id: seat.id, studentId: null, status: 'PAID_UNCLAIMED' },
          data: { studentId: student.id, status: 'ACTIVE' },
        });
        if (!claimed.count) continue;
        const monitorId = seat.batch.monitorId;
        // SponsoredSeat has no subscription-item bridge required by StudentEnrollment.
        if (this.environment === 'PRODUCTION') {
          const current = await transaction.studentSubscription.findUnique({ where: { studentId_monitorId: { studentId: student.id, monitorId } }, select: { startsAt: true, expiresAt: true } });
          const startsAt = current?.startsAt && current.startsAt < (seat.startsAt ?? now) ? current.startsAt : seat.startsAt ?? now;
          const expiresAt = current?.expiresAt && seat.endsAt && current.expiresAt > seat.endsAt ? current.expiresAt : seat.endsAt;
          await transaction.studentSubscription.upsert({
            where: { studentId_monitorId: { studentId: student.id, monitorId } },
            create: { studentId: student.id, monitorId, status: 'active', amountPaid: 0, startsAt, expiresAt, currentPeriodStart: startsAt, currentPeriodEnd: expiresAt },
            update: { status: 'active', startsAt, expiresAt, currentPeriodStart: startsAt, currentPeriodEnd: expiresAt, cancelledAt: null, cancelAtPeriodEnd: false },
          });
        }
        claimedCount += 1;
        monitorIds.add(monitorId);
      }
      return { claimedCount, monitorIds: [...monitorIds] };
    }, { isolationLevel: 'Serializable' });
  }
}
