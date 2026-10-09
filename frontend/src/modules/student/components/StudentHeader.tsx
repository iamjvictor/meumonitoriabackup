'use client';
import { OptimizedImage } from '@/shared';

import Link from 'next/link';
import Image from 'next/image';
import { Bell, ChevronRight, ChevronDown, LogOut, User, CreditCard, ShieldCheck } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useStudent } from '../context/StudentContext';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface StudentHeaderProps {
  title?: string;
  breadcrumbs?: BreadcrumbItem[];
  showGreeting?: boolean;
}

export function StudentHeader({ title, breadcrumbs, showGreeting = false }: StudentHeaderProps) {
  const { student, logout } = useStudent();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isTeacher = student?.role && ['teacher', 'professor', 'admin'].includes(student.role.toLowerCase());

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formattedDate = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date());

  const capitalizedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

  return (
    <header className="flex items-center justify-between border-b border-[#0F2942]/10 pb-5">
      {/* Mobile Logo */}
      <div className="flex items-center gap-3 lg:hidden">
        <Image src="/logoSemfundo.png" alt="MeuMonitor AI" width={36} height={36} className="h-9 w-9 object-contain" />
        <span className="font-heading text-base font-bold">
          MeuMonitor <span className="text-[#2E5B37]">AI</span>
        </span>
      </div>

      {/* Desktop Left Info: Greeting or Breadcrumb Header */}
      <div className="hidden lg:block">
        {showGreeting ? (
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#2E5B37]">
                {capitalizedDate}
              </p>
              {isTeacher && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-900 border border-amber-500/30">
                  <ShieldCheck className="h-3 w-3 text-amber-700" /> Modo Professor
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-[#0F2942]/55">
              Um passo de cada vez, {student?.firstName || 'estudante'}.
            </p>
          </div>
        ) : (
          <div>
            {breadcrumbs && breadcrumbs.length > 0 && (
              <div className="flex items-center gap-2 text-xs font-bold text-[#2E5B37]">
                {breadcrumbs.map((item, index) => {
                  const isLast = index === breadcrumbs.length - 1;
                  return (
                    <span key={item.label} className="flex items-center gap-2">
                      {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-[#0F2942]/30" />}
                      {item.href && !isLast ? (
                        <Link href={item.href} className="hover:underline">
                          {item.label}
                        </Link>
                      ) : (
                        <span className={isLast ? 'text-[#0F2942]' : ''}>{item.label}</span>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
            {title && (
              <div className="flex items-center gap-3">
                <h1 className="mt-1 font-heading text-2xl font-bold tracking-[-0.03em] text-[#0F2942]">
                  {title}
                </h1>
                {isTeacher && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-900 border border-amber-500/30">
                    <ShieldCheck className="h-3 w-3 text-amber-700" /> Modo Professor
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Header Right Tools: Notifications & Expandable User Pill */}
      <div className="ml-auto flex items-center gap-3">
        {isTeacher && (
          <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-extrabold text-amber-900 border border-amber-500/30 shadow-2xs">
            <ShieldCheck className="h-3.5 w-3.5 text-amber-700" />
            <span>Modo Professor (Teste)</span>
          </div>
        )}
        <button
          aria-label="Notificações"
          className="relative min-h-11 min-w-11 rounded-xl p-2.5 text-[#0F2942]/60 transition hover:bg-white hover:text-[#2E5B37]"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#C56A43] ring-2 ring-[#F5F1E8]" />
        </button>

        {/* Expandable User Profile Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setShowMenu((prev) => !prev)}
            aria-expanded={showMenu}
            className="flex min-h-11 items-center gap-2.5 border-l border-[#0F2942]/10 pl-3 py-1 text-left group transition hover:opacity-85"
          >
            {student?.avatarUrl ? (
              <OptimizedImage
                src={student.avatarUrl}
                alt={student.fullName || 'Foto do perfil'}
                className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-[#2E5B37]/30 group-hover:ring-[#2E5B37]/60 transition"
              />
            ) : (
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-heading text-sm font-bold ring-2 transition ${
                isTeacher
                  ? 'bg-amber-600 text-white ring-amber-500/40 group-hover:ring-amber-500/60 shadow-xs'
                  : 'bg-[#2E5B37]/10 text-[#2E5B37] ring-[#2E5B37]/20 group-hover:ring-[#2E5B37]/40'
              }`}>
                {student?.initials || 'ST'}
              </div>
            )}
            <div className="hidden sm:block min-w-0 max-w-[140px]">
              <p className="truncate text-xs font-bold text-[#0F2942] group-hover:text-[#2E5B37] transition-colors">
                {student?.fullName || student?.email || 'Estudante'}
              </p>
              {isTeacher ? (
                <span className="inline-block rounded-md bg-amber-100 px-1.5 py-0.2 text-[9px] font-extrabold uppercase tracking-wider text-amber-900 border border-amber-300">
                  Professor
                </span>
              ) : (
                <p className="text-[10px] font-medium text-[#0F2942]/45">Estudante</p>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-[#0F2942]/40 transition-transform duration-200 group-hover:text-[#0F2942]/70 ${showMenu ? 'rotate-180 text-[#2E5B37]' : ''}`} />
          </button>

          {showMenu && (
            <div className="absolute right-0 mt-2.5 w-60 rounded-2xl border border-[#0F2942]/08 bg-white p-2 shadow-[0_16px_36px_rgba(15,41,66,0.12)] z-50 animate-fade-in">
              {/* Profile Card Header in Dropdown */}
              <div className="flex items-center gap-3 rounded-xl bg-[#F5F1E8]/70 p-2.5 mb-1.5 border border-[#0F2942]/05">
                {student?.avatarUrl ? (
                  <OptimizedImage
                    src={student.avatarUrl}
                    alt={student.fullName || 'Foto do perfil'}
                    className="h-9 w-9 shrink-0 rounded-full object-cover shadow-sm ring-1 ring-[#0F2942]/10"
                  />
                ) : (
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-heading text-xs font-bold text-white shadow-sm ${
                    isTeacher ? 'bg-amber-600' : 'bg-[#2E5B37]'
                  }`}>
                    {student?.initials || 'ST'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="truncate text-xs font-bold text-[#0F2942]">
                      {student?.fullName || 'Estudante'}
                    </p>
                    {isTeacher && (
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[8px] font-extrabold uppercase text-amber-900 border border-amber-300">
                        Professor
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[10px] text-[#0F2942]/50">{student?.email}</p>
                </div>
              </div>

              {/* Navigation Options */}
              <div className="space-y-0.5 py-1">
                <Link
                  href="/areadoaluno/perfil"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-[#0F2942]/80 transition hover:bg-[#2E5B37]/08 hover:text-[#2E5B37]"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2E5B37]/10 text-[#2E5B37]">
                    <User className="h-4 w-4" />
                  </div>
                  Meu perfil
                </Link>

                <Link
                  href="/areadoaluno/planos"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-[#0F2942]/80 transition hover:bg-[#2E5B37]/08 hover:text-[#2E5B37]"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2E5B37]/10 text-[#2E5B37]">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  Meus planos
                </Link>

                {student?.role && ['teacher', 'professor', 'admin'].includes(student.role.toLowerCase()) && (
                  <Link
                    href="/professor"
                    onClick={() => setShowMenu(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-[#0F2942]/80 transition hover:bg-[#2E5B37]/08 hover:text-[#2E5B37]"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0F2942]/10 text-[#0F2942]">
                      <User className="h-4 w-4" />
                    </div>
                    Painel do Professor
                  </Link>
                )}
              </div>

              {/* Logout Option */}
              <div className="mt-1 pt-1 border-t border-[#0F2942]/08">
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100/60 text-rose-600">
                    <LogOut className="h-4 w-4" />
                  </div>
                  Sair da conta
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
