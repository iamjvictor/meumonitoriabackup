'use client';
/* eslint-disable react-hooks/set-state-in-effect -- Effects synchronize API loading state. */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Brain,
  CalendarDays,
  CheckCircle2,
  HelpCircle,
  Layers,
  Loader2,
  RotateCcw,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react';
import { StudentHeader, StudentRightSidebar, StudentSidebar, useStudent } from '@/modules/student';
import { PerformanceByActivity } from './components/PerformanceByActivity';
import { SubjectRankings } from './components/SubjectRankings';

type ConsistencyDay = {
  day: string;
  weekday: string;
  answeredCount: number;
};

type PerformanceTopic = {
  id: string | null;
  name: string;
  answeredCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracy: number;
};

type PerformanceSubject = {
  id: string;
  name: string;
  answeredCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracy: number;
  topics: PerformanceTopic[];
};

type PerformanceMonitor = {
  id: string;
  name: string;
  answeredCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracy: number;
  subjects: PerformanceSubject[];
};

type FlashcardTopic = {
  id: string | null;
  name: string;
  reviewedCount: number;
  retainedCount: number;
  retentionRate: number;
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
};

type FlashcardSubject = {
  id: string;
  name: string;
  reviewedCount: number;
  retainedCount: number;
  retentionRate: number;
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
  topics: FlashcardTopic[];
};

type FlashcardMonitor = {
  id: string;
  name: string;
  reviewedCount: number;
  retainedCount: number;
  retentionRate: number;
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
  subjects: FlashcardSubject[];
};

type FlashcardsPerformanceData = {
  summary: {
    reviewedCount: number;
    retainedCount: number;
    againCount: number;
    hardCount: number;
    goodCount: number;
    easyCount: number;
    retentionRate: number;
    dueCount: number;
    totalCardsCount: number;
  };
  monitors: FlashcardMonitor[];
  weakTopics: FlashcardTopic[];
};

type QuestionPerformanceData = {
  monitors: PerformanceMonitor[];
};

type PerformanceData = {
  summary: {
    answeredCount: number;
    correctCount: number;
    incorrectCount: number;
    accuracy: number;
  };
  monitors: PerformanceMonitor[];
  weakTopics: PerformanceTopic[];
  simulados?: QuestionPerformanceData;
  dailyChallenges?: QuestionPerformanceData;
  flashcards?: FlashcardsPerformanceData;
};

function accuracyTone(value: number) {
  if (value >= 80) return 'text-[#2E5B37]';
  if (value >= 60) return 'text-amber-700';
  return 'text-rose-700';
}

