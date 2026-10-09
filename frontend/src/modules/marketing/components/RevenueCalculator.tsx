'use client';

import React, { useState } from 'react';
import { Users, TrendingUp, Sparkles, ShieldCheck, ArrowRight, Info } from 'lucide-react';
import { ScrollRevealSection } from './ScrollRevealSection';

interface RevenueCalculatorProps {
  onStartRegistration: () => void;
}

export const RevenueCalculator: React.FC<RevenueCalculatorProps> = ({ onStartRegistration }) => {
  const [studentCount, setStudentCount] = useState<number>(100);
  
  // Mensalidade fixa de R$ 59,90 (estimativa padrão)
  const FIXED_SUBSCRIPTION_PRICE = 59.90;
  const TEACHER_SHARE_PERCENT = 25; // 25% comissão fixa do professor

  const monthlyGrossTotal = studentCount * FIXED_SUBSCRIPTION_PRICE;
  const teacherMonthlyEarnings = monthlyGrossTotal * (TEACHER_SHARE_PERCENT / 100);
  const teacherAnnualEarnings = teacherMonthlyEarnings * 12;

  return (
    <ScrollRevealSection id="modelo-receita" className="pt-20 pb-10 flex flex-col justify-between bg-[#EFEAE1]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 my-auto w-full">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#0F2942] tracking-tight mb-3">
            Como você ganha dinheiro com seu assistente
          </h2>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed font-medium">
            Você ganha <span className="text-[#2E5B37] font-extrabold">25% de comissão recorrente</span> sobre cada assinatura ativa do seu assistente, sem pagar servidor, IA, plataforma ou gateway.
          </p>
        </div>

        {/* Grid: 4 Value Points + Interactive Calculator */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-6xl mx-auto items-center">
          
          {/* Left Column: 4 Key Revenue Points */}
          <div className="lg:col-span-5 space-y-4">
            
            <div className="glass-card p-4 rounded-xl border border-slate-200 bg-white hover:border-[#2E5B37]/30 transition-all shadow-sm flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-[#2E5B37]/10 text-[#2E5B37] shrink-0 mt-0.5">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-heading text-xs font-bold text-[#0F2942] mb-0.5">Assinatura recorrente para o aluno</h4>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Cada aluno assina seu assistente por uma mensalidade acessível de R$ 59,90/mês (estimativa base).
                </p>
              </div>
            </div>

            <div className="glass-card p-4 rounded-xl border border-slate-200 bg-white hover:border-[#2E5B37]/30 transition-all shadow-sm flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-[#2E5B37]/10 text-[#2E5B37] shrink-0 mt-0.5">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-heading text-xs font-bold text-[#0F2942] mb-0.5">Comissão recorrente para você</h4>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Você recebe 25% de comissão fixa de cada assinatura ativa do seu assistente, todo mês, enquanto o aluno permanecer.
                </p>
              </div>
            </div>

            <div className="glass-card p-4 rounded-xl border border-slate-200 bg-white hover:border-[#0F2942]/30 transition-all shadow-sm flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-[#0F2942]/10 text-[#0F2942] shrink-0 mt-0.5">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-heading text-xs font-bold text-[#0F2942] mb-0.5">Sem custo de infraestrutura</h4>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Assumimos IA, armazenamento, processamento de PDFs, banco de questões, simulados, relatórios e cobrança.
                </p>
              </div>
            </div>

            <div className="glass-card p-4 rounded-xl border border-slate-200 bg-white hover:border-[#2E5B37]/30 transition-all shadow-sm flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-[#2E5B37]/10 text-[#2E5B37] shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-heading text-xs font-bold text-[#0F2942] mb-0.5">Escala e Receita Previsível</h4>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Dezenas ou centenas de alunos gerando faturamento previsível com base na qualidade do seu conteúdo.
                </p>
              </div>
            </div>

          </div>

          {/* Right Column: Interactive Earnings Calculator (Navy Container Contrast) */}
          <div className="lg:col-span-7 bg-[#0F2942] p-6 sm:p-8 rounded-3xl border border-[#2E5B37]/40 shadow-2xl space-y-6 text-white">
            
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-4">
              <h3 className="font-heading font-bold text-white text-base sm:text-lg flex items-center">
                <Sparkles className="w-4 h-4 text-emerald-400 mr-2" />
                Simular meus ganhos estimados
              </h3>
              <span className="text-[11px] font-mono font-bold text-white bg-[#2E5B37] px-3 py-1 rounded-full border border-emerald-400/30">
                Sua Comissão: 25% Fixa
              </span>
            </div>

            {/* Fixed Subscription Price Card Info */}
            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-700/60 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Info className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs text-slate-300">
                  Plano Base de Assinatura (Aluno):
                </span>
              </div>
              <span className="text-sm font-bold font-mono text-emerald-300 bg-[#2E5B37]/40 px-3 py-1 rounded-xl border border-emerald-500/30">
                R$ 59,90 / mês
              </span>
            </div>

            {/* Slider 1: Number of Students */}
            <div className="pt-2">
              <div className="flex justify-between text-xs font-bold mb-2">
                <span className="text-slate-200">Quantidade Estimada de Alunos Ativos:</span>
                <span className="text-emerald-400 font-mono text-sm">{studentCount} alunos</span>
              </div>
              <input
                type="range"
                min={10}
                max={1000}
                step={10}
                value={studentCount}
                onChange={(e) => setStudentCount(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>10 alunos</span>
                <span>500 alunos</span>
                <span>1.000 alunos</span>
              </div>
            </div>

            {/* Estimativa Note */}
            <p className="text-[11px] text-slate-300 italic">
              * Valores estimados considerando a comissão fixa de 25% sobre o plano padrão de R$ 59,90/mês.
            </p>

            {/* Output Display Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="bg-slate-900/90 p-4 rounded-2xl border border-emerald-500/30">
                <p className="text-[11px] text-slate-300 font-medium">Sua Comissão Recorrente Mensal</p>
                <p className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono mt-1">
                  R$ {teacherMonthlyEarnings.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">Repassados todo mês via PIX/Transferência</p>
              </div>

              <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-700">
                <p className="text-[11px] text-slate-300 font-medium">Estimativa de Ganho Anual</p>
                <p className="text-2xl sm:text-3xl font-extrabold text-teal-300 font-mono mt-1">
                  R$ {teacherAnnualEarnings.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">Acumulado em 12 meses com base constante</p>
              </div>
            </div>

            {/* CTA Button */}
            <button
              onClick={onStartRegistration}
              className="w-full py-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#2E5B37] via-emerald-700 to-[#166534] hover:from-[#1E4620] hover:to-[#2E5B37] shadow-xl shadow-[#2E5B37]/40 transition-all flex items-center justify-center space-x-2"
            >
              <span>Quero Criar Meu Assistente e Começar</span>
              <ArrowRight className="w-4 h-4" />
            </button>

          </div>

        </div>

      </div>
    </ScrollRevealSection>
  );
};
