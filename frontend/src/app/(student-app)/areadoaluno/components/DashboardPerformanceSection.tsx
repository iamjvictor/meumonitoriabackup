'use client';

import { BarChart3, Check, Flame, Target, Trophy } from 'lucide-react';

interface PerformanceStats {
  totalAnswered: number;
  accuracy: number;
}

interface ConsistencySummary {
  activeDays: number;
  answeredCount: number;
}

interface ConsistencyDay {
  day: string;
  weekday: string;
  answeredCount: number;
}

interface DailyChallengeSummaryData {
  currentStudent: { rank: number; score: number; correctAnswers: number; streakDays: number };
  challengeDays: Array<{ day: string; weekday: string; completed: boolean; correct: boolean }>;
}

interface DashboardPerformanceSectionProps {
  performanceStats: PerformanceStats;
  consistencySummary: ConsistencySummary;
  visibleConsistencyDays: ConsistencyDay[];
  dailyChallengeSummary: DailyChallengeSummaryData | null;
  isLoadingDailyChallengeSummary: boolean;
  activePeriod?: string;
}

function WeekDots({
  days,
  challenge = false,
  loading = false,
}: {
  days: Array<{ day: string; weekday: string; answeredCount?: number; completed?: boolean }>;
  challenge?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="flex min-w-0 justify-between gap-1.5 sm:gap-2">
      {days.map((day) => {
        const completed = challenge ? day.completed : (day.answeredCount ?? 0) > 0;
        return (
          <div key={day.day} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" title={completed ? 'Concluído' : 'Pendente'}>
            <span className="text-[9px] font-bold uppercase text-white/60">{day.weekday}</span>
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[#183B2B] sm:h-9 sm:w-9 ${
                loading
                  ? 'animate-pulse bg-white/10'
                  : completed
                    ? challenge
                      ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.5)]'
                      : 'bg-[#76D69B] shadow-[0_0_12px_rgba(118,214,155,0.45)]'
                    : 'border border-white/15 bg-white/8 text-white/40'
              }`}
            >
              {completed && !loading ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Kpi({ label, value, tone = 'green' }: { label: string; value: string | number; tone?: 'green' | 'amber' }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
      <p className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-white/55">{label}</p>
      <p className={`mt-1 truncate font-heading text-xl font-black ${tone === 'amber' ? 'text-amber-300' : 'text-[#76D69B]'}`}>{value}</p>
    </div>
  );
}

export function DashboardPerformanceSection({
  performanceStats,
  consistencySummary,
  visibleConsistencyDays,
  dailyChallengeSummary,
  isLoadingDailyChallengeSummary,
  activePeriod = 'Últimos 7 dias',
}: DashboardPerformanceSectionProps) {
  const accuracy = performanceStats?.accuracy ?? 0;
  const streakDays = dailyChallengeSummary?.currentStudent.streakDays ?? 0;
  const challengeDays = isLoadingDailyChallengeSummary
    ? Array.from({ length: 7 }, (_, index) => ({ day: `loading-${index}`, weekday: '—', completed: false }))
    : (dailyChallengeSummary?.challengeDays ?? []);

  return (
    <section
      id="progress-section"
      aria-labelledby="progress-title"
      className="relative mt-6 overflow-hidden rounded-[24px] border border-[#76D69B]/25 bg-gradient-to-br from-[#1B4332] via-[#245337] to-[#122B20] p-4 text-white shadow-[0_16px_38px_rgba(27,67,50,0.2)] sm:p-6"
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-[#76D69B]/10 blur-3xl" />

      <header className="relative z-10 flex items-center gap-3 border-b border-white/10 pb-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#76D69B]/15 text-[#76D69B]">
          <BarChart3 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 id="progress-title" className="truncate font-heading text-base font-bold text-white sm:text-lg">Seu progresso</h2>
            <span className="hidden shrink-0 text-[10px] font-semibold text-white/45 sm:inline">{activePeriod}</span>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-white/55">Desempenho, constância e desafios.</p>
        </div>
      </header>

      <div className="relative z-10 mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <Kpi label="Taxa de acertos" value={`${accuracy}%`} />
        <Kpi label="Questões respondidas" value={performanceStats?.totalAnswered ?? 0} />
        <Kpi label="Dias ativos" value={`${consistencySummary.activeDays}/7`} />
      </div>

      <div className="relative z-10 mt-5 border-t border-white/10 pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Target className="h-4 w-4 shrink-0 text-[#76D69B]" />
            <h3 className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-white">Constância semanal</h3>
          </div>
          <span className="shrink-0 text-[10px] text-white/50">{consistencySummary.answeredCount} questões</span>
        </div>
        <WeekDots days={visibleConsistencyDays} />
      </div>

      <div className="relative z-10 mt-5 border-t border-white/10 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Flame className="h-4 w-4 shrink-0 fill-amber-300 text-amber-300" />
            <h3 className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-amber-100">Desafio diário</h3>
          </div>
          <span className="shrink-0 text-sm font-black text-amber-300">{streakDays} dias</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Kpi label="Acertos seguidos" value={dailyChallengeSummary?.currentStudent.correctAnswers ?? 0} tone="amber" />
          <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
            <p className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-white/55">Ranking</p>
            <p className="mt-1 flex items-center gap-1.5 truncate font-heading text-xl font-black text-[#76D69B]">
              <Trophy className="h-4 w-4 shrink-0" />
              {isLoadingDailyChallengeSummary ? '...' : dailyChallengeSummary?.currentStudent.rank ? `${dailyChallengeSummary.currentStudent.rank}º` : '—'}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/50">Últimos 7 desafios</span>
            <span className="text-[9px] text-white/40">{challengeDays.filter((day) => day.completed).length}/7 concluídos</span>
          </div>
          <WeekDots days={challengeDays} challenge loading={isLoadingDailyChallengeSummary} />
        </div>
      </div>
    </section>
  );
}
