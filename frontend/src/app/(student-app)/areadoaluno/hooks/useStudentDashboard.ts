'use client';

import { useEffect, useMemo, useState } from 'react';
import { studentDashboardService } from '../services/student-dashboard.service';

export interface DailyChallengeSummary {
  id: string; monitorId: string; challengeDate: string; availableUntil: string; answered: boolean;
  question: { id: string; text: string; alternatives: unknown; subject?: { id: string; name: string } | null; topic?: { id: string; name: string } | null };
}
export interface ConsistencyDay { day: string; weekday: string; answeredCount: number; responseTimeMs: number }
export interface DailyChallengeSummaryData {
  currentStudent: { rank: number; score: number; correctAnswers: number; streakDays: number };
  challengeDays: Array<{ day: string; weekday: string; completed: boolean; correct: boolean }>;
}
interface HistoricalPracticeStats { attemptsCount: number; correctCount: number; accuracy: number }

export function useStudentDashboard(status: string) {
  const [dailyChallenges, setDailyChallenges] = useState<DailyChallengeSummary[]>([]);
  const [consistencyDays, setConsistencyDays] = useState<ConsistencyDay[]>([]);
  const [historicalStats, setHistoricalStats] = useState<HistoricalPracticeStats>({ attemptsCount: 0, correctCount: 0, accuracy: 0 });
  const [dailyChallengeSummary, setDailyChallengeSummary] = useState<DailyChallengeSummaryData | null>(null);
  const [isLoadingDailyChallengeSummary, setIsLoadingDailyChallengeSummary] = useState(true);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;

    const loadData = async () => {
      try {
        setIsLoadingDailyChallengeSummary(true);
        const [challengeRes, statsRes, consistencyRes, challengeSummaryRes] = await Promise.all([
          studentDashboardService.loadChallenges(),
          studentDashboardService.loadQuestions(),
          studentDashboardService.loadConsistency(),
          studentDashboardService.loadDailyChallengeSummary(),
        ]);
        const challengeBody = (await challengeRes.json().catch(() => ({}))) as { data?: DailyChallengeSummary[] };
        const statsBody = await statsRes.json().catch(() => ({}));
        const consistencyBody = await consistencyRes.json().catch(() => ({}));
        const challengeSummaryBody = await challengeSummaryRes.json().catch(() => ({}));
        if (cancelled) return;
        setDailyChallenges(challengeRes.ok && Array.isArray(challengeBody.data) ? challengeBody.data : []);
        setHistoricalStats(statsRes.ok && statsBody.data?.stats ? {
          attemptsCount: statsBody.data.stats.attemptsCount ?? 0,
          correctCount: statsBody.data.stats.correctCount ?? 0,
          accuracy: statsBody.data.stats.accuracy ?? 0,
        } : { attemptsCount: 0, correctCount: 0, accuracy: 0 });
        setConsistencyDays(consistencyRes.ok && Array.isArray(consistencyBody.data?.days) ? consistencyBody.data.days : []);
        setDailyChallengeSummary(challengeSummaryRes.ok && challengeSummaryBody.data ? challengeSummaryBody.data : null);
      } catch (error) {
        if (!cancelled) { setDailyChallenges([]); setHistoricalStats({ attemptsCount: 0, correctCount: 0, accuracy: 0 }); setConsistencyDays([]); setDailyChallengeSummary(null); }
        console.error('Erro ao carregar dados do aluno:', error);
      } finally {
        if (!cancelled) setIsLoadingDailyChallengeSummary(false);
      }
    };
    void loadData();
    return () => { cancelled = true; };
  }, [status]);

  const consistencySummary = useMemo(() => ({
    activeDays: consistencyDays.filter((day) => day.answeredCount > 0).length,
    answeredCount: consistencyDays.reduce((total, day) => total + day.answeredCount, 0),
  }), [consistencyDays]);
  const visibleConsistencyDays = useMemo(() => [...consistencyDays].sort((left, right) => left.day.localeCompare(right.day)).slice(-7), [consistencyDays]);

  return { dailyChallenges, setDailyChallenges, performanceStats: { totalAnswered: historicalStats.attemptsCount, accuracy: historicalStats.accuracy }, consistencySummary, visibleConsistencyDays, dailyChallengeSummary, isLoadingDailyChallengeSummary };
}
