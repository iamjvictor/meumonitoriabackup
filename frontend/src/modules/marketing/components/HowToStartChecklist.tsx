'use client';

import React from 'react';
import { CheckSquare, ArrowRight, ChevronDown } from 'lucide-react';
import { ScrollRevealSection } from './ScrollRevealSection';

interface HowToStartChecklistProps {
  onStartRegistration: () => void;
}

export const HowToStartChecklist: React.FC<HowToStartChecklistProps> = ({ onStartRegistration }) => {
  const steps = [
    {
      step: '01',
      title: 'Tenha seus materiais em mãos',
      description: 'Separe suas apostilas em PDF, provas anteriores comentadas e listas de exercícios que você já usa nas suas aulas.',
    },
    {
      step: '02',
      title: 'Cadastre sua conta de professor',
      description: 'Preencha seu cadastro simples em menos de 2 minutos para acessar seu painel de criação.',
    },
    {
      step: '03',
      title: 'Suba o conteúdo e configure a banca',
      description: 'Organize suas matérias, envie os arquivos e selecione para qual prova/concurso seu assistente será especialista.',
    },
    {
      step: '04',
      title: 'Publique sua página e divulgue seu link',
      description: 'Compartilhe seu link exclusivo com seus alunos nas suas redes e comece a receber suas comissões recorrentes.',
    },
  ];

  return (
    <ScrollRevealSection id="como-comecar" className="pt-20 pb-10 flex flex-col justify-between bg-[#F5F1E8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 my-auto w-full">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#0F2942] tracking-tight mb-3">
            O que você precisa para começar hoje mesmo?
          </h2>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed font-medium">
            Sem burocracia. Sem necessidade de conhecimentos de programação. Apenas o seu conhecimento pedagógico.
          </p>
        </div>

        {/* 4 Steps Checklist Horizontal Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto mb-10">
          {steps.map((item, idx) => (
            <div
              key={idx}
              className="glass-card p-5 rounded-2xl border border-slate-200 bg-white flex flex-col justify-between relative overflow-hidden shadow-sm hover:border-[#2E5B37]/30 transition-all"
            >
              <div className="absolute top-2 right-3 text-3xl font-black text-slate-200 select-none font-mono">
                {item.step}
              </div>

              <div>
                <div className="w-8 h-8 rounded-lg bg-[#0F2942]/10 border border-[#0F2942]/20 text-[#0F2942] font-bold text-xs flex items-center justify-center mb-3">
                  <CheckSquare className="w-4 h-4" />
                </div>

                <h3 className="font-heading text-sm font-bold text-[#0F2942] mb-2 leading-snug">
                  {item.title}
                </h3>

                <p className="text-slate-600 text-xs leading-relaxed">
                  {item.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-[#2E5B37] font-semibold">
                Passo {item.step} concluído em minutos
              </div>
            </div>
          ))}
        </div>

        {/* Action Call */}
        <div className="text-center">
          <button
            onClick={onStartRegistration}
            className="px-8 py-4 rounded-xl font-bold text-sm sm:text-base text-white bg-gradient-to-r from-[#0F2942] via-[#1E3A8A] to-[#2E5B37] hover:from-[#172554] hover:to-[#1E4620] shadow-xl shadow-[#0F2942]/20 transition-all inline-flex items-center justify-center space-x-2 group"
          >
            <span>Iniciar meu cadastro de professor</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

      </div>

      {/* Scroll Down Hint */}
      <div className="flex justify-center pb-2 text-[#0F2942]/60 z-10 animate-bounce">
        <a href="#faq" className="flex flex-col items-center text-xs hover:text-[#2E5B37] transition-colors font-semibold">
          <span>Perguntas Frequentes</span>
          <ChevronDown className="w-4 h-4 mt-1" />
        </a>
      </div>
    </ScrollRevealSection>
  );
};
