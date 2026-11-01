import { prisma } from '../../../lib/prisma.js';
import type { EntitlementRepository, EntitlementRepositoryRow } from '../application/entitlement.service.js';

export class PaymentEntitlementRepository implements EntitlementRepository {
  async findStudentIdByUserId(userId: string) {
    const student = await prisma.student.findUnique({ where: { userId }, select: { id: true } });
    return student?.id ?? null;
  }

  async listForStudent(studentId: string): Promise<EntitlementRepositoryRow[]> {
    const subscriptions = await prisma.paymentSubscription.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: { include: { monitor: { include: { teacher: { select: { id: true, fullName: true, avatarUrl: true, bannerUrl: true } }, subjects: { include: { topics: { select: { id: true, name: true, subtopics: { select: { id: true, name: true }, orderBy: { position: 'asc' } } }, orderBy: { position: 'asc' } } }, orderBy: { position: 'asc' } } } } } },
      },
    });
    const monitorIds = [...new Set(subscriptions.flatMap((subscription) => subscription.items.map((item) => item.monitorId)))];
    const counts = await prisma.monitor.findMany({
      where: { id: { in: monitorIds } },
      select: {
        id: true,
        _count: {
          select: {
            questions: { where: { status: 'APPROVED' } },
            flashcards: { where: { status: 'APPROVED' } },
          },
        },
      },
    });
    const countsByMonitor = new Map(counts.map((count) => [count.id, count._count]));
    const paymentRows = subscriptions.flatMap((subscription) => subscription.items.map((item) => ({
      monitorId: item.monitor.id, monitorName: item.monitor.name, monitorAvatarUrl: item.monitor.avatarUrl, teacherId: item.monitor.teacher.id, teacherName: item.monitor.teacher.fullName, teacherAvatarUrl: item.monitor.teacher.avatarUrl, teacherBannerUrl: item.monitor.teacher.bannerUrl,
      subscriptionId: subscription.id, providerSubscriptionId: subscription.providerSubscriptionId,
      subscriptionStatus: subscription.status, itemStatus: item.status, purchasedAt: subscription.createdAt.toISOString(),
      currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null, currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      cancelRequestedAt: subscription.cancelledAt?.toISOString() ?? null,
      subjects: item.monitor.subjects.map((subject) => ({ id: subject.id, name: subject.name, topics: subject.topics.map((topic) => ({ id: topic.id, name: topic.name, subtopics: topic.subtopics.map((subtopic) => ({ id: subtopic.id, name: subtopic.name })) })) })),
      approvedQuestionCount: countsByMonitor.get(item.monitorId)?.questions ?? 0,
      approvedFlashcardCount: countsByMonitor.get(item.monitorId)?.flashcards ?? 0,
    })));
    const sponsoredSeats = await prisma.sponsoredSeat.findMany({
      where: { studentId, status: 'ACTIVE', OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
      include: {
        batch: {
          include: {
            monitor: {
              include: {
                teacher: { select: { id: true, fullName: true, avatarUrl: true, bannerUrl: true } },
                subjects: {
                  include: {
                    topics: {
                      select: { id: true, name: true, subtopics: { select: { id: true, name: true }, orderBy: { position: 'asc' } } },
                      orderBy: { position: 'asc' },
                    },
                  },
                  orderBy: { position: 'asc' },
                },
              },
            },
          },
        },
      },
    });
    const sponsoredMonitorIds = [...new Set(sponsoredSeats.map((seat) => seat.batch.monitorId))];
    const sponsoredCounts = sponsoredMonitorIds.length ? await prisma.monitor.findMany({
      where: { id: { in: sponsoredMonitorIds } },
      select: { id: true, _count: { select: { questions: { where: { status: 'APPROVED' } }, flashcards: { where: { status: 'APPROVED' } } } } },
    }) : [];
    const sponsoredCountsByMonitor = new Map(sponsoredCounts.map((count) => [count.id, count._count]));
    const sponsoredRows = sponsoredSeats.map((seat) => ({
      monitorId: seat.batch.monitor.id, monitorName: seat.batch.monitor.name, monitorAvatarUrl: seat.batch.monitor.avatarUrl, teacherId: seat.batch.monitor.teacher.id, teacherName: seat.batch.monitor.teacher.fullName, teacherAvatarUrl: seat.batch.monitor.teacher.avatarUrl, teacherBannerUrl: seat.batch.monitor.teacher.bannerUrl,
      subscriptionId: `sponsored:${seat.batch.id}`, providerSubscriptionId: seat.batch.providerSubscriptionId,
      subscriptionStatus: 'ACTIVE', itemStatus: 'ACTIVE', purchasedAt: seat.batch.createdAt.toISOString(),
      currentPeriodStart: seat.startsAt?.toISOString() ?? seat.batch.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: seat.endsAt?.toISOString() ?? seat.batch.currentPeriodEnd?.toISOString() ?? null,
      cancelRequestedAt: null,
      subjects: seat.batch.monitor.subjects.map((subject) => ({ id: subject.id, name: subject.name, topics: subject.topics.map((topic) => ({ id: topic.id, name: topic.name, subtopics: topic.subtopics.map((subtopic) => ({ id: subtopic.id, name: subtopic.name })) })) })),
      approvedQuestionCount: sponsoredCountsByMonitor.get(seat.batch.monitorId)?.questions ?? 0,
      approvedFlashcardCount: sponsoredCountsByMonitor.get(seat.batch.monitorId)?.flashcards ?? 0,
    } satisfies EntitlementRepositoryRow));
    return [...paymentRows, ...sponsoredRows];
  }
}
