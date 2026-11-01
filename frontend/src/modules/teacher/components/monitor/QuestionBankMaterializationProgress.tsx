'use client';

import { LoaderCircle, RotateCcw } from 'lucide-react';
import type { QuestionBankMaterializationRun } from '@/modules/teacher/services/TeacherMonitorService';

type Props = {
  run: QuestionBankMaterializationRun;
  isRetrying?: boolean;
  onRetry?: () => void;
};

const terminalStatuses = new Set(['COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED']);

export function QuestionBankMaterializationProgress({ run, isRetrying = false, onRetry }: Props) {
  const total = run.totalEligible ?? run.totalSelected;
  const percent = total > 0 ? Math.min(100, Math.round((run.processed / total) * 100)) : 0;
  const isTerminal = terminalStatuses.has(run.status);
  const label = run.status === 'QUEUED'
    ? 'Importação na fila. O total abaixo é uma estimativa do catálogo.'
    : run.status === 'PROCESSING'
      ? 'Importando questões do acervo para este monitor.'
      : run.status === 'RETRYING'
        ? 'Uma falha temporária ocorreu. Vamos tentar novamente automaticamente.'
        : run.status === 'COMPLETED'
          ? 'Importação concluída.'
          : run.status === 'COMPLETED_WITH_WARNINGS'
            ? 'Importação concluída com questões que precisam de atenção.'
            : 'A importação não foi concluída.';

  return (
    <section className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm" aria-label="Progresso da importação de questões">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-emerald-950">Importação do banco de questões</p>
          <p className="mt-1 text-sm text-slate-600" role="status">{label}</p>
        </div>
        {!isTerminal && <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-emerald-700" aria-hidden="true" />}
      </div>

      <div className="mt-3">
        <div
          className="h-2.5 overflow-hidden rounded-full bg-emerald-100"
          role="progressbar"
          aria-label="Questões importadas"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.min(run.processed, total)}
          aria-valuetext={`${run.processed} de ${total} questões`}
        >
          <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-1.5 flex flex-wrap justify-between gap-x-4 text-xs font-semibold text-slate-600">
          <span>{run.processed.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')} questões{run.totalEligible === null ? ' (estimativa)' : ''}</span>
          <span>{percent}%</span>
        </div>
      </div>

      {isTerminal && (
        <p className="mt-3 text-xs text-slate-600">
          {run.created} importadas · {run.updated} atualizadas · {run.skipped} ignoradas · {run.failed} com falha
        </p>
      )}
      {run.status === 'FAILED' && run.errorMessage && <p className="mt-2 text-sm text-rose-700">{run.errorMessage}</p>}
      {run.status === 'FAILED' && onRetry && (
        <button type="button" onClick={onRetry} disabled={isRetrying} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-900 disabled:opacity-60">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {isRetrying ? 'Reenfileirando...' : 'Tentar novamente'}
        </button>
      )}
    </section>
  );
}
