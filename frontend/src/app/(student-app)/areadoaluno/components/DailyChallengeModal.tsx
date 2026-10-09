import { ArrowRight, X } from 'lucide-react';

interface DailyChallenge {
  id: string;
  question: { text: string; alternatives: unknown; subject?: { name: string } | null; topic?: { name: string } | null };
}
interface ChallengeAlternative { label: string; text: string }
interface ChallengeResult { isCorrect: boolean; correctAnswer?: string | null; explanation?: string | null }
interface DailyChallengeModalProps {
  isChallengeModalOpen: boolean;
  dailyChallenge: DailyChallenge | null;
  challengeResult: ChallengeResult | null;
  challengeAlternatives: ChallengeAlternative[];
  selectedChallengeAnswer: string | null;
  isSubmittingChallenge: boolean;
  setSelectedChallengeAnswer: (answer: string) => void;
  submitChallengeAnswer: () => void;
  onClose: () => void;
  onNextChallenge?: () => void;
  hasNextChallenge?: boolean;
}

export function DailyChallengeModal({ isChallengeModalOpen, dailyChallenge, challengeResult, challengeAlternatives, selectedChallengeAnswer, isSubmittingChallenge, setSelectedChallengeAnswer, submitChallengeAnswer, onClose, onNextChallenge, hasNextChallenge }: DailyChallengeModalProps) {
  return (
    isChallengeModalOpen && dailyChallenge && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/75 p-2 backdrop-blur-md sm:p-4" onClick={onClose}>
        <div className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[#F8F5EE] p-4 shadow-[0_25px_60px_rgba(0,0,0,0.35)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[28px] sm:p-8" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2E5B37]">Desafio diário</p>
                <span className="rounded-full bg-[#E8F0FA] px-2.5 py-1 text-[10px] font-bold text-[#24527A]">{dailyChallenge.question.subject?.name ?? 'Matéria geral'}</span>
                {dailyChallenge.question.topic?.name && <span className="rounded-full bg-[#F0F4F8] px-2.5 py-1 text-[10px] font-bold text-[#526579]">{dailyChallenge.question.topic.name}</span>}
              </div>
              <h2 className="mt-2 font-heading text-xl font-bold text-[#0F2942] sm:text-2xl">Responda à questão de hoje</h2>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-[#0F2942]/50 hover:bg-black/5 hover:text-[#0F2942]" aria-label="Fechar desafio"><X className="h-5 w-5" /></button>
          </div>
          {challengeResult ? (
            <div className="mt-6 animate-fade-in-up rounded-2xl border border-[#2E5B37]/20 bg-white p-5 shadow-sm">
              <p className={`text-lg font-bold ${challengeResult.isCorrect ? 'text-[#2E5B37]' : 'text-red-700'}`}>{challengeResult.isCorrect ? 'Resposta correta!' : 'Resposta incorreta.'}</p>
              <div className="mt-5 space-y-2.5">
                {challengeAlternatives.map((alternative) => {
                  const isCorrectAnswer = alternative.label.toUpperCase() === challengeResult.correctAnswer?.toUpperCase();
                  const isWrongSelection = alternative.label === selectedChallengeAnswer && !isCorrectAnswer;
                  return <div key={alternative.label} className={`flex items-start gap-3 rounded-xl border p-4 text-left text-sm ${isCorrectAnswer ? 'border-[#2E5B37] bg-[#E3F1E4] text-[#1B4332]' : isWrongSelection ? 'border-red-300 bg-red-50 text-red-800' : 'border-[#0F2942]/10 bg-white text-[#0F2942]/65'}`}><span className={`font-bold ${isCorrectAnswer ? 'text-[#2E5B37]' : isWrongSelection ? 'text-red-700' : 'text-[#0F2942]/45'}`}>{alternative.label}.</span><span className="flex-1">{alternative.text}</span>{isCorrectAnswer && <span className="text-xs font-bold text-[#2E5B37]">Correta</span>}{isWrongSelection && <span className="text-xs font-bold text-red-700">Sua resposta</span>}</div>;
                })}
              </div>
              {challengeResult.explanation && <div className="mt-4 border-t border-[#0F2942]/10 pt-4"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#2E5B37]">Explicação</p><p className="mt-2 text-sm leading-relaxed text-[#0F2942]/75">{challengeResult.explanation}</p></div>}
              {hasNextChallenge && onNextChallenge ? (
                <button
                  type="button"
                  onClick={onNextChallenge}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2E5B37] py-4 text-sm font-bold text-white transition hover:bg-[#1B4332]"
                >
                  Responder próxima pergunta <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F2942] py-4 text-sm font-bold text-white transition hover:bg-[#1A365D]"
                >
                  Concluir desafio
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="mt-5 text-sm font-semibold leading-relaxed text-[#0F2942] sm:mt-6 sm:text-base">{dailyChallenge.question.text}</p>
              <div className="mt-6 space-y-2.5">
                {challengeAlternatives.map((alternative) => <button key={alternative.label} type="button" onClick={() => setSelectedChallengeAnswer(alternative.label)} className={`flex w-full items-start gap-2.5 rounded-xl border p-3 text-left text-xs leading-relaxed transition sm:gap-3 sm:p-4 sm:text-sm ${selectedChallengeAnswer === alternative.label ? 'border-[#3B82F6] bg-[#EFF6FF] text-[#0F2942] ring-2 ring-[#93C5FD]/60' : 'border-[#0F2942]/10 bg-white hover:border-[#60A5FA] hover:bg-[#F8FBFF]'}`}><span className={`shrink-0 font-bold ${selectedChallengeAnswer === alternative.label ? 'text-[#2563EB]' : 'text-[#2E5B37]'}`}>{alternative.label}.</span><span className="min-w-0">{alternative.text}</span></button>)}
              </div>
              <button type="button" disabled={!selectedChallengeAnswer || isSubmittingChallenge} onClick={() => void submitChallengeAnswer()} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2E5B37] py-4 text-sm font-bold text-white transition hover:bg-[#1B4332] disabled:cursor-not-allowed disabled:opacity-50">{isSubmittingChallenge ? 'Registrando resposta...' : 'Confirmar resposta'} <ArrowRight className="h-4 w-4" /></button>
            </>
          )}
        </div>
      </div>
    )
  );
}
