'use client';

import React from 'react';
import { XCircle, CheckCircle2, ChevronDown } from 'lucide-react';
import { ScrollRevealSection } from './ScrollRevealSection';

export const CourseVsAssistantSection: React.FC = () => {
  const traditionalIssues = [
    'O aluno compra o curso em PDF/vídeo e fica estudando sozinho, sem acompanhamento diário.',
    'Dúvidas simples exigem mandar e-mail ou fórum e esperar respostas por dias.',
    'Você precisa gravar dezenas de horas de aula, editar e regravar quando o edital muda.',
    'O aluno precisa procurar bancas de questões e simulados em outros sites genéricos.',
    'Monetização em venda única (one-shot): vendeu uma vez, não ganha mais nada no mês seguinte.',
  ];

  const assistantBenefits = [
    'Assistente ativo 24 horas por dia, tirando dúvidas com base exatamente no seu material.',
    'Questões ilimitadas, flashcards e simulados integrados na mesma interface com a sua marca.',
    'Zero necessidade de gravar vídeos novos: você usa os arquivos que já tem (PDFs, provas, gabaritos).',
    'Relatório de evolução em tempo real mostrando onde o aluno tem mais dificuldade.',
    'Receita recorrente previsível todo mês, impulsionando um negócio sustentável.',
  ];

  return (
    <ScrollRevealSection id="diferenciais" className="pt-20 pb-10 flex flex-col justify-between bg-[#F5F1E8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 my-auto w-full">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#0F2942] tracking-tight mb-3">
            Por que um assistente com IA é melhor que um curso tradicional?
          </h2>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed font-medium">
            Entenda como a inteligência artificial revoluciona a retenção dos alunos e o modelo de negócios do professor.
          </p>
        </div>

        {/* Comparison Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          
          {/* Traditional Way */}
          <div className="glass-card p-6 rounded-2xl border border-rose-200 bg-rose-50/70 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center space-x-2 mb-4 pb-3 border-b border-rose-200">
                <XCircle className="w-6 h-6 text-rose-600" />
                <h3 className="font-heading text-lg font-bold text-rose-950">Modelo Tradicional (PDF / Vídeo)</h3>
              </div>
              <ul className="space-y-3">
                {traditionalIssues.map((issue, index) => (
                  <li key={index} className="flex items-start text-xs sm:text-sm text-slate-700">
                    <span className="text-rose-600 mr-2 shrink-0 font-bold">✕</span>
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 pt-3 border-t border-rose-200 text-xs text-rose-800 font-semibold">
              Desgaste constante para atualizar e dependência de novas vendas diárias.
            </div>
          </div>

          {/* MeuMonitor AI Way */}
          <div className="glass-panel p-6 rounded-2xl border border-[#2E5B37]/40 bg-white flex flex-col justify-between shadow-md">
            <div>
              <div className="flex items-center space-x-2 mb-4 pb-3 border-b border-slate-200">
                <CheckCircle2 className="w-6 h-6 text-[#2E5B37]" />
                <h3 className="font-heading text-lg font-bold text-[#0F2942]">Com o seu Assistente de IA</h3>
              </div>
              <ul className="space-y-3">
                {assistantBenefits.map((benefit, index) => (
                  <li key={index} className="flex items-start text-xs sm:text-sm text-slate-700">
                    <span className="text-[#2E5B37] mr-2 shrink-0 font-bold">✓</span>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 pt-3 border-t border-slate-100 text-xs text-[#2E5B37] font-bold">
              Escala sem limite de alunos, trabalho passivo pós-configuração e retenção altíssima.
            </div>
          </div>

        </div>

      </div>

      {/* Scroll Down Hint */}
      <div className="flex justify-center pb-2 text-[#0F2942]/60 z-10 animate-bounce">
        <a href="#seguranca" className="flex flex-col items-center text-xs hover:text-[#2E5B37] transition-colors font-semibold">
          <span>Segurança e controle</span>
          <ChevronDown className="w-4 h-4 mt-1" />
        </a>
      </div>
    </ScrollRevealSection>
  );
};
