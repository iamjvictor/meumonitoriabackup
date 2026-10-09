'use client';

import React, { useState } from 'react';
import {
  UserPlus,
  Bot,
  UploadCloud,
  Share2,
  BookOpen,
  Brain,
  Zap,
  BarChart3,
  ChevronDown,
} from 'lucide-react';
import { ScrollRevealSection } from './ScrollRevealSection';

export const HowItWorks: React.FC = () => {
  const [activeTeacherStep, setActiveTeacherStep] = useState<number>(1);
  const [activeStudentStep, setActiveStudentStep] = useState<number>(1);

  const teacherSteps = [
    {
      num: 1,
      icon: UserPlus,
      title: 'Cadastre-se',
      description: 'Crie sua conta de professor na plataforma.',
    },
    {
      num: 2,
      icon: Bot,
      title: 'Monte seu monitor',
      description: 'Personalize seu assistente com as matérias e a sua metodologia.',
    },
    {
      num: 3,
      icon: UploadCloud,
      title: 'Envie seu material',
      description: 'Adicione apostilas, PDFs e questões para preparar o monitor.',
    },
    {
      num: 4,
      icon: Share2,
      title: 'Divulgue sua página de vendas',
      description: 'Compartilhe seu link e ofereça seu monitor diretamente aos alunos.',
    },
  ];

  const studentSteps = [
    {
      num: 1,
      icon: BookOpen,
      title: 'Escolha sua monitoria',
      description: 'Encontre a monitoria do seu professor favorito.',
    },
    {
      num: 2,
      icon: Brain,
      title: 'Pratique com questões e flashcards',
      description: 'Reforce o conteúdo com exercícios e cartões de memorização.',
    },
    {
      num: 3,
      icon: Zap,
      title: 'Responda ao desafio diário',
      description: 'Pratique todos os dias e avance no ranking.',
    },
    {
      num: 4,
      icon: BarChart3,
      title: 'Receba um simulado toda semana',
      description: 'Treine com questões selecionadas com base no seu desempenho.',
    },
  ];

  return (
    <ScrollRevealSection id="como-funciona" className="pt-16 pb-10 flex flex-col justify-between bg-[#EFEAE1]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 my-auto w-full space-y-10">
        
        {/* Main Title */}
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#0F2942] tracking-tight">
            Como funciona na prática
          </h2>
        </div>

        {/* --- PROFESSOR SECTION (ABOVE) --- */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-[#0F2942] text-white text-xs font-bold uppercase tracking-wider rounded-full shadow-sm">
              Para o Professor
            </span>
            <div className="h-px bg-slate-300 flex-1" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {teacherSteps.map((step) => {
              const Icon = step.icon;
              const isActive = activeTeacherStep === step.num;

              return (
                <div
                  key={step.num}
                  onClick={() => setActiveTeacherStep(step.num)}
                  className={`glass-card p-4 rounded-2xl border cursor-pointer transition-all duration-300 flex flex-col justify-between ${
                    isActive
                      ? 'border-[#2E5B37] bg-white shadow-xl shadow-[#2E5B37]/10 scale-[1.02]'
                      : 'border-slate-200 hover:border-slate-300 bg-white/80'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="w-7 h-7 rounded-lg bg-[#0F2942] text-white font-bold text-xs flex items-center justify-center shadow-md">
                        0{step.num}
                      </span>
                      <Icon className={`w-4 h-4 ${isActive ? 'text-[#2E5B37]' : 'text-slate-400'}`} />
                    </div>

                    <h3 className="font-heading text-xs sm:text-sm font-bold text-[#0F2942] mb-1 leading-snug">
                      {step.title}
                    </h3>

                    <p className="text-slate-600 text-[11px] leading-relaxed font-medium">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* --- ALUNO SECTION (BELOW - GREEN THEME) --- */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-[#2E5B37] text-white text-xs font-bold uppercase tracking-wider rounded-full shadow-sm">
              Para o Aluno
            </span>
            <div className="h-px bg-[#2E5B37]/30 flex-1" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {studentSteps.map((step) => {
              const Icon = step.icon;
              const isActive = activeStudentStep === step.num;

              return (
                <div
                  key={step.num}
                  onClick={() => setActiveStudentStep(step.num)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all duration-300 flex flex-col justify-between bg-[#2E5B37] ${
                    isActive
                      ? 'border-emerald-300 shadow-xl shadow-[#2E5B37]/30 scale-[1.02] ring-2 ring-emerald-400/40'
                      : 'border-[#2E5B37]/60 hover:border-emerald-400/60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="w-7 h-7 rounded-lg bg-white text-[#2E5B37] font-extrabold text-xs flex items-center justify-center shadow-md">
                        0{step.num}
                      </span>
                      <Icon className="w-4 h-4 text-emerald-200" />
                    </div>

                    <h3 className="font-heading text-xs sm:text-sm font-bold text-white mb-1 leading-snug">
                      {step.title}
                    </h3>

                    <p className="text-emerald-100/90 text-[11px] leading-relaxed font-medium">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Scroll Down Hint */}
      <div className="flex justify-center pt-8 pb-2 text-[#0F2942]/60 z-10 animate-bounce">
        <a href="#faq" className="flex flex-col items-center text-xs hover:text-[#2E5B37] transition-colors font-semibold">
          <span>Cadastre seu assistente</span>
          <ChevronDown className="w-4 h-4 mt-1" />
        </a>
      </div>
    </ScrollRevealSection>
  );
};
