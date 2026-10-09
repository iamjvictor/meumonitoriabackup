'use client';

import { useState } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';

interface ContentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: 'QUESTION' | 'FLASHCARD';
  questionId?: string;
  flashcardId?: string;
}

export function ContentReportModal({
  isOpen,
  onClose,
  targetType,
  questionId,
  flashcardId,
}: ContentReportModalProps) {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) {
      setError('Por favor, selecione um motivo.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';
      const response = await fetch(`${apiUrl}/api/v1/student/reports`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType,
          questionId,
          flashcardId,
          reason,
          description,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao enviar o report. Tente novamente.');
      }

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setReason('');
        setDescription('');
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar o report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0F2942]/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md animate-scale-in rounded-2xl bg-white shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#0F2942] flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Reportar problema
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-[#0F2942]/60 hover:bg-[#0F2942]/5 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isSuccess ? (
          <div className="py-8 flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-bold text-[#0F2942]">Report enviado!</p>
            <p className="text-sm text-[#0F2942]/60 mt-1">Agradecemos por nos ajudar a melhorar.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold text-[#0F2942]">Qual o problema?</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-xl border border-[#0F2942]/10 bg-white px-4 py-3 text-sm text-[#0F2942] outline-none transition focus:border-[#2E5B37] focus:ring-2 focus:ring-[#2E5B37]/20"
              >
                <option value="" disabled>Selecione um motivo</option>
                <option value="Gabarito incorreto">Gabarito incorreto</option>
                <option value="Enunciado com erro ou confuso">Enunciado com erro ou confuso</option>
                <option value="Erro de formatação/imagem">Erro de formatação/imagem</option>
                <option value="Conteúdo desatualizado">Conteúdo desatualizado</option>
                <option value="Outro">Outro</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold text-[#0F2942]">Descrição (opcional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explique o problema com mais detalhes..."
                className="w-full min-h-[100px] resize-y rounded-xl border border-[#0F2942]/10 bg-white px-4 py-3 text-sm text-[#0F2942] outline-none transition focus:border-[#2E5B37] focus:ring-2 focus:ring-[#2E5B37]/20"
              />
            </div>

            <div className="mt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-[#0F2942] hover:bg-[#0F2942]/5 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-amber-600 disabled:opacity-75 cursor-pointer shadow-sm"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Registrar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
