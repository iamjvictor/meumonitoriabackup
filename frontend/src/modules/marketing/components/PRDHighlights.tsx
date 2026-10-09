'use client';

import React, { useState } from 'react';
import { UserCheck, GraduationCap, FileText, CheckSquare, MessageSquare, Trophy, BarChart3, Sparkles, ArrowUpRight, ChevronDown } from 'lucide-react';

export const PRDHighlights: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'professor' | 'aluno'>('professor');

  return (
    <section id="recursos" className="snap-section pt-20 pb-10 bg-slate-950/60 border-t border-b border-slate-900 flex flex-col justify-between">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 my-auto w-full">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-xs font-semibold text-purple-300 mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Arquitetura Desenhada para Resultados</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight mb-3">
            Duas Experiências Perfeitamente Conectadas
          </h2>
          <p className="text-slate-300 text-sm sm:text-base">
            O professor cria o conteúdo e monetiza a audiência. O aluno recebe estudo guiado, simulados e respostas com 100% de precisão pedagógica.
          </p>

          {/* Toggle Switch */}
          <div className="mt-6 inline-flex p-1 rounded-2xl glass-panel border border-slate-800">
            <button
              onClick={() => setActiveTab('professor')}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 ${
                activeTab === 'professor'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Para o Professor (Criador)</span>
            </button>
            <button
              onClick={() => setActiveTab('aluno')}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 ${
                activeTab === 'aluno'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Para o Aluno (Assinante)</span>
            </button>
          </div>
        </div>

        {/* Tab Content: Professor */}
        {activeTab === 'professor' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-card p-6 rounded-2xl relative overflow-hidden group">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">1. Organização por Subcategorias</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-3">
                Cadastre seus materiais, livros, provas e gabaritos organizados em categorias e subcategorias (ex: Gramática &gt; Crase).
              </p>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mr-2" /> Upload em PDF, apostilas e documentos</li>
                <li className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mr-2" /> Indexação automática em chunks vetoriais</li>
              </ul>
            </div>

            <div className="glass-card p-6 rounded-2xl relative overflow-hidden group">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <CheckSquare className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">2. Extração & Revisão de Questões</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-3">
                A IA analisa seus PDFs, identifica questões, opções e gabaritos. Você revisa, edita e aprova com total controle.
              </p>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-purple-400 mr-2" /> Nenhuma questão entra no ar sem sua aprovação</li>
                <li className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-purple-400 mr-2" /> Classificação automática por dificuldade</li>
              </ul>
            </div>

            <div className="glass-card p-6 rounded-2xl relative overflow-hidden group">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <ArrowUpRight className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">3. Página Própria & Vendas Recorrentes</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-3">
                Publique seu agente com um link compartilhável exclusivo (ex: <code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded">meumonitor.ai/prof-seu-nome</code>) e receba mensalmente.
              </p>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2" /> Assinaturas por agente a R$ 59,90/mês</li>
                <li className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2" /> Sem necessidade de equipe técnica</li>
              </ul>
            </div>
          </div>
        )}

        {/* Tab Content: Aluno */}
        {activeTab === 'aluno' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-card p-6 rounded-2xl relative overflow-hidden group">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">1. Chat de Dúvidas Confiável</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-3">
                O aluno tira dúvidas sobre matérias e questões e recebe explicações baseadas exclusivamente nos materiais do professor.
              </p>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mr-2" /> Resposta &quot;Sem base suficiente&quot; se fugir do tema</li>
                <li className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mr-2" /> Explicações detalhadas de alternativas</li>
              </ul>
            </div>

            <div className="glass-card p-6 rounded-2xl relative overflow-hidden group">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Trophy className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">2. Desafio Diário & Ranking</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-3">
                Todo dia o aluno recebe 1 questão desafio para manter o hábito de estudo e competir no ranking mensal por acertos.
              </p>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-2" /> Engajamento e disciplina diária</li>
                <li className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-2" /> Ranking transparente com apelido</li>
              </ul>
            </div>

            <div className="glass-card p-6 rounded-2xl relative overflow-hidden group">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">3. Simulados para Pontos Fracos</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-3">
                O sistema rastreia o histórico por subcategoria e monta simulados focando exatamente nos tópicos onde o aluno mais erra.
              </p>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-rose-400 mr-2" /> Diagnóstico preciso de desempenho</li>
                <li className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-rose-400 mr-2" /> Prioridade para questões não respondidas</li>
              </ul>
            </div>
          </div>
        )}

      </div>

      <div className="flex justify-center pb-4 text-slate-500 z-10 animate-bounce">
        <a href="#como-funciona" className="flex flex-col items-center text-xs hover:text-indigo-400 transition-colors">
          <span>Como Funciona</span>
          <ChevronDown className="w-4 h-4 mt-1" />
        </a>
      </div>
    </section>
  );
};
