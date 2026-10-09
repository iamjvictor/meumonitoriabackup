'use client';

import React from 'react';
import { UserPlus, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

interface FooterProps {
  onOpenRegister: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenRegister }) => {
  return (
    <footer id="footer" className="bg-[#0F2942] border-t border-slate-800 py-6 sm:py-8 text-slate-300 text-xs w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        
        {/* Footer Links Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-6 sm:gap-6 mb-6">
          
          {/* Col 1: Brand info */}
          <div className="col-span-2 md:col-span-2 space-y-2">
            <div className="flex items-center space-x-2.5">
              <Image src="/logoSemfundo.png" alt="MeuMonitor AI" width={32} height={32} className="w-8 h-8 object-contain" />
              <div className="flex items-center space-x-1 font-heading text-lg font-bold text-white">
                <span>MeuMonitor</span>
                <span className="text-emerald-400">AI</span>
              </div>
            </div>
            <p className="text-slate-400 text-xs max-w-sm leading-relaxed">
              Plataforma SaaS que permite a professores e criadores de conteúdo transformarem apostilas e questões em assistentes de estudo com IA e gerarem receita recorrente.
            </p>
          </div>

          {/* Col 2: Navegação do Professor */}
          <div className="space-y-2">
            <h4 className="font-heading font-bold text-white uppercase tracking-wider text-[11px]">Navegação</h4>
            <ul className="space-y-1 text-slate-400">
              <li><a href="#foco-ensinar" className="hover:text-emerald-400 transition-colors">Estrutura Pronta</a></li>
              <li><a href="#como-funciona" className="hover:text-emerald-400 transition-colors">Como Funciona</a></li>
              <li><a href="#o-que-o-assistente-faz" className="hover:text-emerald-400 transition-colors">Entregáveis</a></li>
              <li><a href="#faq" className="hover:text-emerald-400 transition-colors">FAQ</a></li>
            </ul>
          </div>

          {/* Col 3: Links Adicionais */}
          <div className="space-y-2">
            <h4 className="font-heading font-bold text-white uppercase tracking-wider text-[11px]">Acesso Rápido</h4>
            <ul className="space-y-1.5">
              <li>
                <Link href="/alunos" className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors flex items-center">
                  <span>Portal do Aluno</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Link>
              </li>
              <li>
                <button
                  onClick={onOpenRegister}
                  className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors flex items-center text-left"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1" />
                  <span>Cadastrar como Professor</span>
                </button>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-2">
          <p>© {new Date().getFullYear()} MeuMonitor AI. Todos os direitos reservados.</p>
          <p>Plataforma para Criadores & Professores</p>
        </div>

      </div>
    </footer>
  );
};
