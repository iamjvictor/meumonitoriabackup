'use client';

import { Medal, TrendingDown, TrendingUp } from 'lucide-react';

type Topic = { id: string | null; name: string; answeredCount: number; correctCount: number; incorrectCount: number; accuracy: number };
type Subject = { id: string; name: string; topics: Topic[] };
type Monitor = { id: string; name: string; subjects: Subject[] };
type RankingItem = Topic & { subjectNames: string[]; monitorNames: string[] };

function aggregateTopics(monitors: Monitor[]) {
  const topics = new Map<string, RankingItem>();
  monitors.forEach((monitor) => monitor.subjects.forEach((subject) => subject.topics.forEach((topic) => {
    const key = topic.id || `${subject.id}-${topic.name}`;
    const current = topics.get(key);
    if (!current) {
      topics.set(key, { ...topic, subjectNames: [subject.name], monitorNames: [monitor.name] });
      return;
    }
    current.answeredCount += topic.answeredCount;
    current.correctCount += topic.correctCount;
    current.incorrectCount += topic.incorrectCount;
    current.accuracy = current.answeredCount > 0 ? Math.round((current.correctCount / current.answeredCount) * 100) : 0;
    if (!current.subjectNames.includes(subject.name)) current.subjectNames.push(subject.name);
    if (!current.monitorNames.includes(monitor.name)) current.monitorNames.push(monitor.name);
  })));
  return Array.from(topics.values()).sort((a, b) => b.accuracy - a.accuracy);
}

function RankingCard({ title, items, descending }: { title: string; items: RankingItem[]; descending: boolean }) {
  const Icon = descending ? TrendingUp : TrendingDown;
  return (
    <section className="rounded-[20px] border border-[#0F2942]/10 bg-[#FCFBF7] p-4" aria-label={title}>
      <div className="flex items-center gap-2 border-b border-[#0F2942]/10 pb-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${descending ? 'bg-[#2E5B37]' : 'bg-[#C56A43]'} text-white`}><Icon className="h-3.5 w-3.5" /></span>
        <h3 className="font-heading text-base font-bold">{title}</h3>
      </div>
      {items.length === 0 ? <p className="py-5 text-sm text-[#0F2942]/50">Responda questões para gerar este ranking.</p> : <div className="mt-3 space-y-2">{items.map((item, index) => <article key={`${item.id}-${item.name}`} className="flex items-center gap-2.5 rounded-2xl border border-[#0F2942]/10 bg-white px-2.5 py-2"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${index === 0 ? 'bg-[#F6D36B] text-[#6B4A00]' : index === 1 ? 'bg-[#D9E1E5] text-[#43515A]' : 'bg-[#E8C09E] text-[#704629]'}`}>{index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h4 className="truncate text-xs font-bold text-[#0F2942]">{item.name}</h4><span className={`shrink-0 font-heading text-base font-black ${descending ? 'text-[#2E5B37]' : 'text-[#C56A43]'}`}>{item.accuracy}%</span></div><p className="mt-0.5 truncate text-[9px] text-[#0F2942]/45">{item.subjectNames.join(' · ')}</p><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#DCE5DC]"><div className={`h-full rounded-full ${descending ? 'bg-[#76B982]' : 'bg-[#E5A078]'}`} style={{ width: `${item.accuracy}%` }} /></div><p className="mt-1 text-[9px] text-[#0F2942]/50">{item.answeredCount} respondidas · {item.correctCount} acertos · {item.incorrectCount} erros</p></div>{index === 0 && <Medal className={`h-3.5 w-3.5 shrink-0 ${descending ? 'text-[#C39418]' : 'text-[#C56A43]'}`} />}</article>)}</div>}
    </section>
  );
}

export function SubjectRankings({ monitors }: { monitors: Monitor[] }) {
  const topics = aggregateTopics(monitors);

  return (
    <section className="rounded-[26px] border border-[#0F2942]/10 bg-white p-4 shadow-sm" aria-label="Ranking de matérias">
      <div className="grid gap-4 lg:grid-cols-2"><RankingCard title="Top 3 melhores tópicos" items={topics.slice(0, 3)} descending /><RankingCard title="Top 3 tópicos para reforçar" items={[...topics].reverse().slice(0, 3)} descending={false} /></div>
    </section>
  );
}
