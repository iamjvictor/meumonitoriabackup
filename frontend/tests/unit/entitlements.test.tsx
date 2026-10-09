import { describe, expect, it } from 'vitest';
import { normalizeEntitlementSnapshot } from '@/modules/student/context/entitlements';

describe('normalizeEntitlementSnapshot', () => {
  it('deduplicates monitors while preserving complete access data', () => {
    const subscription = {
      paymentSubscriptionId: 'payment-sub-1', providerSubscriptionId: 'sub_asaas_1', status: 'CANCEL_PENDING' as const,
      purchasedAt: '2026-09-01T00:00:00.000Z', currentPeriodStart: '2026-09-01T00:00:00.000Z',
      currentPeriodEnd: '2026-10-01T00:00:00.000Z', cancelRequestedAt: '2026-09-25T12:00:00.000Z', accessEndsAt: '2026-10-01T00:00:00.000Z',
    };
    const snapshot = normalizeEntitlementSnapshot({
      studentId: 'student-1', generatedAt: '2026-09-25T12:00:00.000Z', source: 'DATABASE',
      monitors: [
        { monitorId: 'monitor-1', name: 'Matemática', avatarUrl: 'https://cdn.example.com/monitor.png', teacherAvatarUrl: 'https://cdn.example.com/teacher.png', teacherBannerUrl: 'https://cdn.example.com/teacher-banner.png', teacherId: 'teacher-1', teacherName: 'Prof. Ana', subjects: [{ id: 'subject-1', name: 'Álgebra', topics: [{ id: 'topic-1', name: 'Equações' }] }], approvedQuestionCount: 73, approvedFlashcardCount: 10, subscription, permissions: { agent: true, questions: true, flashcards: true, dailyChallenges: true, chat: true, performance: true, ranking: true } },
        { monitorId: 'monitor-1', name: 'Matemática', teacherId: 'teacher-1', teacherName: 'Prof. Ana', subjects: [], approvedQuestionCount: 0, approvedFlashcardCount: 0, subscription, permissions: { agent: true, questions: true, flashcards: true, dailyChallenges: true, chat: true, performance: true, ranking: true } },
      ],
    });
    expect(snapshot.monitors).toHaveLength(1);
    expect(snapshot.monitors[0]).toMatchObject({ monitorId: 'monitor-1', approvedQuestionCount: 73, approvedFlashcardCount: 10 });
    expect(snapshot.monitors[0].subjects[0].topics[0].name).toBe('Equações');
    expect(snapshot.monitors[0].avatarUrl).toBe('https://cdn.example.com/monitor.png');
    expect(snapshot.monitors[0].teacherAvatarUrl).toBe('https://cdn.example.com/teacher.png');
  });
});
