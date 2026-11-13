import type { PrismaClient } from '@prisma/client';
import { env } from '../../../config/env.js';
import { legacyStudentEnrollmentEnvironmentFilter, legacyStudentSubscriptionEnvironmentFilter } from '../../access/infrastructure/legacy-access-environment.js';
import type { ChatAccessInput, ChatAccessPort } from '../ports/chat-access.port.js';
import type { ChatScope } from '../ports/chat-access.port.js';

/**
 * Consulta somente autorização existente. Este adaptador não persiste chat,
 * mensagens ou histórico.
 */
export class PrismaChatAccessRepository implements ChatAccessPort {
  constructor(private readonly client: PrismaClient) {}

  async resolveChatScope(input: ChatAccessInput): Promise<ChatScope | null> {
    const [student, subject, teacher] = await Promise.all([
      this.client.student.findUnique({
        where: { userId: input.userId },
        select: { id: true },
      }),
      this.client.monitorSubject.findFirst({
        where: { id: input.subjectId, monitorId: input.monitorId },
        select: { id: true, monitor: { select: { teacherId: true } } },
      }),
      this.client.teacher.findUnique({
        where: { userId: input.userId },
        select: { id: true },
      }),
    ]);

    if (!subject) return null;

    if (teacher && subject.monitor.teacherId === teacher.id) {
      return {
        studentId: `teacher-preview:${input.userId}`,
        teacherId: subject.monitor.teacherId,
        monitorId: input.monitorId,
        subjectId: input.subjectId,
      };
    }

    if (!student) return null;

    const now = new Date();
    const [subscription, enrollment, sponsoredSeat] = await Promise.all([
      this.client.studentSubscription.findFirst({
        where: {
          studentId: student.id,
          monitorId: input.monitorId,
          status: 'active',
          ...legacyStudentSubscriptionEnvironmentFilter(),
          startsAt: { lte: now },
          OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        },
        select: { id: true },
      }),
      this.client.studentEnrollment.findFirst({
        where: {
          studentId: student.id,
          monitorId: input.monitorId,
          status: 'ACTIVE',
          ...legacyStudentEnrollmentEnvironmentFilter(),
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        },
        select: { id: true },
      }),
      this.client.sponsoredSeat.findFirst({
        where: {
          studentId: student.id,
          status: 'ACTIVE',
          accessRevokedAt: null,
          batch: { environment: env.ASAAS_ENV.toUpperCase(), monitorId: input.monitorId },
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        select: { id: true },
      }),
    ]);

    if (!subscription && !enrollment && !sponsoredSeat) return null;

    return {
      studentId: student.id,
      teacherId: subject.monitor.teacherId,
      monitorId: input.monitorId,
      subjectId: input.subjectId,
    };
  }
}
