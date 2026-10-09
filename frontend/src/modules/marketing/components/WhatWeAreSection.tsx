'use client';

import React from 'react';
import { 
  GraduationCap, 
  Sparkles, 
  CheckCircle2, 
  Coins, 
  ShieldCheck, 
  LineChart, 
  Bot, 
  BookOpen, 
  BrainCircuit, 
  Smartphone,
  Layers,
  ArrowRight,
  Handshake
} from 'lucide-react';
import { ScrollRevealSection } from './ScrollRevealSection';

interface WhatWeAreSectionProps {
  onStartRegistration?: () => void;
}

export const WhatWeAreSection: React.FC<WhatWeAreSectionProps> = ({ onStartRegistration }) => {
  return (
    <ScrollRevealSection id="o-que-somos" className="h-auto min-h-0 lg:h-screen lg:min-h-screen w-full relative overflow-visible lg:overflow-hidden bg-[#F5F1E8] p-0 flex flex-col justify-stretch">
      
      {/* Título Principal no Mobile (Centralizado no Fundo Bege) */}
      <div className="lg:hidden relative z-10 px-6 pt-24 pb-2">
        <h2 className="font-heading text-2xl sm:text-3xl font-black tracking-tight uppercase" style={{ color: '#2E5B37' }}>
          O que somos?
        </h2>
      </div>

      {/* Título Principal no Desktop (Matematicamente dividido 50/50 exatamente na linha de transição de cor) */}
      <div className="hidden lg:flex absolute top-16 left-0 right-0 z-30 pointer-events-none w-full">
        {/* Metade Esquerda: "O que" em verde alinhado à direita da metade bege */}
        <div className="w-1/2 flex justify-end pr-2.5">
          <h2 className="font-heading text-4xl lg:text-5xl font-black tracking-tight" style={{ color: '#2E5B37' }}>
            O que
          </h2>
        </div>
        {/* Metade Direita: "somos?" em off-white alinhado à esquerda da metade verde */}
        <div className="w-1/2 flex justify-start pl-2.5">
          <h2 className="font-heading text-4xl lg:text-5xl font-black tracking-tight" style={{ color: '#F5F1E8' }}>
            somos?
          </h2>
        </div>
      </div>

      {/* Grid Dividida 50/50 de Ponta a Ponta na Tela (Edge-to-Edge 100vh) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 w-full h-auto min-h-0 lg:h-full lg:min-h-screen flex-1">
        
        {/* Metade Esquerda: Para o Professor (Fundo Bege #F5F1E8, Letras Verdes #2E5B37) */}
        <div className="bg-[#F5F1E8] w-full h-auto lg:h-full flex flex-col justify-between p-6 sm:p-10 lg:p-12 xl:p-14 lg:pt-32 relative overflow-hidden">
          <div className="max-w-xl ml-auto w-full flex flex-col justify-center lg:h-full">
            
            {/* Header Coluna Professor */}
            <div className="flex items-center space-x-3 mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-[#2E5B37]/15 border border-[#2E5B37]/30 flex items-center justify-center shrink-0" style={{ color: '#2E5B37' }}>
                <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <span className="text-[11px] sm:text-xs font-extrabold uppercase tracking-widest block" style={{ color: 'rgba(46, 91, 55, 0.85)' }}>
                  Para o Professor & Criador
                </span>
                <h3 className="font-heading text-xl sm:text-2xl lg:text-3xl font-extrabold leading-tight tracking-tight" style={{ color: '#2E5B37' }}>
                  O que entregamos para VOCÊ
                </h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm lg:text-base font-medium mb-4 sm:mb-5 leading-relaxed min-h-[48px] flex items-center" style={{ color: 'rgba(46, 91, 55, 0.95)' }}>
              Toda a estrutura tecnológica para você escalar seu ensino e criar uma fonte de receita recorrente sem esforço técnico.
            </p>

            {/* Lista de Entregáveis ao Professor */}
            <ul className="space-y-3 sm:space-y-3.5">
              <li className="flex items-start space-x-3.5">
                <div className="p-1.5 sm:p-2 rounded-xl bg-[#2E5B37]/15 shrink-0 mt-0.5" style={{ color: '#2E5B37' }}>
                  <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-h-[48px] flex flex-col justify-center">
                  <h4 className="font-heading text-xs sm:text-sm lg:text-base font-bold leading-snug" style={{ color: '#2E5B37' }}>Ambiente de Estudos 100% Pronto</h4>
                  <p className="text-[11px] sm:text-xs leading-relaxed" style={{ color: 'rgba(46, 91, 55, 0.85)' }}>
                    Sem precisar entender nada de tecnologia. Seu produto de ensino no ar em minutos.
                  </p>
                </div>
              </li>

              <li className="flex items-start space-x-3.5">
                <div className="p-1.5 sm:p-2 rounded-xl bg-[#2E5B37]/15 shrink-0 mt-0.5" style={{ color: '#2E5B37' }}>
                  <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-h-[48px] flex flex-col justify-center">
                  <h4 className="font-heading text-xs sm:text-sm lg:text-base font-bold leading-snug" style={{ color: '#2E5B37' }}>Assistente com a Sua Metodologia</h4>
                  <p className="text-[11px] sm:text-xs leading-relaxed" style={{ color: 'rgba(46, 91, 55, 0.85)' }}>
                    Envie suas apostilas, PDFs e questões. O assistente responde exatamente como você.
                  </p>
                </div>
              </li>

              <li className="flex items-start space-x-3.5">
                <div className="p-1.5 sm:p-2 rounded-xl bg-[#2E5B37]/15 shrink-0 mt-0.5" style={{ color: '#2E5B37' }}>
                  <Handshake className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-h-[48px] flex flex-col justify-center">
                  <h4 className="font-heading text-xs sm:text-sm lg:text-base font-bold leading-snug" style={{ color: '#2E5B37' }}>Parceria 50/50 & Receita Recorrente</h4>
                  <p className="text-[11px] sm:text-xs leading-relaxed" style={{ color: 'rgba(46, 91, 55, 0.85)' }}>
                    Nós cuidamos da tecnologia, suporte e manutenção; você da distribuição com seus alunos.
                  </p>
                </div>
              </li>

              <li className="flex items-start space-x-3.5">
                <div className="p-1.5 sm:p-2 rounded-xl bg-[#2E5B37]/15 shrink-0 mt-0.5" style={{ color: '#2E5B37' }}>
                  <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-h-[48px] flex flex-col justify-center">
                  <h4 className="font-heading text-xs sm:text-sm lg:text-base font-bold leading-snug" style={{ color: '#2E5B37' }}>Proteção de Conteúdo e Autoridade</h4>
                  <p className="text-[11px] sm:text-xs leading-relaxed" style={{ color: 'rgba(46, 91, 55, 0.85)' }}>
                    Seus materiais ficam blindados e acessíveis exclusivamente para os seus alunos.
                  </p>
                </div>
              </li>

              <li className="flex items-start space-x-3.5">
                <div className="p-1.5 sm:p-2 rounded-xl bg-[#2E5B37]/15 shrink-0 mt-0.5" style={{ color: '#2E5B37' }}>
                  <LineChart className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-h-[48px] flex flex-col justify-center">
                  <h4 className="font-heading text-xs sm:text-sm lg:text-base font-bold leading-snug" style={{ color: '#2E5B37' }}>Painel de Controle e Acompanhamento</h4>
                  <p className="text-[11px] sm:text-xs leading-relaxed" style={{ color: 'rgba(46, 91, 55, 0.85)' }}>
                    Acompanhe suas vendas, assinaturas ativas e o progresso dos alunos em tempo real.
                  </p>
                </div>
              </li>
            </ul>

            {onStartRegistration && (
              <div className="pt-3 mt-5 border-t border-[#2E5B37]/20 flex items-center min-h-[40px]">
                <button
                  onClick={onStartRegistration}
                  className="inline-flex items-center font-heading font-bold text-xs sm:text-sm hover:underline group/btn"
                  style={{ color: '#2E5B37' }}
                >
                  <span>Criar meu assistente de professor</span>
                  <ArrowRight className="w-4 h-4 ml-1.5 group-hover/btn:translate-x-1 transition-transform" />
                </button>
              </div>
            )}
          </div>
        </div>


        {/* Metade Direita: Para o Aluno (Fundo Verde Musgo #2E5B37, Letras Brancas #FFFFFF) */}
        <div className="bg-[#2E5B37] w-full h-auto lg:h-full flex flex-col justify-between p-6 sm:p-10 lg:p-12 xl:p-14 lg:pt-32 text-white relative overflow-hidden">
          <div className="max-w-xl mr-auto w-full flex flex-col justify-center lg:h-full">
            
            {/* Header Coluna Aluno */}
            <div className="flex items-center space-x-3 mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0">
                <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <span className="text-[11px] sm:text-xs font-extrabold uppercase tracking-widest text-white/85 block">
                  Para o seu Aluno
                </span>
                <h3 className="font-heading text-xl sm:text-2xl lg:text-3xl font-extrabold text-white leading-tight tracking-tight" style={{ color: '#FFFFFF' }}>
                  O que entregamos para o ALUNO
                </h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm lg:text-base text-white/95 font-medium mb-4 sm:mb-5 leading-relaxed min-h-[48px] flex items-center">
              Um ambiente de aprendizado inteligente que acelera os estudos com respostas confiáveis baseadas no material do professor.
            </p>

            {/* Lista de Entregáveis ao Aluno */}
            <ul className="space-y-3 sm:space-y-3.5">
              <li className="flex items-start space-x-3.5">
                <div className="p-1.5 sm:p-2 rounded-xl bg-white/15 text-white shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-h-[48px] flex flex-col justify-center">
                  <h4 className="font-heading text-xs sm:text-sm lg:text-base font-bold leading-snug text-white" style={{ color: '#FFFFFF' }}>Tutor Virtual 24 Horas por Dia</h4>
                  <p className="text-[11px] sm:text-xs text-white/85 leading-relaxed">
                    Tira-dúvidas instantâneo que responde com base no material do professor, sem invenções.
                  </p>
                </div>
              </li>

              <li className="flex items-start space-x-3.5">
                <div className="p-1.5 sm:p-2 rounded-xl bg-white/15 text-white shrink-0 mt-0.5">
                  <BrainCircuit className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-h-[48px] flex flex-col justify-center">
                  <h4 className="font-heading text-xs sm:text-sm lg:text-base font-bold leading-snug text-white" style={{ color: '#FFFFFF' }}>Simulados Personalizados & Banco de Questões</h4>
                  <p className="text-[11px] sm:text-xs text-white/85 leading-relaxed">
                    Treino completo com simulados gerados sob medida a partir do desempenho do aluno no banco de questões.
                  </p>
                </div>
              </li>

              <li className="flex items-start space-x-3.5">
                <div className="p-1.5 sm:p-2 rounded-xl bg-white/15 text-white shrink-0 mt-0.5">
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-h-[48px] flex flex-col justify-center">
                  <h4 className="font-heading text-xs sm:text-sm lg:text-base font-bold leading-snug text-white" style={{ color: '#FFFFFF' }}>Cartões de Memorização Inteligentes</h4>
                  <p className="text-[11px] sm:text-xs text-white/85 leading-relaxed">
                    Flashcards gerados automaticamente para fixar os pontos mais importantes da matéria.
                  </p>
                </div>
              </li>

              <li className="flex items-start space-x-3.5">
                <div className="p-1.5 sm:p-2 rounded-xl bg-white/15 text-white shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-h-[48px] flex flex-col justify-center">
                  <h4 className="font-heading text-xs sm:text-sm lg:text-base font-bold leading-snug text-white" style={{ color: '#FFFFFF' }}>Diagnóstico de Desempenho</h4>
                  <p className="text-[11px] sm:text-xs text-white/85 leading-relaxed">
                    Identificação dos pontos fracos para focar as revisões onde o aluno mais precisa.
                  </p>
                </div>
              </li>

              <li className="flex items-start space-x-3.5">
                <div className="p-1.5 sm:p-2 rounded-xl bg-white/15 text-white shrink-0 mt-0.5">
                  <Smartphone className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-h-[48px] flex flex-col justify-center">
                  <h4 className="font-heading text-xs sm:text-sm lg:text-base font-bold leading-snug text-white" style={{ color: '#FFFFFF' }}>Acesso Fácil pelo Celular ou Computador</h4>
                  <p className="text-[11px] sm:text-xs text-white/85 leading-relaxed">
                    Interface simples, rápida e acessível de qualquer lugar, focada na aprovação do aluno.
                  </p>
                </div>
              </li>
            </ul>

            <div className="pt-3 mt-5 border-t border-white/20 flex items-center justify-between text-xs sm:text-sm text-white/95 font-bold min-h-[40px]">
              <span>Aprovação acelerada para concursos, OAB e vestibulares</span>
              <Sparkles className="w-4 h-4 text-white/80" />
            </div>
          </div>
        </div>

      </div>
    </ScrollRevealSection>
  );
};
