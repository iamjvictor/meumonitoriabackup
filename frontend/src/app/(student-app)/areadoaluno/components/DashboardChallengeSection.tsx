import { ArrowRight, Target } from 'lucide-react';
import type { DailyChallengeSummary } from '../hooks/useStudentDashboard';

interface DashboardChallengeSectionProps {
  dailyChallenges: DailyChallengeSummary[];
  onOpenChallenge: (challenge: DailyChallengeSummary) => void;
}

export function DashboardChallengeSection({ dailyChallenges, onOpenChallenge }: DashboardChallengeSectionProps) {
  if (!dailyChallenges || dailyChallenges.length === 0) return null;

  const challenge = dailyChallenges[0];
  const totalQuestions = dailyChallenges.length;
  const isMultiple = totalQuestions > 1;

  return (
    <div key={challenge.id} className="mb-5 animate-fade-in-up relative overflow-hidden rounded-[28px] bg-[#0F2942] px-6 py-7 text-white shadow-[0_22px_42px_rgba(15,41,66,0.15)] sm:px-8">
      <div className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-[#76D69B]/10 blur-2xl" />
      
      <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div className="max-w-[580px] space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#76D69B]/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#76D69B]">
              <Target className="h-3.5 w-3.5" /> Desafio Diário
            </div>
            {isMultiple && (
              <span className="inline-flex items-center rounded-full border border-[#76D69B]/30 bg-[#76D69B]/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#9AE6B2]">
                {totalQuestions} perguntas disponíveis
              </span>
            )}
          </div>

          <div>
            <h1 className="font-heading text-3xl font-bold leading-[1.08] tracking-[-0.04em] text-white sm:text-[38px]">
              {isMultiple ? 'Responda aos seus desafios diários' : 'Responda ao seu desafio diário'}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              {isMultiple
                ? `Você tem ${totalQuestions} perguntas disponíveis hoje. Responda agora para manter seu ritmo de estudo e subir no ranking!`
                : 'Seu desafio diário está disponível. Responda agora para manter seu ritmo de estudo e subir no ranking!'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenChallenge(challenge)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#76D69B] to-[#9AE6B2] px-8 py-5 text-sm font-extrabold text-[#0F2942] shadow-[0_12px_28px_rgba(118,214,155,0.32)] ring-2 ring-[#76D69B]/30 ring-offset-2 ring-offset-[#0F2942] transition duration-300 hover:-translate-y-1 hover:scale-[1.03] hover:from-[#9AE6B2] hover:to-[#B8EAC5] hover:shadow-[0_16px_34px_rgba(118,214,155,0.42)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#B8EAC5]/70"
        >
          {isMultiple ? `Responder agora (${totalQuestions} perguntas)` : 'Responder agora'} <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
