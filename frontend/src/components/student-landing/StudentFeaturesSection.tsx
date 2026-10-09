'use client';

import React from 'react';
import { MessageSquare, Trophy, BarChart3, BookOpen, Sparkles, ShieldCheck } from 'lucide-react';

export const StudentFeaturesSection: React.FC = () => {
  return (
    <section id="recursos-aluno" className="snap-section pt-20 pb-10 bg-slate-950/60 border-t border-b border-slate-900 flex flex-col justify-between">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 my-auto w-full">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-300 mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Sua Preparação de Alto Rendimento</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight mb-3">
            Tudo o que Você Precisa para Ser Aprovado
          </h2>
          <p className="text-slate-300 text-sm sm:text-base">
            Estude com um assistente de IA configurado pessoalmente pelo seu professor com apostilas, provas e gabaritos revisados.
          </p>
        </div>

        {/* 4 Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          
          <div className="glass-card p-6 rounded-2xl border border-slate-800 hover:border-emerald-500/40 transition-all flex items-start space-x-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-white text-lg mb-1">1. Chat de Dúvidas 100% Confiável</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-2">
                Tire dúvidas a qualquer hora sobre matérias ou alternativas de questões. A IA responde fundamentando em páginas das apostilas do professor e se recusa a responder fora do tema.
              </p>
              <span className="inline-flex items-center text-[11px] text-emerald-300 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Sem alucinações de IA
              </span>
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-slate-800 hover:border-teal-500/40 transition-all flex items-start space-x-4">
            <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-white text-lg mb-1">2. Questões Separadas por Subcategoria</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-2">
                Pratique listas de questões extraídas das provas anteriores e dos PDFs do seu professor, organizadas exatamente pela ordem do edital ou matéria.
              </p>
              <span className="inline-flex items-center text-[11px] text-teal-300 font-medium">
                ✓ Questões aprovadas pelo professor
              </span>
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-slate-800 hover:border-cyan-500/40 transition-all flex items-start space-x-4">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-white text-lg mb-1">3. Simulados para Pontos Fracos</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-2">
                O algoritmo identifica em quais subcategorias você comete mais erros e gera simulados personalizados priorizando seus tópicos de menor desempenho.
              </p>
              <span className="inline-flex items-center text-[11px] text-cyan-300 font-medium">
                ⚡ Evolução contínua por estatísticas
              </span>
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-slate-800 hover:border-indigo-500/40 transition-all flex items-start space-x-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-white text-lg mb-1">4. Desafio Diário & Ranking</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-2">
                Receba todo dia uma questão desafio para manter a disciplina de estudo diária e pontuar no ranking mensal entre todos os alunos do seu agente.
              </p>
              <span className="inline-flex items-center text-[11px] text-indigo-300 font-medium">
                🏆 Gamificação e motivação diária
              </span>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
