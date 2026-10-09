'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Bot,
  Receipt,
  ChevronRight,
  AlertCircle,
  HelpCircle,
  Copy,
  Check,
  ArrowUpRight,
  XCircle,
  AlertTriangle,
  Loader2,
  User,
  Sparkles,
  Mail,
  FileText
} from 'lucide-react';
import { StudentHeader, StudentRightSidebar, StudentSidebar, TeacherAvatar, useStudent } from '@/modules/student';
import { useAlert, LoadingState } from '@/shared';
import { getMonthlyTotalCents } from '@/modules/student/utils/subscription-pricing';
import { buildCancellationHeaders, getCancelableSubscriptionItems, getCancellationErrorMessage } from '@/modules/student/utils/subscription-cancellation';
import { dedupeAsyncRequest } from '@/shared/utils/async-request-deduper';
import { buildStudentAuthHeaders } from '@/shared/auth/session-headers';

interface PurchaseItem {
  id: string;
  descriptionSnapshot: string;
  unitAmount: number;
  quantity: number;
  monitor?: {
    id: string;
    name: string;
    avatarUrl?: string | null;
    teacher?: {
      fullName: string;
      avatarUrl?: string | null;
    };
  };
}

interface Purchase {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED' | 'EXPIRED';
  paymentMethod: 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'OTHER';
  currency: string;
  totalAmount: number | null;
  gatewayCheckoutId?: string | null;
  createdAt: string;
  items: PurchaseItem[];
  source?: 'LEGACY' | 'ASAAS' | 'BILLING';
}

interface BillingSubscription {
  id: string;
  status: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string;
  items: Array<{
    id: string;
    monitorId: string;
    monitorName: string;
    status?: string;
    priceCents?: number | null;
  }>;
}

interface SubscriptionChange {
  id: string;
  type: 'REMOVE' | 'CANCEL' | 'ADD' | 'REACTIVATE' | 'INTERVAL_CHANGE' | string;
  monitorId?: string | null;
  monitorName?: string | null;
  createdAt: string;
  endsAt?: string | null;
}

interface ActiveMonitor {
  id: string;
  name: string;
  priceCents?: number | null;
  description?: string;
  avatarUrl?: string | null;
  teacher?: {
    fullName: string;
    avatarUrl?: string | null;
    area?: string;
  };
  subjects?: Array<{ name: string }>;
  _count?: {
    questions: number;
    flashcards: number;
  };
}

