'use client';

import type { Dispatch, SetStateAction } from 'react';
import { BookOpen, BrainCircuit, CheckCircle2, FileText, LoaderCircle, ListChecks, Send, Settings, Sparkles } from 'lucide-react';
import type { TeacherMonitor } from '@/modules/teacher/services/TeacherMonitorService';

type SidebarView = 'structure' | 'settings';
type PublishValidation = { canPublish: boolean; reason: string; completedTopics: number; totalTopics: number };

interface MonitorContextSidebarProps {
  monitor: TeacherMonitor;
  selectedSubjectName: string | null;
  selectedTopic: string | null;
  topicCount: number;
  documentsCount: number;
  totalApprovedQuestionsCount: number;
  totalPendingQuestionsCount: number;
  totalReportedQuestionsCount: number;
  totalApprovedFlashcardsCount: number;
  totalPendingFlashcardsCount: number;
  sidebarView: SidebarView;
  publishValidation: PublishValidation;
  isPublishing: boolean;
  setSidebarView: Dispatch<SetStateAction<SidebarView>>;
  setIsEditingInfo: Dispatch<SetStateAction<boolean>>;
  setEditInfoName: Dispatch<SetStateAction<string>>;
  setEditInfoDescription: Dispatch<SetStateAction<string>>;
  handlePublishMonitor: () => void;
}

export function MonitorContextSidebar({
  monitor,
  selectedSubjectName,
  selectedTopic,
  topicCount,
  documentsCount,
  totalApprovedQuestionsCount,
  totalPendingQuestionsCount,
  totalReportedQuestionsCount,
  totalApprovedFlashcardsCount,
  totalPendingFlashcardsCount,
  sidebarView,
  publishValidation,
  isPublishing,
  setSidebarView,
  setIsEditingInfo,
  setEditInfoName,
  setEditInfoDescription,
  handlePublishMonitor,
}: MonitorContextSidebarProps) {
  const statusLabel = monitor.status === 'PUBLISHED'
    ? 'Publicado'
    : monitor.status === 'READY_TO_PUBLISH'
      ? 'Pronto para publicar'
      : monitor.status === 'PAUSED'
        ? 'Pausado'
        : 'Rascunho';

  const toggleSettings = () => {
    setSidebarView((current) => current === 'settings' ? 'structure' : 'settings');
    setIsEditingInfo(false);
    setEditInfoName(monitor.name);
    setEditInfoDescription(monitor.description || '');
  };

  return (
    <aside aria-label="Informações do monitor" className="order-3 max-h-[45vh] w-full shrink-0 overflow-y-auto border-t border-slate-200 bg-white lg:h-full lg:max-h-none lg:w-[292px] lg:border-l lg:border-t-0">
      <div className="space-y-5 p-4">
        <section className="border-b border-slate-100 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Monitor de IA</p>
              <h1 className="mt-1 truncate text-base font-extrabold text-[#132E20]" title={monitor.name}>{monitor.name}</h1>
              {monitor.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{monitor.description}</p>}
            </div>
            <button
              type="button"
              onClick={toggleSettings}
              aria-label="Configurações do monitor"
              title="Configurações do monitor"
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${sidebarView === 'settings' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-emerald-800'}`}
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${monitor.status === 'PUBLISHED' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            {statusLabel}
          </span>
        </section>

        <section aria-label="Escopo ativo" className="space-y-2">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Escopo ativo</h2>
          <div className="flex min-w-0 items-center gap-2 text-xs font-bold text-[#132E20]">
            <span className="max-w-[44%] truncate rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5" title={selectedSubjectName || 'Matéria'}>{selectedSubjectName || 'Matéria'}</span>
            <span className="text-slate-300">/</span>
            <span className="min-w-0 truncate rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5" title={selectedTopic || 'Toda a matéria'}>{selectedTopic || 'Toda a matéria'}</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] font-semibold text-emerald-900">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
            <span>Esteira de extração IA ativa</span>
          </div>
        </section>

        <section aria-label="Resumo do monitor" className="space-y-2">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Resumo</h2>
          <div className="grid grid-cols-2 gap-2">
            <Metric icon={BookOpen} label="Matérias" value={monitor.subjects.length} />
            <Metric icon={ListChecks} label="Tópicos" value={topicCount} />
            <Metric icon={FileText} label="Base de conhecimento" value={documentsCount} />
            <Metric icon={ListChecks} label="Questões aprovadas" value={totalApprovedQuestionsCount} detail={totalPendingQuestionsCount ? `${totalPendingQuestionsCount} pend.` : undefined} />
            <Metric icon={BrainCircuit} label="Flashcards aprovados" value={totalApprovedFlashcardsCount} detail={totalPendingFlashcardsCount ? `${totalPendingFlashcardsCount} pend.` : undefined} />
            {totalReportedQuestionsCount > 0 && <Metric icon={ListChecks} label="Questões reportadas" value={totalReportedQuestionsCount} alert />}
          </div>
        </section>

        <section className="space-y-2 border-t border-slate-100 pt-4">
          {monitor.status === 'PUBLISHED' ? (
            <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Agente publicado
            </div>
          ) : (
            <button
              type="button"
              disabled={!publishValidation.canPublish || isPublishing}
              onClick={handlePublishMonitor}
              title={publishValidation.reason}
              className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition-colors ${publishValidation.canPublish ? 'bg-[#132E20] text-white hover:bg-[#1E432D]' : 'cursor-not-allowed bg-slate-100 text-slate-400'}`}
            >
              {isPublishing ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
              {isPublishing ? 'Publicando…' : 'Publicar agente'}
            </button>
          )}
          {!publishValidation.canPublish && monitor.status !== 'PUBLISHED' && (
            <p className="text-center text-[10px] leading-4 text-slate-500">{publishValidation.completedTopics}/{publishValidation.totalTopics} tópicos prontos para publicação</p>
          )}
        </section>
      </div>
    </aside>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  alert = false,
}: {
  icon: typeof BookOpen;
  label: string;
  value: number;
  detail?: string;
  alert?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
      <div className="flex items-center gap-1.5 text-slate-400">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${alert ? 'text-rose-600' : 'text-emerald-700'}`} aria-hidden="true" />
        <span className="truncate text-[9px] font-bold uppercase tracking-wide" title={label}>{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`text-lg font-extrabold ${alert ? 'text-rose-700' : 'text-[#132E20]'}`}>{value.toLocaleString('pt-BR')}</span>
        {detail && <span className="truncate text-[9px] font-semibold text-amber-700">{detail}</span>}
      </div>
    </div>
  );
}
