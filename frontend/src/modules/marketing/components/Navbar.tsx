'use client';

import React, { useEffect, useState } from 'react';
import { UserPlus, LogIn } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

interface NavbarProps {
  onOpenRegister: () => void;
  onOpenLogin?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenRegister, onOpenLogin }) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const container = document.querySelector('.snap-container');
      const scrollTop = container ? container.scrollTop : window.scrollY;
      setScrolled(scrollTop > 40);
    };

    const container = document.querySelector('.snap-container');
    if (container) {
      container.addEventListener('scroll', handleScroll);
    } else {
      window.addEventListener('scroll', handleScroll);
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      } else {
        window.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  const navLinks = [
    { name: 'Estrutura', href: '#foco-ensinar' },
    { name: 'Como Funciona', href: '#como-funciona' },
    { name: 'Entregáveis', href: '#o-que-o-assistente-faz' },
    { name: 'FAQ', href: '#faq' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 pointer-events-none transition-all duration-500 flex justify-center">
      <div
        className={`relative pointer-events-auto transition-all duration-500 ease-out w-full ${
          scrolled
            ? 'max-w-5xl mx-3 sm:mx-auto mt-3 sm:mt-4 rounded-full bg-[#0F2942]/95 backdrop-blur-xl border border-[#2E5B37]/40 shadow-2xl shadow-[#0F2942]/20 py-2 px-4 sm:px-6 text-white'
            : 'max-w-7xl mx-auto py-5 px-4 sm:px-6 lg:px-8 bg-transparent border-b border-transparent text-[#0F2942]'
        }`}
      >
        <div className="flex items-center justify-between">
          
          {/* Logo - Brand Asset */}
          <Link href="/" className="flex items-center space-x-2.5 group">
            <Image
              src="/logoSemfundo.png"
              alt="MeuMonitor AI"
              width={36}
              height={36}
              className="w-9 h-9 object-contain group-hover:scale-105 transition-transform"
            />
            <div className="flex flex-col">
              <span className={`font-heading text-lg font-bold tracking-tight flex items-center space-x-1 ${scrolled ? 'text-white' : 'text-[#0F2942]'}`}>
                <span>MeuMonitor</span>
                <span className="text-[#2E5B37] font-extrabold ml-0.5">AI</span>
              </span>
              {!scrolled && (
                <span className="text-[9px] font-semibold text-[#2E5B37] -mt-1 tracking-wider uppercase">
                  Para Professores
                </span>
              )}
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className={`hidden md:flex items-center space-x-6 text-xs font-semibold ${scrolled ? 'text-slate-200' : 'text-[#0F2942]/80'}`}>
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className={`transition-colors relative py-1 hover:after:w-full after:w-0 after:h-0.5 after:bg-[#2E5B37] after:absolute after:bottom-0 after:left-0 after:transition-all after:duration-300 ${
                  scrolled ? 'hover:text-emerald-300' : 'hover:text-[#2E5B37]'
                }`}
              >
                {link.name}
              </a>
            ))}
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2.5">
            <button
              onClick={onOpenLogin || onOpenRegister}
              className={`inline-flex items-center space-x-1.5 text-xs font-semibold px-3 py-2 rounded-full transition-colors cursor-pointer ${
                scrolled
                  ? 'text-slate-200 hover:text-white hover:bg-white/10'
                  : 'text-[#0F2942] hover:bg-[#0F2942]/10'
              }`}
            >
              <LogIn className={`w-3.5 h-3.5 ${scrolled ? 'text-emerald-400' : 'text-[#2E5B37]'}`} />
              <span>Entrar</span>
            </button>

            <button
              onClick={onOpenRegister}
              className={`hidden md:flex py-2 rounded-full text-xs font-bold text-white bg-gradient-to-r from-[#0F2942] via-[#1E3A8A] to-[#2E5B37] hover:from-[#172554] hover:to-[#1E4620] shadow-lg shadow-[#0F2942]/20 transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] items-center space-x-1.5 cursor-pointer ${
                scrolled ? 'px-4' : 'px-5'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 text-emerald-300" />
              <span>Criar Assistente</span>
            </button>

          </div>
        </div>
      </div>
    </header>
  );
};
