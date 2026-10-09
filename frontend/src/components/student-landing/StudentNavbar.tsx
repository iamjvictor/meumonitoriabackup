'use client';

import React, { useState, useEffect } from 'react';
import { LogIn, GraduationCap, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export const StudentNavbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const container = document.querySelector('.snap-container');
      if (container) {
        setScrolled(container.scrollTop > 20);
      }
    };
    const container = document.querySelector('.snap-container');
    if (container) {
      container.addEventListener('scroll', handleScroll);
    }
    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        scrolled
          ? 'bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 shadow-xl py-3'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          
          {/* Logo */}
          <Link href="/alunos" className="flex items-center space-x-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25 group-hover:scale-105 transition-transform">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-heading text-xl font-bold tracking-tight text-white flex items-center space-x-1">
                <span>MeuMonitor</span>
                <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">AI</span>
              </span>
              <span className="text-[10px] font-medium text-emerald-400 -mt-1 tracking-wider uppercase">
                Portal do Aluno
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-8 text-sm font-medium text-slate-300">
            <a href="#hero-aluno" className="hover:text-white transition-colors">
              Início
            </a>
            <a href="#como-acessar" className="hover:text-white transition-colors">
              Como Acessar
            </a>
            <a href="#recursos-aluno" className="hover:text-white transition-colors">
              Recursos
            </a>
            <a href="#faq-aluno" className="hover:text-white transition-colors">
              Dúvidas
            </a>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-3">
            <Link
              href="/"
              className="hidden lg:inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg hover:bg-slate-800/40 transition-colors"
            >
              <span>Sou Professor</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>

            <Link
              href="/?login=true&perfil=aluno"
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-300 hover:from-emerald-300 hover:to-teal-300 shadow-lg shadow-emerald-500/25 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] flex items-center space-x-1.5"
            >
              <LogIn className="w-4 h-4" />
              <span>Entrar como Aluno</span>
            </Link>
          </div>

        </div>
      </div>
    </nav>
  );
};
