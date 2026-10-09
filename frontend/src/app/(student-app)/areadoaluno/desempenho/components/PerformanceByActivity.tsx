'use client';

import { BookOpen, Brain, ClipboardCheck, Layers, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';

type QuestionTopic = { id: string | null; name: string; answeredCount: number; correctCount: number; incorrectCount: number; accuracy: number };
type QuestionSubject = QuestionTopic & { id: string; topics: QuestionTopic[] };
type QuestionMonitor = { id: string; name: string; answeredCount: number; correctCount: number; incorrectCount: number; accuracy: number; subjects: QuestionSubject[] };
type FlashcardTopic = { id: string | null; name: string; reviewedCount: number; retainedCount: number; retentionRate: number; againCount: number; hardCount: number; goodCount: number; easyCount: number };
type FlashcardSubject = FlashcardTopic & { id: string; topics: FlashcardTopic[] };
type FlashcardMonitor = { id: string; name: string; reviewedCount: number; retainedCount: number; retentionRate: number; againCount: number; hardCount: number; goodCount: number; easyCount: number; subjects: FlashcardSubject[] };

interface PerformanceByActivityProps {
  questionMonitors: QuestionMonitor[];
  flashcardMonitors: FlashcardMonitor[];
  simulatedMonitors: QuestionMonitor[];
  dailyChallengeMonitors: QuestionMonitor[];
}

type ActivityKind = 'questions' | 'flashcards';
type ActivitySectionProps = { label: string; description: string; icon: typeof BookOpen; color: string; kind: ActivityKind; monitors: QuestionMonitor[] | FlashcardMonitor[] };

function tone(value: number) {
  if (value >= 80) return 'text-[#2E5B37]';
  if (value >= 60) return 'text-amber-700';
  return 'text-rose-700';
}

function percent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return <div className="h-2 overflow-hidden rounded-full bg-[#DCE5DC]"><div className={`h-full rounded-full ${color}`} style={{ width: percent(value) }} /></div>;
}

