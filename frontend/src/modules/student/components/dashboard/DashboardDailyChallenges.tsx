'use client';
import { Target } from 'lucide-react';
import { useDailyChallenges } from '@/modules/student/hooks/useDailyChallenges';

export function DashboardDailyChallenges() {
  const { dailyChallenges, loading } = useDailyChallenges();
  if (loading) return <section className="@container mt-6"><div className="rounded-2xl bg-[#0F2942] p-8 text-white">Carregando desafio diário...</div></section>;
  if (!dailyChallenges || dailyChallenges.length === 0) return null;

  const totalQuestions = dailyChallenges.length;
  const isMultiple = totalQuestions > 1;

  return (
    <section className="@container mt-6">
      <div className="mb-5 min-w-0 rounded-2xl bg-[#0F2942] p-5 text-white @sm:p-7">
        <div className="flex items-center gap-2 text-xs font-bold uppercase text-[#76D69B]">
          <Target className="h-4 w-4" /> Desafio Diário {isMultiple && `• ${totalQuestions} perguntas`}
        </div>
        <h1 className="mt-4 text-2xl font-bold @sm:text-3xl">
          {isMultiple ? 'Responda aos seus desafios diários' : 'Responda ao seu desafio diário'}
        </h1>
        <p className="mt-2 text-sm">
          {isMultiple ? `Você tem ${totalQuestions} perguntas disponíveis. Mantenha seu ritmo de estudo.` : 'Mantenha seu ritmo de estudo.'}
        </p>
      </div>
    </section>
  );
}

