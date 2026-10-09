'use client';

import React, { useState } from 'react';
import { LogIn, GraduationCap, Search, ShieldCheck, CheckCircle2, Zap, ArrowRight, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export const StudentHeroSection: React.FC = () => {
  const router = useRouter();
  const [teacherSlugInput, setTeacherSlugInput] = useState('');

  const handleGoToTeacherPage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherSlugInput.trim()) return;

    const cleanedSlug = teacherSlugInput
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/[^\/]+\/p\//, '')
      .replace(/^meumonitor\.ai\/prof-/, '')
      .replace(/^prof-/, '');

    router.push(`/p/${cleanedSlug}`);
  };

  return (
    <section id="hero-aluno" className="snap-section pt-20 pb-10 overflow-hidden flex flex-col justify-between">
      {/* Background Ambient Glows */}
      <div className="bg-glow top-0 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-emerald-600/15" />
      <div className="bg-glow top-32 right-10 w-[400px] h-[300px] bg-teal-600/15" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 my-auto w-full">
        <div className="text-center max-w-3xl mx-auto">
          
          {/* Badge */}
          <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full glass-panel border border-emerald-500/30 text-xs sm:text-sm font-medium text-emerald-300 mb-6 shadow-inner">
            <GraduationCap className="w-4 h-4 text-emerald-400" />
            <span>Portal do Aluno MeuMonitor AI</span>
            <span className="bg-emerald-500/20 text-emerald-200 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-emerald-400/30">
              Estudo Guiado por IA
            </span>
          </div>

          {/* Main Title */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-5 leading-[1.15]">
            Acesse o Assistente de Estudos do{' '}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              Seu Professor
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg text-slate-300 mb-8 max-w-2xl mx-auto leading-relaxed font-normal">
            Tire dúvidas em tempo real com base restrita nos materiais do seu professor, pratique questões revisadas, faça simulados para seus pontos fracos e participe do Desafio Diário.
          </p>

          {/* Direct Login Button */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
            <Link
              href="/?login=true&perfil=aluno"
              className="w-full sm:w-auto px-8 py-4 rounded-xl font-bold text-sm sm:text-base text-slate-950 bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-300 hover:from-emerald-300 hover:to-teal-300 shadow-xl shadow-emerald-500/25 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center group"
            >
              <LogIn className="w-5 h-5 mr-2" />
              <span>Fazer Login como Aluno</span>
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          {/* Direct Teacher Link Search Input */}
          <div className="max-w-xl mx-auto glass-panel p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-2xl mb-8">
            <label className="block text-left text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Já possui o link ou código do seu professor?
            </label>
            <form onSubmit={handleGoToTeacherPage} className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={teacherSlugInput}
                  onChange={(e) => setTeacherSlugInput(e.target.value)}
                  placeholder="Ex: prof-joaovictor ou joaovictor"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors flex items-center justify-center space-x-1 shrink-0"
              >
                <span>Acessar Agente</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </button>
            </form>
            <p className="text-[11px] text-slate-400 text-left mt-2">
              O link é fornecido diretamente pelo seu professor (ex: <code className="text-emerald-300">meumonitor.ai/p/prof-joaovictor</code>).
            </p>
          </div>

          {/* Trust Badges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto text-left">
            <div className="glass-card p-3 rounded-xl flex items-center space-x-2.5">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400">RAG Restrito</p>
                <p className="text-xs font-semibold text-slate-200">Zero Alucinações</p>
              </div>
            </div>

            <div className="glass-card p-3 rounded-xl flex items-center space-x-2.5">
              <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Banco de Questões</p>
                <p className="text-xs font-semibold text-slate-200">Do Seu Professor</p>
              </div>
            </div>

            <div className="glass-card p-3 rounded-xl flex items-center space-x-2.5">
              <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Desafio Diário</p>
                <p className="text-xs font-semibold text-slate-200">Ranking por Acertos</p>
              </div>
            </div>

            <div className="glass-card p-3 rounded-xl flex items-center space-x-2.5">
              <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Simulados</p>
                <p className="text-xs font-semibold text-slate-200">Foco em Erros</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
