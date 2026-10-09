'use client';
import { OptimizedImage } from '@/shared';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Bell,
  User,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronDown,
  LogOut,
  MessageSquareWarning,
  WalletCards,
} from 'lucide-react';
import { TeacherProfile, UserInfo } from '../services/TeacherProfileService';

interface TeacherHeaderProps {
  teacher: TeacherProfile | null;
  user?: UserInfo | null;
  hasProfile: boolean;
  onOpenOnboarding: () => void;
  reportedQuestions?: ReportedQuestionNotification[];
}

export interface ReportedQuestionNotification {
  monitorId: string;
  monitorName: string;
  questionId: string;
}

export const TeacherHeader: React.FC<TeacherHeaderProps> = ({
  teacher,
  user,
  hasProfile,
  onOpenOnboarding,
  reportedQuestions = [],
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // Exibe o nome real do professor (do perfil da tabela teachers ou da sessao/metadata de usuario)
  const displayName = teacher?.fullName || user?.fullName || 'Professor';
  const displayEmail = teacher?.email || user?.email || '';
  
  // Exibe o username se o cadastro na tabela teachers ja foi concluido, caso contrario exibe '-'
  const displayUsername = teacher?.username
    ? `@${teacher.username}`
    : teacher?.pageSlug
    ? `@${teacher.pageSlug}`
    : '-';

  // Fecha o menu suspenso ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('mm_teacher_profile');
      localStorage.removeItem('mm_user_info');
      localStorage.removeItem('mm_access_token');
      document.cookie = 'mm_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      router.push('/?login=true');
    }
  };

  return (
    <header className="w-full bg-[#0F2942] text-white border-b border-sky-950 sticky top-0 z-40 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
        
        {/* Brand Logo & Area */}
        <div className="flex items-center space-x-4">
          <Link href="/professor" className="flex items-center space-x-2.5 group">
            <Image
              src="/logoSemfundo.png"
              alt="MeuMonitor AI"
              width={36}
              height={36}
              className="w-9 h-9 object-contain group-hover:scale-105 transition-transform"
            />
            <div className="flex flex-col">
              <span className="font-heading text-lg font-bold tracking-tight flex items-center space-x-1">
                <span>MeuMonitor</span>
                <span className="text-sky-300 font-extrabold ml-0.5">AI</span>
              </span>
              <span className="text-[9px] font-semibold text-sky-400 -mt-1 tracking-wider uppercase">
                Painel do Professor
              </span>
            </div>
          </Link>

          {/* Status Badge */}
          <div className="hidden md:flex items-center">
            {hasProfile ? (
              teacher?.status === 'active' ? (
                <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Perfil Ativo</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Aguardando Aprovação</span>
                </span>
              )
            ) : (
              <button
                onClick={onOpenOnboarding}
                className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 transition-colors cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>Onboarding Incompleto</span>
              </button>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          
          {/* Notifications Icon */}
          <div className="relative">
            <button
              type="button"
              aria-label={reportedQuestions.length > 0 ? `${reportedQuestions.length} questão(ões) reportada(s)` : 'Notificações'}
              aria-expanded={isNotificationsOpen}
              onClick={() => setIsNotificationsOpen((current) => !current)}
              className={`relative rounded-xl p-2 transition-colors cursor-pointer ${reportedQuestions.length > 0 ? 'text-rose-300 hover:bg-rose-500/15 hover:text-rose-200' : 'text-slate-300 hover:bg-sky-950/60 hover:text-white'}`}
            >
              <Bell className="h-4 w-4" />
              <span className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${reportedQuestions.length > 0 ? 'bg-rose-400' : 'bg-emerald-500'}`} />
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white text-[#0F2942] shadow-2xl">
                <div className={`border-b px-4 py-3 ${reportedQuestions.length > 0 ? 'border-rose-100 bg-rose-50' : 'border-slate-100 bg-slate-50'}`}>
                  <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">Notificações</p>
                  <p className={`mt-1 text-sm font-bold ${reportedQuestions.length > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                    {reportedQuestions.length > 0 ? `${reportedQuestions.length} questão(ões) precisam de revisão` : 'Tudo em ordem por aqui'}
                  </p>
                </div>
                {reportedQuestions.length > 0 ? (
                  <div className="max-h-72 space-y-1 overflow-y-auto p-2">
                    {reportedQuestions.map((notification) => (
                      <button
                        key={`${notification.monitorId}-${notification.questionId}`}
                        type="button"
                        onClick={() => {
                          setIsNotificationsOpen(false);
                          router.push(`/professor/monitores/${notification.monitorId}?questionId=${encodeURIComponent(notification.questionId)}`);
                        }}
                        className="flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors hover:bg-rose-50"
                      >
                        <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                        <span>
                          <span className="block text-sm font-bold text-rose-800">Uma questão foi reportada</span>
                          <span className="mt-0.5 block text-xs text-slate-500">No monitor {notification.monitorName}. Clique para revisar.</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-5 text-sm text-slate-500">Nenhuma questão reportada.</p>
                )}
              </div>
            )}
          </div>

          {/* Expandable User Profile Dropdown */}
          <div className="relative border-l border-sky-900/60 pl-2" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex items-center space-x-2.5 p-1.5 rounded-xl hover:bg-sky-950/60 border border-transparent hover:border-sky-800/40 transition-all cursor-pointer group"
              aria-expanded={isMenuOpen}
            >
              {teacher?.avatarUrl ? (
                <OptimizedImage
                  src={teacher.avatarUrl}
                  alt={displayName}
                  className="w-8 h-8 rounded-full object-cover border border-[#0F2942]"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#0F2942] flex items-center justify-center text-xs font-bold text-white border border-sky-400/40 shadow-sm">
                  {displayName ? displayName.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
                </div>
              )}
              
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-semibold leading-tight text-white group-hover:text-sky-300 transition-colors">
                  {displayName}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  {displayUsername}
                </span>
              </div>

              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform duration-200 ${isMenuOpen ? 'rotate-180 text-sky-400' : ''}`} />
            </button>

            {/* Dropdown Menu Modal / Popup */}
            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-[#0F2942] border border-sky-800/80 rounded-2xl shadow-2xl overflow-hidden z-50 text-white animate-fadeIn">
                
                {/* User Header Summary */}
                <div className="p-4 bg-slate-900/60 border-b border-slate-800 flex items-center space-x-3">
                  {teacher?.avatarUrl ? (
                    <OptimizedImage
                      src={teacher.avatarUrl}
                      alt={displayName}
                      className="w-10 h-10 rounded-full object-cover border border-[#0F2942]"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#0F2942] flex items-center justify-center text-sm font-bold text-white border border-sky-400/40">
                      {displayName ? displayName.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold truncate text-white">
                      {displayName}
                    </span>
                    <span className="text-xs text-slate-400 truncate">
                      {displayEmail || displayUsername}
                    </span>
                    <div className="mt-1">
                      {hasProfile ? (
                        <span className="inline-block px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                          Perfil Ativo
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                          Cadastro Pendente
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Menu Options List */}
                <div className="p-2 space-y-1 text-xs font-semibold">
                  {hasProfile ? (
                    <>
                      <Link
                        href="/professor/conta"
                        onClick={() => setIsMenuOpen(false)}
                        className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 text-slate-200 hover:text-white transition-colors flex items-center space-x-2.5 cursor-pointer"
                      >
                        <WalletCards className="w-4 h-4 text-emerald-400" />
                        <span>Minha Conta</span>
                      </Link>
                      <Link
                        href="/professor/perfil"
                        onClick={() => setIsMenuOpen(false)}
                        className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 text-slate-200 hover:text-white transition-colors flex items-center space-x-2.5 cursor-pointer"
                      >
                        <User className="w-4 h-4 text-emerald-400" />
                        <span>Editar Perfil</span>
                      </Link>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenOnboarding();
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 text-slate-200 hover:text-white transition-colors flex items-center space-x-2.5 cursor-pointer"
                    >
                      <User className="w-4 h-4 text-emerald-400" />
                      <span>Completar Cadastro (Onboarding)</span>
                    </button>
                  )}

                  <div className="my-1 border-t border-slate-800" />

                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-rose-500/10 text-rose-300 hover:text-rose-200 transition-colors flex items-center space-x-2.5 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-rose-400" />
                    <span>Sair da Conta</span>
                  </button>
                </div>

              </div>
            )}
          </div>

        </div>

      </div>
    </header>
  );
};