function QuestionDetails({ subject }: { subject: QuestionSubject }) {
  return (
    <>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#0F2942]/55"><span>{subject.answeredCount} respondidas</span><span className="text-[#2E5B37]">{subject.correctCount} acertos</span><span className="text-rose-700">{subject.incorrectCount} erros</span></div>
      {subject.topics.length > 0 && <div className="mt-4 border-l-2 border-[#DCE5DC] pl-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0F2942]/45">Tópicos</p><div className="mt-2 space-y-3">{subject.topics.map((topic) => <div key={topic.id ?? topic.name}><div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-[#0F2942]">{topic.name}</span><span className={`font-bold ${tone(topic.accuracy)}`}>{percent(topic.accuracy)}</span></div><ProgressBar value={topic.accuracy} color="bg-[#76B982]" /><p className="mt-1 text-[10px] text-[#0F2942]/45">{topic.answeredCount} respondidas · <span className="text-[#2E5B37]">{topic.correctCount} acertos</span> · <span className="text-rose-700">{topic.incorrectCount} erros</span></p></div>)}</div></div>}
    </>
  );
}

function FlashcardDetails({ subject }: { subject: FlashcardSubject }) {
  return (
    <>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#0F2942]/55"><span>{subject.reviewedCount} revisões</span><span className="text-[#2E5B37]">{subject.retainedCount} retidos</span><span className="text-amber-700">{subject.againCount} para revisar</span></div>
      {subject.topics.length > 0 && <div className="mt-4 border-l-2 border-[#DCE5DC] pl-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0F2942]/45">Tópicos</p><div className="mt-2 space-y-3">{subject.topics.map((topic) => <div key={topic.id ?? topic.name}><div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-[#0F2942]">{topic.name}</span><span className={`font-bold ${tone(topic.retentionRate)}`}>{percent(topic.retentionRate)}</span></div><ProgressBar value={topic.retentionRate} color="bg-[#76B982]" /><p className="mt-1 text-[10px] text-[#0F2942]/45">{topic.reviewedCount} revisões · <span className="text-[#2E5B37]">{topic.retainedCount} retidos</span> · <span className="text-amber-700">{topic.againCount} para revisar</span></p></div>)}</div></div>}
    </>
  );
}

function ActivitySection({ label, description, icon: Icon, color, kind, monitors }: ActivitySectionProps) {
  const isFlashcard = kind === 'flashcards';
  const typedMonitors = isFlashcard ? monitors as FlashcardMonitor[] : monitors as QuestionMonitor[];
  const total = isFlashcard
    ? (typedMonitors as FlashcardMonitor[]).reduce((sum, monitor) => sum + monitor.reviewedCount, 0)
    : (typedMonitors as QuestionMonitor[]).reduce((sum, monitor) => sum + monitor.answeredCount, 0);
  const successful = isFlashcard
    ? (typedMonitors as FlashcardMonitor[]).reduce((sum, monitor) => sum + monitor.retainedCount, 0)
    : (typedMonitors as QuestionMonitor[]).reduce((sum, monitor) => sum + monitor.correctCount, 0);
  const overall = total > 0 ? (successful / total) * 100 : 0;
  return (
    <section className="rounded-[22px] border border-[#0F2942]/10 bg-[#FCFBF7] p-5" aria-label={`Desempenho detalhado em ${label}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#0F2942]/10 pb-4"><div className="flex items-start gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color} text-white`}><Icon className="h-4 w-4" /></span><div><h3 className="font-heading text-lg font-bold">{label}</h3><p className="mt-1 text-xs text-[#0F2942]/55">{description}</p></div></div><div className="text-right"><p className={`font-heading text-2xl font-black ${tone(overall)}`}>{percent(overall)}</p><p className="text-[10px] text-[#0F2942]/50">{isFlashcard ? `${total} revisões` : `${total} respondidas`}</p></div></div>
      {typedMonitors.length === 0 ? <p className="py-6 text-sm text-[#0F2942]/50">Nenhum dado disponível para este monitor.</p> : <div className="mt-4 grid gap-3 md:grid-cols-2">{typedMonitors.map((monitor) => { const monitorValue = isFlashcard ? (monitor as FlashcardMonitor).retentionRate : (monitor as QuestionMonitor).accuracy; return <article key={monitor.id} className="rounded-2xl border border-[#0F2942]/10 bg-white p-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><h4 className="truncate font-heading text-sm font-bold">{monitor.name}</h4><p className="mt-1 text-[11px] text-[#0F2942]/50">Detalhamento por matéria</p></div><span className={`shrink-0 font-heading text-lg font-black ${tone(monitorValue)}`}>{percent(monitorValue)}</span></div><div className="mt-2"><ProgressBar value={monitorValue} color={color} /></div><div className="mt-3 grid gap-3 sm:grid-cols-2">{monitor.subjects.length === 0 ? <p className="text-xs text-[#0F2942]/45">Nenhuma matéria com histórico nesta atividade.</p> : monitor.subjects.map((subject) => { const subjectValue = isFlashcard ? (subject as FlashcardSubject).retentionRate : (subject as QuestionSubject).accuracy; return <div key={subject.id} className="rounded-xl border border-[#0F2942]/10 bg-[#F8F5EE] p-3"><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-bold">{subject.name}</span><span className={`shrink-0 text-sm font-black ${tone(subjectValue)}`}>{percent(subjectValue)}</span></div><div className="mt-2"><ProgressBar value={subjectValue} color="bg-[#76B982]" /></div>{isFlashcard ? <FlashcardDetails subject={subject as FlashcardSubject} /> : <QuestionDetails subject={subject as QuestionSubject} />}</div>; })}</div></article>; })}</div>}
    </section>
  );
}

export function PerformanceByActivity({ questionMonitors, flashcardMonitors, simulatedMonitors, dailyChallengeMonitors }: PerformanceByActivityProps) {
  const monitorOptions = useMemo(() => { const names = new Map<string, string>(); [...questionMonitors, ...flashcardMonitors, ...simulatedMonitors, ...dailyChallengeMonitors].forEach((monitor) => names.set(monitor.id, monitor.name)); return Array.from(names, ([id, name]) => ({ id, name })); }, [dailyChallengeMonitors, flashcardMonitors, questionMonitors, simulatedMonitors]);
  const [selectedMonitorId, setSelectedMonitorId] = useState('ALL');
  const effectiveSelectedMonitorId = selectedMonitorId !== 'ALL' && monitorOptions.some((monitor) => monitor.id === selectedMonitorId) ? selectedMonitorId : 'ALL';
  const filter = <T extends { id: string }>(items: T[]) => effectiveSelectedMonitorId === 'ALL' ? items : items.filter((item) => item.id === effectiveSelectedMonitorId);
  return (
    <section className="rounded-[26px] border border-[#0F2942]/10 bg-white p-6 shadow-sm" aria-label="Aproveitamento por tipo de atividade">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2E5B37]">Desempenho por atividade</p><h2 className="mt-1 font-heading text-xl font-bold">Aproveitamento detalhado</h2><p className="mt-1 text-sm text-[#0F2942]/55">Escolha um monitor e acompanhe matérias, tópicos e aproveitamento sem misturar os históricos.</p></div><div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-[#2E5B37]" /><select aria-label="Selecionar monitor do desempenho" value={effectiveSelectedMonitorId} onChange={(event) => setSelectedMonitorId(event.target.value)} className="rounded-xl border border-[#0F2942]/15 bg-[#F8F5EE] px-3 py-2 text-xs font-bold text-[#0F2942] focus:border-[#2E5B37] focus:outline-none"><option value="ALL">Todos os monitores</option>{monitorOptions.map((monitor) => <option key={monitor.id} value={monitor.id}>{monitor.name}</option>)}</select></div></div>
      <div className="mt-5 space-y-5"><ActivitySection label="Questões" description="Acertos, Erros e aproveitamento por matéria e tópico." icon={BookOpen} color="bg-[#2E5B37]" kind="questions" monitors={filter(questionMonitors)} /><ActivitySection label="Flashcards" description="Retenção e revisões por matéria e tópico." icon={Brain} color="bg-[#76B982]" kind="flashcards" monitors={filter(flashcardMonitors)} /><ActivitySection label="Simulados" description="Aproveitamento das questões respondidas em simulados." icon={ClipboardCheck} color="bg-[#24527A]" kind="questions" monitors={filter(simulatedMonitors)} /><ActivitySection label="Desafios diários" description="Desempenho nas questões dos desafios diários." icon={Layers} color="bg-amber-500" kind="questions" monitors={filter(dailyChallengeMonitors)} /></div>
    </section>
  );
}
