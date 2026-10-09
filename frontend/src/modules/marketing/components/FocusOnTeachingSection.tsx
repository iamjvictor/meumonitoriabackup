'use client';

import React from 'react';
import { Bot, GraduationCap, Cpu, CreditCard, ShieldCheck, BookOpen, Award, TrendingUp, ChevronDown } from 'lucide-react';
import { ScrollRevealSection } from './ScrollRevealSection';

interface FocusOnTeachingSectionProps {
  onStartRegistration: () => void;
}

// Símbolo de Aperto de Mão (Handshake) fornecido pelo usuário
const DualToneHandshake: React.FC<{ className?: string; strokeColor?: string }> = ({ 
  className = "w-8 h-8",
  strokeColor = "#FFFFFF" 
}) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 256 256"
    className={className}
  >
    <rect width="256" height="256" fill="none"/>
    
    {/* Lado Esquerdo */}
    <path 
      d="M34.37,60.42,8.85,111.48a8,8,0,0,0,3.57,10.73L40,136,72.68,70.63,45.11,56.85A8,8,0,0,0,34.37,60.42Z" 
      fill="none" 
      stroke={strokeColor} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />
    <polyline 
      points="72.68 70.63 128 56" 
      fill="none" 
      stroke={strokeColor} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />
    <polyline 
      points="124.06 216 82.34 205.57 56 186.75" 
      fill="none" 
      stroke={strokeColor} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />

    {/* Lado Direito */}
    <path 
      d="M216,136l27.58-13.79a8,8,0,0,0,3.57-10.73L221.63,60.42a8,8,0,0,0-10.74-3.57L183.32,70.63Z" 
      fill="none" 
      stroke={strokeColor} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />
    <polyline 
      points="128 56 183.32 70.63" 
      fill="none" 
      stroke={strokeColor} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />
    <polyline 
      points="200 152 160 192 96 176 40 136" 
      fill="none" 
      stroke={strokeColor} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />

    {/* Mão Central / Aperto */}
    <path 
      d="M184,72H144L98.34,116.29a8,8,0,0,0,1.38,12.42C117.23,139.9,141,139.13,160,120l40,32,16-16" 
      fill="none" 
      stroke={strokeColor} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />
  </svg>
);

