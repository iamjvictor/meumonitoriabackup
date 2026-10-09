'use client';

import React from 'react';
import { MessageSquare, BookOpen, Brain, Zap, BarChart3, ChevronDown, CheckCircle2 } from 'lucide-react';
import { ScrollRevealSection } from './ScrollRevealSection';

export const StudentValueSection: React.FC = () => {
  const deliverables = [
    {
      num: '01',
      icon: MessageSquare,
      title: '1. Tira-dúvidas com seus materiais',
      description:
        'O aluno faz perguntas por texto ou envia uma foto de uma questão. O assistente responde usando as suas apostilas, provas e explicações, sempre dentro do escopo da matéria e da banca que você escolheu.',
      badge: 'Zero Alucinações',
      color: 'border-[#2E5B37]/30 text-[#2E5B37] bg-[#2E5B37]/10',
    },
    {
      num: '02',
      icon: BookOpen,
      title: '2. Banco de questões ilimitadas',
      description:
        'As questões que você já tem viram um banco organizado por tema, subtema, dificuldade e prova. O aluno pode praticar quantas questões quiser, e cada tentativa alimenta o diagnóstico de pontos fortes e fracos.',
      badge: 'Gabarito Comentado',
      color: 'border-[#0F2942]/30 text-[#0F2942] bg-[#0F2942]/10',
    },
    {
      num: '03',
      icon: Brain,
      title: '3. Flashcards para memorização',
      description:
        'A plataforma gera flashcards com base nos seus conteúdos e você aprova. Os alunos revisam em sessões rápidas, com repetição espaçada, para fixar regras, fórmulas e conceitos importantes.',
      badge: 'Repetição Espaçada',
      color: 'border-[#0F2942]/30 text-[#0F2942] bg-[#0F2942]/10',
    },
    {
      num: '04',
      icon: Zap,
      title: '4. Desafio diário',
      description:
        'Uma questão por dia, para todos os alunos daquele assistente. Isso ajuda a manter o hábito, medir evolução e criar uma sensação de "treino constante".',
      badge: 'Engajamento Diário',
      color: 'border-[#2E5B37]/30 text-[#2E5B37] bg-[#2E5B37]/10',
    },
    {
      num: '05',
      icon: BarChart3,
      title: '5. Simulados semanais e mensais',
      description:
        'Semanal: mini simulado de cerca de 10 questões. Mensal: simulado personalizado de 20–30 questões, focado nas maiores deficiências do aluno. No fim, ele recebe um relatório das áreas que precisa revisar.',
      badge: 'Diagnóstico de Erros',
      color: 'border-[#2E5B37]/30 text-[#2E5B37] bg-[#2E5B37]/10',
    },
  ];

  return (
    <ScrollRevealSection id="o-que-o-assistente-faz" className="pt-20 pb-10 flex flex-col justify-between bg-[#F5F1E8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 my-auto w-full">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#0F2942] tracking-tight mb-3">
            O que o seu assistente entrega para os seus alunos
          </h2>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed font-medium">
            Ele não é só um “chat com IA”. É um ambiente completo de estudo, alimentado pelos seus conteúdos e pela sua experiência.
          </p>
        </div>

        {/* 5 Blocks Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
          {deliverables.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={index}
                className={`glass-card p-6 rounded-2xl border border-slate-200 bg-white hover:border-[#2E5B37]/40 transition-all duration-300 flex flex-col justify-between shadow-sm ${
                  index === 4 ? 'md:col-span-2 lg:col-span-1' : ''
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${item.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-[#0F2942]">
                      {item.badge}
                    </span>
                  </div>

                  <h3 className="font-heading text-base font-bold text-[#0F2942] mb-2">
                    {item.title}
                  </h3>

                  <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center space-x-1.5 text-[11px] text-[#2E5B37] font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Configuração 100% Automática</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Scroll Down Hint */}
      <div className="flex justify-center pb-2 text-[#0F2942]/60 z-10 animate-bounce">
        <a href="#diferenciais" className="flex flex-col items-center text-xs hover:text-[#2E5B37] transition-colors font-semibold">
          <span>Comparativo</span>
          <ChevronDown className="w-4 h-4 mt-1" />
        </a>
      </div>
    </ScrollRevealSection>
  );
};
