'use client';

import React from 'react';
import { Lock, FileText, UserCheck, ShieldCheck, ChevronDown } from 'lucide-react';
import { ScrollRevealSection } from './ScrollRevealSection';

export const ControlAndSecuritySection: React.FC = () => {
  const securityFeatures = [
    {
      icon: Lock,
      title: 'Espaço 100% Isolado',
      description: 'Seus PDFs, materiais e dados de alunos ficam em um banco de dados privado. Nenhum outro professor ou assistente da plataforma tem acesso ao seu conteúdo.',
      color: 'border-[#0F2942]/30 text-[#0F2942] bg-[#0F2942]/10',
    },
    {
      icon: FileText,
      title: 'Proteção de Direitos Autorais',
      description: 'Os arquivos que você envia servem exclusivamente para alimentar a IA e gerar questões para os seus alunos. O PDF bruto não fica disponível para download público.',
      color: 'border-[#2E5B37]/30 text-[#2E5B37] bg-[#2E5B37]/10',
    },
    {
      icon: UserCheck,
      title: 'Controle Total de Acesso',
      description: 'Você escolhe quem entra. Apenas alunos com assinatura ativa no seu link conseguem interagir com o assistente e utilizar os recursos de treino.',
      color: 'border-[#0F2942]/30 text-[#0F2942] bg-[#0F2942]/10',
    },
    {
      icon: ShieldCheck,
      title: 'Respostas Sem Alucinação',
      description: 'A IA responde estritamente com base nos materiais aprovados por você. Se o aluno perguntar sobre um tema fora do escopo, ela orienta a focar no conteúdo programático.',
      color: 'border-[#2E5B37]/30 text-[#2E5B37] bg-[#2E5B37]/10',
    },
  ];

  return (
    <ScrollRevealSection id="seguranca" className="pt-20 pb-10 flex flex-col justify-between bg-[#EFEAE1]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 my-auto w-full">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#0F2942] tracking-tight mb-3">
            Segurança, Controle e Proteção do seu Conteúdo
          </h2>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed font-medium">
            Seu conhecimento autoral é o seu maior patrimônio. Projetamos a plataforma para garantir que ele permaneça seguro e exclusivo dos seus alunos.
          </p>
        </div>

        {/* 4 Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {securityFeatures.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={index}
                className="glass-card p-6 rounded-2xl border border-slate-200 bg-white hover:border-[#2E5B37]/30 transition-all duration-300 flex items-start space-x-4 shadow-sm"
              >
                <div className={`p-3 rounded-xl border shrink-0 ${item.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-heading text-base font-bold text-[#0F2942] mb-1.5">
                    {item.title}
                  </h3>
                  <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Scroll Down Hint */}
      <div className="flex justify-center pb-2 text-[#0F2942]/60 z-10 animate-bounce">
        <a href="#como-comecar" className="flex flex-col items-center text-xs hover:text-[#2E5B37] transition-colors font-semibold">
          <span>Checklist para começar</span>
          <ChevronDown className="w-4 h-4 mt-1" />
        </a>
      </div>
    </ScrollRevealSection>
  );
};
