'use client';

import { useState } from 'react';
import { CheckCircle2, Clock, Send, Sparkles } from 'lucide-react';

type Props = {
  onClose: () => void;
  onConfirm: () => void;
  requireScopeConfirmation?: boolean;
  teacherName?: string;
};

export function UploadConfirmationModal({ onClose, onConfirm, requireScopeConfirmation = false, teacherName }: Props) {
  const [scopeConfirmed, setScopeConfirmed] = useState(false);
  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-[#0F2942]/10 text-[#0F2942] rounded-xl shrink-0 border border-[#0F2942]/15">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0F2942]">
                  Confirmar Envio para Processamento
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Atenção às orientações importantes antes de enviar seus materiais:
                </p>
              </div>
            </div>

            <div className="space-y-3.5 bg-[#E8F0FA]/60 border border-[#173C67]/15 rounded-xl p-4 text-xs text-[#0F2942]/85 leading-relaxed">
              <div className="flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-[#173C67] shrink-0 mt-0.5" />
                <p>
                  <strong className="font-bold text-[#0F2942]">Ferramenta de auxílio:</strong> A IA é uma ferramenta para ajudar e acelerar a estruturação dos seus materiais e questões.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-[#173C67] shrink-0 mt-0.5" />
                <p>
                  <strong className="font-bold text-[#0F2942]">Tempo de leitura:</strong> O processamento completo dos documentos pode levar <strong>alguns minutos</strong>.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#173C67] shrink-0 mt-0.5" />
                <p>
                  <strong className="font-bold text-[#0F2942]">Revisão necessária:</strong> Após a leitura, você precisará <strong>revisar os materiais gerados</strong> antes de aprová-los para os alunos.
                </p>
              </div>
            </div>

            {requireScopeConfirmation && (
              <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-700">
                <input type="checkbox" checked={scopeConfirmed} onChange={(event) => setScopeConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-800" />
                <span>Confirmo que estes arquivos serão adicionados somente à base de conhecimento de {teacherName}, nas matérias indicadas na fila.</span>
              </label>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!requireScopeConfirmation || scopeConfirmed) onConfirm();
                }}
                disabled={requireScopeConfirmation && !scopeConfirmed}
                className="inline-flex items-center gap-2 px-4.5 py-2 text-xs font-bold text-white bg-[#0F2942] hover:bg-[#0F2942]/90 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg shadow-xs transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Confirmar e Enviar para IA</span>
              </button>
            </div>
          </div>
        </div>
  );
}