interface SubscriptionPlan extends ActiveMonitor {
  subscriptionId: string;
  subscriptionItemId: string;
  subscriptionStatus: string;
  endsAt?: string | null;
  isCancelPending?: boolean;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

function getInitials(name?: string): string {
  if (!name || !name.trim()) return 'MA';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

export default function MeusPlanosPage() {
  const { student, status, fetchMonitors } = useStudent();
  const { showAlert } = useAlert();
  const [activeMonitors, setActiveMonitors] = useState<ActiveMonitor[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [subscriptions, setSubscriptions] = useState<BillingSubscription[]>([]);
  const [subscriptionChanges, setSubscriptionChanges] = useState<SubscriptionChange[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Cancel modal state
  const [selectedCancelMonitor, setSelectedCancelMonitor] = useState<SubscriptionPlan | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const dataRequestRef = useRef<Promise<void> | null>(null);
  const cancelIdempotencyKeyRef = useRef<string | null>(null);
  const cancelRequestInFlightRef = useRef(false);

  const selectCancelMonitor = useCallback((monitor: SubscriptionPlan | null) => {
    cancelIdempotencyKeyRef.current = monitor ? `cancel-${monitor.subscriptionId}-${monitor.subscriptionItemId}-${crypto.randomUUID()}` : null;
    setSelectedCancelMonitor(monitor);
  }, []);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';

  const loadData = useCallback(async () => {
    if (status === 'loading') return;
    return dedupeAsyncRequest(dataRequestRef, async () => {
      setIsLoading(true);
      try {
        const authHeaders = { 'Content-Type': 'application/json', ...buildStudentAuthHeaders(localStorage.getItem('mm_access_token')) };
        // Reutiliza a requisição/cache do StudentProvider em vez de forçar outra chamada.
        const monitorsData = await fetchMonitors(true);
        setActiveMonitors(monitorsData || []);

        const [subscriptionsRes, changesRes, purchasesRes] = await Promise.all([
          fetch(`${apiUrl}/api/v1/student/subscriptions`, {
            method: 'GET',
            headers: authHeaders,
            credentials: 'include',
          }),
          fetch(`${apiUrl}/api/v1/student/subscriptions/history`, {
            method: 'GET',
            headers: authHeaders,
            credentials: 'include',
          }),
          fetch(`${apiUrl}/api/v1/student/payment-history`, {
            method: 'GET',
            headers: authHeaders,
            credentials: 'include',
          }),
        ]);

      if (subscriptionsRes.ok) {
        const json = await subscriptionsRes.json();
        setSubscriptions(Array.isArray(json.data) ? json.data : []);
      } else {
        setSubscriptions([]);
      }

      if (changesRes.ok) {
        const json = await changesRes.json();
        setSubscriptionChanges(Array.isArray(json.data) ? json.data : []);
      } else {
        setSubscriptionChanges([]);
      }

      if (purchasesRes.ok) {
        const json = await purchasesRes.json();
        setPurchases(Array.isArray(json.data) ? json.data : []);
      } else {
        setPurchases([]);
      }
      } catch (err) {
        console.error('[MeusPlanosPage] Erro ao carregar dados:', err);
      } finally {
        setIsLoading(false);
      }
    });
  }, [apiUrl, fetchMonitors, status]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleConfirmCancel = async () => {
    if (!selectedCancelMonitor || cancelRequestInFlightRef.current) return;
    cancelRequestInFlightRef.current = true;
    setIsCancelling(true);
    try {
      const selectedSubscription = subscriptions.find((subscription) => subscription.id === selectedCancelMonitor.subscriptionId);
      const idempotencyKey = cancelIdempotencyKeyRef.current ?? `cancel-${selectedCancelMonitor.subscriptionId}-${selectedCancelMonitor.subscriptionItemId}-${crypto.randomUUID()}`;
      cancelIdempotencyKeyRef.current = idempotencyKey;
      const res = await fetch(`${apiUrl}/api/v1/student/subscriptions/${selectedCancelMonitor.subscriptionId}/items/${selectedCancelMonitor.id}`, {
        method: 'DELETE',
        headers: buildCancellationHeaders(
          buildStudentAuthHeaders(localStorage.getItem('mm_access_token')),
          idempotencyKey,
        ),
        credentials: 'include',
      });


      const json = await res.json().catch(() => null);
      if (res.ok) {
        const endsAt = typeof json.data?.endsAt === 'string'
          ? formatDate(json.data.endsAt)
          : selectedSubscription?.currentPeriodEnd
            ? formatDate(selectedSubscription.currentPeriodEnd)
            : 'o fim do período já pago';
        showAlert({
          title: 'Cancelamento agendado',
          message: `O monitor "${selectedCancelMonitor.name}" permanecerá disponível até ${endsAt}. Não haverá nova cobrança para ele.`,
          type: 'success',
          showSupport: false,
        });
        selectCancelMonitor(null);
        await loadData();
      } else {
        showAlert({
          title: 'Erro ao Cancelar',
          message: getCancellationErrorMessage(json),
          type: 'error',
          showSupport: true,
        });
      }
    } catch (err) {
      console.error('Erro ao solicitar cancelamento:', err);
      showAlert({
        title: 'Erro de Conexão',
        message: 'Falha na conexão ao tentar cancelar. Verifique sua internet.',
        type: 'error',
        showSupport: true,
      });
    } finally {
      cancelRequestInFlightRef.current = false;
      setIsCancelling(false);
    }
  };

  const monitorsById = new Map(activeMonitors.map((monitor) => [monitor.id, monitor]));
  const subscriptionPlans: SubscriptionPlan[] = getCancelableSubscriptionItems(subscriptions).map((item) => {
    const accessMonitor = monitorsById.get(item.monitorId);
    const parentSub = subscriptions.find((sub) => sub.id === item.subscriptionId);
    const monitorName = accessMonitor?.name ?? item.monitorName;

    const matchingChange = subscriptionChanges.find(
      (change) =>
        (change.monitorId === item.monitorId ||
          (change.monitorName &&
            monitorName &&
            change.monitorName.trim().toLowerCase() === monitorName.trim().toLowerCase())) &&
        (change.type === 'REMOVE' || change.type === 'CANCEL'),
    );

    const isCancelPending =
      item.status === 'CANCEL_PENDING' ||
      parentSub?.status === 'CANCEL_PENDING' ||
      Boolean(parentSub?.cancelAtPeriodEnd) ||
      Boolean(matchingChange);

    const endsAt =
      matchingChange?.endsAt ||
      (accessMonitor as unknown as { entitlement?: { subscription?: { accessEndsAt?: string | null; currentPeriodEnd?: string | null } } })?.entitlement?.subscription?.accessEndsAt ||
      (accessMonitor as unknown as { entitlement?: { subscription?: { accessEndsAt?: string | null; currentPeriodEnd?: string | null } } })?.entitlement?.subscription?.currentPeriodEnd ||
      parentSub?.currentPeriodEnd ||
      null;

    return {
      ...(accessMonitor ?? { id: item.monitorId, name: monitorName }),
      id: item.monitorId,
      name: monitorName,
      priceCents: item.priceCents,
      subscriptionId: item.subscriptionId,
      subscriptionItemId: item.itemId,
      subscriptionStatus: isCancelPending ? 'CANCEL_PENDING' : item.status,
      endsAt,
      isCancelPending,
    };
  });

  const hasCancellation =
    subscriptionPlans.some((plan) => plan.isCancelPending || plan.subscriptionStatus === 'CANCEL_PENDING') ||
    subscriptions.some((sub) => (sub.cancelAtPeriodEnd || sub.status === 'CANCEL_PENDING') && sub.status !== 'CANCELED') ||
    subscriptionChanges.some((change) => change.type === 'REMOVE' || change.type === 'CANCEL');

  const cancellationReleaseDate = (() => {
    const planWithEndsAt = subscriptionPlans.find((plan) => (plan.isCancelPending || plan.subscriptionStatus === 'CANCEL_PENDING') && plan.endsAt);
    if (planWithEndsAt?.endsAt) return planWithEndsAt.endsAt;

    const changeWithEndsAt = subscriptionChanges.find((change) => (change.type === 'REMOVE' || change.type === 'CANCEL') && change.endsAt);
    if (changeWithEndsAt?.endsAt) return changeWithEndsAt.endsAt;

    const subWithPeriodEnd = subscriptions.find((sub) => (sub.cancelAtPeriodEnd || sub.status === 'CANCEL_PENDING') && sub.currentPeriodEnd);
    if (subWithPeriodEnd?.currentPeriodEnd) return subWithPeriodEnd.currentPeriodEnd;

    const anySubWithPeriodEnd = subscriptions.find((sub) => sub.currentPeriodEnd);
    if (anySubWithPeriodEnd?.currentPeriodEnd) return anySubWithPeriodEnd.currentPeriodEnd;

    return null;
  })();

  const totalMonthlyPrice = getMonthlyTotalCents(subscriptionPlans);
  const hasMonthlyPrice = subscriptionPlans.length > 0 && subscriptionPlans.every(
    (monitor) => typeof monitor.priceCents === 'number' && Number.isFinite(monitor.priceCents),
  );

  return (
    <main className="min-h-screen bg-[#F5F1E8] text-[#0F2942]">
      <div className="flex min-h-screen w-full">
        <StudentSidebar activeNav="overview" />

        <section className="min-w-0 flex-1 px-5 py-5 sm:px-8 lg:px-12 lg:py-8">
          <StudentHeader
            title="Meus Planos & Assinaturas"
            breadcrumbs={[
              { label: 'Área do aluno', href: '/areadoaluno' },
              { label: 'Meus planos' },
            ]}
          />

          {isLoading ? (
            <LoadingState
              variant="page"
              message="Carregando seus planos e assinaturas..."
              description="Buscando detalhes de cobrança, histórico financeiro e seus monitores contratados."
            />
          ) : (
            <>
              {/* Billing Overview Summary Card */}
              <div className="mt-6 overflow-hidden rounded-[26px] border border-[#0F2942]/10 bg-white p-6 sm:p-8 shadow-xs">
            {/* Top Row: Plan Header & Quick Actions */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between pb-6 border-b border-[#0F2942]/08">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E3F1E4] px-3 py-1 text-xs font-extrabold text-[#2E5B37] border border-[#2E5B37]/20">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2E5B37] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2E5B37]"></span>
                    </span>
                    {activeMonitors.length > 0 ? 'Assinatura Ativa' : 'Sem Plano Ativo'}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#F8F5EE] px-3 py-1 text-xs font-semibold text-[#0F2942]/70 border border-[#0F2942]/08">
                    Cobrança mensal por monitor
                  </span>
                </div>

                <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-[#0F2942]">
                  Plano Personalizado MeuMonitor AI
                </h2>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#0F2942]/70 pt-0.5">
                  <span className="inline-flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-[#2E5B37]" />
                    <span>Titular da conta: <strong className="text-[#0F2942] font-semibold">{student?.fullName || student?.email}</strong></span>
                  </span>
                  {student?.email && (
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-[#0F2942]/40" />
                      <span>{student.email}</span>
                    </span>
                  )}
                  {student?.cpf && (
                    <span className="inline-flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-[#0F2942]/40" />
                      <span>CPF: {student.cpf}</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href="/areadoaluno/agentes"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0F2942] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#1A426B] shadow-xs cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5 text-[#76D69B]" />
                  <span>Explorar Monitores</span>
                  <ChevronRight className="h-3.5 w-3.5 text-white/60" />
                </Link>
              </div>
            </div>

            {/* Bottom Row: Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6">
              {/* Stat 1: Monitores */}
              <div className="flex items-center gap-3.5 rounded-2xl bg-[#F8F5EE] p-4 border border-[#0F2942]/08">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E3F1E4] text-[#2E5B37] border border-[#2E5B37]/15">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#0F2942]/50">Assinaturas Ativas</p>
                  <p className="font-heading text-xl font-bold text-[#0F2942] leading-tight mt-0.5">
                    {subscriptionPlans.length} {subscriptionPlans.length === 1 ? 'assinatura ativa' : 'assinaturas ativas'}
                  </p>
                  <p className="text-[11px] text-[#0F2942]/55 mt-0.5">Disponível 24/7 para estudos</p>
                </div>
              </div>

              {/* Stat 2: Investimento */}
              <div className="flex items-center gap-3.5 rounded-2xl bg-[#F8F5EE] p-4 border border-[#0F2942]/08">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0F2942]/08 text-[#0F2942] border border-[#0F2942]/10">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#0F2942]/50">Investimento Mensal</p>
                  <p className="font-heading text-xl font-bold text-[#2E5B37] leading-tight mt-0.5">
                    {hasMonthlyPrice ? formatCurrency(totalMonthlyPrice) : 'Valor indisponível'}
                    {hasMonthlyPrice && <span className="text-xs font-normal text-[#0F2942]/50"> /mês</span>}
                  </p>
                  <p className="text-[11px] text-[#0F2942]/55 mt-0.5">Total unificado por monitor</p>
                </div>
              </div>

              {/* Stat 3: Renovação ou Data de Liberação */}
              {hasCancellation ? (
                <div className="flex items-center gap-3.5 rounded-2xl bg-[#F8F5EE] p-4 border border-[#0F2942]/08">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 border border-amber-500/20">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#0F2942]/50">Data de Liberação</p>
                    <p className="font-heading text-xl font-bold text-[#0F2942] leading-tight mt-0.5">
                      {cancellationReleaseDate ? formatDate(cancellationReleaseDate) : 'Fim do período pago'}
                    </p>
                    <p className="text-[11px] text-[#0F2942]/55 mt-0.5">Acesso mantido no período pago</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3.5 rounded-2xl bg-[#F8F5EE] p-4 border border-[#0F2942]/08">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#2E5B37]/10 text-[#2E5B37] border border-[#2E5B37]/15">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#0F2942]/50">Ciclo de Cobrança</p>
                    <p className="font-heading text-xl font-bold text-[#0F2942] leading-tight mt-0.5">
                      Renovação Mensal
                    </p>
                    <p className="text-[11px] text-[#0F2942]/55 mt-0.5">Flexível, sem fidelidade</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECTION 1: Subscribed Monitors */}
          <div className="mt-10">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-heading text-xl font-bold text-[#0F2942] flex items-center gap-2">
                  <Bot className="h-5 w-5 text-[#2E5B37]" />
                  Assinaturas Ativas ({subscriptionPlans.length})
                </h3>
                <p className="text-xs text-[#0F2942]/60 mt-0.5">
                  Cada card corresponde a uma assinatura financeira que pode ser cancelada individualmente.
                </p>
              </div>

              <Link
                href="/areadoaluno/agentes"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2E5B37] hover:underline"
              >
                <span>Acessar todos os agentes</span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {subscriptionPlans.length > 0 ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {subscriptionPlans.map((monitor) => {
                  const teacherName = monitor.teacher?.fullName || 'Professor Responsável';
                  const teacherInitials = getInitials(teacherName);
                  const subjectName = monitor.subjects?.[0]?.name || 'Geral';
                  const isCancelPending = monitor.isCancelPending || monitor.subscriptionStatus === 'CANCEL_PENDING';
                  const endsAtFormatted = monitor.endsAt ? formatDate(monitor.endsAt) : null;

                  return (
                    <div
                      key={`${monitor.subscriptionId}-${monitor.subscriptionItemId}`}
                      className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-[#0F2942]/10 bg-white p-5 shadow-xs transition duration-200 hover:-translate-y-1 hover:border-[#2E5B37]/30 hover:shadow-md"
                    >
                      <div>
                        {/* Header Badge & Title */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="rounded-md bg-[#2E5B37]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#2E5B37]">
                            {subjectName}
                          </span>
                          {isCancelPending ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800 border border-amber-200 shadow-2xs">
                              <Clock className="h-3 w-3 text-amber-600 shrink-0" />
                              <span>
                                Cancelamento agendado
                                {endsAtFormatted ? ` • Acesso até: ${endsAtFormatted}` : ' • Acesso no período pago'}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[#2E5B37]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#76D69B] animate-pulse" />
                              Ativo
                            </span>
                          )}
                        </div>

                        <h4 className="mt-3 font-heading text-base font-bold text-[#0F2942] group-hover:text-[#2E5B37] transition">
                          {monitor.name}
                        </h4>
                        <p className="mt-1 font-mono text-[10px] font-semibold text-[#0F2942]/45">
                          Assinatura #{monitor.subscriptionId.slice(0, 8)}
                        </p>

                        {/* Teacher & Price Info */}
                        <div className="mt-3 flex items-center justify-between pt-3 border-t border-[#0F2942]/08">
                          <div className="flex items-center gap-2">
                            <TeacherAvatar
                              src={monitor.teacher?.avatarUrl || monitor.avatarUrl}
                              alt={teacherName}
                              initials={teacherInitials}
                              sizeClassName="h-7 w-7 text-[10px]"
                            />
                            <span className="text-xs font-medium text-[#0F2942]/70 truncate max-w-[130px]">
                              {teacherName}
                            </span>
                          </div>

                          <span className="font-heading text-sm font-bold text-[#0F2942]">
                            {typeof monitor.priceCents === 'number' && Number.isFinite(monitor.priceCents)
                              ? formatCurrency(monitor.priceCents)
                              : 'Valor indisponível'}{' '}
                            {typeof monitor.priceCents === 'number' && Number.isFinite(monitor.priceCents) && (
                              <span className="text-[10px] font-normal text-[#0F2942]/50">/mês</span>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#0F2942]/08 flex items-center justify-between">
                        {isCancelPending ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
                            <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            <span>{endsAtFormatted ? `Acesso até ${endsAtFormatted}` : 'Cancelamento agendado'}</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => selectCancelMonitor(monitor)}
                            className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                          >
                            Cancelar plano
                          </button>
                        )}
                        <Link
                          href="/areadoaluno/agentes"
                          className="inline-flex items-center gap-1 rounded-xl bg-[#0F2942] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#1C466D]"
                        >
                          <span>Estudar</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-[#0F2942]/10 bg-white/70 p-8 text-center">
                <Bot className="mx-auto h-10 w-10 text-[#0F2942]/30" />
                <p className="mt-2 text-sm font-bold text-[#0F2942]">Nenhum monitor contratado no momento</p>
                <p className="mt-1 text-xs text-[#0F2942]/50">
                  Explore os professores disponíveis e assine seu primeiro agente de estudos.
                </p>
              </div>
            )}
          </div>

          {/* SECTION 2: Purchase & Payment History */}
          <div className="mt-12">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-heading text-xl font-bold text-[#0F2942] flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-[#2E5B37]" />
                  Histórico de Pagamentos & Transações
                </h3>
                <p className="text-xs text-[#0F2942]/60 mt-0.5">
                  Registro completo de todas as suas compras e confirmações de assinatura.
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-[#0F2942]/10 bg-white shadow-xs">
              {purchases.length > 0 || subscriptionChanges.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8F5EE] text-[#0F2942]/60 font-bold uppercase tracking-wider text-[10px] border-b border-[#0F2942]/08">
                      <tr>
                        <th className="px-6 py-4">Data</th>
                        <th className="px-6 py-4">ID do Pedido</th>
                        <th className="px-6 py-4">Item / Monitor</th>
                        <th className="px-6 py-4">Método</th>
                        <th className="px-6 py-4">Valor Total</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#0F2942]/08 text-[#0F2942]">
                      {subscriptionChanges.map((change) => (
                        <tr key={`change-${change.id}`} className="bg-amber-50/40 hover:bg-amber-50 transition">
                          <td className="px-6 py-4 font-medium whitespace-nowrap">
                            {formatDate(change.createdAt)}
                          </td>
                          <td className="px-6 py-4 font-mono text-[11px] font-semibold text-[#0F2942]/80 whitespace-nowrap">
                            #{change.id.slice(0, 8)}...
                          </td>
                          <td className="px-6 py-4 font-bold text-[#0F2942] max-w-[220px] truncate">
                            {change.type === 'REMOVE' ? `Cancelamento: ${change.monitorName || 'Monitor'}` : 'Alteração de assinatura'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#F8F5EE] px-2.5 py-1 text-[11px] font-semibold text-[#0F2942]/70 border border-[#0F2942]/08">
                              <CreditCard className="h-3.5 w-3.5 text-[#2E5B37]" />
                              Asaas
                            </span>
                          </td>
                          <td className="px-6 py-4 font-heading font-bold text-[#0F2942] whitespace-nowrap">—</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 border border-amber-200">
                              <Clock className="h-3.5 w-3.5 text-amber-600" />
                              Cancelamento agendado
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap text-[11px] font-semibold text-[#0F2942]/60">
                            {change.endsAt ? `Acesso até ${formatDate(change.endsAt)}` : 'Acesso mantido no período pago'}
                          </td>
                        </tr>
                      ))}
                      {purchases
                        // Cancelamentos legados também vêm de /subscriptions/history;
                        // evita repetir a mesma ocorrência na tabela.
                        .filter((purchase) => !(purchase.source === 'BILLING' && subscriptionChanges.some((change) => change.id === purchase.id)))
                        .map((purchase) => {
                        const isPaid = purchase.status === 'PAID';
                        const isPending = purchase.status === 'PENDING' || purchase.status === 'PROCESSING';
                        const itemNames = purchase.items?.map(i => i.descriptionSnapshot || i.monitor?.name).filter(Boolean).join(', ') || 'Monitor AI';

                        return (
                          <tr key={purchase.id} className="hover:bg-[#F8F5EE]/50 transition">
                            <td className="px-6 py-4 font-medium whitespace-nowrap">
                              {formatDate(purchase.createdAt)}
                            </td>
                            <td className="px-6 py-4 font-mono text-[11px] font-semibold text-[#0F2942]/80 whitespace-nowrap">
                              <button
                                onClick={() => handleCopyId(purchase.id)}
                                className="inline-flex items-center gap-1 hover:text-[#2E5B37] cursor-pointer"
                                title="Clique para copiar ID"
                              >
                                #{purchase.id.slice(0, 8)}...
                                {copiedId === purchase.id ? (
                                  <Check className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3 w-3 opacity-40 hover:opacity-100" />
                                )}
                              </button>
                            </td>
                            <td className="px-6 py-4 font-bold text-[#0F2942] max-w-[220px] truncate">
                              {itemNames}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#F8F5EE] px-2.5 py-1 text-[11px] font-semibold text-[#0F2942]/70 border border-[#0F2942]/08">
                                <CreditCard className="h-3.5 w-3.5 text-[#2E5B37]" />
                                {purchase.source === 'ASAAS'
                                  ? 'Asaas'
                                  : purchase.source === 'BILLING'
                                  ? 'Assinatura'
                                  : purchase.paymentMethod === 'PIX'
                                  ? 'Pix'
                                  : purchase.paymentMethod === 'CREDIT_CARD'
                                  ? 'Cartão'
                                  : purchase.paymentMethod === 'BOLETO'
                                  ? 'Boleto'
                                  : 'Online'}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-heading font-bold text-[#0F2942] whitespace-nowrap">
                              {purchase.totalAmount === null ? '—' : formatCurrency(purchase.totalAmount)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {isPaid ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                  Pago
                                </span>
                              ) : isPending ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 border border-amber-200">
                                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                                  Pendente
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 border border-rose-200">
                                  <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
                                  Cancelado
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right whitespace-nowrap">
                              {isPending ? (
                                <span className="text-[11px] font-semibold text-amber-700">Aguardando checkout</span>
                              ) : isPaid ? (
                                <span className="text-[11px] font-semibold text-[#2E5B37] bg-[#E3F1E4] px-2.5 py-1 rounded-lg">
                                  Confirmado
                                </span>
                              ) : (
                                <span className="text-[11px] text-[#0F2942]/40">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-12 text-center">
                  <Receipt className="mx-auto h-10 w-10 text-[#0F2942]/30" />
                  <p className="mt-2 text-sm font-bold text-[#0F2942]">Nenhum histórico de transação encontrado</p>
                  <p className="mt-1 text-xs text-[#0F2942]/50 max-w-md mx-auto">
                    Suas futuras confirmações de assinatura e comprovantes de pagamento aparecerão listados nesta tabela.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* SECTION 3: Support & Security Notice */}
          <div className="mt-10 relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#0B2135] via-[#0F2942] to-[#16385C] p-6 sm:p-8 text-white shadow-lg border border-[#0F2942]/20">
            {/* Glow effects */}
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#2E5B37]/25 blur-3xl" />
            <div className="pointer-events-none absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-[#76D69B]/10 blur-3xl" />

            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4 sm:gap-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#76D69B] border border-white/15 shadow-inner">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-[#76D69B] border border-white/10 backdrop-blur-xs">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#76D69B] animate-pulse" />
                      Atendimento & Segurança
                    </span>
                    <span className="text-xs text-white/40">•</span>
                    <span className="text-xs text-white/60 font-medium">Ambiente 100% Criptografado</span>
                  </div>

                  <div>
                    <h4 className="font-heading text-lg sm:text-xl font-bold text-white tracking-tight">
                      Dúvidas sobre sua assinatura ou pagamentos?
                    </h4>
                    <p className="mt-1 text-xs sm:text-sm text-white/75 leading-relaxed max-w-2xl">
                      Nossa equipe está pronta para auxiliar você com notas fiscais, métodos de pagamento, dúvidas sobre os monitores de IA ou qualquer suporte técnico.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-white/60 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#76D69B]" />
                      <span>Transações seguras</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#76D69B]" />
                      <span>Sem fidelidade ou carência</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-[#76D69B]" />
                      <span className="text-white/80">suporte@meumonitor.ai</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="shrink-0 flex items-center pt-2 lg:pt-0">
                <a
                  href="mailto:suporte@meumonitor.ai"
                  className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#2E5B37] px-6 py-3.5 text-xs font-bold text-white transition hover:bg-[#3D7749] hover:shadow-lg hover:-translate-y-0.5 shadow-md border border-[#76D69B]/30 cursor-pointer w-full sm:w-auto"
                >
                  <HelpCircle className="h-4 w-4 text-[#76D69B]" />
                  <span>Falar com o Suporte</span>
                </a>
              </div>
            </div>
          </div>

          {/* SECTION 4: Manage & Cancel Subscription */}
          {subscriptionPlans.length > 0 && (
            <div className="mt-10 overflow-hidden rounded-[24px] border border-rose-200/80 bg-rose-50/50 p-6 sm:p-7 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 border border-rose-200">
                    <XCircle className="h-5 w-5" />
                  </div>
                  <div>
                      <h4 className="font-heading text-base font-bold text-[#0F2942]">
                      Gerenciamento e Cancelamento de Monitores
                    </h4>
                    <p className="mt-1 text-xs text-[#0F2942]/65 leading-relaxed max-w-2xl">
                      Deseja encerrar ou pausar a assinatura de seus agentes? Você pode cancelar a qualquer momento sem custos adicionais ou multas. Seu acesso continuará liberado até o fim do período mensal vigente.
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center">
                  <button
                    type="button"
                    onClick={() => selectCancelMonitor(subscriptionPlans[0])}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-5 py-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-600 hover:text-white hover:border-rose-600 shadow-xs cursor-pointer"
                  >
                    <XCircle className="h-4 w-4" />
                    <span>Cancelar um monitor</span>
                  </button>
                </div>
              </div>
            </div>
          )}
            </>
          )}
        </section>

        <StudentRightSidebar />
      </div>

      {/* CANCELLATION MODAL */}
      {selectedCancelMonitor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 sm:p-8 shadow-2xl border border-[#0F2942]/10 space-y-6">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 border border-rose-200">
                <AlertTriangle className="h-6 w-6 text-rose-600" />
              </div>
              <div>
                <h3 className="font-heading text-lg font-bold text-[#0F2942]">Cancelar monitor</h3>
                <p className="text-xs text-[#0F2942]/60">Confirmação de remoção do monitor</p>
              </div>
            </div>

            {subscriptionPlans.length > 1 && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#0F2942]">
                  Selecione o monitor a ser cancelado:
                </label>
                <select
                  value={`${selectedCancelMonitor.subscriptionId}-${selectedCancelMonitor.subscriptionItemId}`}
                  onChange={(e) => {
                    const found = subscriptionPlans.find((plan) => `${plan.subscriptionId}-${plan.subscriptionItemId}` === e.target.value);
                    if (found) selectCancelMonitor(found);
                  }}
                  className="w-full rounded-xl border border-[#0F2942]/20 bg-white p-2.5 text-xs font-medium text-[#0F2942] focus:border-[#2E5B37] focus:outline-none"
                >
                  {subscriptionPlans.map((m) => (
                    <option key={`${m.subscriptionId}-${m.subscriptionItemId}`} value={`${m.subscriptionId}-${m.subscriptionItemId}`}>
                      {m.name} {m.teacher?.fullName ? `(${m.teacher.fullName})` : ''} — assinatura #{m.subscriptionId.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="rounded-2xl bg-[#F8F5EE] p-4 border border-[#0F2942]/08 space-y-2">
              <p className="text-xs text-[#0F2942]/70 leading-relaxed">
                Você está prestes a cancelar apenas o monitor:
              </p>
              <p className="font-heading text-base font-bold text-[#0F2942]">
                {selectedCancelMonitor.name}
              </p>
              {selectedCancelMonitor.teacher?.fullName && (
                <p className="text-xs font-medium text-[#2E5B37]">
                  Professor: {selectedCancelMonitor.teacher.fullName}
                </p>
              )}
            </div>

            <p className="text-xs text-[#0F2942]/60 leading-relaxed">
              Após o cancelamento, seu acesso aos bancos de questões e flashcards deste agente permanecerá ativo até o fim do período mensal já pago.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isCancelling}
                    onClick={() => selectCancelMonitor(null)}
                className="rounded-xl border border-[#0F2942]/15 bg-[#F8F5EE] px-4 py-2.5 text-xs font-bold text-[#0F2942] transition hover:bg-white cursor-pointer"
              >
                Voltar / Manter Plano
              </button>
              <button
                type="button"
                disabled={isCancelling}
                onClick={handleConfirmCancel}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-rose-700 shadow-md cursor-pointer disabled:opacity-50"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Cancelando...</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    <span>Sim, Quero Cancelar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
