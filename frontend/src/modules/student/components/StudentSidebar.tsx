'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  LayoutGrid,
  Brain,
  Trophy,
  BarChart3,
  Bot,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

interface StudentSidebarProps {
  activeNav: 'overview' | 'agents' | 'practice' | 'chats' | 'performance' | 'ranking';
}

export function StudentSidebar({ activeNav }: StudentSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const saved = localStorage.getItem('mm_student_left_sidebar_collapsed');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const nextState = !prev;
      try {
        localStorage.setItem('mm_student_left_sidebar_collapsed', String(nextState));
      } catch {
        // Ignore localStorage errors
      }
      return nextState;
    });
  };

  return (
    <aside
      className={`hidden shrink-0 flex-col border-r border-[#0F2942]/10 bg-[#F8F5EE] py-7 transition-all duration-200 ease-in-out lg:flex sticky top-0 h-screen ${
        isCollapsed ? 'w-[76px] px-3 items-center' : 'w-[248px] px-5'
      }`}
    >
      {/* Header com Logo e Botão de Recolher/Expandir */}
      <div className={`mb-8 flex items-center ${isCollapsed ? 'flex-col gap-4' : 'justify-between'} px-1`}>
        <Link href="/areadoaluno" className="flex items-center gap-3 truncate">
          <Image
            src="/logoSemfundo.png"
            alt="MeuMonitor AI"
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 object-contain transition hover:scale-105"
          />
          {!isCollapsed && (
            <div className="truncate">
              <div className="font-heading text-[17px] font-bold tracking-[-0.04em] truncate">
                MeuMonitor <span className="text-[#2E5B37]">AI</span>
              </div>
              <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.22em] text-[#2E5B37] truncate">
                Área do aluno
              </div>
            </div>
          )}
        </Link>

        <button
          type="button"
          onClick={toggleCollapse}
          title={isCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-[#0F2942]/60 hover:bg-white hover:text-[#0F2942] shadow-2xs transition cursor-pointer"
        >
          {isCollapsed ? <PanelLeftOpen className="h-4.5 w-4.5" /> : <PanelLeftClose className="h-4.5 w-4.5" />}
        </button>
      </div>

      {/* Navegação principal */}
      <nav className={`w-full space-y-1.5 ${isCollapsed ? 'flex flex-col items-center' : ''}`} aria-label="Navegação principal">
        <NavItem
          active={activeNav === 'overview'}
          icon={LayoutGrid}
          label="Visão geral"
          href="/areadoaluno"
          isCollapsed={isCollapsed}
        />
        <NavItem
          active={activeNav === 'agents'}
          icon={Bot}
          label="Meus agentes"
          href="/areadoaluno/agentes"
          isCollapsed={isCollapsed}
        />
        <NavItem
          active={activeNav === 'practice'}
          icon={Brain}
          label="Prática"
          href="/areadoaluno/pratica"
          isCollapsed={isCollapsed}
        />

        <NavItem
          active={activeNav === 'performance'}
          icon={BarChart3}
          label="Meu desempenho"
          href="/areadoaluno/desempenho"
          isCollapsed={isCollapsed}
        />
        <NavItem
          active={activeNav === 'ranking'}
          icon={Trophy}
          label="Ranking"
          href="/areadoaluno/ranking"
          isCollapsed={isCollapsed}
        />
      </nav>

    </aside>
  );
}

function NavItem({
  active,
  icon: Icon,
  label,
  href,
  isCollapsed,
}: {
  active?: boolean;
  icon: typeof LayoutGrid;
  label: string;
  href: string;
  isCollapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={isCollapsed ? label : undefined}
      className={`flex items-center gap-3 rounded-xl transition font-bold text-xs ${
        isCollapsed
          ? 'h-11 w-11 justify-center p-0'
          : 'w-full px-3 py-3'
      } ${
        active
          ? 'bg-[#E3F1E4] text-[#2E5B37]'
          : 'text-[#0F2942]/50 hover:bg-white hover:text-[#0F2942]'
      }`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!isCollapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
