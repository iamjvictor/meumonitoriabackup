'use client';

import { ArrowRight, CheckCircle2, Clock3, RefreshCw, Sparkles } from 'lucide-react';
import type { StudentMonitorRecord } from '@/modules/student/context/StudentContext';
import { getWeeklySimulationActionLabel, type WeeklySimulationStatus } from '../models/weekly-simulation-ui';
import type { WeeklySimulationStatusResponse } from '../services/student-dashboard.service';

interface Props {
  monitors: StudentMonitorRecord[];
  states: Record<string, WeeklySimulationStatusResponse>;
  busyMonitorId: string | null;
  error: string | null;
  onAction: (monitorId: string, status: WeeklySimulationStatus) => void;
}

function statusCopy(status: WeeklySimulationStatus) {
  switch (status) {
    case 'AVAILABLE_TO_GENERATE': return 'Seu diagnóstico da semana está pronto para ser montado.';
    case 'PENDING': return 'Recebemos seu pedido e estamos organizando as questões.';
    case 'PROCESSING': return 'Cruzando seu desempenho em questões e flashcards.';
    case 'READY': return 'O simulado está pronto para você começar.';
    case 'IN_PROGRESS': return 'Você já começou este simulado e pode continuar de onde parou.';
    case 'COMPLETED': return 'Simulado concluído. Revise seu desempenho quando quiser.';
    case 'BLOCKED_BY_PREVIOUS': return 'Conclua o simulado anterior para liberar o desta semana.';
    case 'FAILED': return 'Não conseguimos montar este simulado. Você pode tentar novamente.';
  }
}

export function WeeklySimulationsSection({ monitors, states, busyMonitorId, error, onAction }: Props) {
  if (monitors.length === 0) return null;
  return (
    <section aria-labelledby="weekly-simulations-title" className="mt-10 border-t border-[#D9D2C5] pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#C65F3B]">Diagnóstico semanal</p>
          <h2 id="weekly-simulations-title" className="font-serif text-3xl font-semibold text-[#0F2942]">Simulados da semana</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5E6B73]">Um simulado personalizado por monitor, distribuído a partir do que mais precisa da sua atenção.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#5E6B73]"><Sparkles size={15} aria-hidden="true" /> 30 questões por monitor</div>
      </div>

      <div className="mt-6 divide-y divide-[#E2DCD2] border-y border-[#E2DCD2]">
        {monitors.map((monitor) => {
          const state = states[monitor.id]?.status ?? 'AVAILABLE_TO_GENERATE';
          const isBusy = busyMonitorId === monitor.id;
          const disabled = isBusy || state === 'PENDING' || state === 'PROCESSING';
          return (
            <div key={monitor.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E6EFEA] text-[#2E6B59]"><Sparkles size={16} aria-hidden="true" /></span>
                  <div><h3 className="font-semibold text-[#0F2942]">{monitor.name}</h3><p className="text-xs text-[#7B8587]">{monitor.subject || monitor.area || 'Monitor de estudos'}</p></div>
                </div>
                <p className="mt-3 text-sm text-[#5E6B73]">{statusCopy(state)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3 sm:pl-5">
                {state === 'READY' || state === 'COMPLETED' ? <CheckCircle2 size={17} className="text-[#2E6B59]" aria-hidden="true" /> : null}
                {state === 'PENDING' || state === 'PROCESSING' ? <Clock3 size={17} className="animate-pulse text-[#C65F3B]" aria-hidden="true" /> : null}
                <button type="button" disabled={disabled} onClick={() => onAction(monitor.id, state)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#0F2942] px-5 text-sm font-semibold text-white transition hover:bg-[#183D5D] disabled:cursor-wait disabled:bg-[#A7AFAB]">
                  {state === 'FAILED' ? <RefreshCw size={15} aria-hidden="true" /> : null}{isBusy ? 'Preparando…' : getWeeklySimulationActionLabel(state)}{!disabled && state !== 'FAILED' ? <ArrowRight size={15} aria-hidden="true" /> : null}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {error ? <p role="alert" className="mt-4 text-sm text-[#B84732]">{error}</p> : null}
    </section>
  );
}
