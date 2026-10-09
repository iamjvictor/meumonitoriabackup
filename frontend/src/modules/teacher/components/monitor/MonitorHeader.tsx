'use client';

import Link from 'next/link';
import type { Dispatch, SetStateAction } from 'react';
import { ArrowLeft, CheckCircle2, LoaderCircle, Send, Settings } from 'lucide-react';
import type { TeacherMonitor } from '@/modules/teacher/services/TeacherMonitorService';

type SidebarView = 'structure' | 'settings';
type PublishValidation = { canPublish: boolean; reason: string; completedTopics: number; totalTopics: number };

interface MonitorHeaderProps {
  monitor?: TeacherMonitor;
  title?: string;
  status?: string;
  sidebarView?: SidebarView;
  showWorkspaceHeaders?: boolean;
  topicCount?: number;
  documentsCount?: number;
  totalApprovedQuestionsCount?: number;
  totalPendingQuestionsCount?: number;
  totalReportedQuestionsCount?: number;
  totalApprovedFlashcardsCount?: number;
  totalPendingFlashcardsCount?: number;
  publishValidation?: PublishValidation;
  isPublishing?: boolean;
  setSidebarView?: Dispatch<SetStateAction<SidebarView>>;
  setIsEditingInfo?: Dispatch<SetStateAction<boolean>>;
  setEditInfoName?: Dispatch<SetStateAction<string>>;
  setEditInfoDescription?: Dispatch<SetStateAction<string>>;
  handlePublishMonitor?: () => void;
}

const dummyFn = () => undefined;

