'use client';
/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any -- controller legado preservado durante a migração arquitetural. */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  Users,
  Bot,
  FileText,
  DollarSign,
  ArrowRight,
  ExternalLink,
  HelpCircle,
  Globe,
  Lock,
  Clock,
  CheckCircle2,
  Plus,
  Loader2,
  Copy,
  Check,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  UserMinus,
  Trophy,
  Crown,
  Medal,
  Star,
} from 'lucide-react';
import { TeacherProfile } from '../services/TeacherProfileService';
import type { MonitorDraft } from './TeacherMonitorCreationModal';
import { TeacherMonitorService, TeacherMonitor } from '../services/TeacherMonitorService';
import { TeacherSessionError } from '../services/TeacherSessionError';
import { TeacherOnboardingBanner } from './TeacherOnboardingBanner';
import type { ReportedQuestionNotification } from './TeacherHeader';
import { OptimizedImage } from '@/shared';

import { TeacherMonitorRankingView } from './TeacherMonitorRankingView';
import { TeacherPaymentAccountPanel } from './TeacherPaymentAccountPanel';
import type { PaymentAccount } from '../services/TeacherPaymentAccountService';
import { TeacherStudentService, type TeacherStudentSubscription } from '../services/TeacherStudentService';
import { calculateTeacherDashboardMetrics } from '../utils/dashboard-metrics';

const TeacherMonitorCreationModal = dynamic(
  () => import('./TeacherMonitorCreationModal').then((module) => module.TeacherMonitorCreationModal),
  { ssr: false, loading: () => null }
);

interface TeacherDashboardOverviewProps {
  teacher: TeacherProfile | null;
  hasProfile: boolean;
  onOpenOnboarding: () => void;
  onReportedQuestionsChange?: (notifications: ReportedQuestionNotification[]) => void;
}

