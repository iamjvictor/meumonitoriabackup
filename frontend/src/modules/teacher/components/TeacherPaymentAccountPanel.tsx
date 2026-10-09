'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowUpRight, CheckCircle2, Clock3, CreditCard, Loader2, ShieldCheck } from 'lucide-react';
import type { TeacherProfile } from '../services/TeacherProfileService';
import { TeacherPaymentAccountService, type PaymentAccount, type PaymentAccountInput } from '../services/TeacherPaymentAccountService';
import { TeacherSessionError } from '../services/TeacherSessionError';
import { TeacherPaymentOverviewService, type PaymentAccountOverview } from '../services/TeacherPaymentOverviewService';
import { formatPaymentAmount, getDashboardUrl, getPaymentAccountStatusCopy, isRetryablePaymentOverviewError } from '../utils/payment-account-overview';

type Props = {
  teacher: TeacherProfile | null;
  onSessionExpired?: () => void;
  onAccountChange?: (account: PaymentAccount | null) => void;
  onAccountLoaded?: () => void;
  isFormOpen?: boolean;
  onFormOpenChange?: (open: boolean) => void;
  initialAccount?: PaymentAccount | null;
};

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length > 0 ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCpfCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatCep(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function formatBirthDate(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

function toDisplayBirthDate(value: string | undefined | null) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }
  return formatBirthDate(value);
}

function formatCurrency(value: number | string): string {
  if (value === '' || value === undefined || value === null) return '';
  const num = typeof value === 'number' ? value : Number(value.replace(/\D/g, '')) / 100;
  if (isNaN(num) || num === 0) return '';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(num);
}

const initialForm = (teacher: TeacherProfile | null): PaymentAccountInput => ({
  name: teacher?.fullName || '',
  email: teacher?.email || '',
  cpfCnpj: '',
  birthDate: '',
  mobilePhone: formatPhone(teacher?.phone || ''),
  incomeValue: 0,
  address: '',
  addressNumber: '',
  province: '',
  postalCode: '',
});

function statusCopy(account: PaymentAccount) {
  const status = account.status.toUpperCase();
  if (status === 'APPROVED' || account.generalStatus?.toUpperCase() === 'APPROVED') return { label: 'Recebimento aprovado', tone: 'emerald', Icon: CheckCircle2, copy: 'Novas vendas poderão direcionar sua parte para sua carteira Asaas.' };
  if (status === 'REJECTED' || status === 'SUSPENDED') return { label: status === 'SUSPENDED' ? 'Recebimento suspenso' : 'Cadastro precisa de ajuste', tone: 'rose', Icon: AlertCircle, copy: account.rejectionReason || 'Revise os dados e regularize sua conta no Asaas.' };
  return { label: 'Aguardando aprovação', tone: 'amber', Icon: Clock3, copy: 'O Asaas ainda está analisando os dados da conta. Seu monitor pode permanecer em rascunho.' };
}

const statusToneClasses = {
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
} as const;

