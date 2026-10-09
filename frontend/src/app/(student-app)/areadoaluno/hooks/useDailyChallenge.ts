'use client';

import { useMemo, useState } from 'react';
import { studentDashboardService } from '../services/student-dashboard.service';
import type { DailyChallengeSummary } from './useStudentDashboard';

export interface ChallengeResult { isCorrect: boolean; correctAnswer?: string | null; explanation?: string | null }
export interface ChallengeAlternative { label: string; text: string }

export function useDailyChallenge(setDailyChallenges: React.Dispatch<React.SetStateAction<DailyChallengeSummary[]>>) {
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallengeSummary | null>(null);
  const [isChallengeModalOpen, setIsChallengeModalOpen] = useState(false);
  const [selectedChallengeAnswer, setSelectedChallengeAnswer] = useState<string | null>(null);
  const [challengeResult, setChallengeResult] = useState<ChallengeResult | null>(null);
  const [isSubmittingChallenge, setIsSubmittingChallenge] = useState(false);

  const openChallengeModal = (challenge: DailyChallengeSummary) => {
    setDailyChallenge(challenge); setSelectedChallengeAnswer(null); setChallengeResult(null); setIsChallengeModalOpen(true);
  };
  const submitChallengeAnswer = async () => {
    if (!dailyChallenge || !selectedChallengeAnswer || isSubmittingChallenge) return;
    setIsSubmittingChallenge(true);
    try {
      const response = await studentDashboardService.answerChallenge(dailyChallenge.id, selectedChallengeAnswer);
      const body = (await response.json().catch(() => ({}))) as { data?: ChallengeResult };
      if (!response.ok || typeof body.data?.isCorrect !== 'boolean') throw new Error('Não foi possível registrar sua resposta.');
      setChallengeResult(body.data);
      setDailyChallenges((current) => current.filter((challenge) => challenge.id !== dailyChallenge.id));
    } catch (error) { console.error('Erro ao responder desafio diário:', error); }
    finally { setIsSubmittingChallenge(false); }
  };
  const challengeAlternatives = useMemo<ChallengeAlternative[]>(() => {
    const alternatives = dailyChallenge?.question.alternatives;
    if (Array.isArray(alternatives)) return alternatives.map((alternative, index) => {
      if (alternative && typeof alternative === 'object') {
        const item = alternative as { label?: unknown; text?: unknown; value?: unknown };
        return { label: String(item.label ?? String.fromCharCode(65 + index)), text: String(item.text ?? item.value ?? '') };
      }
      return { label: String.fromCharCode(65 + index), text: String(alternative) };
    });
    if (alternatives && typeof alternatives === 'object') return Object.entries(alternatives as Record<string, unknown>).map(([label, value]) => ({ label, text: String(value) }));
    return [];
  }, [dailyChallenge]);
  return { dailyChallenge, setDailyChallenge, isChallengeModalOpen, setIsChallengeModalOpen, selectedChallengeAnswer, setSelectedChallengeAnswer, challengeResult, isSubmittingChallenge, challengeAlternatives, openChallengeModal, submitChallengeAnswer };
}
