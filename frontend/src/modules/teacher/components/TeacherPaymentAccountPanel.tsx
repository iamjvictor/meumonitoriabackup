'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  ShieldCheck,
  UserCheck,
  Wallet,
  MapPin,
  X,
  Check,
} from 'lucide-react';
import type { TeacherProfile } from '../services/TeacherProfileService';
import {
  TeacherPaymentAccountService,
  PaymentAccountApiError,
  type PaymentAccount,
  type PaymentAccountInput,
} from '../services/TeacherPaymentAccountService';
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
  variant?: 'standalone' | 'extension';
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

function isValidCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (10 - i);
  let rem = (sum * 10) % 11;
  if (rem === 10) rem = 0;
  if (rem !== Number(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * (11 - i);
  rem = (sum * 10) % 11;
  if (rem === 10) rem = 0;
  return rem === Number(digits[10]);
}

function isValidCnpj(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const calc = (len: number) => {
    let sum = 0;
    let weight = len === 12 ? 5 : 6;
    for (let i = 0; i < len; i++) {
      sum += Number(digits[i]) * weight--;
      if (weight < 2) weight = 9;
    }
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}

function validateBirthDate(birthDate: string): { valid: boolean; error?: string; formatted?: string } {
  const digits = birthDate.replace(/\D/g, '');
  if (digits.length !== 8) {
    return { valid: false, error: 'Informe a data completa no formato DD/MM/AAAA.' };
  }
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  const now = new Date();
  const currentYear = now.getFullYear();

  if (month < 1 || month > 12) return { valid: false, error: 'Mês de nascimento inválido.' };
  if (day < 1 || day > 31) return { valid: false, error: 'Dia de nascimento inválido.' };
  if (year < 1920 || year > currentYear) return { valid: false, error: 'Ano de nascimento inválido.' };

  const parsedDate = new Date(year, month - 1, day);
  if (parsedDate.getFullYear() !== year || parsedDate.getMonth() !== month - 1 || parsedDate.getDate() !== day) {
    return { valid: false, error: 'Data de nascimento inexistente no calendário.' };
  }

  const eighteenYearsAgo = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
  if (parsedDate > eighteenYearsAgo) {
    return { valid: false, error: 'O titular da conta Asaas deve ter pelo menos 18 anos.' };
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  return { valid: true, formatted: `${year}-${pad(month)}-${pad(day)}` };
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

export function TeacherPaymentAccountPanel({ teacher, onSessionExpired, onAccountChange, onAccountLoaded, isFormOpen = false, onFormOpenChange, initialAccount, variant = 'standalone' }: Props) {
  const isExtension = variant === 'extension';
  const [account, setAccount] = useState<PaymentAccount | null>(initialAccount ?? null);
  const [form, setForm] = useState<PaymentAccountInput>(() => initialForm(teacher));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [cepLoading, setCepLoading] = useState(false);
  const [cepSuccess, setCepSuccess] = useState(false);
  const [overview, setOverview] = useState<PaymentAccountOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewRetryable, setOverviewRetryable] = useState(false);

  const handleCepLookup = useCallback(async (cleanCep: string) => {
    if (cleanCep.length !== 8) return;
    setCepLoading(true);
    setCepSuccess(false);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (!data.erro) {
          setForm((prev) => ({
            ...prev,
            address: data.logradouro || prev.address,
            province: data.bairro || prev.province,
          }));
          setCepSuccess(true);
          setFieldErrors((prev) => {
            const next = { ...prev };
            delete next.address;
            delete next.province;
            delete next.postalCode;
            return next;
          });
        }
      }
    } catch {
      // Ignora falha de rede do ViaCEP permitindo digitação manual
    } finally {
      setCepLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isFormOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFormOpenChange?.(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFormOpen, onFormOpenChange]);

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
    const errors: Record<string, string> = {};

    const cleanCpfCnpj = form.cpfCnpj.replace(/\D/g, '');
    const isIndividualDocument = cleanCpfCnpj.length <= 11;

    if (!form.name || form.name.trim().length < 3) {
      errors.name = 'Informe seu nome completo ou razão social.';
    }

    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = 'Informe um e-mail válido para notificações.';
    }

    if (isIndividualDocument) {
      if (!isValidCpf(cleanCpfCnpj)) {
        errors.cpfCnpj = 'CPF inválido. Verifique os números digitados.';
      }
    } else {
      if (!isValidCnpj(cleanCpfCnpj)) {
        errors.cpfCnpj = 'CNPJ inválido. Verifique os números digitados.';
      }
      if (!form.companyType) {
        errors.companyType = 'Selecione o tipo de empresa.';
      }
    }

    let formattedBirthDate: string | undefined = undefined;
    if (isIndividualDocument) {
      const birthCheck = validateBirthDate(form.birthDate || '');
      if (!birthCheck.valid) {
        errors.birthDate = birthCheck.error || 'Data de nascimento inválida.';
      } else {
        formattedBirthDate = birthCheck.formatted;
      }
    }

    const cleanPhone = form.mobilePhone.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      errors.mobilePhone = 'Celular inválido. Digite DDD + número (10 ou 11 dígitos).';
    }

    if (!form.incomeValue || form.incomeValue <= 0) {
      errors.incomeValue = 'Informe uma renda ou faturamento mensal maior que zero.';
    }

    const cleanCep = form.postalCode.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      errors.postalCode = 'CEP deve conter exatamente 8 dígitos.';
    }

    if (!form.address || form.address.trim().length < 2) {
      errors.address = 'Informe o endereço completo (rua, avenida...).';
    }

    if (!form.addressNumber || form.addressNumber.trim().length < 1) {
      errors.addressNumber = 'Informe o número do endereço.';
    }

    if (!form.province || form.province.trim().length < 2) {
      errors.province = 'Informe o bairro.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError('Por favor, revise os campos destacados em vermelho abaixo.');
      setSubmitting(false);
      return;
    }

    setFieldErrors({});

    try {
      const nextAccount = await TeacherPaymentAccountService.create({
        ...form,
        cpfCnpj: cleanCpfCnpj,
        mobilePhone: cleanPhone,
        postalCode: cleanCep,
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
      if (reason instanceof TeacherSessionError) {
        onSessionExpired?.();
        return;
      }
      if (reason instanceof PaymentAccountApiError) {
        setError(reason.message);
        if (reason.fieldErrors) {
          const mappedErrors: Record<string, string> = {};
          for (const [k, v] of Object.entries(reason.fieldErrors)) {
            if (Array.isArray(v) && v[0]) mappedErrors[k] = v[0];
          }
          setFieldErrors(mappedErrors);
        } else {
          const highlighted: Record<string, string> = {};
          const msg = reason.message.toLowerCase();
          if (msg.includes('cep')) highlighted.postalCode = 'Verifique o CEP';
          if (msg.includes('cpf') || msg.includes('cnpj')) highlighted.cpfCnpj = 'Verifique os dados cadastrais';
          if (msg.includes('nascimento')) highlighted.birthDate = 'Verifique a data de nascimento';
          if (msg.includes('celular') || msg.includes('telefone')) highlighted.mobilePhone = 'Verifique o celular';
          if (msg.includes('endereço')) highlighted.address = 'Verifique o endereço';
          if (Object.keys(highlighted).length > 0) setFieldErrors(highlighted);
        }
      } else {
        const errorMsg = reason instanceof Error ? reason.message : 'Não foi possível iniciar o cadastro.';
        setError(errorMsg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!teacher) return null;
  if (loading) return <section className={`border border-slate-200 bg-white p-6 shadow-sm ${isExtension ? 'rounded-b-3xl rounded-t-none border-t-0 -mt-px mb-8' : 'rounded-3xl'}`}><div className="flex items-center gap-3 text-sm font-semibold text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-[#2E5B37]" /> Consultando sua conta de recebimento...</div></section>;

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
    return <section className={`overflow-hidden border border-slate-200 bg-white shadow-sm ${isExtension ? 'rounded-b-3xl rounded-t-none border-t-0 -mt-px mb-8' : 'rounded-3xl'}`}>
      <div className={`${statusHeaderClass} p-6 text-white`}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${statusToneClasses[status.tone as keyof typeof statusToneClasses]}`}><StatusIcon className="h-5 w-5" /></div>
          <div><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/80">Conta de recebimento Asaas</p><h2 className="mt-1 text-xl font-bold text-white">{statusOverview.label}</h2><p className="mt-1 max-w-xl text-sm leading-6 text-white/90">{statusOverview.description}</p></div>
        </div>
        {dashboardUrl && statusOverview.label === 'Aprovada' ? <a href={dashboardUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-bold text-[#123B68] transition hover:bg-blue-50"><span>Abrir painel Asaas</span><ArrowUpRight className="h-4 w-4" /></a> : <a href={onboardingUrl || dashboardUrl || 'https://www.asaas.com/login'} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-bold text-[#123B68] transition hover:bg-blue-50"><span>Concluir ativação e enviar documentos</span><ArrowUpRight className="h-4 w-4" /></a>}
      </div>
      </div>
      {account.webhookSyncState && account.webhookSyncState !== 'ACTIVE' && <div className={`mx-6 mt-5 flex gap-3 rounded-xl border p-4 text-sm ${account.webhookSyncState === 'FAILED' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`} role="status">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{account.webhookSyncState === 'FAILED' ? 'Não foi possível ativar as notificações automáticas do Asaas. Nossa equipe precisa revisar essa configuração.' : 'Estamos concluindo a configuração das notificações automáticas do Asaas. A atualização continuará em segundo plano.'}</span>
      </div>}
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
    placeholder?: string,
    extraBadge?: React.ReactNode,
    helperText?: string,
  ) => {
    let displayValue = String(form[key] ?? '');
    if (key === 'incomeValue') {
      displayValue = form.incomeValue ? formatCurrency(form.incomeValue) : '';
    } else if (key === 'birthDate') {
      displayValue = toDisplayBirthDate(form.birthDate);
    }

    const fieldError = fieldErrors[key];

    return (
      <div className="flex flex-col">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
          <label htmlFor={`input-${key}`} className="flex items-center gap-1.5 cursor-pointer">
            <span>{label}</span>
            {required ? (
              <span className="text-rose-500 font-bold" title="Campo obrigatório">*</span>
            ) : (
              <span className="text-[10px] font-normal text-slate-400 font-sans">(opcional)</span>
            )}
          </label>
          {extraBadge}
        </div>

        <div className="relative mt-1.5">
          <input
            id={`input-${key}`}
            required={required}
            type={key === 'incomeValue' || key === 'birthDate' ? 'text' : type}
            inputMode={key === 'incomeValue' || key === 'birthDate' || key === 'postalCode' || key === 'cpfCnpj' || key === 'mobilePhone' ? 'numeric' : undefined}
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
                const clean = rawVal.replace(/\D/g, '');
                if (clean.length === 8) {
                  void handleCepLookup(clean);
                }
              } else if (type === 'number') {
                val = Number(rawVal);
              }
              setForm((current) => ({ ...current, [key]: val }));
              if (fieldErrors[key]) {
                setFieldErrors((current) => {
                  const copy = { ...current };
                  delete copy[key];
                  return copy;
                });
              }
            }}
            className={`min-h-11 w-full rounded-xl border px-3.5 text-sm font-normal text-slate-900 outline-none transition-all placeholder:text-slate-400 ${
              fieldError
                ? 'border-rose-400 bg-rose-50/20 text-rose-950 focus:border-rose-600 focus:ring-4 focus:ring-rose-500/10'
                : 'border-slate-200 bg-white hover:border-slate-300 focus:border-[#2E5B37] focus:bg-white focus:ring-4 focus:ring-emerald-500/10'
            }`}
          />

          {key === 'postalCode' && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-slate-400 pointer-events-none">
              {cepLoading ? (
                <span className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                  Buscando CEP...
                </span>
              ) : cepSuccess ? (
                <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  Localizado
                </span>
              ) : null}
            </div>
          )}
        </div>

        {fieldError ? (
          <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-600 animate-in fade-in duration-200">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span>{fieldError}</span>
          </p>
        ) : helperText ? (
          <p className="mt-1 text-[11px] text-slate-500">{helperText}</p>
        ) : null}
      </div>
    );
  };

  const cleanDocument = form.cpfCnpj.replace(/\D/g, '');
  const isIndividual = cleanDocument.length <= 11;

  const accountForm = <>
    {error && (
      <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50/90 p-4 sm:p-5 text-rose-900 shadow-sm" role="alert">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-rose-900">Atenção ao preencher os dados cadastrais</h3>
            <p className="mt-1 text-xs sm:text-sm text-rose-800 leading-relaxed">{error}</p>
            <div className="mt-3 rounded-xl border border-rose-200/70 bg-white/70 p-3 text-xs text-slate-700">
              <p className="font-semibold text-rose-950 mb-1.5">Dicas para aprovação imediata no Asaas:</p>
              <ul className="space-y-1 list-disc list-inside text-slate-600">
                <li><strong>CPF e Data de Nascimento:</strong> Devem ser idênticos aos cadastrados na Receita Federal.</li>
                <li><strong>CEP e Endereço:</strong> Certifique-se de que o CEP existe e o logradouro está preenchido corretamente.</li>
                <li><strong>Telefone celular:</strong> Deve ser um número ativo com DDD brasileiro válido.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    )}

    <form onSubmit={submit} className="mt-6 space-y-6">
      {/* Seção 1: Identificação */}
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
        <div className="flex items-center justify-between border-b border-slate-200/60 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
              <UserCheck className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wide">
                Identificação do Titular
              </h3>
              <p className="text-[11px] text-slate-500">Dados cadastrais na Receita Federal</p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/60 rounded-full px-2.5 py-0.5">
            {isIndividual ? 'Pessoa Física' : 'Pessoa Jurídica'}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            {field('name', 'Nome completo ou razão social', 'text', true, 'Nome conforme documento oficial')}
          </div>
          {field(
            'cpfCnpj',
            'CPF ou CNPJ',
            'text',
            true,
            '000.000.000-00 ou 00.000.000/0000-00',
            cleanDocument.length > 0 ? (
              <span className="text-[10px] font-semibold text-slate-500">
                {isIndividual ? 'CPF (11 dígitos)' : 'CNPJ (14 dígitos)'}
              </span>
            ) : null,
          )}
          {isIndividual ? (
            field('birthDate', 'Data de nascimento', 'text', true, 'DD/MM/AAAA', null, 'O titular deve ter no mínimo 18 anos')
          ) : (
            <div className="flex flex-col">
              <label htmlFor="input-companyType" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <span>Tipo de empresa</span>
                <span className="text-rose-500 font-bold">*</span>
              </label>
              <div className="mt-1.5">
                <select
                  id="input-companyType"
                  required
                  value={form.companyType ?? ''}
                  onChange={(event) => {
                    const val = event.target.value as PaymentAccountInput['companyType'];
                    setForm((current) => ({ ...current, companyType: val }));
                    if (fieldErrors.companyType) {
                      setFieldErrors((current) => {
                        const copy = { ...current };
                        delete copy.companyType;
                        return copy;
                      });
                    }
                  }}
                  className={`min-h-11 w-full rounded-xl border px-3.5 text-sm font-normal text-slate-900 outline-none transition-all ${
                    fieldErrors.companyType
                      ? 'border-rose-400 bg-rose-50/20 text-rose-950 focus:border-rose-600 focus:ring-4 focus:ring-rose-500/10'
                      : 'border-slate-200 bg-white hover:border-slate-300 focus:border-[#2E5B37] focus:bg-white focus:ring-4 focus:ring-emerald-500/10'
                  }`}
                >
                  <option value="">Selecione o formato jurídico</option>
                  <option value="MEI">MEI (Microempreendedor Individual)</option>
                  <option value="LIMITED">LTDA (Sociedade Limitada)</option>
                  <option value="INDIVIDUAL">Empresário Individual</option>
                  <option value="ASSOCIATION">Associação</option>
                </select>
              </div>
              {fieldErrors.companyType && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-600">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>{fieldErrors.companyType}</span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Seção 2: Contato & Financeiro */}
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
        <div className="flex items-center justify-between border-b border-slate-200/60 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-800">
              <Wallet className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wide">
                Contato & Financeiro
              </h3>
              <p className="text-[11px] text-slate-500">Notificações da conta e volume de recebimento</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {field('email', 'E-mail para repasses e avisos', 'email', true, 'seu@email.com')}
          {field('mobilePhone', 'Celular com DDD (WhatsApp)', 'tel', true, '(00) 00000-0000')}
          <div className="sm:col-span-2">
            {field(
              'incomeValue',
              'Renda ou faturamento mensal estimado',
              'text',
              true,
              'R$ 0,00',
              null,
              'Valor estimado de movimentação mensal para fins cadastrais do BACEN',
            )}
          </div>
        </div>
      </div>

      {/* Seção 3: Endereço */}
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
        <div className="flex items-center justify-between border-b border-slate-200/60 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-100 text-teal-800">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wide">
                Endereço
              </h3>
              <p className="text-[11px] text-slate-500">Preenchimento automático ao digitar o CEP</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            {field('postalCode', 'CEP', 'text', true, '00000-000', null, 'Digite o CEP para buscar rua e bairro automaticamente')}
          </div>
          <div className="sm:col-span-2">
            {field('address', 'Endereço (Rua, Avenida, Estrada...)', 'text', true, 'Ex: Av. Paulista')}
          </div>
          {field('addressNumber', 'Número', 'text', true, '123 ou S/N')}
          {field('province', 'Bairro', 'text', true, 'Ex: Centro')}
          <div className="sm:col-span-2">
            {field('complement', 'Complemento', 'text', false, 'Apto, Bloco, Sala...')}
          </div>
        </div>
      </div>

      {/* Rodapé da modal */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 pt-5 mt-2">
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[#2E5B37]" />
          <span>A aprovação acontece no Asaas. Seus dados são criptografados de ponta a ponta.</span>
        </p>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={() => onFormOpenChange?.(false)}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#132E20] hover:bg-[#23472B] px-6 py-3 text-xs sm:text-sm font-bold text-white shadow-lg shadow-emerald-950/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-wait disabled:opacity-60 cursor-pointer"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Iniciar configuração
          </button>
        </div>
      </div>
    </form>
  </>;

  return <>
    {isExtension ? (
      <section className="w-full rounded-b-3xl rounded-t-none border-x border-b border-t border-amber-500/40 bg-gradient-to-r from-[#241708] via-[#331F0A] to-[#221507] p-6 sm:p-7 text-white shadow-xl relative overflow-hidden -mt-px mb-8">
        {/* Glow de fundo âmbar */}
        <div className="absolute -left-10 -bottom-10 w-56 h-56 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-[0_0_16px_rgba(245,158,11,0.25)]">
              <AlertTriangle className="h-6 w-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-400">
                  Pendência de Ativação • Próximo passo para vender
                </p>
              </div>
              <h2 className="mt-1 text-lg sm:text-xl font-bold text-white font-heading">
                Configure sua conta de recebimento
              </h2>
              <p className="mt-1 max-w-2xl text-xs sm:text-sm leading-relaxed text-amber-200/85">
                Informe os dados complementares para iniciar o cadastro da sua subconta no Asaas e liberar o recebimento dos repasses das vendas.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onFormOpenChange?.(true)}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 px-5 py-3 text-xs sm:text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <CreditCard className="h-4 w-4 text-slate-950" />
            <span>Configurar recebimento</span>
            <ArrowRight className="h-4 w-4 text-slate-950" />
          </button>
        </div>
      </section>
    ) : (
      <section className="rounded-3xl border border-amber-400/60 bg-amber-50/80 p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-800">Próximo passo para vender</p>
              <h2 className="mt-1 text-xl font-bold text-amber-950">Configure sua conta de recebimento</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-amber-900/80">Informe os dados complementares para iniciar o cadastro da sua subconta no Asaas.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onFormOpenChange?.(true)}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-amber-600 px-5 py-3 text-xs font-bold text-white transition hover:bg-amber-700 cursor-pointer"
          >
            Configurar recebimento
          </button>
        </div>
      </section>
    )}
    {isFormOpen && (
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6 backdrop-blur-md overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-account-modal-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) onFormOpenChange?.(false);
        }}
      >
        <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[28px] border border-[#B7D5BE]/80 bg-white shadow-2xl">
          <div className="h-1.5 w-full bg-gradient-to-r from-[#1B432C] via-[#2E5B37] to-[#123B68]" />

          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#2E5B37] border border-emerald-200/60">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    Configuração de recebimento
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                    Asaas
                  </span>
                </div>
                <h2 id="payment-account-modal-title" className="mt-2 text-xl sm:text-2xl font-bold text-[#132E20] font-heading">
                  Dados complementares da conta Asaas
                </h2>
                <p className="mt-1 text-xs sm:text-sm leading-relaxed text-slate-600">
                  Esses dados serão enviados para iniciar a análise da sua conta de recebimento.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onFormOpenChange?.(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition cursor-pointer"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {accountForm}
          </div>
        </div>
      </div>
    )}
  </>;
}