export const TeacherDashboardOverview: React.FC<TeacherDashboardOverviewProps> = ({
  teacher,
  hasProfile,
  onOpenOnboarding,
  onReportedQuestionsChange,
}) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'materials' | 'students' | 'ranking' | 'page'>('overview');
  const [isMonitorCreationOpen, setIsMonitorCreationOpen] = useState(false);
  const [monitors, setMonitors] = useState<TeacherMonitor[]>([]);
  const [loadingMonitors, setLoadingMonitors] = useState<boolean>(true);
  const [monitorLoadError, setMonitorLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paymentAccount, setPaymentAccount] = useState<PaymentAccount | null>(null);
  const [paymentAccountLoaded, setPaymentAccountLoaded] = useState(false);
  const [isPaymentAccountFormOpen, setIsPaymentAccountFormOpen] = useState(false);
  const [studentSubscriptions, setStudentSubscriptions] = useState<TeacherStudentSubscription[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentLoadError, setStudentLoadError] = useState<string | null>(null);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  const publicUrl = `${baseUrl}/p/${teacher?.pageSlug || teacher?.username || 'prof-demo'}`;
  const isProfileActive = teacher?.status === 'active';
  const isPaymentAccountEligible = Boolean(
    paymentAccount
      && paymentAccount.status.toUpperCase() !== 'SUSPENDED'
      && (paymentAccount.status.toUpperCase() === 'APPROVED' || paymentAccount.generalStatus?.toUpperCase() === 'APPROVED'),
  );
  const paymentAccountStatus = paymentAccount?.status.toUpperCase() ?? null;
  const paymentAccountNeedsCorrection = paymentAccountStatus === 'REJECTED' || paymentAccountStatus === 'SUSPENDED';
  const canCreateProducts = isProfileActive && isPaymentAccountEligible;

  const focusPaymentAccount = useCallback(() => {
    document.getElementById('teacher-payment-account')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const openPaymentAccountFlow = useCallback(() => {
    setIsPaymentAccountFormOpen(true);
    focusPaymentAccount();
  }, [focusPaymentAccount]);

  const openMonitorCreation = useCallback(() => {
    if (canCreateProducts) setIsMonitorCreationOpen(true);
    else focusPaymentAccount();
  }, [canCreateProducts, focusPaymentAccount]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMonitorCreated = async (monitor: MonitorDraft) => {
    try {
      const savedMonitor = await TeacherMonitorService.createDraft(monitor);
      setMonitors((current) => [savedMonitor, ...current.filter((item) => item.id !== savedMonitor.id)]);
      router.push(`/professor/monitores/${savedMonitor.id}`);
    } catch (err) {
      if (err instanceof TeacherSessionError) {
        router.replace('/?login=true&perfil=professor&session=expired');
        return;
      }
      throw err;
    }
  };

  useEffect(() => {
    if (!isProfileActive) {
      setMonitors([]);
      onReportedQuestionsChange?.([]);
      setLoadingMonitors(false);
      return;
    }

    let isCurrent = true;
    setLoadingMonitors(true);
    setMonitorLoadError(null);
    TeacherMonitorService.listMine()
      .then((result) => {
        if (isCurrent) {
          setMonitors(result);
          onReportedQuestionsChange?.(result.flatMap((monitor) => monitor.reportedQuestionIds.map((questionId) => ({ monitorId: monitor.id, monitorName: monitor.name, questionId }))));
        }
      })
      .catch((error) => {
        if (error instanceof TeacherSessionError) {
          router.replace('/?login=true&perfil=professor&session=expired');
          return;
        }
        console.warn('Não foi possível carregar os Monitores de IA:', error);
        if (isCurrent) setMonitorLoadError(error instanceof Error ? error.message : 'Não foi possível carregar os monitores.');
      })
      .finally(() => {
        if (isCurrent) setLoadingMonitors(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [isProfileActive, onReportedQuestionsChange, router]);

  useEffect(() => {
    if (!isProfileActive) {
      setStudentSubscriptions([]);
      setStudentLoadError(null);
      setLoadingStudents(false);
      return;
    }

    let isCurrent = true;
    setLoadingStudents(true);
    setStudentLoadError(null);
    TeacherStudentService.listMine()
      .then((result) => {
        if (isCurrent) setStudentSubscriptions(result);
      })
      .catch((error) => {
        if (error instanceof TeacherSessionError) {
          router.replace('/?login=true&perfil=professor&session=expired');
          return;
        }
        if (isCurrent) setStudentLoadError(error instanceof Error ? error.message : 'Não foi possível carregar os alunos.');
      })
      .finally(() => {
        if (isCurrent) setLoadingStudents(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [isProfileActive, router]);

  const publishedCount = monitors.filter((m) => m.status === 'PUBLISHED').length;
  const hasPublishedAgent = publishedCount > 0;
  const draftCount = monitors.filter((m) => m.status === 'DRAFT' || !m.status).length;
  const hasCreatedProducts = monitors.length > 0 || Boolean((teacher as any)?.hasProducts);
  const {
    activeStudentCount,
    activeSubscriptionsCount,
    activeMonthlyPayoutCents,
    monthlyRevenueCents,
    monthlyCancellationsCount,
    materialsCount,
  } = calculateTeacherDashboardMetrics(studentSubscriptions, monitors);
  const formatCurrency = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  const formatDate = (date: string | null | undefined) => date ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date)) : '—';

  const renderStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'PUBLISHED':
        return (
          <span className="border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 rounded">
            PUBLICADO
          </span>
        );
      case 'READY_TO_PUBLISH':
        return (
          <span className="border border-sky-300 bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-800 rounded">
            PRONTO PARA PUBLICAR
          </span>
        );
      case 'PAUSED':
        return (
          <span className="border border-slate-300 bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700 rounded">
            PAUSADO
          </span>
        );
      default:
        return (
          <span className="border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800 rounded">
            RASCUNHO
          </span>
        );
    }
  };

  // KPI Metrics
  const metrics: Array<{
    title: string;
    value: React.ReactNode;
    change: string;
    icon: React.ElementType;
    color: string;
  }> = [
    {
      title: 'Alunos Ativos',
      value: loadingStudents ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : String(activeStudentCount),
      change: loadingStudents ? 'Carregando alunos...' : `${studentSubscriptions.length} assinatura${studentSubscriptions.length === 1 ? '' : 's'} ativa${studentSubscriptions.length === 1 ? '' : 's'}`,
      icon: Users,
      color: 'bg-emerald-500/10 text-emerald-600 border-emerald-200',
    },
    {
      title: 'Agentes de Estudo',
      value: loadingMonitors ? (
        <span className="inline-flex items-center gap-1.5 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-[#132E20]" />
        </span>
      ) : (
        `${monitors.length} / 3`
      ),
      change: loadingMonitors
        ? 'Carregando monitores...'
        : publishedCount > 0
        ? `${publishedCount} publicado${publishedCount === 1 ? '' : 's'}${draftCount > 0 ? `, ${draftCount} rascunho` : ''}`
        : monitors.length > 0
        ? `${monitors.length} ${monitors.length === 1 ? 'rascunho criado' : 'rascunhos criados'}`
        : 'Prontos para criar',
      icon: Bot,
      color: 'bg-[#132E20]/10 text-[#132E20] border-[#132E20]/20',
    },
    {
      title: 'Materiais & Questões',
      value: loadingMonitors ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : String(materialsCount),
      change: 'Itens de estudo publicados',
      icon: FileText,
      color: 'bg-indigo-500/10 text-indigo-600 border-indigo-200',
    },
    {
      title: 'Repasse Mensal Est.',
      value: loadingStudents ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : formatCurrency(activeMonthlyPayoutCents),
      change: loadingStudents ? 'Carregando...' : 'Previsão de repasse das assinaturas ativas',
      icon: DollarSign,
      color: 'bg-[#2E5B37]/10 text-[#2E5B37] border-[#2E5B37]/20',
    },
  ];

  // 4 Etapas Oficiais do Professor
  const setupModules = [
    {
      step: '01',
      title: 'Completar Perfil do Professor',
      description: 'Preencha suas informações pessoais, foto, username e biografia profissional para divulgar sua marca.',
      status: hasProfile ? 'Concluído' : 'Pendente',
      isCompleted: hasProfile,
      actionText: hasProfile ? 'Editar Perfil' : 'Completar Perfil',
      onClick: onOpenOnboarding,
    },
    {
      step: '02',
      title: 'Configurar Conta de Recebimento',
      description: paymentAccountNeedsCorrection
        ? paymentAccount?.rejectionReason || 'A conta precisa ser regularizada antes de liberar seus produtos.'
        : 'Cadastre sua conta de recebimento no Asaas e aguarde a aprovação para liberar a criação e publicação dos produtos.',
      status: isPaymentAccountEligible ? 'Aprovado' : paymentAccountNeedsCorrection ? (paymentAccountStatus === 'SUSPENDED' ? 'Suspenso' : 'Requer correção') : paymentAccount ? 'Em Análise' : 'Pendente',
      isCompleted: isPaymentAccountEligible,
      inReview: Boolean(paymentAccount) && !isPaymentAccountEligible,
      actionText: isPaymentAccountEligible ? 'Ver Recebimento' : 'Configurar Recebimento',
      onClick: openPaymentAccountFlow,
    },
    {
      step: '03',
      title: 'Análise e Aprovação do Perfil',
      description: 'Após preencher o perfil, nossa equipe faz a verificação dos dados para aprovar sua conta na plataforma.',
      status: teacher?.status === 'active' ? 'Perfil Aprovado' : hasProfile ? 'Em Análise' : 'Aguardando Perfil',
      isCompleted: teacher?.status === 'active',
      inReview: hasProfile && teacher?.status === 'pending',
      actionText: teacher?.status === 'active' ? 'Status: Aprovado' : 'Aguardando Aprovação',
      disabled: true,
    },
    {
      step: '04',
      title: 'Criar Seu Produto & Assistente IA',
      description: 'Após o perfil ser aprovado e a conta de recebimento ser aprovada pelo Asaas, crie seus assistentes inteligentes de estudo.',
      status: canCreateProducts ? (hasCreatedProducts ? 'Concluído' : 'Liberado para Criar') : 'Bloqueado',
      isCompleted: canCreateProducts && hasCreatedProducts,
      isLocked: !canCreateProducts,
      actionText: canCreateProducts ? (hasCreatedProducts ? 'Ver Produtos' : 'Criar Novo Produto') : 'Bloqueado',
      onClick: openMonitorCreation,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Banner Superior: Enquanto carrega exibe Skeleton/Loading. Quando carregar: se NÃO tiver agente publicado, exibe Onboarding Banner. Se TIVER ao menos 1 publicado, exibe o Banner com Link da Página Pública + Bônus 50% */}
      {loadingMonitors ? (
        <div className="w-full bg-gradient-to-r from-[#132E20] via-[#1B3B2B] to-[#2E5B37] rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-white/10 relative overflow-hidden mb-8 min-h-[160px] flex items-center justify-center animate-pulse">
          <div className="flex items-center space-x-3 text-emerald-200/90 font-medium text-sm">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
            <span>Carregando informações do seu painel...</span>
          </div>
        </div>
      ) : monitorLoadError ? (
        <div className="w-full rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm font-semibold text-amber-900 shadow-sm">{monitorLoadError} Você ainda pode configurar sua conta de recebimento.</div>
      ) : !hasPublishedAgent ? (
        <TeacherOnboardingBanner
          teacher={teacher}
          hasProfile={hasProfile}
          hasProducts={monitors.length > 0}
          paymentAccountApproved={isPaymentAccountEligible}
          paymentAccountStatus={paymentAccountStatus}
          paymentAccountRejectionReason={paymentAccount?.rejectionReason ?? null}
          onStartOnboarding={onOpenOnboarding}
        />
      ) : (
        <div className="w-full bg-gradient-to-br from-[#0A1D30] via-[#0F2942] to-[#18395B] rounded-3xl p-6 sm:p-8 text-white shadow-2xl border border-[#2E5B37]/40 relative overflow-hidden mb-8 group animate-fadeIn">
          {/* Background Glow */}
          <div className="absolute -right-16 -top-16 w-80 h-80 bg-[#2E5B37]/20 rounded-full blur-3xl group-hover:bg-[#2E5B37]/30 transition-all duration-700 pointer-events-none" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 items-center relative z-10">
            
            {/* Esquerda: Banner Página Pública */}
            <div className="lg:col-span-7 space-y-5">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-[#2E5B37]/20 border border-[#2E5B37]/40 flex items-center justify-center text-[#52B76D] shadow-inner">
                  <Globe className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-extrabold tracking-wider px-3 py-1 rounded-full bg-[#2E5B37]/30 text-white border border-[#2E5B37]/50 uppercase flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#52B76D] animate-ping" />
                  <span>PÁGINA ATIVA</span>
                </span>
              </div>

              <div className="space-y-1.5">
                <h2 className="text-white font-heading text-2xl sm:text-3xl font-bold tracking-tight">
                  Sua Página Pública
                </h2>
                <p className="text-sm text-slate-200 font-medium leading-relaxed max-w-xl">
                  A vitrine onde alunos encontram seus assistentes de estudo e assinam seus planos.
                </p>
              </div>

              {/* URL Input Box & Copy Action */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                <div className="flex-1 p-1 bg-[#071624]/90 rounded-2xl border border-[#2E5B37]/40 flex items-center justify-between group/link focus-within:border-[#52B76D]/60 transition-all shadow-inner">
                  <span className="px-3.5 py-2 font-mono text-xs text-slate-200 truncate select-all">
                    {publicUrl.replace('http://', '').replace('https://', '')}
                  </span>
                  
                  <button
                    onClick={handleCopyLink}
                    className={`min-h-11 px-3.5 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs font-bold shrink-0 ${
                      copied
                        ? 'bg-[#2E5B37] text-white scale-95 font-extrabold shadow-sm'
                        : 'bg-[#2E5B37]/30 hover:bg-[#2E5B37]/50 text-white border border-[#2E5B37]/50'
                    }`}
                    title="Copiar Link da Página"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 stroke-[3px]" />
                        <span className="text-[10px] uppercase font-bold tracking-wider">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span className="text-xs">Copiar</span>
                      </>
                    )}
                  </button>
                </div>

                <Link
                  href={publicUrl}
                  target="_blank"
                  className="px-6 py-3.5 rounded-2xl bg-[#2E5B37] hover:bg-[#23472B] text-white font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-lg shadow-[#2E5B37]/30 hover:shadow-xl hover:shadow-[#2E5B37]/40 active:scale-[0.98] shrink-0 border border-[#2E5B37]/40"
                >
                  <span className="whitespace-nowrap font-bold">Acessar Minha Página</span>
                  <ExternalLink className="w-4 h-4 stroke-[2.5px]" />
                </Link>
              </div>
            </div>

            {/* Direita Superior: Card de Comissão (50%) & Indicação (1%) */}
            <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-[#2E5B37]/30 pt-6 lg:pt-0 lg:pl-8 flex flex-col justify-center">
              <div className="bg-[#071624]/90 border border-[#2E5B37]/40 rounded-2xl p-5 space-y-4 shadow-inner relative overflow-hidden">
                
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white">
                    <span>Taxa por Venda</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-y-2 gap-x-3.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-4xl sm:text-5xl font-extrabold text-[#52B76D] font-heading tracking-tight">
                      50%
                    </span>
                    <div 
                      className="inline-flex items-center justify-center p-1.5 rounded-full bg-[#2E5B37]/40 text-[#52B76D] border border-[#2E5B37]/60 shadow-[0_0_12px_rgba(82,183,109,0.35)]"
                      title="Comissão por Venda"
                    >
                      <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5px]" />
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 text-left">
                    <div className="flex flex-col">
                      <span className="text-xs font-extrabold text-white uppercase tracking-wider whitespace-nowrap">
                        Sua Comissão
                      </span>
                      <span className="text-[11px] text-slate-400 whitespace-nowrap">
                        50% por venda direta
                      </span>
                    </div>
                    <span className="text-[#2E5B37] font-semibold text-lg select-none" aria-hidden="true">|</span>
                    <div className="flex flex-col">
                      <span className="text-xs font-extrabold text-[#52B76D] uppercase tracking-wider whitespace-nowrap">
                        Comissão por Indicação
                      </span>
                      <span className="text-[11px] text-slate-400 whitespace-nowrap">
                        1% sobre vendas do indicado
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

      {isProfileActive && paymentAccountLoaded && !isPaymentAccountEligible && (
        <section className={`flex flex-col gap-4 rounded-2xl border p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between ${paymentAccountNeedsCorrection ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${paymentAccountNeedsCorrection ? 'text-rose-600' : 'text-amber-600'}`} />
            <div>
              <h2 className={`text-sm font-extrabold ${paymentAccountNeedsCorrection ? 'text-rose-900' : 'text-amber-900'}`}>
                {paymentAccount ? (paymentAccountStatus === 'SUSPENDED' ? 'Repasses suspensos' : paymentAccountStatus === 'REJECTED' ? 'Repasses desabilitados: ajuste sua conta' : 'Repasses aguardando aprovação') : 'Repasses desabilitados'}
              </h2>
              <p className={`mt-1 text-xs leading-5 ${paymentAccountNeedsCorrection ? 'text-rose-800' : 'text-amber-800'}`}>
                {paymentAccount?.rejectionReason || (paymentAccount ? 'Confirme o cadastro pelo e-mail enviado pelo Asaas. As novas vendas serão liberadas após a aprovação.' : 'Configure uma conta de recebimento no Asaas para habilitar seus repasses.')}
              </p>
            </div>
          </div>
          <Link href={paymentAccount?.onboardingUrl || '/professor/conta'} target={paymentAccount?.onboardingUrl ? '_blank' : undefined} rel={paymentAccount?.onboardingUrl ? 'noreferrer' : undefined} className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold text-white transition ${paymentAccountNeedsCorrection ? 'bg-rose-700 hover:bg-rose-800' : 'bg-[#132E20] hover:bg-[#23472B]'}`}>
            <span>{paymentAccount?.onboardingUrl ? 'Acessar conta de recebimento Asaas' : paymentAccount ? 'Ver conta Asaas' : 'Configurar conta Asaas'}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      )}

      {isProfileActive && paymentAccountLoaded && isPaymentAccountEligible && (
        <section className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-emerald-900">Conta de recebimento Asaas</h2>
            <p className="mt-1 text-xs text-emerald-800">Sua conta está aprovada para receber os repasses.</p>
          </div>
          <Link href={paymentAccount?.onboardingUrl || '/professor/conta'} target={paymentAccount?.onboardingUrl ? '_blank' : undefined} rel={paymentAccount?.onboardingUrl ? 'noreferrer' : undefined} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800">
            Acessar conta de recebimento Asaas
            <ExternalLink className="h-4 w-4" />
          </Link>
        </section>
      )}

      {hasProfile && !isPaymentAccountEligible && (
        <div id="teacher-payment-account">
          <TeacherPaymentAccountPanel
            teacher={teacher}
            onAccountChange={setPaymentAccount}
            onAccountLoaded={() => setPaymentAccountLoaded(true)}
            isFormOpen={isPaymentAccountFormOpen}
            onFormOpenChange={setIsPaymentAccountFormOpen}
            onSessionExpired={() => router.replace('/?login=true&perfil=professor&session=expired')}
          />
        </div>
      )}

      {/* Navigation Tabs Header */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`min-h-11 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-[#132E20] text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Visão Geral
        </button>
        <button
          onClick={() => setActiveTab('agents')}
          className={`min-h-11 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'agents'
              ? 'bg-[#132E20] text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Agentes & IA
        </button>
        <button
          onClick={() => setActiveTab('materials')}
          className={`min-h-11 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'materials'
              ? 'bg-[#132E20] text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Materiais & Questões
        </button>
        <button
          onClick={() => setActiveTab('students')}
          className={`min-h-11 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'students'
              ? 'bg-[#132E20] text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Alunos & Assinaturas
        </button>
        <button
          onClick={() => setActiveTab('ranking')}
          className={`min-h-11 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
            activeTab === 'ranking'
              ? 'bg-[#132E20] text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Trophy className={`w-3.5 h-3.5 ${activeTab === 'ranking' ? 'text-amber-300' : 'text-amber-500'}`} />
          <span>Meu Ranking</span>
        </button>
      </div>

      {activeTab === 'students' ? (
        <section className="space-y-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-heading text-xl font-bold text-[#132E20]">Alunos & Assinaturas</h2>
              <p className="text-xs text-slate-500">Alunos vinculados aos seus monitores e situação das assinaturas.</p>
            </div>
            <span className="text-xs font-bold text-[#2E5B37]">{activeStudentCount} aluno{activeStudentCount === 1 ? '' : 's'} ativo{activeStudentCount === 1 ? '' : 's'}</span>
          </div>

          {/* KPI Cards: Repasse Mensal Ativo, Número de Alunos, Cancelamentos do Mês */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Repasse Mensal Ativo
                </span>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-500/10 p-2.5 text-emerald-700">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="font-heading text-2xl font-bold text-[#132E20]">
                  {loadingStudents ? (
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  ) : (
                    formatCurrency(activeMonthlyPayoutCents)
                  )}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {loadingStudents ? 'Carregando...' : 'Previsão de repasse das assinaturas ativas'}
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Número de Alunos
                </span>
                <div className="rounded-2xl border border-[#132E20]/20 bg-[#132E20]/10 p-2.5 text-[#132E20]">
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="font-heading text-2xl font-bold text-[#132E20]">
                  {loadingStudents ? (
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  ) : (
                    activeStudentCount
                  )}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {loadingStudents
                    ? 'Carregando...'
                    : `${activeSubscriptionsCount} assinatura${activeSubscriptionsCount === 1 ? '' : 's'} ativa${activeSubscriptionsCount === 1 ? '' : 's'}`}
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Cancelamentos do Mês
                </span>
                <div className="rounded-2xl border border-amber-200 bg-amber-500/10 p-2.5 text-amber-700">
                  <UserMinus className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="font-heading text-2xl font-bold text-[#132E20]">
                  {loadingStudents ? (
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  ) : (
                    monthlyCancellationsCount
                  )}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {loadingStudents
                    ? 'Carregando...'
                    : monthlyCancellationsCount === 0
                    ? 'Nenhum cancelamento neste mês'
                    : `${monthlyCancellationsCount} cancelamento${monthlyCancellationsCount === 1 ? '' : 's'} neste mês`}
                </p>
              </div>
            </div>
          </div>

          {loadingStudents ? (
            <div className="flex min-h-48 items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500 shadow-sm">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando alunos e assinaturas...
            </div>
          ) : studentLoadError ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-800">{studentLoadError}</div>
          ) : studentSubscriptions.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
              <Users className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-3 text-sm font-bold text-[#132E20]">Nenhum aluno com assinatura ativa</h3>
              <p className="mt-1 text-xs text-slate-500">Quando um aluno contratar um monitor seu, ele aparecerá nesta lista.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-[#F8F5EE] text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-4">Aluno</th>
                      <th className="px-5 py-4">Monitor</th>
                      <th className="px-5 py-4">Repasse estimado</th>
                      <th className="px-5 py-4">Recebido</th>
                      <th className="px-5 py-4">Próxima cobrança</th>
                      <th className="px-5 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {studentSubscriptions.map((subscription, index) => (
                      <tr key={subscription.id || `${subscription.subscriptionId || ''}-${subscription.studentId}-${subscription.monitorId}-${index}`} className="hover:bg-[#F8F5EE]/60">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {subscription.avatarUrl ? (
                              <OptimizedImage src={subscription.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                            ) : (
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-800">{subscription.fullName.slice(0, 1).toUpperCase()}</div>
                            )}
                            <div>
                              <p className="font-bold text-[#132E20]">{subscription.fullName}</p>
                              <p className="text-[11px] text-slate-500">{subscription.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 font-semibold text-[#132E20]">{subscription.monitorName}</td>
                        <td className="px-5 py-4 font-bold text-[#2E5B37]">{formatCurrency(subscription.expectedTeacherCents ?? 0)} <span className="font-normal text-slate-400">({subscription.teacherPercentageSnapshot ?? 0}%)</span></td>
                        <td className="px-5 py-4 font-semibold text-slate-700">{formatCurrency(subscription.settledTeacherCents ?? 0)}</td>
                        <td className="px-5 py-4 text-slate-600">{formatDate(subscription.nextDueDate || subscription.currentPeriodEnd)}</td>
                        <td className="px-5 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${subscription.itemStatus === 'CANCEL_PENDING' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{subscription.itemStatus === 'CANCEL_PENDING' ? 'Acesso até a data' : 'Ativa'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      ) : activeTab === 'ranking' ? (
        <TeacherMonitorRankingView
          monitors={monitors}
          onCreateMonitor={openMonitorCreation}
        />
      ) : (
        <>
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {metrics.map((metric, idx) => {
              const Icon = metric.icon;
              return (
                <div
                  key={idx}
                  className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {metric.title}
                    </span>
                    <div className={`p-2.5 rounded-2xl border ${metric.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <h3 className="font-heading text-2xl font-bold text-[#132E20]">
                      {metric.value}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">{metric.change}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Main Grid: Setup Modules & Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Activation Roadmap / Product Creation */}
            <div className="lg:col-span-2">
              {isProfileActive ? (
                loadingMonitors ? (
                  <div className="flex flex-col items-center justify-center p-12 bg-white border border-slate-200 rounded-3xl shadow-xs space-y-3 min-h-56">
                    <Loader2 className="w-8 h-8 text-[#132E20] animate-spin" />
                    <span className="text-xs font-semibold text-slate-600">Carregando seus Monitores de IA...</span>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {monitors.map((monitor) => (
                      <button
                        key={monitor.id}
                        type="button"
                        onClick={() => router.push(`/professor/monitores/${monitor.id}`)}
                        className="min-h-56 border border-slate-200 bg-white p-5 text-left shadow-sm transition-colors hover:border-emerald-700 hover:bg-emerald-50/30"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className={`relative flex h-10 w-10 items-center justify-center ${monitor.hasReportedQuestions ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'}`}>
                            <Bot className="h-5 w-5" aria-hidden="true" />
                            {monitor.hasReportedQuestions && (
                              <AlertTriangle className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-white text-rose-600" aria-label="Possui questão reportada" />
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {monitor.hasReportedQuestions && (
                              <span className="border border-rose-300 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700 rounded">REVISAR</span>
                            )}
                            {renderStatusBadge(monitor.status)}
                          </div>
                        </div>
                        <h2 className="mt-6 font-heading text-lg font-bold text-[#132E20]">{monitor.name}</h2>
                        <p className="mt-2 text-sm text-slate-600">
                          {monitor.subjects.length} {monitor.subjects.length === 1 ? 'matéria' : 'matérias'} estruturadas
                        </p>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={openMonitorCreation}
                      disabled={!canCreateProducts}
                      className={`group flex min-h-56 w-full flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-300 bg-white text-slate-500 shadow-sm transition-all ${canCreateProducts ? 'cursor-pointer hover:border-[#2E5B37] hover:bg-emerald-50/40 hover:text-[#132E20]' : 'cursor-not-allowed opacity-60'}`}
                      title={canCreateProducts ? 'Criar novo Monitor de IA' : 'Aguarde a aprovação do perfil e da conta de recebimento'}
                    >
                      <span className="flex h-16 w-16 items-center justify-center border border-slate-300 bg-slate-50 transition-colors group-hover:border-[#2E5B37] group-hover:bg-white">
                        <Plus className="h-8 w-8" aria-hidden="true" />
                      </span>
                      <span className="text-sm font-bold">Criar Monitor de IA</span>
                    </button>
                  </div>
                )
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-heading text-xl font-bold text-[#132E20]">
                        Jornada de Ativação do Professor
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Conclua os 4 passos para colocar seus produtos e assistentes no ar.
                      </p>
                    </div>
                    {!hasProfile && (
                      <button
                        onClick={onOpenOnboarding}
                        className="text-xs font-bold text-[#2E5B37] hover:underline cursor-pointer flex items-center space-x-1"
                      >
                        <span>Completar Cadastro</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {setupModules.map((item, idx) => (
                      <div
                        key={idx}
                        className={`bg-white border rounded-2xl p-5 transition-all shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                          item.isLocked ? 'border-slate-200 opacity-75 bg-slate-50/50' : 'border-slate-200 hover:border-[#132E20]/40'
                        }`}
                      >
                        <div className="flex items-start space-x-4">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            item.isCompleted
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.inReview
                              ? 'bg-amber-100 text-amber-800'
                              : item.isLocked
                              ? 'bg-slate-200 text-slate-500'
                              : 'bg-[#132E20]/10 text-[#132E20]'
                          }`}>
                            {item.step}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <h3 className="font-bold text-sm text-[#132E20]">{item.title}</h3>
                              {item.isCompleted ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  {item.status}
                                </span>
                              ) : item.inReview ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center space-x-1">
                                  <Clock className="w-3 h-3 text-amber-600 animate-pulse" />
                                  <span>{item.status}</span>
                                </span>
                              ) : item.isLocked ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 border border-slate-300 flex items-center space-x-1">
                                  <Lock className="w-3 h-3 text-slate-500" />
                                  <span>{item.status}</span>
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                  {item.status}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed max-w-lg">
                              {item.description}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0 pt-2 sm:pt-0">
                          {item.disabled ? (
                            <span className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 bg-slate-100 px-4 py-2.5 rounded-xl border border-slate-200">
                              {item.inReview ? <Clock className="w-3.5 h-3.5 text-amber-600" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                              <span>{item.actionText}</span>
                            </span>
                          ) : item.isLocked ? (
                            <button
                              disabled
                              className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-400 bg-slate-100 px-4 py-2.5 rounded-xl border border-slate-200 cursor-not-allowed opacity-70"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>{item.actionText}</span>
                            </button>
                          ) : (
                            <button
                              onClick={item.onClick}
                              className="inline-flex items-center space-x-1.5 text-xs font-bold text-white bg-[#132E20] hover:bg-[#1E432D] px-4 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer"
                            >
                              <span>{item.actionText}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Sidebar Widget */}
            <div className="space-y-6">
              
              {/* Status & Dicas do Perfil / Página Pendente */}
              {!loadingMonitors && !hasPublishedAgent && isProfileActive && (
                <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm relative overflow-hidden">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-heading text-base font-bold text-[#132E20]">
                      Página Pública Pendente
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Sua página de vendas será ativada automaticamente assim que você publicar seu 1º Agente IA de estudo.
                    </p>
                  </div>
                </div>
              )}

              {/* Quick Help Box */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-3 shadow-sm">
                <div className="flex items-center space-x-2 text-[#132E20]">
                  <HelpCircle className="w-5 h-5 text-[#2E5B37]" />
                  <h3 className="font-bold text-sm">Precisa de Ajuda no Setup?</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Consulte nosso suporte pedagógico ou o checklist completo para publicação dos assistentes.
                </p>
                <a
                  href="https://wa.me/5522997892095?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20o%20setup%20do%20meu%20painel%20no%20MeuMonitor%20AI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-[#132E20] hover:text-[#2E5B37] hover:underline block pt-1 cursor-pointer"
                >
                  Falar com suporte →
                </a>
              </div>

            </div>

          </div>
        </>
      )}

      <TeacherMonitorCreationModal
        isOpen={isMonitorCreationOpen}
        onClose={() => setIsMonitorCreationOpen(false)}
        onCreated={handleMonitorCreated}
      />

    </div>
  );
};
