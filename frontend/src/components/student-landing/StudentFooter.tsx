'use client';

import React from 'react';
import { GraduationCap, LogIn, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export const StudentFooter: React.FC = () => {
  return (
    <footer id="footer-aluno" className="snap-section bg-slate-950 border-t border-slate-900 py-12 text-slate-400 text-xs flex flex-col justify-between">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 my-auto w-full">
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          
          {/* Col 1: Brand info */}
          <div className="space-y-3 md:col-span-2">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-indigo-600 flex items-center justify-center text-white">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div className="flex items-center space-x-1 font-heading text-lg font-bold text-white">
                <span>MeuMonitor</span>
                <span className="text-emerald-400">AI</span>
                <span className="text-[10px] text-slate-500 font-normal">| Aluno</span>
              </div>
            </div>
            <p className="text-slate-400 text-xs max-w-md leading-relaxed">
              Ambiente de estudos inteligente para alunos de concursos, OAB, vestibulares e cursos livres. Tire dúvidas com IA fundamentada nos PDFs do seu professor.
            </p>
          </div>

          {/* Col 2: Acesso rápido */}
          <div className="space-y-2">
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">Área do Aluno</h4>
            <ul className="space-y-1.5">
              <li>
                <Link href="/?login=true&perfil=aluno" className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors flex items-center">
                  <LogIn className="w-3.5 h-3.5 mr-1" />
                  <span>Fazer Login</span>
                </Link>
              </li>
              <li><a href="#recursos-aluno" className="hover:text-white transition-colors">Chat RAG sem Alucinações</a></li>
              <li><a href="#recursos-aluno" className="hover:text-white transition-colors">Simulados Adaptativos</a></li>
              <li><a href="#faq-aluno" className="hover:text-white transition-colors">Perguntas Frequentes</a></li>
            </ul>
          </div>

          {/* Col 3: Área do Criador */}
          <div className="space-y-2">
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">É Professor?</h4>
            <p className="text-slate-400 text-xs leading-relaxed">
              Crie seu assistente com inteligência artificial e venda assinaturas para seus alunos.
            </p>
            <Link
              href="/"
              className="inline-flex items-center text-indigo-400 hover:text-indigo-300 font-bold transition-colors mt-1"
            >
              <span>Ir para Página de Professores</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </div>

        </div>

        <div className="pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-3">
          <p>© {new Date().getFullYear()} MeuMonitor AI. Todos os direitos reservados.</p>
          <p>Portal de Aprendizado do Aluno</p>
        </div>

      </div>
    </footer>
  );
};
