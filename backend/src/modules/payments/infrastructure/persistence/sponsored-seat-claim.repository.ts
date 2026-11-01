import { prisma } from '../../../../lib/prisma.js';
import type { SponsoredSeatClaimRepository } from '../../application/commands/claim-sponsored-seats.use-case.js';
import { SponsoredSeatClaimError } from '../../application/commands/claim-sponsored-seats.use-case.js';

export class PrismaSponsoredSeatClaimRepository implements SponsoredSeatClaimRepository {
  async claimPaidSeats(input: { studentUserId: string; emailNormalized: string }) {
    const student = await prisma.student.findUnique({ where: { userId: input.studentUserId }, select: { id: true, email: true } });
    if (!student) throw new SponsoredSeatClaimError('STUDENT_NOT_FOUND');
    if (student.email.trim().toLowerCase() !== input.emailNormalized) return { claimedCount: 0, monitorIds: [] };
    const now = new Date();

    return prisma.$transaction(async (transaction) => {
      const seats = await transaction.sponsoredSeat.findMany({
        where: {
          emailNormalized: input.emailNormalized, studentId: null, status: 'PAID_UNCLAIMED',
          batch: { status: 'ACTIVE', currentPeriodEnd: { gt: now } },
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
        const current = await transaction.studentSubscription.findUnique({ where: { studentId_monitorId: { studentId: student.id, monitorId } }, select: { startsAt: true, expiresAt: true } });
        const startsAt = current?.startsAt && current.startsAt < (seat.startsAt ?? now) ? current.startsAt : seat.startsAt ?? now;
        const expiresAt = current?.expiresAt && seat.endsAt && current.expiresAt > seat.endsAt ? current.expiresAt : seat.endsAt;
        await transaction.studentSubscription.upsert({
          where: { studentId_monitorId: { studentId: student.id, monitorId } },
          create: { studentId: student.id, monitorId, status: 'active', amountPaid: 0, startsAt, expiresAt, currentPeriodStart: startsAt, currentPeriodEnd: expiresAt },
          update: { status: 'active', startsAt, expiresAt, currentPeriodStart: startsAt, currentPeriodEnd: expiresAt, cancelledAt: null, cancelAtPeriodEnd: false },
        });
        await transaction.studentEnrollment.upsert({
          where: { studentId_monitorId: { studentId: student.id, monitorId } },
          create: { studentId: student.id, monitorId, status: 'ACTIVE', startsAt, endsAt: expiresAt },
          update: { status: 'ACTIVE', startsAt, endsAt: expiresAt },
        });
        claimedCount += 1;
        monitorIds.add(monitorId);
      }
      return { claimedCount, monitorIds: [...monitorIds] };
    }, { isolationLevel: 'Serializable' });
  }
}
