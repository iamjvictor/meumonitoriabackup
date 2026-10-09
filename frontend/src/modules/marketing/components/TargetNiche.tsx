'use client';

import React from 'react';
import { Award, GraduationCap, Languages, Users, ChevronDown } from 'lucide-react';
import { ScrollRevealSection } from './ScrollRevealSection';

export const TargetNiche: React.FC = () => {
  const niches = [
    {
      icon: Award,
      title: 'Professores de concursos públicos',
      description: 'Que têm apostilas, cadernos de questões e provas comentadas (FGV, Cebraspe, FCC, etc.) e querem oferecer um treino inteligente e contínuo.',
      badge: 'Concursos Federais & Estaduais',
      color: 'bg-[#0F2942]/10 text-[#0F2942] border-[#0F2942]/20',
    },
    {
      icon: GraduationCap,
      title: 'Professores de ENEM e vestibulares',
      description: 'Que já produzem listas, simulados e redações comentadas e gostariam de acompanhar a evolução dos alunos ao longo do ano.',
      badge: 'ENEM & Vestibulares Medicina',
      color: 'bg-[#2E5B37]/10 text-[#2E5B37] border-[#2E5B37]/20',
    },
    {
      icon: Languages,
      title: 'Professores de idiomas',
      description: 'Que querem um assistente capaz de trabalhar com provas específicas (TOEFL, IELTS, Cambridge), estilos de questões e perfis de exame diferentes.',
      badge: 'TOEFL / IELTS / Cambridge',
      color: 'bg-[#2E5B37]/10 text-[#2E5B37] border-[#2E5B37]/20',
    },
    {
      icon: Users,
      title: 'Mentores, cursinhos e criadores',
      description: 'Que possuem material autoral e uma base de alunos, mas ainda não têm uma solução de IA personalizada com a própria marca.',
      badge: 'Mentorias & Cursinhos',
      color: 'bg-[#0F2942]/10 text-[#0F2942] border-[#0F2942]/20',
    },
  ];

  return (
    <ScrollRevealSection id="para-quem-e" className="pt-20 pb-10 flex flex-col justify-between bg-[#F5F1E8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 my-auto w-full">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#0F2942] tracking-tight mb-3">
            Para quem é essa plataforma?
          </h2>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed font-medium">
            Ideal para professores e criadores de conteúdo educacional que já têm materiais prontos e querem transformar isso em um produto recorrente, sem virar “técnico de TI”.
          </p>
        </div>

        {/* 4 Niche Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {niches.map((niche, index) => {
            const Icon = niche.icon;
            return (
              <div
                key={index}
                className="glass-card p-6 rounded-2xl border border-slate-200 bg-white hover:border-[#2E5B37]/40 transition-all duration-300 flex flex-col justify-between group shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${niche.color}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-[#0F2942]">
                      {niche.badge}
                    </span>
                  </div>

                  <h3 className="font-heading text-lg font-bold text-[#0F2942] mb-2 group-hover:text-[#2E5B37] transition-colors">
                    {niche.title}
                  </h3>

                  <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                    {niche.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Pronto para monetizar materiais</span>
                  <span className="text-[#2E5B37] font-bold">100% Personalizável</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Scroll Down Hint */}
      <div className="flex justify-center pb-2 text-[#0F2942]/60 z-10 animate-bounce">
        <a href="#como-funciona" className="flex flex-col items-center text-xs hover:text-[#2E5B37] transition-colors font-semibold">
          <span>Como funciona</span>
          <ChevronDown className="w-4 h-4 mt-1" />
        </a>
      </div>
    </ScrollRevealSection>
  );
};
