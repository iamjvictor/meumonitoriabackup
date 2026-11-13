import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { legacyStudentEnrollmentEnvironmentFilter, legacyStudentSubscriptionEnvironmentFilter } from '../access/infrastructure/legacy-access-environment.js';
import type { StudentAccessRepository } from './student-access.service.js';

export class PrismaStudentAccessRepository implements StudentAccessRepository {
  constructor(private readonly environment = env.ASAAS_ENV.toUpperCase()) {}

  async findStudentByUserId(userId: string) {
    return prisma.student.findUnique({ where: { userId }, select: { id: true } });
  }

  async hasActiveSubscription(studentId: string, monitorId: string) {
    const now = new Date();
    return Boolean(await prisma.studentSubscription.findFirst({
      where: { studentId, monitorId, status: 'active', ...legacyStudentSubscriptionEnvironmentFilter(this.environment), startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { id: true },
    }));
  }

  async hasActiveEnrollment(studentId: string, monitorId: string) {
    const now = new Date();
    const [enrollment, seat] = await Promise.all([
      prisma.studentEnrollment.findFirst({ where: { studentId, monitorId, status: 'ACTIVE', ...legacyStudentEnrollmentEnvironmentFilter(this.environment), startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select: { id: true } }),
      prisma.sponsoredSeat.findFirst({ where: { studentId, status: 'ACTIVE', accessRevokedAt: null, batch: { environment: this.environment, monitorId }, startsAt: { lte: now }, endsAt: { gt: now } }, select: { id: true } }),
    ]);
    return Boolean(enrollment || seat);
  }

  async ownsMonitor(userId: string, monitorId: string) {
    return Boolean(await prisma.monitor.findFirst({
      where: { id: monitorId, teacher: { userId } },
      select: { id: true },
    }));
  }

  async cancelSubscription(studentId: string, monitorId: string) {
    await prisma.studentSubscription.updateMany({
      where: { studentId, monitorId, status: 'active', ...legacyStudentSubscriptionEnvironmentFilter(this.environment) },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
  }

  async cancelEnrollment(studentId: string, monitorId: string) {
    await prisma.studentEnrollment.updateMany({
      where: { studentId, monitorId, status: 'ACTIVE', ...legacyStudentEnrollmentEnvironmentFilter(this.environment) },
      data: { status: 'CANCELLED' },
    });
  }

  async listSubscribedMonitorIds(studentId: string) {
    const now = new Date();
    const records = await prisma.studentSubscription.findMany({ where: { studentId, status: 'active', ...legacyStudentSubscriptionEnvironmentFilter(this.environment), startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { monitorId: true } });
    return records.map((record) => record.monitorId);
  }

  async listEnrolledMonitorIds(studentId: string) {
    const now = new Date();
    const [records, seats] = await Promise.all([
      prisma.studentEnrollment.findMany({ where: { studentId, status: 'ACTIVE', ...legacyStudentEnrollmentEnvironmentFilter(this.environment), startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select: { monitorId: true } }),
      prisma.sponsoredSeat.findMany({ where: { studentId, status: 'ACTIVE', accessRevokedAt: null, batch: { environment: this.environment }, startsAt: { lte: now }, endsAt: { gt: now } }, select: { batch: { select: { monitorId: true } } } }),
    ]);
    return [...new Set([...records.map((record) => record.monitorId), ...seats.map((seat) => seat.batch.monitorId)])];
  }

  async listOwnedMonitorIds(userId: string) {
    const records = await prisma.monitor.findMany({ where: { teacher: { userId } }, select: { id: true } });
    return records.map((record) => record.id);
  }
}