export function MonitorHeader({
  monitor: monitorProp,
  title,
  status,
  sidebarView = 'structure',
  showWorkspaceHeaders = true,
  topicCount = 0,
  documentsCount = 0,
  totalApprovedQuestionsCount = 0,
  totalPendingQuestionsCount = 0,
  totalReportedQuestionsCount = 0,
  totalApprovedFlashcardsCount = 0,
  totalPendingFlashcardsCount = 0,
  publishValidation = { canPublish: false, reason: '', totalTopics: 0, completedTopics: 0 },
  isPublishing = false,
  setSidebarView = dummyFn as unknown as Dispatch<SetStateAction<SidebarView>>,
  setIsEditingInfo = dummyFn as unknown as Dispatch<SetStateAction<boolean>>,
  setEditInfoName = dummyFn as unknown as Dispatch<SetStateAction<string>>,
  setEditInfoDescription = dummyFn as unknown as Dispatch<SetStateAction<string>>,
  handlePublishMonitor = dummyFn,
}: MonitorHeaderProps) {
  const monitor = monitorProp ?? ({ name: title ?? '', description: '', status: status ?? 'DRAFT', subjects: [] } as unknown as TeacherMonitor);
  return (
    /* HEADER DO AGENTE (Barra Superior Completa) */
<header className={`shrink-0 bg-white border-b border-slate-200 shadow-2xs z-20 px-6 transition-all duration-300 ease-in-out overflow-hidden ${
  showWorkspaceHeaders ? 'py-4 max-h-[300px] opacity-100' : 'py-0 max-h-0 opacity-0 border-b-transparent pointer-events-none'
}`}>
  <div className="flex flex-wrap items-center justify-between gap-4">
    {/* Identificação do Agente */}
    <div className="flex min-w-0 items-center gap-3.5">
      {sidebarView === 'settings' ? (
        <button
          type="button"
          onClick={() => setSidebarView('structure')}
          title="Voltar para a estrutura do agente"
          className="inline-flex shrink-0 items-center justify-center h-10 w-10 rounded-xl border border-slate-200 text-slate-500 hover:text-[#2E5B37] hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      ) : (
        <Link
          href="/professor"
          title="Voltar ao painel do professor"
          className="inline-flex shrink-0 items-center justify-center h-10 w-10 rounded-xl border border-slate-200 text-slate-500 hover:text-emerald-800 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">Painel do professor</span>
        </Link>
      )}
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="truncate font-heading text-lg font-bold sm:text-xl text-[#132E20]">
            {sidebarView === 'settings' ? 'Configurações do Agente' : monitor.name}
          </h1>
          {sidebarView !== 'settings' && (
            monitor.status === 'PUBLISHED' ? (
              <span className="shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-0.5 text-[11px] font-extrabold tracking-wide text-emerald-800">
                PUBLICADO
              </span>
            ) : monitor.status === 'READY_TO_PUBLISH' ? (
              <span className="shrink-0 rounded-full border border-sky-300 bg-sky-50 px-3 py-0.5 text-[11px] font-extrabold tracking-wide text-sky-800">
                PRONTO PARA PUBLICAR
              </span>
            ) : monitor.status === 'PAUSED' ? (
              <span className="shrink-0 rounded-full border border-slate-300 bg-slate-100 px-3 py-0.5 text-[11px] font-extrabold tracking-wide text-slate-700">
                PAUSADO
              </span>
            ) : (
              <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-3 py-0.5 text-[11px] font-extrabold tracking-wide text-amber-800">
                RASCUNHO
              </span>
            )
          )}
        </div>
        <p className="truncate max-w-2xl text-xs text-slate-500 mt-0.5">
          {sidebarView === 'settings' 
            ? 'Gerencie as informações básicas, status e veja estatísticas do seu monitor.'
            : (monitor.description || '')}
        </p>
      </div>
    </div>

    {/* Dados e Métricas do Agente (Header Bar) */}
    <div className="flex items-center gap-4 shrink-0">
      <div className="hidden lg:flex items-center divide-x divide-slate-200 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2 text-xs shadow-2xs">
        <div className="px-3 text-center">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Matérias</span>
          <span className="font-extrabold text-[#132E20] text-sm">{monitor.subjects.length}</span>
        </div>
        <div className="px-3 text-center">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Específicas</span>
          <span className="font-extrabold text-[#132E20] text-sm">{topicCount}</span>
        </div>
        <div className="px-3 text-center">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Base Conhecimento</span>
                  <span className="font-extrabold text-emerald-800 text-sm">{documentsCount}</span>
        </div>
        <div className="px-3 text-center">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Banco Questões</span>
          <div className="flex items-center gap-1.5 justify-center">
            <span className="font-extrabold text-emerald-800 text-sm">{totalApprovedQuestionsCount}</span>
            {totalPendingQuestionsCount > 0 && (
              <span className="rounded-full bg-amber-100 text-amber-900 px-1.5 py-0.2 text-[10px] font-bold" title={`${totalPendingQuestionsCount} pendentes de revisão em todo o monitor`}>
                {totalPendingQuestionsCount} pend.
              </span>
            )}
            {totalReportedQuestionsCount > 0 && (
              <span className="animate-pulse rounded-full bg-rose-100 px-1.5 py-0.2 text-[10px] font-bold text-rose-700" title={`${totalReportedQuestionsCount} questões reportadas para revisão`}>
                {totalReportedQuestionsCount} reportada{totalReportedQuestionsCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
        <div className="px-3 text-center">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Flashcards</span>
          <div className="flex items-center gap-1.5 justify-center">
            <span className="font-extrabold text-emerald-800 text-sm">{totalApprovedFlashcardsCount}</span>
            {totalPendingFlashcardsCount > 0 && (
              <span className="rounded-full bg-amber-100 text-amber-900 px-1.5 py-0.2 text-[10px] font-bold" title={`${totalPendingFlashcardsCount} pendentes de revisão em todo o monitor`}>
                {totalPendingFlashcardsCount} pend.
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            setSidebarView(prev => prev === 'settings' ? 'structure' : 'settings');
            setIsEditingInfo(false);
            if (monitor) {
              setEditInfoName(monitor.name);
              setEditInfoDescription(monitor.description || '');
            }
          }}
          title="Configurações do Agente"
          className={`inline-flex shrink-0 items-center justify-center h-10 w-10 rounded-xl border transition-all cursor-pointer ${
            sidebarView === 'settings'
              ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-bold'
              : 'border-slate-200 text-slate-500 hover:text-emerald-800 hover:bg-slate-50'
          }`}
        >
          <Settings className={`h-5 w-5 ${sidebarView === 'settings' ? 'animate-spin-slow' : ''}`} />
        </button>

        {monitor?.status === 'PUBLISHED' ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-100/90 border border-emerald-300 px-4 py-2 text-xs font-bold text-emerald-800 shadow-2xs">
            <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
            <span>Agente Publicado</span>
          </div>
        ) : (
          <button
            type="button"
            disabled={!publishValidation.canPublish || isPublishing}
            onClick={handlePublishMonitor}
            title={publishValidation.reason}
            className={`shrink-0 rounded-xl px-5 py-2.5 text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center gap-2 ${
              publishValidation.canPublish
                ? 'bg-[#0F2942] text-white hover:bg-[#0F2942]/90 hover:shadow-md cursor-pointer active:scale-95'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
          >
            {isPublishing ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin text-white" />
                <span>Publicando...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Publicar Agente</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  </div>
</header>


  );
}