export default function StudentPerformancePage() {
  const { status } = useStudent();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [consistencyDays, setConsistencyDays] = useState<ConsistencyDay[]>([]);
  const [activeTab, setActiveTab] = useState<'questions' | 'flashcards'>('questions');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    setIsLoading(true);
    setError(false);

    Promise.all([
      fetch(`${apiUrl}/api/v1/student/performance`, { credentials: 'include', cache: 'no-store' }),
      fetch(`${apiUrl}/api/v1/student/consistency`, { credentials: 'include', cache: 'no-store' }),
    ])
      .then(async ([performanceResponse, consistencyResponse]) => {
        if (!performanceResponse.ok) throw new Error('PERFORMANCE_LOAD_FAILED');
        const performanceBody = await performanceResponse.json().catch(() => ({}));
        const consistencyBody = await consistencyResponse.json().catch(() => ({}));
        if (!cancelled) {
          setPerformance(performanceBody.data ?? null);
          setConsistencyDays(Array.isArray(consistencyBody.data?.days) ? consistencyBody.data.days : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPerformance(null);
          setConsistencyDays([]);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [apiUrl, status]);

  const weeklySummary = useMemo(() => ({
    activeDays: consistencyDays.filter((day) => day.answeredCount > 0).length,
    answeredCount: consistencyDays.reduce((total, day) => total + day.answeredCount, 0),
  }), [consistencyDays]);

  const fcSummary = performance?.flashcards?.summary;
  const fcMonitors = performance?.flashcards?.monitors ?? [];
  const fcWeakTopics = performance?.flashcards?.weakTopics ?? [];

  return (
    <main className="min-h-screen bg-[#F5F1E8] pb-[calc(5rem+env(safe-area-inset-bottom))] text-[#0F2942] lg:pb-0">
      <div className="flex min-h-screen w-full">
        <StudentSidebar activeNav="performance" />
        <section className="min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-5 lg:px-12 lg:py-8">
          <StudentHeader
            title="Meu desempenho"
            breadcrumbs={[{ label: 'Área do aluno', href: '/areadoaluno' }, { label: 'Meu desempenho' }]}
          />

          {isLoading ? (
            <div className="mt-8 flex min-h-[420px] items-center justify-center rounded-[28px] border border-[#0F2942]/10 bg-white shadow-sm">
              <div className="flex items-center gap-3 text-sm font-semibold text-[#0F2942]/60">
                <Loader2 className="h-5 w-5 animate-spin text-[#2E5B37]" />
                Carregando seu desempenho...
              </div>
            </div>
          ) : error || !performance ? (
            <div className="mt-8 flex min-h-[420px] flex-col items-center justify-center rounded-[28px] border border-rose-200 bg-white px-6 text-center shadow-sm">
              <AlertCircle className="h-8 w-8 text-rose-600" />
              <h2 className="mt-4 font-heading text-xl font-bold">Não foi possível carregar seus dados</h2>
              <p className="mt-2 max-w-md text-sm text-[#0F2942]/60">Tente atualizar a página em alguns instantes.</p>
            </div>
          ) : (
            <div className="mt-5 space-y-4 sm:mt-7 sm:space-y-6">
              {/* Tab Selector */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex w-full items-center gap-1 rounded-2xl border border-[#0F2942]/10 bg-white p-1 shadow-sm sm:w-auto sm:gap-2 sm:p-1.5">
                  <button
                    onClick={() => setActiveTab('questions')}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold transition-all sm:flex-none sm:gap-2 sm:px-4 sm:text-xs ${
                      activeTab === 'questions'
                        ? 'bg-[#2E5B37] text-white shadow-sm'
                        : 'text-[#0F2942]/60 hover:text-[#0F2942] hover:bg-[#F5F1E8]'
                    }`}
                  >
                    <HelpCircle className="h-4 w-4" />
                    Questões
                  </button>
                  <button
                    onClick={() => setActiveTab('flashcards')}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold transition-all sm:flex-none sm:gap-2 sm:px-4 sm:text-xs ${
                      activeTab === 'flashcards'
                        ? 'bg-[#2E5B37] text-white shadow-sm'
                        : 'text-[#0F2942]/60 hover:text-[#0F2942] hover:bg-[#F5F1E8]'
                    }`}
                  >
                    <Brain className="h-4 w-4" />
                    Flashcards (SRS)
                  </button>
                </div>
              </div>

              {activeTab === 'questions' ? (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(240px,1.35fr)]">
                    <SpeedometerCard
                      icon={Target}
                      label="Aproveitamento geral"
                      value={performance.summary.accuracy}
                      detail="de todas as respostas"
                      iconBg="bg-[#2E5B37]/10"
                      iconColor="text-[#2E5B37]"
                    />
                    <SummaryCard
                      icon={BookOpen}
                      label="Questões respondidas"
                      value={String(performance.summary.answeredCount)}
                      detail="em todos os monitores"
                      badge={performance.summary.answeredCount > 0 ? "Ativo" : undefined}
                      iconBg="bg-[#0F2942]/10"
                      iconColor="text-[#0F2942]"
                    />
                    <SummaryCard
                      icon={CheckCircle2}
                      label="Acertos"
                      value={String(performance.summary.correctCount)}
                      detail={`${performance.summary.correctCount} respostas corretas`}
                      progress={performance.summary.accuracy}
                      progressColor="bg-[#2E5B37]"
                      progressLabel={`${performance.summary.accuracy}% do total`}
                      tone="text-[#2E5B37]"
                      iconBg="bg-emerald-500/15"
                      iconColor="text-[#2E5B37]"
                    />
                    <SummaryCard
                      icon={XCircle}
                      label="Para revisar"
                      value={String(performance.summary.incorrectCount)}
                      detail="respostas incorretas"
                      progress={performance.summary.answeredCount > 0 ? Math.round((performance.summary.incorrectCount / performance.summary.answeredCount) * 100) : 0}
                      progressColor="bg-rose-500"
                      progressLabel={`${performance.summary.answeredCount > 0 ? Math.round((performance.summary.incorrectCount / performance.summary.answeredCount) * 100) : 0}% taxa de erro`}
                      tone="text-rose-600"
                      iconBg="bg-rose-500/15"
                      iconColor="text-rose-600"
                    />
                    <SummaryCard
                      icon={CalendarDays}
                      label="Constância"
                      value={`${weeklySummary.activeDays}/7`}
                      detail={`${weeklySummary.answeredCount} questões nos últimos 7 dias`}
                      progress={(weeklySummary.activeDays / 7) * 100}
                      progressColor="bg-[#2E5B37]"
                      progressLabel="dias ativos"
                      tone="text-[#2E5B37]"
                      iconBg="bg-[#2E5B37]/10"
                      iconColor="text-[#2E5B37]"
                      weeklyDays={consistencyDays}
                      large
                    />
                  </div>

                  <div>
                    <SubjectRankings monitors={performance.monitors} />
                  </div>

                  <PerformanceByActivity
                    questionMonitors={performance.monitors}
                    flashcardMonitors={fcMonitors}
                    simulatedMonitors={performance.simulados?.monitors ?? []}
                    dailyChallengeMonitors={performance.dailyChallenges?.monitors ?? []}
                  />

                </>
              ) : (
                /* FLASHCARDS TAB */
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
                    <SpeedometerCard
                      icon={Brain}
                      label="Retenção de memória"
                      value={fcSummary?.retentionRate ?? 0}
                      detail="dos flashcards revisados"
                      iconBg="bg-[#2E5B37]/10"
                      iconColor="text-[#2E5B37]"
                    />
                    <SummaryCard
                      icon={RotateCcw}
                      label="Revisões efetuadas"
                      value={String(fcSummary?.reviewedCount ?? 0)}
                      detail="logs de estudo registrados"
                      badge={fcSummary?.reviewedCount ? "SRS Ativo" : undefined}
                      iconBg="bg-indigo-500/15"
                      iconColor="text-indigo-700"
                    />
                    <SummaryCard
                      icon={CheckCircle2}
                      label="Retidos (Bom/Fácil)"
                      value={String(fcSummary?.retainedCount ?? 0)}
                      detail="memorizados com sucesso"
                      progress={fcSummary?.retentionRate ?? 0}
                      progressColor="bg-[#2E5B37]"
                      progressLabel={`${fcSummary?.retentionRate ?? 0}% taxa retenção`}
                      tone="text-[#2E5B37]"
                      iconBg="bg-emerald-500/15"
                      iconColor="text-[#2E5B37]"
                    />
                    <SummaryCard
                      icon={Sparkles}
                      label="Para revisar hoje"
                      value={String(fcSummary?.dueCount ?? 0)}
                      detail="agendados no sistema SRS"
                      badge={fcSummary?.dueCount && fcSummary.dueCount > 0 ? "Pendente" : "Em dia"}
                      tone="text-amber-700"
                      iconBg="bg-amber-500/15"
                      iconColor="text-amber-700"
                    />
                  </div>

                  {/* Rating Breakdown Section */}
                  <section className="rounded-2xl border border-[#0F2942]/10 bg-white p-4 shadow-sm sm:rounded-[26px] sm:p-6">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2E5B37]">Distribuição de Avaliações</p>
                      <h2 className="mt-1 font-heading text-xl font-bold">Classificação dos Flashcards</h2>
                      <p className="mt-1 text-sm text-[#0F2942]/55">Veja a distribuição das suas respostas no sistema de repetição espaçada.</p>
                    </div>
                    <div className="mt-4 grid grid-cols-4 gap-1.5 sm:mt-6 sm:gap-4">
                        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-2 text-center sm:rounded-2xl sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">De Novo (Errei)</span>
                        <p className="mt-2 font-heading text-2xl font-bold text-rose-700">{fcSummary?.againCount ?? 0}</p>
                        <p className="mt-1 text-[10px] text-rose-600/70">Reforço necessário</p>
                      </div>
                        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-2 text-center sm:rounded-2xl sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Difícil</span>
                        <p className="mt-2 font-heading text-2xl font-bold text-amber-700">{fcSummary?.hardCount ?? 0}</p>
                        <p className="mt-1 text-[10px] text-amber-600/70">Pouco retido</p>
                      </div>
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-2 text-center sm:rounded-2xl sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Bom</span>
                        <p className="mt-2 font-heading text-2xl font-bold text-emerald-800">{fcSummary?.goodCount ?? 0}</p>
                        <p className="mt-1 text-[10px] text-emerald-700/70">Retenção estável</p>
                      </div>
                        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-2 text-center sm:rounded-2xl sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800">Fácil</span>
                        <p className="mt-2 font-heading text-2xl font-bold text-teal-800">{fcSummary?.easyCount ?? 0}</p>
                        <p className="mt-1 text-[10px] text-teal-700/70">Domínio completo</p>
                      </div>
                    </div>
                  </section>

                  {/* Scope Breakdown */}
                  <section className="rounded-[26px] border border-[#0F2942]/10 bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2E5B37]">Desempenho por escopo</p>
                        <h2 className="mt-1 font-heading text-xl font-bold">Flashcards por Monitor e Matéria</h2>
                        <p className="mt-1 text-sm text-[#0F2942]/55">Acompanhe a retenção por monitor e matéria praticada.</p>
                      </div>
                      <Layers className="h-5 w-5 text-[#2E5B37]" />
                    </div>
                    {fcMonitors.length === 0 ? (
                      <EmptyState text="Você ainda não revisou flashcards em nenhum monitor." />
                    ) : (
                      <div className="mt-6 grid gap-5 lg:grid-cols-2">
                        {fcMonitors.map((monitor) => (
                          <div key={monitor.id} className="rounded-2xl border border-[#0F2942]/10 bg-[#F8F5EE] p-5">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <h3 className="font-heading font-bold">{monitor.name}</h3>
                                <p className="mt-1 text-xs text-[#0F2942]/55">{monitor.reviewedCount} revisões efetuadas</p>
                              </div>
                              <span className={`font-heading text-lg font-bold ${accuracyTone(monitor.retentionRate)}`}>{monitor.retentionRate}%</span>
                            </div>
                            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#DCE5DC]">
                              <div className="h-full rounded-full bg-[#2E5B37]" style={{ width: `${monitor.retentionRate}%` }} />
                            </div>
                            <div className="mt-5 space-y-4">
                              {monitor.subjects.map((subject) => (
                                <div key={subject.id}>
                                  <div className="flex items-center justify-between gap-3 text-xs font-bold">
                                    <span>{subject.name}</span>
                                    <span className={accuracyTone(subject.retentionRate)}>{subject.retentionRate}% retenção</span>
                                  </div>
                                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#DCE5DC]">
                                    <div className="h-full rounded-full bg-[#76B982]" style={{ width: `${subject.retentionRate}%` }} />
                                  </div>
                                  <p className="mt-1 text-[10px] text-[#0F2942]/45">
                                    {subject.retainedCount} retidos de {subject.reviewedCount} revisões ({subject.againCount} errei)
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Weak Flashcard Topics */}
                  <section className="rounded-[26px] border border-[#0F2942]/10 bg-white p-6 shadow-sm">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C56A43]">Próximo foco em flashcards</p>
                      <h2 className="mt-1 font-heading text-xl font-bold">Tópicos com menor retenção</h2>
                      <p className="mt-1 text-sm text-[#0F2942]/55">Pratique estes tópicos para fixar os conceitos na memória de longo prazo.</p>
                    </div>
                    {fcWeakTopics.length === 0 ? (
                      <EmptyState text="Revise mais flashcards para visualizar sugestões de tópicos para reforço." />
                    ) : (
                      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {fcWeakTopics.slice(0, 8).map((topic, index) => (
                          <div key={`${topic.id ?? 'none'}-${index}`} className="rounded-2xl border border-[#0F2942]/10 bg-[#F8F5EE] p-4">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#0F2942]/40">#{index + 1}</span>
                              <span className={`font-heading text-lg font-bold ${accuracyTone(topic.retentionRate)}`}>{topic.retentionRate}%</span>
                            </div>
                            <h3 className="mt-3 line-clamp-2 text-sm font-bold">{topic.name}</h3>
                            <p className="mt-2 text-[10px] text-[#0F2942]/50">{topic.reviewedCount} revisões · {topic.againCount} errei</p>
                          </div>
                        ))}
                      </div>
                    )}
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

function getSpeedometerStatus(value: number) {
  if (value < 30) return { label: 'Crítico', bg: 'bg-rose-500', text: 'text-white' };
  if (value < 50) return { label: 'Atenção', bg: 'bg-orange-500', text: 'text-white' };
  if (value < 70) return { label: 'Regular', bg: 'bg-amber-400', text: 'text-amber-950 font-black' };
  if (value < 85) return { label: 'Bom', bg: 'bg-lime-600', text: 'text-white' };
  return { label: 'Excelente', bg: 'bg-[#2E5B37]', text: 'text-white' };
}

function SpeedometerGauge({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));

  // 5 discrete segments for the gauge arc (angles in degrees: 0 is left, 180 is right)
  const segments = [
    { startAngle: 6, endAngle: 34, color: '#EF4444' },    // 0-20%
    { startAngle: 42, endAngle: 70, color: '#F97316' },   // 20-40%
    { startAngle: 78, endAngle: 102, color: '#FACC15' },  // 40-60%
    { startAngle: 110, endAngle: 138, color: '#84CC16' }, // 60-80%
    { startAngle: 146, endAngle: 174, color: '#10B981' }, // 80-100%
  ];

  const cx = 100;
  const cy = 76;
  const r = 58;

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 180) * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  };

  const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return ['M', start.x, start.y, 'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(' ');
  };

  // Pin / needle indicator position
  const pinAngle = Math.max(4, Math.min(176, (clamped / 100) * 180));
  const pinPos = polarToCartesian(cx, cy, r, pinAngle);
  const status = getSpeedometerStatus(clamped);

  return (
    <div className="relative flex w-full flex-col items-center justify-center">
      <svg viewBox="0 0 200 95" className="w-full max-w-[170px] overflow-visible">
        {/* Subtle background track */}
        <path
          d={describeArc(cx, cy, r, 0, 180)}
          fill="none"
          stroke="#0F2942"
          strokeOpacity="0.06"
          strokeWidth="9"
          strokeLinecap="round"
        />
        {/* Colored arc segments */}
        {segments.map((seg, idx) => (
          <path
            key={idx}
            d={describeArc(cx, cy, r, seg.startAngle, seg.endAngle)}
            fill="none"
            stroke={seg.color}
            strokeWidth="8"
            strokeLinecap="round"
          />
        ))}
        {/* Indicator marker pin (white circle with dark stroke and subtle shadow) */}
        <circle
          cx={pinPos.x}
          cy={pinPos.y}
          r="6.5"
          fill="#FFFFFF"
          stroke="#0F2942"
          strokeWidth="2.5"
          className="transition-all duration-700 ease-out drop-shadow-sm"
        />
      </svg>

      {/* Center Value and Status Badge */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end">
        <span className="font-heading text-2xl font-black leading-none text-[#0F2942]">
          {clamped}%
        </span>
        <span className={`mt-1 inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${status.bg} ${status.text} shadow-xs`}>
          {status.label}
        </span>
      </div>
    </div>
  );
}

function SpeedometerCard({
  icon: Icon,
  label,
  value,
  detail,
  iconBg = 'bg-[#2E5B37]/10',
  iconColor = 'text-[#2E5B37]',
}: {
  icon: typeof Target;
  label: string;
  value: number;
  detail: string;
  iconBg?: string;
  iconColor?: string;
}) {
  return (
    <div aria-label={detail} className="group relative flex min-h-[108px] min-w-0 flex-col justify-between rounded-2xl border border-[#0F2942]/10 bg-white p-2.5 shadow-[0_2px_8px_rgba(15,41,66,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,41,66,0.08)] sm:min-h-[140px] sm:rounded-[20px] sm:p-3.5">
      <div className="flex items-center justify-between">
        <span className="min-w-0 truncate text-[8px] font-bold uppercase tracking-[0.1em] text-[#0F2942]/55 sm:text-[11px] sm:tracking-[0.14em]">{label}</span>
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-105 sm:h-8 sm:w-8 sm:rounded-xl ${iconBg}`}>
          <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${iconColor}`} />
        </div>
      </div>
      <div className="my-auto py-0 sm:py-0.5">
        <SpeedometerGauge value={value} />
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'text-[#0F2942]',
  badge,
  progress,
  progressColor = 'bg-[#2E5B37]',
  progressLabel,
  iconBg = 'bg-[#0F2942]/5',
  iconColor = 'text-[#0F2942]',
  weeklyDays,
  large = false,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  detail: string;
  tone?: string;
  badge?: string;
  progress?: number;
  progressColor?: string;
  progressLabel?: string;
  iconBg?: string;
  iconColor?: string;
  weeklyDays?: ConsistencyDay[];
  large?: boolean;
}) {
  return (
    <div aria-label={detail} className={`group relative flex min-w-0 flex-col justify-between rounded-2xl border border-[#0F2942]/10 bg-white p-2.5 shadow-[0_2px_8px_rgba(15,41,66,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,41,66,0.08)] sm:rounded-[20px] sm:p-3.5 ${large ? 'min-h-[128px] sm:min-h-[165px] sm:p-5' : 'min-h-[108px] sm:min-h-[140px]'}`}>
      <div className="flex items-center justify-between">
        <span className="min-w-0 truncate text-[8px] font-bold uppercase tracking-[0.1em] text-[#0F2942]/55 sm:text-[11px] sm:tracking-[0.14em]">{label}</span>
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-105 sm:h-8 sm:w-8 sm:rounded-xl ${iconBg}`}>
          <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${iconColor}`} />
        </div>
      </div>

      <div className="my-auto py-0 sm:py-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`font-heading text-2xl font-black leading-none tracking-tight sm:text-[34px] ${tone}`}>{value}</p>
          {badge && (
            <span className="inline-flex items-center rounded-full bg-[#0F2942]/5 px-2 py-0.5 text-[10px] font-bold text-[#0F2942]/65">
              {badge}
            </span>
          )}
        </div>

        {progress !== undefined && (
          <div className="mt-2 space-y-1 sm:mt-3 sm:space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#0F2942]/6">
              <div
                className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            {progressLabel && (
              <p className="truncate text-[9px] font-bold text-[#0F2942]/45 sm:text-[10px]">{progressLabel}</p>
            )}
            {weeklyDays && (
              <div className="mt-2 grid grid-cols-7 gap-1" aria-label="Atividade dos últimos 7 dias">
                {weeklyDays.map((day) => (
                  <div key={day.day} className="flex flex-col items-center gap-1" title={`${day.weekday}: ${day.answeredCount} questões`}>
                    <span className="text-[8px] font-bold uppercase text-[#0F2942]/40">{day.weekday.slice(0, 1)}</span>
                    <span className={`h-2.5 w-2.5 rounded-full ${day.answeredCount > 0 ? 'bg-[#2E5B37]' : 'bg-[#DCEBDD]'}`} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="mt-6 rounded-2xl border border-dashed border-[#0F2942]/15 bg-[#F8F5EE] p-6 text-center text-sm text-[#0F2942]/55">{text}</div>;
}
