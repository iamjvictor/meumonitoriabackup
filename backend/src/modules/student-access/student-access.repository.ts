import { prisma } from '../../lib/prisma.js';
import type { StudentAccessRepository } from './student-access.service.js';

export class PrismaStudentAccessRepository implements StudentAccessRepository {
  async findStudentByUserId(userId: string) {
    return prisma.student.findUnique({ where: { userId }, select: { id: true } });
  }

  async hasActiveSubscription(studentId: string, monitorId: string) {
    const now = new Date();
    return Boolean(await prisma.studentSubscription.findFirst({
      where: { studentId, monitorId, status: 'active', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { id: true },
    }));
  }

  async hasActiveEnrollment(studentId: string, monitorId: string) {
    const now = new Date();
    return Boolean(await prisma.studentEnrollment.findFirst({
      where: { studentId, monitorId, status: 'ACTIVE', OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      select: { id: true },
    }));
  }

  async ownsMonitor(userId: string, monitorId: string) {
    return Boolean(await prisma.monitor.findFirst({
      where: { id: monitorId, teacher: { userId } },
      select: { id: true },
    }));
  }

  async cancelSubscription(studentId: string, monitorId: string) {
    await prisma.studentSubscription.updateMany({
      where: { studentId, monitorId, status: 'active' },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
  }

  async cancelEnrollment(studentId: string, monitorId: string) {
    await prisma.studentEnrollment.updateMany({
      where: { studentId, monitorId, status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    });
  }

  async listSubscribedMonitorIds(studentId: string) {
    const records = await prisma.studentSubscription.findMany({ where: { studentId, status: 'active', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { monitorId: true } });
    return records.map((record) => record.monitorId);
  }

  async listEnrolledMonitorIds(studentId: string) {
    const records = await prisma.studentEnrollment.findMany({ where: { studentId, status: 'ACTIVE', OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, select: { monitorId: true } });
    return records.map((record) => record.monitorId);
  }

  async listOwnedMonitorIds(userId: string) {
    const records = await prisma.monitor.findMany({ where: { teacher: { userId } }, select: { id: true } });
    return records.map((record) => record.id);
  }
}
