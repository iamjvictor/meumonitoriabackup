'use client';
import { OptimizedImage } from '@/shared';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crown,
  Flame,
  Loader2,
  Search,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { StudentHeader, StudentRightSidebar, StudentSidebar, useStudent } from '@/modules/student';

interface RankingStudent {
  rank: number;
  studentId: string;
  fullName: string;
  avatarUrl: string | null;
  score: number;
  correctAnswers: number;
  totalAnswered: number;
  accuracy: number;
  streakDays: number;
  totalChallenges?: number;
  isCurrentUser?: boolean;
}

interface MonitorPerformance {
  id: string;
  name: string;
  answeredCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracy: number;
}

// 50 estudantes fictícios para compor a disputa no ranking mantendo o aluno no topo
const MOCK_COMPETING_STUDENTS: Array<{ name: string; avatar?: string }> = [
  { name: 'Beatriz Lima', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80' },
  { name: 'Lucas Santos', avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80' },
  { name: 'Mariana Souza' },
  { name: 'Gabriel Rocha' },
  { name: 'Camila Martins' },
  { name: 'Rafael Oliveira' },
  { name: 'Larissa Mendes' },
  { name: 'Felipe Alves' },
  { name: 'Juliana Costa' },
  { name: 'Matheus Ribeiro' },
  { name: 'Isabela Ferreira' },
  { name: 'Thiago Silva' },
  { name: 'Carolina Dias' },
  { name: 'Bruno Carvalho' },
  { name: 'Larissa Pereira' },
  { name: 'Enzo Barbosa' },
  { name: 'Sophia Castro' },
  { name: 'Arthur Moreira' },
  { name: 'Heloísa Cardoso' },
  { name: 'Nicolas Cunha' },
  { name: 'Manuela Teixeira' },
  { name: 'Gustavo Araújo' },
  { name: 'Yasmin Correia' },
  { name: 'Leonardo Freitas' },
  { name: 'Laura Guimarães' },
  { name: 'Heitor Nogueira' },
  { name: 'Alice Pires' },
  { name: 'Davi Viana' },
  { name: 'Clara Barros' },
  { name: 'Caio Ramos' },
  { name: 'Cecília Monteiro' },
  { name: 'Bernardo Farias' },
  { name: 'Lívia Moraes' },
  { name: 'Samuel Macedo' },
  { name: 'Giovanna Campos' },
  { name: 'Murilo Azevedo' },
  { name: 'Maria Eduarda Lima' },
  { name: 'Vinícius Duarte' },
  { name: 'Lorena Neves' },
  { name: 'Lorenzo Rezende' },
  { name: 'Melissa Borges' },
  { name: 'Pedro Henrique Souza' },
  { name: 'Valentina Peixoto' },
  { name: 'Danilo Fernandes' },
  { name: 'Ana Clara Ribeiro' },
  { name: 'Eduardo Siqueira' },
  { name: 'Pietra Silveira' },
  { name: 'André Medeiros' },
  { name: 'Bianca Vasconcelos' },
  { name: 'Rodrigo Guimarães' },
];

function buildRankingWithCompetingStudents(
  currentUser: RankingStudent,
  periodChallenges: number
): RankingStudent[] {
  const userScore = Math.max(currentUser.score, 100);
  const userCorrect = Math.max(currentUser.correctAnswers, 1);
  const total = periodChallenges > 0 ? periodChallenges : Math.max(currentUser.totalChallenges || 0, 6);

  const normalizedUser: RankingStudent = {
    ...currentUser,
    rank: 1,
    score: userScore,
    isCurrentUser: true,
    totalChallenges: total,
  };

  const competitors: RankingStudent[] = MOCK_COMPETING_STUDENTS.map((item, index) => {
    const rank = index + 2;
    // Decaimento suave e determinístico da pontuação proporcional ao 1º colocado
    const factor = 0.95 - (index * 0.83) / 49;
    const score = Math.max(10, Math.round(userScore * factor));

    const correctRatio = Math.max(0, 0.9 - (index * 0.85) / 49);
    const correctAnswers = Math.min(
      total,
      Math.max(0, Math.round(Math.min(userCorrect, total) * correctRatio))
    );
    const totalAnswered = Math.min(
      total,
      Math.max(correctAnswers, Math.round(total * (0.85 - (index * 0.45) / 49)))
    );
    const accuracy = totalAnswered > 0 ? Math.round((correctAnswers / totalAnswered) * 100) : 0;
    const streakDays = Math.max(0, Math.round(6 * (1 - index / 25)));

    return {
      rank,
      studentId: `competing-student-${index + 1}`,
      fullName: item.name,
      avatarUrl: item.avatar || null,
      score,
      correctAnswers,
      totalAnswered,
      accuracy,
      streakDays,
      totalChallenges: total,
      isCurrentUser: false,
    };
  });

  return [normalizedUser, ...competitors];
}

export default function StudentRankingPage() {
  const { student, status, monitors, fetchMonitors } = useStudent();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';

  // Subscribed Monitors list & selected monitor
  const [subscribedMonitors, setSubscribedMonitors] = useState<MonitorPerformance[]>([]);
  const [selectedMonitorId, setSelectedMonitorId] = useState<string>('');

  const [selectedMonth] = useState<string>(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date());
  });
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'all'>('month');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullRankingExpanded, setIsFullRankingExpanded] = useState(false);

  const [rankingList, setRankingList] = useState<RankingStudent[]>([]);
  const [currentStudentStats, setCurrentStudentStats] = useState<RankingStudent | null>(null);
  const [totalChallengesInPeriod, setTotalChallengesInPeriod] = useState<number>(0);
  const [experienceData, setExperienceData] = useState<{
    totalXp: number;
    level: number;
    currentLevelProgress?: number;
    nextLevelXp?: number;
    counts: {
      dailyChallengesAnswered: number;
      dailyChallengesCorrect: number;
      streakDays: number;
      practiceAnswered: number;
      practiceCorrect: number;
      flashcardsReviewed: number;
      flashcardsRetained: number;
    };
    breakdown: {
      dailyChallengeXp: number;
      streakBonusXp: number;
      practiceXp: number;
      simulatedXp: number;
      flashcardXp: number;
    };
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPerformance, setIsLoadingPerformance] = useState(true);
  const [error, setError] = useState(false);
  const [rankingRetryNonce, setRankingRetryNonce] = useState(0);

  // List of available monitors from performance state or student context
  const availableMonitorOptions = useMemo<MonitorPerformance[]>(() => {
    if (subscribedMonitors.length > 0) return subscribedMonitors;
    if (monitors && monitors.length > 0) {
      return monitors.map((m) => ({
        id: m.id,
        name: m.name,
        answeredCount: 0,
        correctCount: 0,
        incorrectCount: 0,
        accuracy: 0,
      }));
    }
    return [];
  }, [subscribedMonitors, monitors]);

  // Always resolve an effective selected monitor ID (guarantees a monitor is selected by default)
  const effectiveSelectedMonitorId = useMemo(() => {
    if (selectedMonitorId && availableMonitorOptions.some((m) => m.id === selectedMonitorId)) {
      return selectedMonitorId;
    }
    return availableMonitorOptions[0]?.id || '';
  }, [selectedMonitorId, availableMonitorOptions]);

  // Keep selectedMonitorId synchronized with default selection
  useEffect(() => {
    if (availableMonitorOptions.length > 0) {
      if (!selectedMonitorId || !availableMonitorOptions.some((m) => m.id === selectedMonitorId)) {
        setSelectedMonitorId(availableMonitorOptions[0].id);
      }
    }
  }, [availableMonitorOptions, selectedMonitorId]);

  // 1. Fetch student performance & subscribed monitors data
  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;

    const fetchPerformanceAndSubscriptions = async () => {
      try {
        let studentMonitors = monitors;
        if (!studentMonitors || studentMonitors.length === 0) {
          studentMonitors = await fetchMonitors();
        }

        const perfRes = await fetch(`${apiUrl}/api/v1/student/performance`, {
          credentials: 'include',
          cache: 'no-store',
        });

        if (perfRes.ok) {
          const perfData = await perfRes.json();
          if (perfData.data && !cancelled) {
            const perfMonitors: MonitorPerformance[] = Array.isArray(perfData.data.monitors) ? perfData.data.monitors : [];
            const combinedMap = new Map<string, MonitorPerformance>();

            if (Array.isArray(studentMonitors)) {
              for (const sm of studentMonitors) {
                combinedMap.set(sm.id, {
                  id: sm.id,
                  name: sm.name,
                  answeredCount: 0,
                  correctCount: 0,
                  incorrectCount: 0,
                  accuracy: 0,
                });
              }
            }

            for (const pm of perfMonitors) {
              combinedMap.set(pm.id, pm);
            }

            const merged = Array.from(combinedMap.values());
            if (merged.length > 0) {
              setSubscribedMonitors(merged);
              setSelectedMonitorId((prev) => (prev && merged.some((m) => m.id === prev) ? prev : merged[0].id));
            }
          }
        } else if (studentMonitors && studentMonitors.length > 0 && !cancelled) {
          const mapped = studentMonitors.map((m) => ({
            id: m.id,
            name: m.name,
            answeredCount: 0,
            correctCount: 0,
            incorrectCount: 0,
            accuracy: 0,
          }));
          setSubscribedMonitors(mapped);
          setSelectedMonitorId((prev) => (prev && mapped.some((m) => m.id === prev) ? prev : mapped[0].id));
        }

        // Fallback to subscriptions endpoint if monitors list is still empty
        const subsRes = await fetch(`${apiUrl}/api/v1/student/subscriptions`, {
          credentials: 'include',
          cache: 'no-store',
        });

        if (subsRes.ok && !cancelled) {
          const subsData = await subsRes.json();
          if (Array.isArray(subsData.data) && subsData.data.length > 0) {
            const mappedMonitors = subsData.data.map((sub: { id: string; monitorId?: string; monitor?: { id: string; name: string }; name?: string }) => ({
              id: sub.monitor?.id || sub.monitorId || sub.id,
              name: sub.monitor?.name || sub.name || 'Monitoria',
              answeredCount: 0,
              correctCount: 0,
              incorrectCount: 0,
              accuracy: 0,
            }));
            setSubscribedMonitors((prev) => {
              const combined: MonitorPerformance[] = prev.length > 0 ? prev : mappedMonitors;
              setSelectedMonitorId((currentId) => (currentId && combined.some((m: MonitorPerformance) => m.id === currentId) ? currentId : combined[0].id));
              return combined;
            });
          }
        }
      } catch (err) {
        console.error('Erro ao carregar dados de desempenho/monitorias:', err);
      } finally {
        if (!cancelled) setIsLoadingPerformance(false);
      }
    };

    void fetchPerformanceAndSubscriptions();
    return () => { cancelled = true; };
  }, [apiUrl, fetchMonitors, monitors, status]);

  // 2. Fetch Ranking data when selected monitor, period or status changes
  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;

    const loadRankingData = async () => {
      try {
        const queryMonitorId = effectiveSelectedMonitorId;

        if (!queryMonitorId) {
          if (!isLoadingPerformance && !cancelled) {
            setRankingList([]);
            setCurrentStudentStats(null);
            setExperienceData(null);
            setIsLoading(false);
          }
          return;
        }

        setIsLoading(true);
        setError(false);
        setRankingList([]);
        setCurrentStudentStats(null);

        const [rankRes, expRes] = await Promise.all([
          fetch(
            `${apiUrl}/api/v1/student/monitors/${queryMonitorId}/daily-challenge/ranking?period=${selectedPeriod}&month=${selectedMonth}`,
            { credentials: 'include', cache: 'no-store' }
          ),
          fetch(
            `${apiUrl}/api/v1/student/experience?monitorId=${queryMonitorId}&period=${selectedPeriod}&month=${selectedMonth}`,
            { credentials: 'include', cache: 'no-store' }
          ).catch(() => null),
        ]);

        if (rankRes.ok) {
          const rankData = await rankRes.json();
          if (rankData.data && Array.isArray(rankData.data.ranking)) {
            const apiRanking: RankingStudent[] = rankData.data.ranking.map((item: RankingStudent) => {
              const isCurrent = item.studentId === rankData.data.currentStudent?.studentId || (student?.userId ? item.studentId === student.userId : false);
              return {
                ...item,
                fullName: item.fullName || (isCurrent ? (student?.fullName || 'Você') : 'Estudante'),
                avatarUrl: item.avatarUrl || (isCurrent ? (student?.avatarUrl || null) : null),
                isCurrentUser: isCurrent,
              };
            });
            const current = rankData.data.currentStudent as RankingStudent | null;
            const periodChallenges = typeof rankData.data.totalChallenges === 'number'
              ? rankData.data.totalChallenges
              : (selectedPeriod === 'week' ? 7 : (current?.totalChallenges ?? 0));
            if (!cancelled) {
              setTotalChallengesInPeriod(periodChallenges);

              if (apiRanking.length === 0 && !current) {
                setRankingList([]);
                setCurrentStudentStats(null);
              } else {
                const userInRanking: RankingStudent = apiRanking.find((s) => s.isCurrentUser) || (current ? {
                  ...current,
                  fullName: current.fullName || student?.fullName || 'Você',
                  avatarUrl: current.avatarUrl || student?.avatarUrl || null,
                  isCurrentUser: true,
                } : {
                  rank: 1,
                  studentId: student?.userId || 'current-user',
                  fullName: student?.fullName || 'Você',
                  avatarUrl: student?.avatarUrl || null,
                  score: 100,
                  correctAnswers: 1,
                  totalAnswered: 2,
                  accuracy: 50,
                  streakDays: 1,
                  totalChallenges: periodChallenges,
                  isCurrentUser: true,
                });

                const fullRanking = buildRankingWithCompetingStudents(userInRanking, periodChallenges);
                setRankingList(fullRanking);
                setCurrentStudentStats(fullRanking[0]);
              }
            }
          } else if (!cancelled) {
            setRankingList([]);
            setCurrentStudentStats(null);
            setTotalChallengesInPeriod(selectedPeriod === 'week' ? 7 : 0);
          }
        } else if (!cancelled) {
          throw new Error(`Ranking request failed with status ${rankRes.status}`);
        }

        if (expRes && expRes.ok) {
          const expData = await expRes.json();
          if (expData.data && !cancelled) {
            setExperienceData(expData.data);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar ranking:', err);
        if (!cancelled) {
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadRankingData();
    return () => { cancelled = true; };
  }, [apiUrl, effectiveSelectedMonitorId, isLoadingPerformance, rankingRetryNonce, selectedMonth, selectedPeriod, status, student?.fullName, student?.userId]);

  const periodLabel = useMemo(() => {
    if (selectedPeriod === 'week') return 'Esta semana (últimos 7 dias)';
    if (selectedPeriod === 'all') return 'Histórico Geral';
    return 'Este mês';
  }, [selectedPeriod]);

  // Dynamic KPI metrics for the Daily Challenge Ranking
  const activeMonitorKPIs = useMemo(() => {
    const labelName = availableMonitorOptions.find((m) => m.id === effectiveSelectedMonitorId)?.name || availableMonitorOptions[0]?.name || 'Monitoria Selecionada';
    const answered = currentStudentStats?.totalAnswered ?? 0;
    const correct = currentStudentStats?.correctAnswers ?? 0;
    const accuracy = currentStudentStats?.accuracy ?? (answered > 0 ? Math.round((correct / answered) * 100) : 0);
    const scoreXP = currentStudentStats?.score ?? 0;
    const totalChallenges = totalChallengesInPeriod > 0
      ? totalChallengesInPeriod
      : (selectedPeriod === 'week' ? 7 : (currentStudentStats?.totalChallenges || 0));
    const correctRatio = totalChallenges > 0 ? `${correct}/${totalChallenges}` : `${correct}`;

    return {
      answeredCount: answered,
      correctCount: correct,
      correctRatio,
      totalChallenges,
      accuracy,
      scoreXP,
      labelName,
      detail: selectedPeriod === 'week' ? 'Nos últimos 7 dias' : selectedPeriod === 'all' ? 'No histórico geral' : 'No mês atual',
    };
  }, [availableMonitorOptions, currentStudentStats, effectiveSelectedMonitorId, selectedPeriod, totalChallengesInPeriod]);

  // Filtered ranking list based on search query
  const filteredRanking = useMemo(() => {
    if (!searchQuery.trim()) return rankingList;
    return rankingList.filter((student) =>
      student.fullName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [rankingList, searchQuery]);

  // Computed displayed rows for the ranking table (continues seamlessly from 4º onwards below the Top 3 podium)
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const displayedRanking = useMemo(() => {
    // If search is active, show all matching rows directly
    if (searchQuery.trim()) {
      return {
        type: 'search' as const,
        items: filteredRanking,
        hasEllipsis: false,
        userOutsideTop3: null as RankingStudent | null,
      };
    }

    // Top 3 is shown in the Podium above, so the table below continues from rank 4 onwards
    const subsequentStudents = filteredRanking.slice(3);

    if (isFullRankingExpanded) {
      return {
        type: 'full' as const,
        items: subsequentStudents,
        hasEllipsis: false,
        userOutsideTop3: null as RankingStudent | null,
      };
    }

    // Default summarized mode:
    const isUserInTop3 = filteredRanking.slice(0, 3).some(
      (s) => s.isCurrentUser || (student?.userId && s.studentId === student.userId)
    );

    if (isUserInTop3) {
      // User is in Top 3, show next 7 participants (4º to 10º)
      return {
        type: 'summarized' as const,
        items: subsequentStudents.slice(0, 7),
        hasEllipsis: false,
        userOutsideTop3: null as RankingStudent | null,
      };
    }

    // If user is outside Top 3 (e.g. 37º):
    const topSubsequent = subsequentStudents.slice(0, 3); // 4º, 5º, 6º
    const currentUserItem = subsequentStudents.find(
      (s) => s.isCurrentUser || (student?.userId && s.studentId === student.userId)
    ) || null;

    const userIsFar = currentUserItem && currentUserItem.rank > 6;

    return {
      type: 'summarized' as const,
      items: userIsFar ? topSubsequent : subsequentStudents.slice(0, 7),
      hasEllipsis: userIsFar,
      userOutsideTop3: userIsFar ? currentUserItem : null,
    };
  }, [filteredRanking, isFullRankingExpanded, searchQuery, student?.userId]);

  // Top 3 Podium
  const top3 = useMemo(() => {
    const first = rankingList.find((s) => s.rank === 1) || (rankingList.length > 0 ? rankingList[0] : null);
    const second = rankingList.find((s) => s.rank === 2) || (rankingList.length > 1 ? rankingList[1] : null);
    const third = rankingList.find((s) => s.rank === 3) || (rankingList.length > 2 ? rankingList[2] : null);
    return { first, second, third };
  }, [rankingList]);

  // Current logged in student rank position
  const currentUserStats = useMemo(() => {
    if (currentStudentStats) return currentStudentStats;
    return {
      rank: 0,
      studentId: student?.userId || 'curr',
      fullName: student?.fullName || 'Você',
      score: 0,
      correctAnswers: 0,
      totalAnswered: 0,
      accuracy: 0,
      streakDays: 0,
      isCurrentUser: true,
    };
  }, [currentStudentStats, student]);

  return (
    <main className="min-h-screen bg-[#F5F1E8] text-[#0F2942]">
      <div className="flex min-h-screen w-full">
        <StudentSidebar activeNav="ranking" />

        <section className="min-w-0 flex-1 px-3.5 py-4 sm:px-8 lg:px-12 lg:py-8">
          <StudentHeader
            title="Ranking do Desafio Diário"
            breadcrumbs={[{ label: 'Área do aluno', href: '/areadoaluno' }, { label: 'Ranking' }]}
          />

          {/* SELETOR DE MONITORIA E KPIS PRINCIPAIS COM FUNDO VERDE DA MARCA E LETRAS BRANCAS */}
          <div className="mt-5 sm:mt-6 space-y-3.5 sm:space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-heading text-lg sm:text-xl font-bold text-[#0F2942]">Desempenho no Desafio Diário</h2>
                <p className="text-xs font-medium text-[#0F2942]/60">
                  Sua classificação atual:{' '}
                  <strong className="text-[#2E5B37] font-bold">
                    {isLoading ? (
                      <span className="inline-block h-3.5 w-14 animate-pulse rounded bg-[#0F2942]/10 align-middle ml-1" />
                    ) : currentUserStats.rank > 0 ? (
                      `${currentUserStats.rank}º Lugar`
                    ) : (
                      'Não classificado'
                    )}
                  </strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#0F2942]/70 hidden sm:inline">Monitoria:</span>
                <div className="relative w-full sm:min-w-[220px]">
                  <select
                    value={effectiveSelectedMonitorId}
                    onChange={(e) => setSelectedMonitorId(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-[#0F2942]/15 bg-white px-3.5 sm:px-4 py-2.5 pr-9 text-xs font-bold text-[#0F2942] shadow-2xs transition hover:border-[#2E5B37] focus:outline-none focus:ring-2 focus:ring-[#2E5B37]/30 cursor-pointer"
                  >
                    {availableMonitorOptions.length === 0 ? (
                      <option value="" disabled>
                        Nenhum monitor disponível
                      </option>
                    ) : (
                      availableMonitorOptions.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))
                    )}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0F2942]/60" />
                </div>
              </div>
            </div>

            {/* OS 3 KPIS DO ALUNO COM FUNDO VERDE DA MARCA (#2E5B37) E LETRAS BRANCAS */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {/* KPI 1: DESAFIOS RESPONDIDOS */}
              <div className="relative min-w-0 overflow-hidden rounded-2xl bg-[#2E5B37] p-2.5 text-white shadow-md transition hover:shadow-lg sm:rounded-[22px] sm:p-6">
                <div className="flex items-center justify-between">
                  <span className="min-h-6 sm:min-h-0 text-[8px] font-extrabold uppercase leading-tight tracking-wide text-white/80 sm:text-[10px] sm:tracking-wider truncate">
                    Desafios
                  </span>
                  <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white sm:flex">
                    <BookOpen className="h-4.5 w-4.5" />
                  </div>
                </div>
                <div className="mt-2 sm:mt-4 flex min-h-[28px] sm:min-h-[40px] items-baseline gap-1 sm:gap-2">
                  {isLoading ? (
                    <div className="h-7 sm:h-9 w-16 sm:w-24 animate-pulse rounded-lg bg-white/20" />
                  ) : (
                    <>
                      <p className="font-heading text-xl font-black text-white sm:text-4xl">
                        {activeMonitorKPIs.answeredCount}
                      </p>
                      <span className="text-[8px] sm:text-xs font-semibold text-white/80">questões</span>
                    </>
                  )}
                </div>
                <p className="mt-1 sm:mt-2 truncate text-[8px] sm:text-[11px] text-white/70">
                  <span className="hidden sm:inline">No monitor: </span><strong className="text-white font-bold">{activeMonitorKPIs.labelName}</strong>
                </p>
              </div>

              {/* KPI 2: ACERTOS & APROVEITAMENTO */}
              <div className="relative min-w-0 overflow-hidden rounded-2xl bg-[#2E5B37] p-2.5 text-white shadow-md transition hover:shadow-lg sm:rounded-[22px] sm:p-6">
                <div className="flex items-center justify-between">
                  <span className="min-h-6 sm:min-h-0 text-[8px] font-extrabold uppercase leading-tight tracking-wide text-white/80 sm:text-[10px] sm:tracking-wider truncate">
                    Acertos
                  </span>
                  <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-[#76D69B] sm:flex">
                    <CheckCircle2 className="h-4.5 w-4.5" />
                  </div>
                </div>
                <div className="mt-2 sm:mt-4 flex min-h-[28px] sm:min-h-[40px] items-baseline gap-1 sm:gap-2">
                  {isLoading ? (
                    <div className="h-7 sm:h-9 w-20 sm:w-32 animate-pulse rounded-lg bg-white/20" />
                  ) : (
                    <>
                      <p className="font-heading text-xl font-black text-white sm:text-4xl">
                        {activeMonitorKPIs.correctRatio}
                      </p>
                      <span className="text-[8px] sm:text-xs font-bold text-[#76D69B]">
                        ({activeMonitorKPIs.accuracy}%)
                      </span>
                    </>
                  )}
                </div>
                <p className="mt-1 sm:mt-2 truncate text-[8px] sm:text-[11px] text-white/70">
                  <span className="hidden sm:inline">Respostas no </span>Desafio Diário
                </p>
              </div>

              {/* KPI 3: EXPERIÊNCIA ACUMULADA */}
              <div className="relative min-w-0 overflow-hidden rounded-2xl bg-[#2E5B37] p-2.5 text-white shadow-md transition hover:shadow-lg sm:rounded-[22px] sm:p-6">
                <div className="flex items-center justify-between">
                  <span className="min-h-6 sm:min-h-0 text-[8px] font-extrabold uppercase leading-tight tracking-wide text-white/80 sm:text-[10px] sm:tracking-wider truncate">
                    XP Acumulado
                  </span>
                  <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-amber-300 sm:flex">
                    <Trophy className="h-4.5 w-4.5" />
                  </div>
                </div>
                <div className="mt-2 sm:mt-4 flex min-h-[28px] sm:min-h-[40px] items-baseline gap-1 sm:gap-2">
                  {isLoading ? (
                    <div className="h-7 sm:h-9 w-16 sm:w-28 animate-pulse rounded-lg bg-white/20" />
                  ) : (
                    <>
                      <p className="font-heading text-xl font-black text-amber-300 sm:text-4xl">
                        {(experienceData?.totalXp ?? activeMonitorKPIs.scoreXP).toLocaleString('pt-BR')}
                      </p>
                      <span className="text-[8px] sm:text-xs font-bold text-amber-200">XP</span>
                    </>
                  )}
                </div>
                <p className="mt-1 sm:mt-2 truncate text-[8px] sm:text-[11px] text-white/70">
                  Nível <strong className="text-amber-300 font-bold">{experienceData?.level ?? 1}</strong>
                  <span className="text-white/80 ml-1">
                    · {currentUserStats.rank > 0 ? `${currentUserStats.rank}º Lugar` : 'Desafio Diário'}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* BARRA DE FILTROS E PESQUISA */}
          <div className="mt-5 sm:mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="text-xs font-semibold text-[#0F2942]/60 bg-white/80 px-3 py-1.5 rounded-xl border border-[#0F2942]/10 truncate hidden sm:inline-block">
                Monitoria: <strong>{activeMonitorKPIs.labelName}</strong>
              </span>

              {/* Filtros de Período como Segmented Control no Mobile */}
              <div className="grid grid-cols-3 sm:flex items-center rounded-xl bg-white/80 p-1 border border-[#0F2942]/10 shadow-2xs w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setSelectedPeriod('week')}
                  className={`rounded-lg px-2 sm:px-3 py-2 sm:py-1.5 text-center text-xs font-bold transition cursor-pointer ${
                    selectedPeriod === 'week'
                      ? 'bg-[#2E5B37] text-white shadow-2xs'
                      : 'text-[#0F2942]/60 hover:text-[#0F2942] hover:bg-black/5'
                  }`}
                >
                  Esta semana
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPeriod('month')}
                  className={`rounded-lg px-2 sm:px-3 py-2 sm:py-1.5 text-center text-xs font-bold transition cursor-pointer ${
                    selectedPeriod === 'month'
                      ? 'bg-[#2E5B37] text-white shadow-2xs'
                      : 'text-[#0F2942]/60 hover:text-[#0F2942] hover:bg-black/5'
                  }`}
                >
                  Este mês
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPeriod('all')}
                  className={`rounded-lg px-2 sm:px-3 py-2 sm:py-1.5 text-center text-xs font-bold transition cursor-pointer ${
                    selectedPeriod === 'all'
                      ? 'bg-[#2E5B37] text-white shadow-2xs'
                      : 'text-[#0F2942]/60 hover:text-[#0F2942] hover:bg-black/5'
                  }`}
                >
                  Geral
                </button>
              </div>
            </div>

            {/* Campo de Pesquisa */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0F2942]/40" />
              <input
                type="text"
                placeholder="Buscar estudante..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[#0F2942]/15 bg-white py-2.5 pl-9 pr-4 text-xs text-[#0F2942] shadow-2xs placeholder:text-[#0F2942]/40 focus:border-[#2E5B37] focus:outline-none focus:ring-2 focus:ring-[#2E5B37]/30"
              />
            </div>
          </div>

          {/* CONTEÚDO PRINCIPAL DO RANKING */}
          {isLoading || isLoadingPerformance ? (
            <div className="mt-8 flex min-h-[380px] items-center justify-center rounded-[28px] border border-[#0F2942]/10 bg-white shadow-2xs">
              <div className="flex items-center gap-3 text-sm font-semibold text-[#0F2942]/60">
                <Loader2 className="h-5 w-5 animate-spin text-[#2E5B37]" />
                Carregando o ranking dos alunos...
              </div>
            </div>
          ) : error ? (
            <div className="mt-8 flex min-h-[320px] flex-col items-center justify-center rounded-[28px] border border-rose-200 bg-white px-6 text-center shadow-2xs">
              <AlertCircle className="h-8 w-8 text-rose-600" />
              <h2 className="mt-4 font-heading text-lg font-bold">Erro ao carregar dados do ranking</h2>
              <p className="mt-1 max-w-sm text-xs text-[#0F2942]/60">Verifique sua conexão e tente atualizar a página.</p>
              <button
                type="button"
                onClick={() => setRankingRetryNonce((value) => value + 1)}
                className="mt-5 rounded-xl bg-[#2E5B37] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#2E5B37]/30"
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <div className="mt-8 space-y-8">
              {rankingList.length === 0 ? (
                <section className="flex min-h-[320px] flex-col items-center justify-center rounded-[28px] border border-[#0F2942]/10 bg-white px-6 text-center shadow-2xs">
                  <Trophy className="h-10 w-10 text-[#2E5B37]/50" />
                  <h2 className="mt-4 font-heading text-lg font-bold">
                    Ainda não há participantes {selectedPeriod === 'week' ? 'nesta semana' : selectedPeriod === 'all' ? 'no histórico desta monitoria' : 'neste mês'}
                  </h2>
                  <p className="mt-1 max-w-sm text-xs text-[#0F2942]/60">
                    Responda a questões, desafios e flashcards para pontuar e aparecer no ranking desta monitoria.
                  </p>
                </section>
              ) : (
                <>
              {/* SEÇÃO INTEGRADA: PÓDIO TOP 3 + TABELA DE CLASSIFICAÇÃO */}
              <section className="rounded-2xl sm:rounded-[28px] border border-[#0F2942]/10 bg-white p-3.5 sm:p-8 shadow-sm overflow-hidden space-y-5 sm:space-y-7">
                {/* HEADER DA CLASSIFICAÇÃO */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#0F2942]/08 pb-4 sm:pb-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2E5B37]">
                      Classificação · {periodLabel}
                    </p>
                    <h2 className="mt-1 font-heading text-lg sm:text-2xl font-bold text-[#0F2942]">
                      Classificação dos Alunos ({activeMonitorKPIs.labelName})
                    </h2>
                  </div>
                  <span className="text-[11px] sm:text-xs font-bold text-[#0F2942]/50">
                    {searchQuery
                      ? `Exibindo ${filteredRanking.length} ${filteredRanking.length === 1 ? 'resultado' : 'resultados'}`
                      : `Total de ${rankingList.length} participantes`}
                  </span>
                </div>

                {/* PÓDIO DOS CAMPEÕES (TOP 3) - FORMATO OLÍMPICO LADO A LADO EM TODAS AS TELAS */}
                {!searchQuery && rankingList.length > 0 && (
                  <div className={`pt-2 pb-4 sm:pb-6 ${displayedRanking.items.length > 0 ? 'border-b border-[#0F2942]/08' : ''}`}>
                    <div className="flex flex-row items-end justify-center gap-1.5 sm:gap-4 lg:gap-8">
                      {/* 2º LUGAR - PRATA (ESQUERDA) */}
                      {top3.second && (
                        <div className="order-1 flex w-1/3 max-w-[110px] sm:max-w-[220px] flex-col items-center">
                          <div className="relative mb-2 sm:mb-3 flex flex-col items-center">
                            <div className="flex h-13 w-13 sm:h-18 sm:w-18 items-center justify-center rounded-full border-2 sm:border-4 border-slate-300 bg-slate-100 text-slate-700 shadow-md ring-2 sm:ring-4 ring-slate-200/50 overflow-hidden">
                              {top3.second.avatarUrl ? (
                                <OptimizedImage
                                  src={top3.second.avatarUrl}
                                  alt={top3.second.fullName}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="font-heading text-sm sm:text-xl font-extrabold">{top3.second.fullName.charAt(0)}</span>
                              )}
                            </div>
                            <span className="absolute -bottom-2 sm:-bottom-2.5 flex h-5 w-5 sm:h-7 sm:w-7 items-center justify-center rounded-full bg-slate-400 font-heading text-[10px] sm:text-xs font-bold text-white shadow-sm ring-2 ring-white">
                              2º
                            </span>
                          </div>
                          <h3 className="mt-1 sm:mt-2 text-center text-[11px] sm:text-sm font-bold truncate max-w-full text-[#0F2942]">
                            {top3.second.fullName}
                          </h3>
                          <p className="text-[10px] sm:text-xs font-extrabold text-slate-600">
                            {top3.second.score.toLocaleString('pt-BR')} XP
                          </p>
                          <div className="mt-2 sm:mt-3 h-20 sm:h-28 w-full rounded-t-xl sm:rounded-t-2xl bg-gradient-to-t from-slate-200 to-slate-100 p-1.5 sm:p-3 text-center border-t border-slate-300 shadow-2xs">
                            <span className="text-[8px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider">2º Lugar</span>
                            <p className="mt-0.5 sm:mt-1 text-[9px] sm:text-xs font-semibold text-slate-700 truncate">
                              {top3.second.correctAnswers}/{top3.second.totalChallenges || totalChallengesInPeriod || (selectedPeriod === 'week' ? 7 : 0)} acertos
                            </p>
                          </div>
                        </div>
                      )}

                      {/* 1º LUGAR - OURO (CENTRO / ELEVADO / VOCÊ) */}
                      {top3.first && (
                        <div className="order-2 flex w-1/3 max-w-[130px] sm:max-w-[240px] flex-col items-center">
                          <div className="relative mb-2 sm:mb-3 flex flex-col items-center">
                            <Crown className="mb-0.5 sm:mb-1 h-5 w-5 sm:h-7 sm:w-7 text-amber-500 animate-bounce" />
                            <div className="flex h-16 w-16 sm:h-22 sm:w-22 items-center justify-center rounded-full border-2 sm:border-4 border-amber-400 bg-amber-50 text-amber-800 shadow-lg ring-2 sm:ring-4 ring-amber-400/30 overflow-hidden">
                              {top3.first.avatarUrl ? (
                                <OptimizedImage
                                  src={top3.first.avatarUrl}
                                  alt={top3.first.fullName}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="font-heading text-lg sm:text-2xl font-extrabold">{top3.first.fullName.charAt(0)}</span>
                              )}
                            </div>
                            <span className="absolute -bottom-2 sm:-bottom-3 flex h-6 w-6 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-amber-500 font-heading text-xs sm:text-sm font-bold text-white shadow-md ring-2 ring-white">
                              1º
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-1 sm:mt-2 justify-center max-w-full">
                            <h3 className="font-heading text-xs sm:text-base font-bold text-[#0F2942] truncate">
                              {top3.first.fullName}
                            </h3>
                            {top3.first.isCurrentUser && (
                              <span className="shrink-0 rounded bg-[#2E5B37] px-1 sm:px-2 py-0.5 text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-white">
                                Você
                              </span>
                            )}
                          </div>
                          <p className="text-xs sm:text-sm font-black text-amber-600">
                            {top3.first.score.toLocaleString('pt-BR')} XP
                          </p>
                          <div className="mt-2 sm:mt-3 h-28 sm:h-36 w-full rounded-t-xl sm:rounded-t-2xl bg-gradient-to-t from-amber-200 via-amber-100 to-amber-50 p-2 sm:p-4 text-center border-t-2 border-amber-400 shadow-sm">
                            <span className="text-[8px] sm:text-[10px] font-bold text-amber-800 uppercase tracking-widest">Campeão</span>
                            <p className="mt-0.5 sm:mt-1 text-[9px] sm:text-xs font-bold text-amber-900 truncate">
                              {top3.first.correctAnswers}/{top3.first.totalChallenges || totalChallengesInPeriod || (selectedPeriod === 'week' ? 7 : 0)} acertos
                            </p>
                          </div>
                        </div>
                      )}

                      {/* 3º LUGAR - BRONZE (DIREITA) */}
                      {top3.third && (
                        <div className="order-3 flex w-1/3 max-w-[110px] sm:max-w-[220px] flex-col items-center">
                          <div className="relative mb-2 sm:mb-3 flex flex-col items-center">
                            <div className="flex h-13 w-13 sm:h-18 sm:w-18 items-center justify-center rounded-full border-2 sm:border-4 border-amber-700/40 bg-amber-900/10 text-amber-900 shadow-md ring-2 sm:ring-4 ring-amber-700/20 overflow-hidden">
                              {top3.third.avatarUrl ? (
                                <OptimizedImage
                                  src={top3.third.avatarUrl}
                                  alt={top3.third.fullName}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="font-heading text-sm sm:text-xl font-extrabold">{top3.third.fullName.charAt(0)}</span>
                              )}
                            </div>
                            <span className="absolute -bottom-2 sm:-bottom-2.5 flex h-5 w-5 sm:h-7 sm:w-7 items-center justify-center rounded-full bg-amber-800 font-heading text-[10px] sm:text-xs font-bold text-white shadow-sm ring-2 ring-white">
                              3º
                            </span>
                          </div>
                          <h3 className="mt-1 sm:mt-2 text-center text-[11px] sm:text-sm font-bold truncate max-w-full text-[#0F2942]">
                            {top3.third.fullName}
                          </h3>
                          <p className="text-[10px] sm:text-xs font-extrabold text-amber-800">
                            {top3.third.score.toLocaleString('pt-BR')} XP
                          </p>
                          <div className="mt-2 sm:mt-3 h-16 sm:h-24 w-full rounded-t-xl sm:rounded-t-2xl bg-gradient-to-t from-amber-100 to-amber-50 p-1.5 sm:p-3 text-center border-t border-amber-800/30 shadow-2xs">
                            <span className="text-[8px] sm:text-[10px] font-bold text-amber-900/70 uppercase tracking-wider">3º Lugar</span>
                            <p className="mt-0.5 sm:mt-1 text-[9px] sm:text-xs font-semibold text-amber-900 truncate">
                              {top3.third.correctAnswers}/{top3.third.totalChallenges || totalChallengesInPeriod || (selectedPeriod === 'week' ? 7 : 0)} acertos
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* LISTA / TABELA (A PARTIR DO 4º LUGAR OU BUSCA) */}
                {displayedRanking.items.length > 0 && (
                  <>
                    {/* VISÃO MOBILE: CARDS/LISTA TOUCH-FRIENDLY SEM SCROLL HORIZONTAL */}
                    <div className="block sm:hidden divide-y divide-[#0F2942]/08">
                      {displayedRanking.items.map((studentItem) => (
                        <div
                          key={studentItem.studentId}
                          className={`flex items-center justify-between py-3 px-1.5 gap-2 transition rounded-xl ${
                            studentItem.isCurrentUser
                              ? 'bg-[#E3F1E4]/70 px-2.5 font-bold my-1'
                              : 'hover:bg-[#F8F5EE]/80'
                          }`}
                        >
                          {/* Esquerda: Posição + Nome e métricas */}
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-heading text-xs font-black ${
                                studentItem.rank === 1
                                  ? 'bg-amber-400 text-amber-950 shadow-2xs'
                                  : studentItem.rank === 2
                                  ? 'bg-slate-300 text-slate-900 shadow-2xs'
                                  : studentItem.rank === 3
                                  ? 'bg-amber-700 text-amber-50 shadow-2xs'
                                  : studentItem.isCurrentUser
                                  ? 'bg-[#2E5B37] text-white shadow-2xs'
                                  : 'bg-[#F0EDF5] text-[#0F2942]/70'
                              }`}
                            >
                              {studentItem.rank}º
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="font-heading text-xs font-bold text-[#0F2942] truncate">
                                  {studentItem.fullName}
                                </p>
                                {studentItem.isCurrentUser && (
                                  <span className="shrink-0 rounded bg-[#2E5B37] px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-white">
                                    Você
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-medium text-[#0F2942]/60">
                                <span>
                                  {studentItem.correctAnswers}/{studentItem.totalChallenges || totalChallengesInPeriod || (selectedPeriod === 'week' ? 7 : 0)} acertos
                                </span>
                                <span>•</span>
                                <span className="font-bold text-[#2E5B37]">
                                  {studentItem.accuracy ?? 0}%
                                </span>
                                {(studentItem.streakDays ?? 0) > 0 && (
                                  <>
                                    <span>•</span>
                                    <span className="inline-flex items-center gap-0.5 font-bold text-amber-600">
                                      <Flame className="h-3 w-3 fill-amber-500 text-amber-500" />
                                      {studentItem.streakDays}d
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Direita: XP */}
                          <div className="text-right shrink-0">
                            <span className="font-heading text-xs font-black text-[#2E5B37]">
                              {studentItem.score.toLocaleString('pt-BR')} <span className="text-[9px] font-normal text-[#0F2942]/50">XP</span>
                            </span>
                          </div>
                        </div>
                      ))}

                      {/* RETICÊNCIAS MOBILE */}
                      {displayedRanking.hasEllipsis && (
                        <div className="py-2.5 text-center">
                          <div className="flex items-center justify-center gap-2 text-[#0F2942]/40 text-xs">
                            <span className="h-px w-8 bg-[#0F2942]/10" />
                            <span className="font-heading font-extrabold tracking-widest text-[#0F2942]/40">
                              • • •
                            </span>
                            {displayedRanking.userOutsideTop3 && (
                              <span className="text-[10px] font-semibold text-[#0F2942]/60 bg-white px-2 py-0.5 rounded-full border border-[#0F2942]/08">
                                {displayedRanking.userOutsideTop3.rank - 7} participantes até você
                              </span>
                            )}
                            <span className="font-heading font-extrabold tracking-widest text-[#0F2942]/40">
                              • • •
                            </span>
                            <span className="h-px w-8 bg-[#0F2942]/10" />
                          </div>
                        </div>
                      )}

                      {/* LINHA DO USUÁRIO MOBILE FORA DO TOPO */}
                      {displayedRanking.hasEllipsis && displayedRanking.userOutsideTop3 && (
                        <div className="flex items-center justify-between py-3 px-2.5 gap-2 bg-[#E3F1E4]/70 rounded-xl my-1 font-bold">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#2E5B37] text-white font-heading text-xs font-black shadow-2xs">
                              {displayedRanking.userOutsideTop3.rank}º
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="font-heading text-xs font-bold text-[#0F2942] truncate">
                                  {displayedRanking.userOutsideTop3.fullName}
                                </p>
                                <span className="shrink-0 rounded bg-[#2E5B37] px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-white">
                                  Você
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-medium text-[#0F2942]/60">
                                <span>
                                  {displayedRanking.userOutsideTop3.correctAnswers}/{displayedRanking.userOutsideTop3.totalChallenges || totalChallengesInPeriod || (selectedPeriod === 'week' ? 7 : 0)} acertos
                                </span>
                                <span>•</span>
                                <span className="font-bold text-[#2E5B37]">
                                  {displayedRanking.userOutsideTop3.accuracy ?? 0}%
                                </span>
                                {(displayedRanking.userOutsideTop3.streakDays ?? 0) > 0 && (
                                  <>
                                    <span>•</span>
                                    <span className="inline-flex items-center gap-0.5 font-bold text-amber-600">
                                      <Flame className="h-3 w-3 fill-amber-500 text-amber-500" />
                                      {displayedRanking.userOutsideTop3.streakDays}d
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-heading text-xs font-black text-[#2E5B37]">
                              {displayedRanking.userOutsideTop3.score.toLocaleString('pt-BR')} <span className="text-[9px] font-normal text-[#0F2942]/50">XP</span>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* VISÃO DESKTOP: TABELA COMPLETA COM 6 COLUNAS */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#0F2942]/10 text-[10px] font-bold uppercase tracking-wider text-[#0F2942]/50">
                            <th className="py-3 px-4 w-16">Posição</th>
                            <th className="py-3 px-4">Estudante</th>
                            <th className="py-3 px-4 text-center">Acertos</th>
                            <th className="py-3 px-4 text-center">Precisão</th>
                            <th className="py-3 px-4 text-center">Sequência</th>
                            <th className="py-3 px-4 text-right">Pontuação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#0F2942]/08 text-xs font-semibold">
                          {displayedRanking.items.map((studentItem) => (
                            <tr
                              key={studentItem.studentId}
                              className={`transition ${
                                studentItem.isCurrentUser
                                  ? 'bg-[#E3F1E4]/60 font-bold hover:bg-[#E3F1E4]'
                                  : 'hover:bg-[#F8F5EE]/80'
                              }`}
                            >
                              {/* POSIÇÃO */}
                              <td className="py-3.5 px-4">
                                <span
                                  className={`flex h-7 w-7 items-center justify-center rounded-lg font-heading text-xs font-extrabold ${
                                    studentItem.rank === 1
                                      ? 'bg-amber-400 text-amber-950 shadow-2xs'
                                      : studentItem.rank === 2
                                      ? 'bg-slate-300 text-slate-900 shadow-2xs'
                                      : studentItem.rank === 3
                                      ? 'bg-amber-700 text-amber-50 shadow-2xs'
                                      : studentItem.isCurrentUser
                                      ? 'bg-[#2E5B37] text-white shadow-2xs'
                                      : 'bg-[#F0EDF5] text-[#0F2942]/70'
                                  }`}
                                >
                                  {studentItem.rank}º
                                </span>
                              </td>

                              {/* ESTUDANTE */}
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-2">
                                  <span className="font-heading text-xs font-bold text-[#0F2942]">
                                    {studentItem.fullName}
                                  </span>
                                  {studentItem.isCurrentUser && (
                                    <span className="rounded-md bg-[#2E5B37] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white">
                                      Você
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* ACERTOS */}
                              <td className="py-3.5 px-4 text-center font-bold text-[#0F2942]">
                                {studentItem.correctAnswers}/{studentItem.totalChallenges || totalChallengesInPeriod || (selectedPeriod === 'week' ? 7 : 0)}
                              </td>

                              {/* PRECISÃO */}
                              <td className="py-3.5 px-4 text-center">
                                <span className="rounded-full bg-[#E3F1E4] px-2.5 py-1 text-[11px] font-bold text-[#2E5B37]">
                                  {studentItem.accuracy ?? 0}%
                                </span>
                              </td>

                              {/* SEQUÊNCIA */}
                              <td className="py-3.5 px-4 text-center">
                                <div className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-amber-700 font-bold text-[11px]">
                                  <Flame className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                                  {studentItem.streakDays ?? 0}d
                                </div>
                              </td>

                              {/* PONTUAÇÃO (XP) */}
                              <td className="py-3.5 px-4 text-right font-heading text-sm font-extrabold text-[#2E5B37]">
                                {studentItem.score.toLocaleString('pt-BR')} <span className="text-[10px] text-[#0F2942]/50 font-normal">XP</span>
                              </td>
                            </tr>
                          ))}

                          {/* RETICÊNCIAS DESKTOP */}
                          {displayedRanking.hasEllipsis && (
                            <>
                              <tr className="bg-[#F8F5EE]/60">
                                <td colSpan={6} className="py-3 px-4 text-center">
                                  <div className="flex items-center justify-center gap-3 text-[#0F2942]/40">
                                    <span className="h-px w-12 sm:w-24 bg-[#0F2942]/10" />
                                    <span className="font-heading text-base font-extrabold tracking-widest text-[#0F2942]/40 select-none">
                                      • • •
                                    </span>
                                    {displayedRanking.userOutsideTop3 && (
                                      <span className="text-[11px] font-semibold text-[#0F2942]/50 bg-white px-2.5 py-0.5 rounded-full border border-[#0F2942]/08 shadow-2xs">
                                        {displayedRanking.userOutsideTop3.rank - 7 === 1
                                          ? '1 participante entre os listados e você'
                                          : `${displayedRanking.userOutsideTop3.rank - 7} participantes entre os listados e você`}
                                      </span>
                                    )}
                                    <span className="font-heading text-base font-extrabold tracking-widest text-[#0F2942]/40 select-none">
                                      • • •
                                    </span>
                                    <span className="h-px w-12 sm:w-24 bg-[#0F2942]/10" />
                                  </div>
                                </td>
                              </tr>

                              {/* LINHA DO USUÁRIO DESKTOP */}
                              {displayedRanking.userOutsideTop3 && (
                                <tr
                                  key={displayedRanking.userOutsideTop3.studentId}
                                  className="bg-[#E3F1E4]/70 font-bold hover:bg-[#E3F1E4] transition"
                                >
                                  <td className="py-3.5 px-4">
                                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2E5B37] text-white font-heading text-xs font-extrabold shadow-2xs">
                                      {displayedRanking.userOutsideTop3.rank}º
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4">
                                    <div className="flex items-center gap-2">
                                      <span className="font-heading text-xs font-bold text-[#0F2942]">
                                        {displayedRanking.userOutsideTop3.fullName}
                                      </span>
                                      <span className="rounded-md bg-[#2E5B37] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white">
                                        Você
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-4 text-center font-bold text-[#0F2942]">
                                    {displayedRanking.userOutsideTop3.correctAnswers}/{displayedRanking.userOutsideTop3.totalChallenges || totalChallengesInPeriod || (selectedPeriod === 'week' ? 7 : 0)}
                                  </td>
                                  <td className="py-3.5 px-4 text-center">
                                    <span className="rounded-full bg-[#2E5B37]/15 px-2.5 py-1 text-[11px] font-bold text-[#2E5B37]">
                                      {displayedRanking.userOutsideTop3.accuracy ?? 0}%
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4 text-center">
                                    <div className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-amber-700 font-bold text-[11px]">
                                      <Flame className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                                      {displayedRanking.userOutsideTop3.streakDays ?? 0}d
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-4 text-right font-heading text-sm font-extrabold text-[#2E5B37]">
                                    {displayedRanking.userOutsideTop3.score.toLocaleString('pt-BR')} <span className="text-[10px] text-[#0F2942]/50 font-normal">XP</span>
                                  </td>
                                </tr>
                              )}
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* RODAPÉ COM CONTAGEM TOTAL DO RANKING E BOTÃO EXPANSÍVEL */}
                <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[#0F2942]/08 pt-4">
                  <div className="flex items-center gap-2 text-xs text-[#0F2942]/70 font-medium">
                    <Users className="h-4 w-4 text-[#2E5B37]" />
                    <span>
                      Total de <strong className="text-[#0F2942] font-bold">{rankingList.length}</strong> {rankingList.length === 1 ? 'participante' : 'participantes'} no ranking
                      {currentUserStats.rank > 0 && (
                        <span className="text-[#2E5B37] font-semibold ml-1.5">
                          · Sua posição: <strong>{currentUserStats.rank}º lugar</strong>
                        </span>
                      )}
                    </span>
                  </div>

                  {rankingList.length > 3 && !searchQuery && (
                    <button
                      type="button"
                      onClick={() => setIsFullRankingExpanded((prev) => !prev)}
                      className="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 rounded-xl border border-[#0F2942]/15 bg-white px-3.5 py-2.5 sm:py-1.5 text-xs font-bold text-[#0F2942] shadow-2xs transition hover:bg-[#F8F5EE] hover:text-[#2E5B37] cursor-pointer"
                    >
                      {isFullRankingExpanded ? (
                        <>
                          <ChevronUp className="h-3.5 w-3.5 text-[#2E5B37]" />
                          Ver ranking resumido
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3.5 w-3.5 text-[#2E5B37]" />
                          Ver ranking completo ({rankingList.length} alunos)
                        </>
                      )}
                    </button>
                  )}
                </div>
              </section>

              {/* GUIA GAMIFICADO: COMO FUNCIONA A PONTUAÇÃO E XP */}
              <section className="relative overflow-hidden rounded-[28px] border border-[#0F2942]/10 bg-gradient-to-b from-white to-[#F8F5EE] p-6 sm:p-8 shadow-sm">
                {/* Background ambient glow */}
                <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#2E5B37]/05 blur-3xl" />
                <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-[#0F2942]/05 blur-3xl" />

                {/* Header com Status do Jogador & Barra de Progresso de Nível */}
                <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between pb-6 border-b border-[#0F2942]/10">
                  <div className="flex items-center gap-4">
                    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2E5B37] to-[#0F2942] text-amber-300 shadow-md ring-4 ring-[#2E5B37]/15">
                      <Zap className="h-7 w-7 animate-pulse" />
                      <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[#0F2942] text-[10px] font-black shadow-2xs">
                        XP
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-[#2E5B37]/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#2E5B37]">
                          Guia de Conquistas
                        </span>
                        <span className="text-[11px] font-bold text-[#0F2942]/50">· Nível & Pontuação</span>
                      </div>
                      <h3 className="font-heading text-xl font-extrabold text-[#0F2942]">Como funciona o seu XP e Nível?</h3>
                      <p className="text-xs text-[#0F2942]/70">
                        Cada atividade completada gera XP que sobe o seu nível e define a sua classificação no ranking.
                      </p>
                    </div>
                  </div>

                  {/* Barra de Progresso do Nível */}
                  {experienceData && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl bg-white p-3.5 border border-[#0F2942]/10 shadow-2xs min-w-[280px] lg:min-w-[340px]">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0F2942] text-amber-300 font-heading font-black text-base shadow-sm">
                        Nv.{experienceData.level}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span className="text-[#0F2942]">Progresso do Nível</span>
                          <span className="text-[#2E5B37]">
                            {experienceData.currentLevelProgress ?? 0} / {experienceData.nextLevelXp ?? 500} XP
                          </span>
                        </div>
                        <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[#0F2942]/10 p-0.5">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#2E5B37] via-emerald-500 to-amber-400 transition-all duration-500"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(
                                  5,
                                  Math.round(
                                    ((experienceData.currentLevelProgress ?? 0) / (experienceData.nextLevelXp ?? 500)) * 100
                                  )
                                )
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* GRID DOS 3 CARDS GAMIFICADOS */}
                <div className="mt-6 grid gap-5 sm:grid-cols-3">
                  {/* CARD 1: DESAFIO DIÁRIO (VERDE DA MARCA #2E5B37) */}
                  <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-[#2E5B37]/30 bg-white p-5 shadow-2xs transition hover:border-[#2E5B37] hover:shadow-md">
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#2E5B37] to-emerald-400" />
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E3F1E4] text-[#2E5B37] ring-2 ring-[#2E5B37]/20">
                          <Flame className="h-5 w-5 fill-[#2E5B37] text-[#2E5B37]" />
                        </div>
                        <span className="rounded-full bg-gradient-to-r from-[#2E5B37] to-emerald-600 px-3 py-1 font-heading text-xs font-black text-white shadow-2xs">
                          +100 a +120 XP
                        </span>
                      </div>

                      <h4 className="mt-4 font-heading text-sm font-bold text-[#0F2942]">Desafio Diário & Ofensiva</h4>
                      <p className="mt-1 text-[11px] leading-relaxed text-[#0F2942]/70">
                        O desafio que atualiza todo dia. O segredo é não quebrar a sequência de acertos!
                      </p>

                      <div className="mt-4 space-y-1.5 rounded-xl bg-[#F8F5EE] p-2.5 text-[11px]">
                        <div className="flex items-center justify-between font-semibold text-[#0F2942]/80">
                          <span>🎯 Acerto no dia:</span>
                          <strong className="text-[#2E5B37] font-bold">+100 XP</strong>
                        </div>
                        <div className="flex items-center justify-between font-semibold text-[#0F2942]/80">
                          <span>🔥 Sequência ativa (2d+):</span>
                          <strong className="text-amber-600 font-bold">+120 XP/dia</strong>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#0F2942]/10 flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-[#0F2942]/60">Seu desempenho:</span>
                      <strong className="rounded-lg bg-[#E3F1E4] px-2 py-0.5 text-[#2E5B37] font-extrabold">
                        {experienceData?.counts.dailyChallengesCorrect ?? currentStudentStats?.correctAnswers ?? 0}/
                        {totalChallengesInPeriod > 0
                          ? totalChallengesInPeriod
                          : selectedPeriod === 'week'
                          ? 7
                          : currentStudentStats?.totalChallenges || 0}{' '}
                        acertos ({experienceData?.breakdown.dailyChallengeXp ?? 0} XP)
                      </strong>
                    </div>
                  </div>

                  {/* CARD 2: BANCO DE QUESTÕES (AZUL NAVY #0F2942) */}
                  <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-[#0F2942]/20 bg-white p-5 shadow-2xs transition hover:border-[#0F2942] hover:shadow-md">
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#0F2942] to-sky-500" />
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-[#0F2942] ring-2 ring-[#0F2942]/20">
                          <BookOpen className="h-5 w-5 text-[#0F2942]" />
                        </div>
                        <span className="rounded-full bg-gradient-to-r from-[#0F2942] to-sky-700 px-3 py-1 font-heading text-xs font-black text-white shadow-2xs">
                          +5 a +15 XP
                        </span>
                      </div>

                      <h4 className="mt-4 font-heading text-sm font-bold text-[#0F2942]">Prática & Simulados</h4>
                      <p className="mt-1 text-[11px] leading-relaxed text-[#0F2942]/70">
                        Resolva questões do banco da monitoria para acumular XP no seu progresso geral.
                      </p>

                      <div className="mt-4 space-y-1.5 rounded-xl bg-[#F8F5EE] p-2.5 text-[11px]">
                        <div className="flex items-center justify-between font-semibold text-[#0F2942]/80">
                          <span>📝 Questão respondida:</span>
                          <strong className="text-sky-700 font-bold">+5 XP</strong>
                        </div>
                        <div className="flex items-center justify-between font-semibold text-[#0F2942]/80">
                          <span>⚡ Bônus de acerto:</span>
                          <strong className="text-[#2E5B37] font-bold">+10 XP (+15 total)</strong>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#0F2942]/10 flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-[#0F2942]/60">Praticadas:</span>
                      <strong className="rounded-lg bg-sky-50 px-2 py-0.5 text-[#0F2942] font-extrabold">
                        {experienceData?.counts.practiceAnswered ?? 0} ({experienceData?.breakdown.practiceXp ?? 0} XP)
                      </strong>
                    </div>
                  </div>

                  {/* CARD 3: FLASHCARDS (ÍNDIGO & CIANO MÍSTICO) */}
                  <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-indigo-200 bg-white p-5 shadow-2xs transition hover:border-indigo-400 hover:shadow-md">
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-600 to-violet-400" />
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 ring-2 ring-indigo-200">
                          <Sparkles className="h-5 w-5 text-indigo-600" />
                        </div>
                        <span className="rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-1 font-heading text-xs font-black text-white shadow-2xs">
                          +5 XP
                        </span>
                      </div>

                      <h4 className="mt-4 font-heading text-sm font-bold text-[#0F2942]">Revisão de Flashcards</h4>
                      <p className="mt-1 text-[11px] leading-relaxed text-[#0F2942]/70">
                        Fortaleça sua memória de longo prazo revisando os conceitos e cartões da monitoria.
                      </p>

                      <div className="mt-4 space-y-1.5 rounded-xl bg-[#F8F5EE] p-2.5 text-[11px]">
                        <div className="flex items-center justify-between font-semibold text-[#0F2942]/80">
                          <span>🧠 Card revisado:</span>
                          <strong className="text-indigo-700 font-bold">+5 XP</strong>
                        </div>
                        <div className="flex items-center justify-between font-semibold text-[#0F2942]/80">
                          <span>💎 Retenção ativa:</span>
                          <strong className="text-indigo-600 font-bold">Fixação de conteúdo</strong>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#0F2942]/10 flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-[#0F2942]/60">Revisados:</span>
                      <strong className="rounded-lg bg-indigo-50 px-2 py-0.5 text-indigo-700 font-extrabold">
                        {experienceData?.counts.flashcardsReviewed ?? 0} ({experienceData?.breakdown.flashcardXp ?? 0} XP)
                      </strong>
                    </div>
                  </div>
                </div>
              </section>
                </>
              )}
            </div>
          )}
        </section>

        <StudentRightSidebar />
      </div>
    </main>
  );
}
