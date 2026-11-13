'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BrainCircuit, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Loader2, Search, Target, Users, XCircle } from 'lucide-react';
import {
  TeacherIntelligenceService,
  isIntelligenceDemo,
  type IntelligenceMonitorDetail,
  type IntelligenceOverview,
  type IntelligencePeriod,
  type IntelligenceStudentDetail,
} from '../../services/TeacherIntelligenceService';

const periodOptions: Array<{ value: IntelligencePeriod; label: string }> = [
  { value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' }, { value: '90d', label: '90 dias' }, { value: 'all', label: 'Todo o período' },
];
const panelButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2';
const formatPercent = (value: number | null) => value === null ? 'Sem dados' : `${Math.round(value)}%`;
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : 'Sem atividade';

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Users }) {
  return <div className="rounded-2xl bg-[#0F2942] px-5 py-5 text-center text-white shadow-sm">
    <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide text-white"><Icon className="h-4 w-4 shrink-0 text-white" />{label}</div>
    <p className="mt-2 text-2xl font-bold text-white">{value}</p><p className="mt-1 text-xs text-white">{detail}</p>
  </div>;
}

export function TeacherIntelligencePanel() {
  const [period, setPeriod] = useState<IntelligencePeriod>('30d');
  const [overview, setOverview] = useState<IntelligenceOverview | null>(null);
  const [monitor, setMonitor] = useState<IntelligenceMonitorDetail | null>(null);
  const [student, setStudent] = useState<IntelligenceStudentDetail | null>(null);
  const [selectedMonitorId, setSelectedMonitorId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const loadOverview = useCallback(async () => {
    setLoading(true); setError(null);
    try { setOverview(await TeacherIntelligenceService.getOverview(period)); setMonitor(null); setStudent(null); setSelectedMonitorId(null); setSelectedStudentId(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o painel.'); }
    finally { setLoading(false); }
  }, [period]);

  const loadMonitor = useCallback(async (monitorId: string, currentPage: number, currentSearch: string) => {
    setLoading(true); setError(null);
    try { setMonitor(await TeacherIntelligenceService.getMonitor(monitorId, { period, page: currentPage, pageSize, search: currentSearch, sort: 'name' })); setStudent(null); setSelectedStudentId(null); setSelectedMonitorId(monitorId); setPage(currentPage); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o monitor.'); }
    finally { setLoading(false); }
  }, [pageSize, period]);

  const loadStudent = useCallback(async (monitorId: string, studentId: string) => {
    setLoading(true); setError(null);
    try { setStudent(await TeacherIntelligenceService.getStudent(monitorId, studentId, period)); setSelectedMonitorId(monitorId); setSelectedStudentId(studentId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o aluno.'); }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { if (!selectedMonitorId) void loadOverview(); else if (selectedStudentId) void loadStudent(selectedMonitorId, selectedStudentId); else void loadMonitor(selectedMonitorId, page, search); }, [period]);

  const backToOverview = () => { setSelectedMonitorId(null); setSelectedStudentId(null); setStudent(null); setMonitor(null); void loadOverview(); };
  const backToMonitor = () => { setSelectedStudentId(null); setStudent(null); if (selectedMonitorId) void loadMonitor(selectedMonitorId, page, search); };
  const currentMetrics = student ? null : monitor?.metrics ?? overview?.metrics;
  const title = student?.student.fullName ?? monitor?.monitor.name ?? 'Painel de Inteligência';

  return <section className="space-y-6" aria-labelledby="teacher-intelligence-title">
    {isIntelligenceDemo() && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Demonstração: 50 alunos fictícios para Juarez. Os dados não são reais.</p>}
    <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {(monitor || student) && <button type="button" onClick={student ? backToMonitor : backToOverview} className={`${panelButton} -ml-3 mb-2 text-emerald-900 hover:bg-emerald-50`}><ArrowLeft className="h-4 w-4" />{student ? 'Voltar aos alunos' : 'Voltar aos monitores'}</button>}
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-800"><BrainCircuit className="h-4 w-4" />Inteligência de aprendizagem</p>
        <h2 id="teacher-intelligence-title" className="mt-2 text-2xl font-bold text-[#132E20]">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">Desempenho e frequência de prática dos seus alunos.</p>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">Período
        <select aria-label="Período dos indicadores" value={period} onChange={(event) => setPeriod(event.target.value as IntelligencePeriod)} className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
          {periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </div>

    {loading ? <div className="flex min-h-56 items-center justify-center text-sm text-slate-500" role="status"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando indicadores…</div>
      : error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5" role="alert"><p className="font-semibold text-rose-900">{error}</p><button onClick={() => selectedStudentId && selectedMonitorId ? void loadStudent(selectedMonitorId, selectedStudentId) : selectedMonitorId ? void loadMonitor(selectedMonitorId, page, search) : void loadOverview()} className={`${panelButton} mt-3 bg-rose-800 text-white hover:bg-rose-900`}>Tentar novamente</button></div>
        : student ? <StudentView detail={student} />
          : <>
            {currentMetrics && <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Alunos vinculados" value={String(currentMetrics.studentCount)} detail="No escopo selecionado" icon={Users} />
              <Metric label="Acurácia média" value={formatPercent(currentMetrics.accuracy)} detail={`${currentMetrics.accuracyStudentCount} aluno(s) com respostas`} icon={Target} />
              <Metric label="Questões respondidas" value={String(currentMetrics.attemptCount)} detail={period === 'all' ? 'Média diária indisponível para todo o período' : currentMetrics.studentCount === 0 ? 'Sem alunos para calcular a média' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(currentMetrics.attemptCount / currentMetrics.studentCount / Number.parseInt(period, 10))} questões por aluno por dia, em média`} icon={CheckCircle2} />
              <Metric label="Dias médios de prática" value={currentMetrics.averagePracticeDays.toFixed(1)} detail={`${currentMetrics.activeStudentCount} aluno(s) praticaram`} icon={Clock3} />
            </div>}
            {monitor ? <MonitorView detail={monitor} search={search} setSearch={(value) => { setSearch(value); void loadMonitor(monitor.monitor.id, 1, value); }} page={page} pageSize={pageSize} onPage={(next) => void loadMonitor(monitor.monitor.id, next, search)} onStudent={(id) => void loadStudent(monitor.monitor.id, id)} />
              : <OverviewView overview={overview} onMonitor={(id) => { setSearch(''); setPage(1); void loadMonitor(id, 1, ''); }} />}
          </>}
  </section>;
}

function OverviewView({ overview, onMonitor }: { overview: IntelligenceOverview | null; onMonitor: (id: string) => void }) {
  if (!overview) return <EmptyState title="Não há dados para exibir" detail="Confira sua conexão e tente carregar o painel novamente." />;
  if (!overview.monitors.length) return <EmptyState title="Você ainda não tem monitores" detail="Quando criar um monitor, os indicadores dos alunos aparecerão aqui." />;
  return <div className="space-y-4">
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-lg font-bold text-[#132E20]">Desempenho por monitor</h3><p className="text-sm text-slate-500">Selecione um monitor para ver tópicos e alunos.</p></div><p className="text-xs text-slate-500">{overview.metrics.studentCount - overview.metrics.activeStudentCount} aluno(s) sem prática no período</p></div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {overview.monitors.map((item) => <button key={item.id} onClick={() => onMonitor(item.id)} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-emerald-700 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
        <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3">{item.avatarUrl ? <img src={item.avatarUrl} alt="" className="h-11 w-11 rounded-xl object-cover" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-900">{item.name.slice(0, 1).toUpperCase()}</span>}<div className="min-w-0"><h4 className="truncate font-bold text-[#132E20]">{item.name}</h4><p className="text-xs text-slate-500">{item.metrics.studentCount} alunos vinculados</p></div></div><ArrowLeft className="h-4 w-4 rotate-180 text-slate-400 transition group-hover:translate-x-1 group-hover:text-emerald-800" /></div>
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4"><div><p className="text-[11px] text-slate-500">Acurácia</p><p className="mt-1 font-bold text-[#132E20]">{formatPercent(item.metrics.accuracy)}</p></div><div><p className="text-[11px] text-slate-500">Ativos</p><p className="mt-1 font-bold text-[#132E20]">{item.metrics.activeStudentCount}/{item.metrics.studentCount}</p></div><div><p className="text-[11px] text-slate-500">Dias médios</p><p className="mt-1 font-bold text-[#132E20]">{item.metrics.averagePracticeDays.toFixed(1)}</p></div></div>
      </button>)}
    </div>
  </div>;
}

function MonitorView({ detail, search, setSearch, page, pageSize, onPage, onStudent }: { detail: IntelligenceMonitorDetail; search: string; setSearch: (value: string) => void; page: number; pageSize: number; onPage: (page: number) => void; onStudent: (id: string) => void }) {
  const topics = detail.topics;
  return <div className="space-y-7">
    <div className="grid gap-5 lg:grid-cols-2">
      <TopicList title="Pontos fortes" entries={topics.strongest} positive />
      <TopicList title="Precisam de atenção" entries={topics.needsAttention} />
    </div>
    <div>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-lg font-bold text-[#132E20]">Alunos</h3><p className="text-sm text-slate-500">{detail.pagination.total} aluno(s) vinculados a este monitor.</p></div><label className="relative block w-full sm:max-w-xs"><span className="sr-only">Buscar aluno por nome</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar aluno" className="min-h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" /></label></div>
      {detail.students.length ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><ul className="divide-y divide-slate-100">{detail.students.map((item) => <li key={item.id}><button onClick={() => onStudent(item.id)} className="flex w-full flex-col gap-2 px-4 py-4 text-left transition hover:bg-emerald-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700 sm:flex-row sm:items-center sm:justify-between"><span><span className="block font-semibold text-[#132E20]">{item.fullName}</span><span className="text-xs text-slate-500">{item.email}</span></span><span className="flex items-center gap-5 text-xs text-slate-600"><span>{item.attemptCount} respostas</span><span className="font-semibold text-[#132E20]">{formatPercent(item.accuracy)}</span><span>{formatDate(item.lastActivityAt)}</span></span></button></li>)}</ul></div> : <EmptyState title="Nenhum aluno encontrado" detail={search ? 'Tente outro nome.' : 'Não há alunos ativos neste monitor.'} />}
      {detail.pagination.total > pageSize && <div className="mt-3 flex items-center justify-between text-sm text-slate-600"><span>Página {page} de {Math.ceil(detail.pagination.total / pageSize)}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior" className={`${panelButton} border border-slate-300 disabled:opacity-40`}><ChevronLeft className="h-4 w-4" />Anterior</button><button disabled={page * pageSize >= detail.pagination.total} onClick={() => onPage(page + 1)} aria-label="Próxima página" className={`${panelButton} border border-slate-300 disabled:opacity-40`}>Próxima<ChevronRight className="h-4 w-4" /></button></div></div>}
    </div>
  </div>;
}

function TopicList({ title, entries, positive = false }: { title: string; entries: Array<{ name: string; accuracy: number; attempts: number; studentCount: number }>; positive?: boolean }) {
  return <section className="border-t-2 border-emerald-700 pt-3"><h3 className="font-bold text-[#132E20]">{title}</h3>{entries.length ? <ol className="mt-2 divide-y divide-slate-200">{entries.slice(0, 3).map((entry, index) => <li key={`${entry.name}-${index}`} className="flex items-center justify-between gap-3 py-3"><div><p className="font-medium text-slate-800">{entry.name}</p><p className="text-xs text-slate-500">{entry.attempts} respostas · {entry.studentCount} alunos</p></div><span className={`text-lg font-bold ${positive ? 'text-emerald-800' : 'text-amber-800'}`}>{formatPercent(entry.accuracy)}</span></li>)}</ol> : <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Ainda não há amostra suficiente para classificar tópicos.</p>}</section>;
}

function StudentView({ detail }: { detail: IntelligenceStudentDetail }) {
  const { metrics } = detail;
  const topics = detail.topicPerformance.filter((topic) => topic.attemptCount >= 5).sort((a, b) => a.accuracy - b.accuracy);
  const strongest = [...topics].sort((a, b) => b.accuracy - a.accuracy).slice(0, 3);
  const attention = topics.filter((topic) => !strongest.includes(topic)).slice(0, 3);
  return <div className="space-y-7">
    <p className="text-sm text-slate-500">{detail.monitor.name} · {detail.student.email}</p>
    <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Acurácia" value={formatPercent(metrics.accuracy)} detail={`${metrics.correctCount} de ${metrics.attemptCount} respostas corretas`} icon={Target} /><Metric label="Dias de prática" value={String(metrics.practiceDays)} detail="Dias distintos no período" icon={Clock3} /><Metric label="Última atividade" value={formatDate(metrics.lastActivityAt)} detail="Questões respondidas" icon={Users} /><Metric label="Flashcards revisados" value={String(metrics.flashcardReviewCount)} detail="Revisões no período" icon={CheckCircle2} /></div>
    <section><h3 className="mb-3 text-lg font-bold text-[#132E20]">Desempenho por tópico</h3>{detail.topicPerformance.length ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><ul className="divide-y divide-slate-100">{[...detail.topicPerformance].sort((a, b) => a.accuracy - b.accuracy).map((topic) => <li key={`${topic.subject}-${topic.topic}`} className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center"><span className="text-xs text-slate-500 sm:text-sm">{topic.subject}</span><span className="font-medium text-slate-800">{topic.topic}<span className="ml-2 text-xs text-slate-400">{topic.attemptCount} resp.</span></span><span className="font-bold text-[#132E20]">{formatPercent(topic.accuracy)}</span></li>)}</ul></div> : <EmptyState title="Sem desempenho por tópico" detail="As respostas deste aluno ainda não têm tópicos classificados." />}</section>
    {topics.length > 0 && <div className="grid gap-5 lg:grid-cols-2"><TopicList title="Melhores tópicos" entries={strongest.map((topic) => ({ name: topic.topic, accuracy: topic.accuracy, attempts: topic.attemptCount, studentCount: 1 }))} positive /><TopicList title="Tópicos para reforçar" entries={attention.map((topic) => ({ name: topic.topic, accuracy: topic.accuracy, attempts: topic.attemptCount, studentCount: 1 }))} /></div>}
    {topics.length === 0 && <p className="flex items-center gap-2 text-sm text-slate-500"><XCircle className="h-4 w-4" />São necessárias ao menos 5 respostas por tópico para destacar tendências.</p>}
  </div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-5 py-10 text-center"><p className="font-semibold text-[#132E20]">{title}</p><p className="mt-1 text-sm text-slate-500">{detail}</p></div>; }
