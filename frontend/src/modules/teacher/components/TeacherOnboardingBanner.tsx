'use client';

import React from 'react';
import { Sparkles, ArrowRight, CheckCircle2, AlertCircle, UserCheck, Clock, Lock } from 'lucide-react';
import { TeacherProfile } from '../services/TeacherProfileService';

interface TeacherOnboardingBannerProps {
  teacher: TeacherProfile | null;
  hasProfile: boolean;
  hasProducts?: boolean;
  paymentAccountApproved?: boolean;
  paymentAccountStatus?: string | null;
  paymentAccountRejectionReason?: string | null;
  onStartOnboarding: () => void;
}

type TeacherProgressProfile = TeacherProfile & {
  hasProducts?: boolean;
  monitors?: unknown[];
};

export const TeacherOnboardingBanner: React.FC<TeacherOnboardingBannerProps> = ({
  teacher,
  hasProfile,
  hasProducts,
  paymentAccountApproved = false,
  paymentAccountStatus = null,
  paymentAccountRejectionReason = null,
  onStartOnboarding,
}) => {
  const progressTeacher = teacher as TeacherProgressProfile | null;
  const hasCreatedProducts = Boolean(
    hasProducts ||
    progressTeacher?.hasProducts ||
    (progressTeacher?.monitors && progressTeacher.monitors.length > 0)
  );

  // Checklist oficial de 4 passos do Professor:
  // 1. Completar Perfil
  // 2. Configurar Conta de Recebimento
  // 3. Perfil em Análise
  // 4. Criar Seu Produto
  const steps = [
    {
      title: 'Completar Perfil',
      done: hasProfile && Boolean(teacher?.username),
      statusText: hasProfile ? 'Perfil cadastrado' : 'Pendente',
    },
    {
      title: 'Conta de Recebimento',
      done: hasProfile && paymentAccountApproved,
      statusText: paymentAccountApproved
        ? 'Aprovada'
        : paymentAccountStatus === 'SUSPENDED'
        ? 'Suspensa'
        : paymentAccountStatus === 'REJECTED'
        ? 'Requer correção'
          : paymentAccountStatus
        ? 'Em análise'
        : 'Configuração pendente',
    },
    {
      title: 'Análise do Perfil',
      done: hasProfile && teacher?.status === 'active',
      inReview: hasProfile && teacher?.status === 'pending',
      statusText: teacher?.status === 'active' ? 'Aprovado' : hasProfile ? 'Em análise' : 'Aguardando envio',
    },
    {
      title: 'Criar Seu Produto',
      done: hasProfile && teacher?.status === 'active' && hasCreatedProducts,
      locked: !(hasProfile && teacher?.status === 'active' && paymentAccountApproved),
      statusText: hasCreatedProducts
        ? 'Produto criado'
        : teacher?.status === 'active' && paymentAccountApproved
        ? 'Liberado'
        : 'Bloqueado (Aguardando aprovação)',
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const progressPercentage = Math.round((completedCount / steps.length) * 100);

  if (hasProfile && teacher?.status === 'active' && hasCreatedProducts) {
    return null; // Oculta o banner quando tudo estiver 100% ativo e configurado
  }

  return (
    <div className="w-full bg-gradient-to-r from-[#132E20] via-[#1B3B2B] to-[#2E5B37] rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-white/10 relative overflow-hidden mb-8">
      {/* Background Subtle Pattern Overlay */}
      <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
        
        {/* Banner Details */}
        <div className="space-y-3 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/10 text-emerald-300 text-xs font-semibold backdrop-blur-md border border-white/15">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {!hasProfile
                ? 'Passo 1: Complete seu Perfil'
                : teacher?.status === 'pending'
                ? 'Perfil Enviado para Análise'
                : teacher?.status === 'active' && paymentAccountApproved
                ? 'Pronto! Crie seu Produto'
                : 'Aprovado! Configure seu Recebimento'}
            </span>
          </div>

          <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {!hasProfile
              ? 'Complete seu perfil para enviar para análise'
              : teacher?.status === 'pending'
              ? 'Seu perfil está em análise pela nossa equipe'
              : teacher?.status === 'active' && paymentAccountApproved
              ? 'Seu perfil foi aprovado! Crie seu primeiro produto'
              : paymentAccountStatus === 'REJECTED' || paymentAccountStatus === 'SUSPENDED'
              ? 'Regularize sua conta de recebimento'
              : 'Seu perfil foi aprovado! Configure seu recebimento'}
          </h2>

          <p className="text-slate-200 text-sm leading-relaxed">
            {!hasProfile
              ? 'Para começar a vender e criar seus assistentes IA de estudo, preencha seus dados de perfil e configure sua conta de recebimento. Seu perfil passará por análise antes da liberação total.'
              : teacher?.status === 'pending'
              ? 'Recebemos suas informações. Nossa equipe está analisando seu perfil. Assim que for aprovado, você poderá criar produtos e assistentes de estudo para seus alunos.'
              : teacher?.status === 'active' && paymentAccountApproved
              ? 'Parabéns! Seu perfil e sua conta de recebimento foram aprovados. Você já pode criar e publicar produtos.'
              : paymentAccountStatus === 'REJECTED' || paymentAccountStatus === 'SUSPENDED'
              ? paymentAccountRejectionReason || 'A conta de recebimento precisa ser regularizada para liberar seus produtos.'
              : 'Seu perfil foi aprovado. Configure e aguarde a aprovação da conta de recebimento para liberar seus produtos.'}
          </p>

          {/* Progress Bar */}
          <div className="pt-2 max-w-md">
            <div className="flex justify-between text-xs font-semibold mb-1 text-slate-300">
              <span>Progresso do Setup</span>
              <span>{progressPercentage}% Concluído</span>
            </div>
            <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-500 rounded-full"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Action Button & Checklist */}
        <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end justify-between gap-4 shrink-0">
          <button
            onClick={onStartOnboarding}
            className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-white text-[#132E20] hover:bg-emerald-50 font-bold text-sm shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center space-x-2 cursor-pointer"
          >
            <UserCheck className="w-4 h-4 text-[#2E5B37]" />
            <span>{!hasProfile ? 'Completar Perfil do Professor' : 'Editar Dados do Perfil'}</span>
            <ArrowRight className="w-4 h-4 text-[#132E20]" />
          </button>

          {/* Steps Checklist Summary */}
          <div className="w-full sm:w-auto bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-white/10 space-y-2 text-xs text-slate-200 shadow-inner">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 block mb-1">
              Checklist de Ativação
            </span>
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-center space-x-2.5">
                {step.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : step.inReview ? (
                  <Clock className="w-4 h-4 text-amber-300 shrink-0 animate-pulse" />
                ) : step.locked ? (
                  <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <div className="flex flex-col">
                  <span className={step.done ? 'text-slate-300 line-through opacity-80 font-medium' : 'font-bold text-white'}>
                    {idx + 1}. {step.title}
                  </span>
                  <span className="text-[9px] text-slate-400 font-medium">
                    {step.statusText}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
