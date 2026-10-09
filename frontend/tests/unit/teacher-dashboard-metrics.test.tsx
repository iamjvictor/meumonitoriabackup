import { describe, expect, it } from 'vitest';
import { calculateTeacherDashboardMetrics } from '@/modules/teacher/utils/dashboard-metrics';

describe('calculateTeacherDashboardMetrics', () => {
  it('deduplica alunos e soma assinaturas ativas e cancelamentos do mês', () => {
    const referenceDate = new Date('2026-09-25T12:00:00Z');
    const result = calculateTeacherDashboardMetrics([
      { studentId: 's1', status: 'ACTIVE', priceCents: 2990, expectedTeacherCents: 1495 },
      { studentId: 's1', status: 'ACTIVE', priceCents: 1990, expectedTeacherCents: 995 },
      { studentId: 's2', status: 'CANCELLED', priceCents: 2990, cancelledAt: '2026-09-10T10:00:00Z' },
      { studentId: 's3', status: 'CANCELLED', priceCents: 2990, cancelledAt: '2026-08-15T10:00:00Z' },
      { studentId: 's4', status: 'CANCEL_PENDING', itemStatus: 'CANCEL_PENDING', priceCents: 2990, updatedAt: '2026-09-20T10:00:00Z' },
    ], [], referenceDate);

    expect(result).toEqual({
      activeStudentCount: 1,
      activeSubscriptionsCount: 2,
      activeMonthlyPayoutCents: 2490,
      monthlyRevenueCents: 4980,
      monthlyCancellationsCount: 2, // s2 (September) and s4 (September)
      materialsCount: 0,
    });
  });

  it('soma materiais, questões e flashcards dos monitores', () => {
    expect(calculateTeacherDashboardMetrics([], [
      { knowledgeBaseCount: 3, questionsCount: 4, flashcardsCount: 2 },
      { knowledgeBaseCount: 1, questionsCount: 0, flashcardsCount: 5 },
    ]).materialsCount).toBe(15);
  });
});