export function TeacherPaymentAccountPanel({ teacher, onSessionExpired, onAccountChange, onAccountLoaded, isFormOpen = false, onFormOpenChange, initialAccount }: Props) {
  const [account, setAccount] = useState<PaymentAccount | null>(initialAccount ?? null);
  const [form, setForm] = useState<PaymentAccountInput>(() => initialForm(teacher));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<PaymentAccountOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewRetryable, setOverviewRetryable] = useState(false);

  async function loadOverview() {
    setOverviewLoading(true);
    setOverviewError(null);
    setOverviewRetryable(false);
    try {
      setOverview(await TeacherPaymentOverviewService.get());
    } catch (reason) {
      if (reason instanceof TeacherSessionError) onSessionExpired?.();
      setOverviewError(reason instanceof Error ? reason.message : 'Não foi possível atualizar os indicadores.');
      setOverviewRetryable(isRetryablePaymentOverviewError(reason));
    } finally {
      setOverviewLoading(false);
    }
  }

  useEffect(() => {
    if (!teacher) return;
    if (initialAccount !== undefined) {
      setAccount(initialAccount);
      onAccountChange?.(initialAccount);
      void loadOverview();
      setLoading(false);
      onAccountLoaded?.();
      return;
    }
    TeacherPaymentAccountService.get()
      .then((nextAccount) => {
        setAccount(nextAccount);
        onAccountChange?.(nextAccount);
        void loadOverview();
      })
      .catch((reason) => {
        if (reason instanceof TeacherSessionError) onSessionExpired?.();
        else setError(reason instanceof Error ? reason.message : 'Não foi possível consultar sua conta.');
      })
      .finally(() => {
        setLoading(false);
        onAccountLoaded?.();
      });
  }, [teacher, initialAccount, onSessionExpired, onAccountChange, onAccountLoaded]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const documentDigits = form.cpfCnpj.replace(/\D/g, '');
      const isIndividualDocument = documentDigits.length <= 11;

      let formattedBirthDate: string | undefined = undefined;
      if (isIndividualDocument) {
        const rawDate = form.birthDate?.trim() || '';
        const digits = rawDate.replace(/\D/g, '');
        if (digits.length === 8) {
          const day = digits.slice(0, 2);
          const month = digits.slice(2, 4);
          const year = digits.slice(4, 8);
          const dayNum = Number(day);
          const monthNum = Number(month);
          const yearNum = Number(year);
          const currentYear = new Date().getFullYear();
          if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12 || yearNum < 1900 || yearNum > currentYear) {
            setError('Data de nascimento inválida. Use o formato DD/MM/AAAA.');
            setSubmitting(false);
            return;
          }
          formattedBirthDate = `${year}-${month}-${day}`;
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
          formattedBirthDate = rawDate;
        } else if (rawDate) {
          setError('Informe a data de nascimento completa no formato DD/MM/AAAA.');
          setSubmitting(false);
          return;
        }
      }

      if (!form.incomeValue || form.incomeValue <= 0) {
        setError('Informe uma renda ou faturamento mensal válido.');
        setSubmitting(false);
        return;
      }

      const nextAccount = await TeacherPaymentAccountService.create({
        ...form,
        birthDate: formattedBirthDate,
        incomeValue: form.incomeValue,
        companyType: isIndividualDocument ? undefined : form.companyType,
        complement: form.complement?.trim() || undefined,
        site: form.site?.trim() || undefined,
      });
      setAccount(nextAccount);
      onAccountChange?.(nextAccount);
      onFormOpenChange?.(false);
    } catch (reason) {
      if (reason instanceof TeacherSessionError) onSessionExpired?.();
      else setError(reason instanceof Error ? reason.message : 'Não foi possível iniciar o cadastro.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!teacher) return null;
  if (loading) return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3 text-sm font-semibold text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-[#2E5B37]" /> Consultando sua conta de recebimento...</div></section>;

  if (account) {
    const status = statusCopy(account);
    const StatusIcon = status.Icon;
    const dashboardUrl = getDashboardUrl(overview?.account.dashboardUrl);
    const onboardingUrl = getDashboardUrl(account.onboardingUrl);
    const statusOverview = getPaymentAccountStatusCopy(account.status);
    const metrics = overview?.metrics;
    const kpis = [
      ['Saldo disponível', metrics ? formatPaymentAmount(metrics.availableBalanceCents) : 'Indisponível'],
      ['Recebido neste mês', metrics ? formatPaymentAmount(metrics.receivedThisMonthCents) : 'Indisponível'],
      ['A receber', metrics ? formatPaymentAmount(metrics.pendingReceivablesCents) : 'Indisponível'],
      ['Transferências pendentes', metrics ? String(metrics.pendingTransfersCount) : 'Indisponível'],
    ];
    const statusHeaderClass = statusOverview.label === 'Pendente' || statusOverview.label === 'Em análise'
      ? 'bg-amber-600'
      : statusOverview.label === 'Aprovada'
        ? 'bg-emerald-700'
        : 'bg-rose-700';
    return <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className={`${statusHeaderClass} p-6 text-white`}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${statusToneClasses[status.tone as keyof typeof statusToneClasses]}`}><StatusIcon className="h-5 w-5" /></div>
          <div><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/80">Conta de recebimento Asaas</p><h2 className="mt-1 text-xl font-bold text-white">{statusOverview.label}</h2><p className="mt-1 max-w-xl text-sm leading-6 text-white/90">{statusOverview.description}</p></div>
        </div>
        {dashboardUrl && statusOverview.label === 'Aprovada' ? <a href={dashboardUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-bold text-[#123B68] transition hover:bg-blue-50"><span>Abrir painel Asaas</span><ArrowUpRight className="h-4 w-4" /></a> : onboardingUrl && <a href={onboardingUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-bold text-[#123B68] transition hover:bg-blue-50"><span>Ver status da aprovação</span><ArrowUpRight className="h-4 w-4" /></a>}
      </div>
      </div>
      <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-4">{kpis.map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><span className="block text-xs font-bold text-slate-500">{label}</span>{overviewLoading ? <div className="mt-3 h-7 w-28 animate-pulse rounded bg-slate-200" aria-label="Carregando indicador" /> : <strong className="mt-2 block text-lg text-[#132E20]">{value}</strong>}</div>)}</div>
      <p className="px-6 pb-4 text-xs text-slate-500">Prazo estimado: 2 dias úteis</p>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 pb-6 text-xs text-slate-500">{overviewError ? <span role="alert">{overviewRetryable ? 'Não foi possível atualizar os indicadores.' : overviewError}</span> : metrics ? <span>Atualizado em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(metrics.asOf))}</span> : <span>Indicadores financeiros indisponíveis no momento.</span>}{overviewError && overviewRetryable && <button type="button" onClick={() => void loadOverview()} className="font-bold text-[#123B68] underline">Tentar novamente</button>}</div>
    </section>;
  }

  const field = (
    key: keyof PaymentAccountInput,
    label: string,
    type = 'text',
    required = true,
    placeholder?: string
  ) => {
    let displayValue = String(form[key] ?? '');
    if (key === 'incomeValue') {
      displayValue = form.incomeValue ? formatCurrency(form.incomeValue) : '';
    } else if (key === 'birthDate') {
      displayValue = toDisplayBirthDate(form.birthDate);
    }

    return (
      <label className="block text-xs font-bold text-slate-700">
        {label}
        <input
          required={required}
          type={key === 'incomeValue' || key === 'birthDate' ? 'text' : type}
          inputMode={key === 'incomeValue' || key === 'birthDate' ? 'numeric' : undefined}
          placeholder={placeholder}
          value={displayValue}
          onChange={(event) => {
            const rawVal = event.target.value;
            let val: any = rawVal;
            if (key === 'incomeValue') {
              const digits = rawVal.replace(/\D/g, '');
              val = digits ? Number(digits) / 100 : 0;
            } else if (key === 'birthDate') {
              val = formatBirthDate(rawVal);
            } else if (key === 'mobilePhone') {
              val = formatPhone(rawVal);
            } else if (key === 'cpfCnpj') {
              val = formatCpfCnpj(rawVal);
            } else if (key === 'postalCode') {
              val = formatCep(rawVal);
            } else if (type === 'number') {
              val = Number(rawVal);
            }
            setForm((current) => ({ ...current, [key]: val }));
          }}
          className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal outline-none transition focus:border-[#2E5B37] focus:bg-white"
        />
      </label>
    );
  };
  const isIndividual = form.cpfCnpj.replace(/\D/g, '').length <= 11;

  const accountForm = <>
    {error && <div className="mt-5 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
    <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
      {field('name', 'Nome completo ou razão social', 'text', true, 'Seu nome ou Razão Social')}
      {field('email', 'E-mail', 'email', true, 'seu@email.com')}
      {field('cpfCnpj', 'CPF ou CNPJ', 'text', true, '000.000.000-00 ou 00.000.000/0000-00')}
      {isIndividual ? (
        field('birthDate', 'Data de nascimento', 'text', true, 'DD/MM/AAAA')
      ) : (
        <label className="block text-xs font-bold text-slate-700">
          Tipo de empresa
          <select
            required
            value={form.companyType ?? ''}
            onChange={(event) => setForm((current) => ({ ...current, companyType: event.target.value as PaymentAccountInput['companyType'] }))}
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal outline-none transition focus:border-[#2E5B37] focus:bg-white"
          >
            <option value="">Selecione</option>
            <option value="MEI">MEI</option>
            <option value="LIMITED">LTDA</option>
            <option value="INDIVIDUAL">Empresário individual</option>
            <option value="ASSOCIATION">Associação</option>
          </select>
        </label>
      )}
      {field('mobilePhone', 'Celular', 'tel', true, '(00) 00000-0000')}
      {field('incomeValue', 'Renda/faturamento mensal', 'text', true, 'R$ 0,00')}
      {field('postalCode', 'CEP', 'text', true, '00000-000')}
      {field('address', 'Endereço', 'text', true, 'Rua, Avenida...')}
      {field('addressNumber', 'Número', 'text', true, '123')}
      {field('province', 'Bairro', 'text', true, 'Centro')}
      {field('complement', 'Complemento', 'text', false, 'Apto, Bloco...')}
      <div className="sm:col-span-2 flex items-center justify-between gap-4 border-t border-[#DCEBDD] pt-5">
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 text-[#2E5B37]" />
          A aprovação acontece no Asaas.
        </p>
        <button
          disabled={submitting}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#132E20] px-5 py-3 text-xs font-bold text-white transition hover:bg-[#23472B] disabled:cursor-wait disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Iniciar configuração
        </button>
      </div>
    </form>
  </>;

  return <>
    <section className="rounded-3xl border border-[#B7D5BE] bg-[#F8FCF8] p-6 shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E3F1E5] text-[#2E5B37]"><CreditCard className="h-5 w-5" /></div><div><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#2E5B37]">Próximo passo para vender</p><h2 className="mt-1 text-xl font-bold text-[#132E20]">Configure sua conta de recebimento</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Informe os dados complementares para iniciar o cadastro da sua subconta no Asaas.</p></div></div><button type="button" onClick={() => onFormOpenChange?.(true)} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[#132E20] px-5 py-3 text-xs font-bold text-white transition hover:bg-[#23472B]">Configurar recebimento</button></div>
    </section>
    {isFormOpen && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="payment-account-modal-title"><div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-[#B7D5BE] bg-[#F8FCF8] p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#2E5B37]">Configuração de recebimento</p><h2 id="payment-account-modal-title" className="mt-1 text-xl font-bold text-[#132E20]">Dados complementares da conta Asaas</h2><p className="mt-1 text-sm leading-6 text-slate-600">Esses dados serão enviados para iniciar a análise da sua conta de recebimento.</p></div><button type="button" onClick={() => onFormOpenChange?.(false)} className="rounded-xl px-3 py-2 text-sm font-bold text-slate-500 hover:bg-white hover:text-slate-800" aria-label="Fechar">Fechar</button></div>{accountForm}</div></div>}
  </>;
}