export const FocusOnTeachingSection: React.FC<FocusOnTeachingSectionProps> = ({ onStartRegistration: _onStartRegistration }) => {
  const ourSide = [
    {
      icon: Cpu,
      title: 'Tecnologia & IA Avançada',
      description: 'Plataforma completa de estudos, IA de ponta, infraestrutura em nuvem e zero necessidade de código.',
    },
    {
      icon: ShieldCheck,
      title: 'Suporte, Manutenção & Operação',
      description: 'Cuidamos do suporte técnico aos alunos, servidores, manutenção contínua e evolução da plataforma 24/7.',
    },
    {
      icon: CreditCard,
      title: 'Gestão de Pagamentos & Repasses',
      description: 'Cobrança recorrente dos alunos, checkout seguro e divisão automática da receita 50/50 na sua conta.',
    },
  ];

  const yourSide = [
    {
      icon: BookOpen,
      title: 'Metodologia & Conteúdo',
      description: 'Seus materiais de aula, banco de questões, resumos didáticos e toda a sua assinatura pedagógica única.',
    },
    {
      icon: Award,
      title: 'Sua Marca & Autoridade',
      description: 'O seu nome como referência no mercado, com um ambiente de estudos personalizado para a sua comunidade.',
    },
    {
      icon: TrendingUp,
      title: 'Distribuição & Parceria 50/50',
      description: 'Você cuida da distribuição e divulgação para seus alunos. Parceria 50/50 de receita recorrente mensal.',
    },
  ];

  return (
    <ScrollRevealSection id="foco-ensinar" className="pt-20 pb-12 flex flex-col justify-between bg-[#EFEAE1]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 my-auto w-full">
        
        {/* Header */}
        <div className="text-center max-w-4xl mx-auto mb-12">
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#0F2942] tracking-tight mb-4">
            Parceria para <span className="text-[#2E5B37]">Educação</span>
          </h2>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto font-medium">
            Entenda como funciona o nosso modelo de parceria 50/50: nós cuidamos da tecnologia, suporte e manutenção, enquanto você lidera a distribuição e o ensino com seus alunos.
          </p>
        </div>

        {/* Split Grid com Símbolo de Handshake Centralizado no Meio dos Cards com Amplo Espaçamento */}
        <div className="relative max-w-7xl mx-auto mb-10">
          
          {/* Badge central de Handshake em Desktop (Círculo dividido 50% Azul Marinho / 50% Verde) */}
          <div className="hidden lg:flex absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 z-20 items-center justify-center">
            <div 
              className="w-20 h-20 rounded-full bg-[linear-gradient(90deg,#0F2942_0%,#0F2942_50%,#2E5B37_50%,#2E5B37_100%)] border-2 border-white shadow-2xl flex items-center justify-center hover:scale-110 transition-transform duration-300 ring-8 ring-[#EFEAE1]"
              title="Parceria 50/50: MeuMonitor & Professor"
            >
              <DualToneHandshake className="w-11 h-11" strokeColor="#FFFFFF" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-[150px]">
            
            {/* Nosso Lado - Fundo Branco */}
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center mb-2">
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-[#0F2942] shadow-xs mb-1.5">
                  <Bot className="w-6 h-6 text-[#0F2942]" />
                </div>
                <span className="text-xs font-bold text-[#0F2942] tracking-wide uppercase">
                  MeuMonitor
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {ourSide.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={idx}
                      className="p-5 rounded-2xl bg-white text-[#0F2942] shadow-md hover:border-[#2E5B37]/40 transition-all border border-slate-200 flex items-start space-x-4"
                    >
                      <div className="w-10 h-10 rounded-xl bg-[#0F2942]/5 flex items-center justify-center shrink-0 border border-[#0F2942]/10">
                        <Icon className="w-5 h-5 text-[#0F2942]" />
                      </div>
                      <div>
                        <h3 className="font-heading font-bold text-[#0F2942] text-sm sm:text-base mb-1">
                          {item.title}
                        </h3>
                        <p className="text-slate-600 text-xs leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile Handshake Divider */}
            <div className="flex lg:hidden items-center justify-center my-4">
              <div className="bg-[linear-gradient(90deg,#0F2942_0%,#0F2942_50%,#2E5B37_50%,#2E5B37_100%)] border-2 border-white shadow-md rounded-full px-5 py-2.5 flex items-center gap-3 ring-4 ring-[#EFEAE1]">
                <DualToneHandshake className="w-6 h-6" strokeColor="#FFFFFF" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Parceria 50/50
                </span>
              </div>
            </div>

            {/* Seu Lado / Do Outro Lado - Fundo Verde */}
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center mb-2">
                <div className="w-12 h-12 rounded-2xl bg-[#2E5B37]/15 border border-[#2E5B37]/30 flex items-center justify-center text-[#2E5B37] shadow-xs mb-1.5">
                  <GraduationCap className="w-6 h-6 text-[#2E5B37]" />
                </div>
                <span className="text-xs font-bold text-[#2E5B37] tracking-wide uppercase">
                  Professor
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {yourSide.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={idx}
                      className="p-5 rounded-2xl bg-[#2E5B37] text-white shadow-md hover:bg-[#254A2D] transition-all border border-[#2E5B37] flex items-start space-x-4"
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0 border border-white/20">
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-heading font-bold text-white text-sm sm:text-base mb-1">
                          {item.title}
                        </h3>
                        <p className="text-white/80 text-xs leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* Scroll Down Hint */}
      <div className="flex justify-center pt-8 pb-2 text-[#0F2942]/60 z-10 animate-bounce">
        <a href="#como-funciona" className="flex flex-col items-center text-xs hover:text-[#2E5B37] transition-colors font-semibold">
          <span>Como funciona</span>
          <ChevronDown className="w-4 h-4 mt-1" />
        </a>
      </div>
    </ScrollRevealSection>
  );
};
