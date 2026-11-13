'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, CalendarClock, LoaderCircle, Plus, RefreshCw, Users, XCircle, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { TeacherMonitorService, type TeacherMonitor } from '../services/TeacherMonitorService';
import { parseSponsoredEmails, TeacherSponsoredSeatService, TeacherSponsoredSeatApiError, type SponsoredBatchQuote, type SponsoredSeatBatch, type SponsoredSeatBillingType, type SponsoredSeatInterval } from '../services/TeacherSponsoredSeatService';

const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const seatStatus: Record<string, string> = {
  PENDING_PAYMENT: 'Aguardando pagamento', CHECKOUT_PENDING: 'Aguardando pagamento', CHECKOUT_PAID_PENDING_PAYMENT: 'Pagamento em processamento', PAID_UNCLAIMED: 'Pago; aguardando o aluno',
  ACTIVE: 'Acesso ativo', CANCEL_PENDING: 'Acesso até o fim do período', EXPIRED: 'Expirado', REFUNDED: 'Reembolsado', CHARGEBACK: 'Contestação',
};
const batchStatus: Record<string, string> = { PENDING: 'Aguardando pagamento', CHECKOUT_PENDING: 'Aguardando pagamento', CHECKOUT_CREATION_FAILED: 'Falha ao criar checkout', ACTIVE: 'Ativa', CANCEL_PENDING: 'Renovação cancelada', EXPIRED: 'Encerrada', FAILED: 'Falha no pagamento', REFUNDED: 'Reembolsada' };

function userFacingError(cause: unknown, fallback: string) {
  const statusCode = cause && typeof cause === 'object' && 'statusCode' in cause && typeof cause.statusCode === 'number'
    ? cause.statusCode
    : 0;
  if (statusCode >= 500) {
    return 'O serviço de turmas está instável. Tente novamente em instantes.';
  }
  if (cause instanceof Error && /erro interno do servidor|internal server error/i.test(cause.message)) {
    return 'O serviço de turmas está instável. Tente novamente em instantes.';
  }
  if (cause instanceof TypeError) {
    return 'Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.';
  }
  return cause instanceof Error ? cause.message : fallback;
}

export function TeacherSponsoredClassesPage() {
  const [renewalTarget, setRenewalTarget] = useState<{ batch: SponsoredSeatBatch; email: string; interval: SponsoredSeatInterval; billingType: SponsoredSeatBillingType; quote: SponsoredBatchQuote | null; busy: boolean; error: string | null } | null>(null);
  const [monitors, setMonitors] = useState<TeacherMonitor[]>([]);
  const [batches, setBatches] = useState<SponsoredSeatBatch[]>([]);
  const [monitorId, setMonitorId] = useState('');
  const [interval, setInterval] = useState<SponsoredSeatInterval>('MONTHLY');
  const [billingType, setBillingType] = useState<SponsoredSeatBillingType | null>(null);
  const [paymentMenuOpen, setPaymentMenuOpen] = useState(false);
  const [purchaseStep, setPurchaseStep] = useState(1);
  const [emailsText, setEmailsText] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [expandedMonitors, setExpandedMonitors] = useState<Record<string, boolean>>({});
  const [monitorIntervalFilters, setMonitorIntervalFilters] = useState<Record<string, 'ALL' | SponsoredSeatInterval>>({});
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editingEmailsText, setEditingEmailsText] = useState('');
  const [updatingBatchId, setUpdatingBatchId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [quote, setQuote] = useState<SponsoredBatchQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorPlacement, setErrorPlacement] = useState<'general' | 'quote' | 'checkout'>('general');
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const parsedEmails = useMemo(() => parseSponsoredEmails(emailsText), [emailsText]);
  const emails = emailsText.split(/\s+/).filter(Boolean);
  const publishedMonitors = monitors.filter((monitor) => monitor.status === 'PUBLISHED');
  const selectedMonitor = publishedMonitors.find((monitor) => monitor.id === monitorId);
  const annualAvailable = Boolean(selectedMonitor?.annualPriceCents && selectedMonitor.annualPriceCents > 0);
  const showAnnualCardEstimate = Boolean(quote && interval === 'ANNUAL' && billingType === 'CREDIT_CARD');
  const batchesByMonitor = batches.reduce<Record<string, SponsoredSeatBatch[]>>((groups, batch) => {
    (groups[batch.monitorId] ??= []).push(batch);
    return groups;
  }, {});
  const monitorsWithBatches = monitors.map((monitor) => ({ monitor, batches: batchesByMonitor[monitor.id] ?? [] }));
  const showError = (message: string | null) => { setError(message); setErrorPlacement('general'); };

  const reload = useCallback(async () => {
    setLoading(true); setMonitorError(null); setHistoryError(null);
    const [monitorResult, batchResult] = await Promise.allSettled([TeacherMonitorService.listMine(), TeacherSponsoredSeatService.listSponsoredBatches()]);
    if (monitorResult.status === 'fulfilled') {
      setMonitors(monitorResult.value);
      setMonitorId((current) => current && monitorResult.value.some((item) => item.id === current && item.status === 'PUBLISHED') ? current : '');
    } else setMonitorError(userFacingError(monitorResult.reason, 'Não foi possível carregar seus monitores.'));
    if (batchResult.status === 'fulfilled') { setBatches(batchResult.value); setHistoryError(null); }
    else { setHistoryError(userFacingError(batchResult.reason, 'Não foi possível carregar o histórico de vagas.')); setBatches([]); }
    setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { if (interval === 'ANNUAL' && !annualAvailable) setInterval('MONTHLY'); }, [annualAvailable, interval]);

  const requestQuote = async () => {
    showError(null); setNotice(null); setQuote(null);
    if (!monitorId) { showError('Selecione um monitor publicado.'); return; }
    if (!billingType) { showError('Selecione a forma de pagamento.'); return; }
    if (!parsedEmails.emails.length) { showError('Informe pelo menos um e-mail de aluno.'); return; }
    if (parsedEmails.invalid.length) { showError(`Confira os e-mails inválidos: ${parsedEmails.invalid.join(', ')}`); return; }
    if (parsedEmails.duplicates.length) { showError(`Remova os e-mails repetidos: ${parsedEmails.duplicates.join(', ')}`); return; }
    setQuoting(true);
    try {
      const result = await TeacherSponsoredSeatService.quoteSponsoredBatch({ monitorId, interval, beneficiaryEmails: parsedEmails.emails });
      setQuote(result);
      setPurchaseStep(3);
    } catch (cause) { setError(userFacingError(cause, 'Não foi possível calcular o valor.')); setErrorPlacement('quote'); }
    finally { setQuoting(false); }
  };

  const addEmail = () => {
    const value = emailInput.trim().toLowerCase();
    if (!value) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { showError('Informe um e-mail válido.'); return; }
    if (emails.includes(value)) { showError('Este e-mail já está na lista.'); return; }
    showError(null); setEmailsText([...emails, value].join('\n')); setEmailInput(''); setQuote(null);
  };

  const removeEmail = (email: string) => { setEmailsText(emails.filter((item) => item !== email).join('\n')); setQuote(null); };

  const updatePendingBatch = async (batch: SponsoredSeatBatch) => {
    const parsed = parseSponsoredEmails(editingEmailsText);
    if (!parsed.emails.length || parsed.invalid.length || parsed.duplicates.length) { showError('Revise os e-mails: informe endereços válidos e sem repetição.'); return; }
    setUpdatingBatchId(batch.id); showError(null);
    try {
      const quoteResult = await TeacherSponsoredSeatService.quoteSponsoredBatch({ monitorId: batch.monitorId, interval: batch.interval, beneficiaryEmails: parsed.emails });
      const result = await TeacherSponsoredSeatService.updateSponsoredBatch(batch.id, { beneficiaryEmails: parsed.emails, expectedTotalAmountCents: quoteResult.totalAmountCents });
      setEditingBatchId(null); window.location.assign(result.checkoutUrl);
    } catch (cause) { showError(userFacingError(cause, 'Não foi possível atualizar este lote.')); }
    finally { setUpdatingBatchId(null); }
  };

  const cancelBatch = async (batchId: string) => {
    setCancellingId(batchId); showError(null); setNotice(null);
    try {
      await TeacherSponsoredSeatService.cancelSponsoredBatch(batchId);
      setNotice('A renovação foi cancelada. Os alunos mantêm acesso até o fim do período pago.');
      await reload();
    } catch (cause) {
      showError(userFacingError(cause, 'Não foi possível cancelar a renovação.'));
    } finally {
      setCancellingId(null);
    }
  };

  const startCheckout = async () => {
    if (!quote || !billingType) return;
    setCreating(true); showError(null);
    try {
      const result = await TeacherSponsoredSeatService.createSponsoredBatch({ monitorId, interval, billingType, beneficiaryEmails: parsedEmails.emails, expectedTotalAmountCents: quote.totalAmountCents });
      window.location.assign(result.checkoutUrl);
    } catch (cause) {
      if (cause instanceof TeacherSponsoredSeatApiError && cause.code === 'PRICE_CHANGED') {
        setQuote(null);
        setPurchaseStep(2);
        setError('O preço foi atualizado. Revise a cotação antes de continuar.');
        setErrorPlacement('quote');
      } else {
        setError(userFacingError(cause, 'Não foi possível abrir o checkout.'));
        setErrorPlacement('checkout');
      }
    } finally { setCreating(false); }
  };

  const quoteRenewal = async () => {
    if (!renewalTarget) return;
    setRenewalTarget((current) => current ? { ...current, busy: true, error: null, quote: null } : current);
    try {
      const quoteResult = await TeacherSponsoredSeatService.quoteSponsoredBatch({ monitorId: renewalTarget.batch.monitorId, interval: renewalTarget.interval, beneficiaryEmails: [renewalTarget.email] });
      setRenewalTarget((current) => current ? { ...current, quote: quoteResult, busy: false } : current);
    } catch (cause) {
      setRenewalTarget((current) => current ? { ...current, busy: false, error: userFacingError(cause, 'Não foi possível calcular a renovação.') } : current);
    }
  };

  const checkoutRenewal = async () => {
    if (!renewalTarget?.quote) return;
    setRenewalTarget((current) => current ? { ...current, busy: true, error: null } : current);
    try {
      const result = await TeacherSponsoredSeatService.createSponsoredBatch({ monitorId: renewalTarget.batch.monitorId, interval: renewalTarget.interval, billingType: renewalTarget.billingType, beneficiaryEmails: [renewalTarget.email], expectedTotalAmountCents: renewalTarget.quote.totalAmountCents });
      window.location.assign(result.checkoutUrl);
    } catch (cause) {
      const priceChanged = cause instanceof TeacherSponsoredSeatApiError && cause.code === 'PRICE_CHANGED';
      setRenewalTarget((current) => current ? { ...current, busy: false, quote: priceChanged ? null : current.quote, error: priceChanged ? 'O preço mudou. Calcule novamente para confirmar o novo valor.' : userFacingError(cause, 'Não foi possível abrir o pagamento.') } : current);
    }
  };

  return <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div><Link href="/professor" className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-white hover:text-emerald-900"><ArrowLeft className="h-4 w-4"/>Voltar ao painel</Link><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Gestão de alunos</p><h1 className="mt-1 text-2xl font-extrabold text-[#132E20]">Turmas patrocinadas</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">Escolha um monitor publicado, informe os alunos e compre as vagas para eles.</p></div>
      <button type="button" disabled={loading} onClick={() => void reload()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">{loading ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}{loading ? 'Atualizando…' : 'Atualizar'}</button>
    </header>

    {error && errorPlacement === 'general' && <div role="alert" className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0"/><span>{error}</span></div>}
    {monitorError && historyError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700"/><div><p className="font-bold">Não foi possível carregar os dados das turmas.</p><p className="mt-0.5 text-rose-800">Monitores e histórico de vagas estão temporariamente indisponíveis.</p></div></div><button type="button" disabled={loading} onClick={() => void reload()} className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 font-bold text-rose-900 underline disabled:opacity-60">{loading && <LoaderCircle className="h-4 w-4 animate-spin"/>}Tentar novamente</button></div> : monitorError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700"/><div><p className="font-bold">Não foi possível carregar seus monitores.</p><p className="mt-0.5 text-rose-800">{monitorError}</p></div></div><button type="button" disabled={loading} onClick={() => void reload()} className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 font-bold text-rose-900 underline disabled:opacity-60">{loading && <LoaderCircle className="h-4 w-4 animate-spin"/>}Tentar novamente</button></div> : null}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</div>}
    {!monitorError && historyError && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><span><strong>Histórico de vagas indisponível.</strong> Você ainda pode iniciar uma nova compra. {historyError}</span><button type="button" disabled={loading} onClick={() => void reload()} className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 font-bold underline disabled:opacity-60">{loading && <LoaderCircle className="h-4 w-4 animate-spin"/>}Tentar novamente</button></div>}

    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-start gap-3"><span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-800"><Plus className="h-5 w-5"/></span><div><h2 className="font-bold text-slate-900">Adicionar alunos</h2><p className="mt-1 text-sm text-slate-600">Você pode comprar vagas em momentos diferentes, conforme precisar.</p></div></div>
        {loading ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin"/>Carregando seus monitores…</div> : monitorError ? <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Não foi possível carregar a lista de monitores. Tente novamente.</p> : publishedMonitors.length === 0 ? <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Publique um monitor para poder adicionar alunos.</p> : <div className="space-y-4">
          <nav aria-label="Etapas da compra" className="grid grid-cols-3 gap-2">
            {['Plano', 'Alunos', 'Revisão'].map((label, index) => <div key={label} aria-current={purchaseStep === index + 1 ? 'step' : undefined} className={`border-b-2 pb-2 text-xs font-bold sm:text-sm ${purchaseStep === index + 1 ? 'border-emerald-700 text-emerald-900' : purchaseStep > index + 1 ? 'border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-400'}`}><span className="mr-1.5">{index + 1}.</span>{label}</div>)}
          </nav>
          {purchaseStep === 1 && <div className="space-y-4" aria-label="Etapa 1: escolha do plano">
          <label className="block text-sm font-semibold text-slate-700">1. Escolha o monitor<select value={monitorId} onChange={(event) => { setMonitorId(event.target.value); setBillingType(null); setPaymentMenuOpen(false); setQuote(null); showError(null); }} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"><option value="">Selecione um monitor</option>{publishedMonitors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {selectedMonitor && <>
          <fieldset><legend className="mb-2 text-sm font-semibold text-slate-700">2. Período de acesso</legend><div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => { if (interval !== 'MONTHLY') setBillingType(null); setInterval('MONTHLY'); setPaymentMenuOpen(false); setQuote(null); showError(null); }} aria-pressed={interval === 'MONTHLY'} className={`rounded-xl border p-3 text-left ${interval === 'MONTHLY' ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200'}`}><span className="block text-sm font-bold">Mensal</span><span className="mt-1 block text-xs text-slate-500">Acesso por um mês; a renovação pode ser manual ou automática.</span></button><button type="button" disabled={!annualAvailable} onClick={() => { if (interval !== 'ANNUAL') setBillingType(null); setInterval('ANNUAL'); setPaymentMenuOpen(false); setQuote(null); showError(null); }} aria-pressed={interval === 'ANNUAL'} className={`rounded-xl border p-3 text-left disabled:cursor-not-allowed disabled:opacity-50 ${interval === 'ANNUAL' ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200'}`}><span className="block text-sm font-bold">Anual · 12 meses</span><span className="mt-1 block text-xs text-slate-500">{annualAvailable ? 'Compra única; a renovação será manual.' : 'Ainda não configurado para este monitor.'}</span></button></div></fieldset>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">3. Forma de pagamento</p>
            <button type="button" aria-expanded={paymentMenuOpen} aria-controls="sponsored-payment-method-options" onClick={() => setPaymentMenuOpen((open) => !open)} className="flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 text-left text-sm font-semibold text-slate-800"><span>{billingType ? `Forma de pagamento: ${billingType === 'PIX' ? 'Pix' : 'Cartão de crédito'}` : 'Forma de pagamento'}</span><ChevronDown className={`h-4 w-4 transition-transform ${paymentMenuOpen ? 'rotate-180' : ''}`}/></button>
            {paymentMenuOpen && <div id="sponsored-payment-method-options" className="grid gap-2 sm:grid-cols-2">
              <button type="button" aria-pressed={billingType === 'PIX'} onClick={() => { setBillingType('PIX'); setPaymentMenuOpen(false); setQuote(null); showError(null); }} className={`rounded-xl border p-3 text-left ${billingType === 'PIX' ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200'}`}>
                <span className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold">Pix</span><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">Recomendado</span></span>
                <span className="mt-1 block text-xs text-slate-500">{interval === 'MONTHLY' ? 'Pagamento único para um mês; a renovação será manual.' : 'Pagamento único para 12 meses.'}</span>
              </button>
              <button type="button" aria-pressed={billingType === 'CREDIT_CARD'} onClick={() => { setBillingType('CREDIT_CARD'); setPaymentMenuOpen(false); setQuote(null); showError(null); }} className={`rounded-xl border p-3 text-left ${billingType === 'CREDIT_CARD' ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200'}`}>
                <span className="block text-sm font-bold">Cartão de crédito</span><span className="mt-1 block text-xs text-slate-500">{interval === 'MONTHLY' ? 'Cobrança recorrente no cartão.' : 'À vista ou em até 12x; escolha no checkout.'}</span>
              </button>
            </div>}
            {!billingType && <p className="text-xs text-slate-500">Selecione a forma de pagamento para revisar a compra.</p>}
          </div>
          </>}
          <button type="button" disabled={!monitorId || !billingType} onClick={() => { showError(null); setPurchaseStep(2); }} className="min-h-11 rounded-xl bg-[#132E20] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Continuar para alunos</button>
          </div>}
          {purchaseStep === 2 && <div className="space-y-4" aria-label="Etapa 2: adicione os alunos">
          <div><label htmlFor="sponsored-student-email" className="block text-sm font-semibold text-slate-700">4. Adicione os alunos um por vez</label><div className="mt-1.5 flex gap-2"><input id="sponsored-student-email" type="email" value={emailInput} onChange={(event) => setEmailInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addEmail(); } }} placeholder="aluno@email.com" className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm"/><button type="button" onClick={addEmail} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-700 px-4 text-sm font-bold text-emerald-900"><Plus className="h-4 w-4"/>Adicionar</button></div><ul className="mt-3 space-y-2">{emails.map((email) => <li key={email} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"><span>{email}</span><button type="button" aria-label={`Remover ${email}`} onClick={() => removeEmail(email)} className="text-rose-700"><Trash2 className="h-4 w-4"/></button></li>)}</ul><span className="mt-1 block text-xs text-slate-500">{emails.length} {emails.length === 1 ? 'aluno' : 'alunos'} na compra.</span></div>
          {!!parsedEmails.duplicates.length && <p className="text-sm text-rose-700">E-mails repetidos: {parsedEmails.duplicates.join(', ')}</p>}
          {!!parsedEmails.invalid.length && <p className="text-sm text-rose-700">E-mails inválidos: {parsedEmails.invalid.join(', ')}</p>}
          <button type="button" disabled={quoting || !billingType || !monitorId || !parsedEmails.emails.length || !!parsedEmails.invalid.length || !!parsedEmails.duplicates.length} onClick={() => void requestQuote()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#132E20] px-5 text-sm font-bold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50">{quoting && <LoaderCircle className="h-4 w-4 animate-spin"/>}Calcular valores e revisar</button>
          {error && errorPlacement === 'quote' && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
          <button type="button" onClick={() => { showError(null); setPurchaseStep(1); }} className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700">Voltar ao plano</button>
          </div>}
          {purchaseStep === 3 && quote && <div className="space-y-4" aria-label="Etapa 3: revisão da compra"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><h3 className="font-bold text-emerald-950">Revise a compra</h3><div className="mt-3 space-y-2 text-sm text-emerald-950"><p>{quote.seatCount} vagas · {interval === 'MONTHLY' ? billingType === 'PIX' ? 'mensal, pagamento único para 1 mês' : 'mensal, recorrente' : 'anual, 12 meses'}</p><p>Forma de pagamento: {billingType === 'PIX' ? 'Pix' : 'Cartão de crédito'}</p><p>Alunos: {parsedEmails.emails.join(', ')}</p><p>Valor por vaga: {money(quote.platformAmountCents)}</p><p className="border-t border-emerald-200 pt-2 text-base font-extrabold">Total: {money(quote.totalAmountCents)}{interval === 'MONTHLY' ? billingType === 'PIX' ? ' (pagamento único para 1 mês)' : '/mês' : billingType === 'CREDIT_CARD' ? ' (à vista ou em até 12x no cartão)' : ' (pagamento único)'}</p>{showAnnualCardEstimate && <p className="font-bold">Estimativa: até 12x de {money(quote.totalAmountCents / 12)}</p>}<p className="text-xs">Não há repasse ao professor nesta compra.</p></div></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setPurchaseStep(2)} className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold">Voltar aos alunos</button><button type="button" disabled={creating} onClick={() => void startCheckout()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white disabled:opacity-50">{creating && <LoaderCircle className="h-4 w-4 animate-spin"/>}Ir para pagamento</button></div>{error && errorPlacement === 'checkout' && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}</div>}
        </div>}
      </div>
      <aside aria-label="Resumo da compra" className="overflow-hidden rounded-2xl border border-slate-700 bg-[#101a17] text-emerald-50 shadow-[0_18px_40px_-24px_rgba(2,6,23,0.85)]">
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
          <h2 className="font-mono text-sm font-bold tracking-wide text-white">Resumo da compra</h2>
          <span aria-hidden="true" className="flex gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-400"/><i className="h-2 w-2 rounded-full bg-emerald-300/60"/><i className="h-2 w-2 rounded-full bg-white/30"/></span>
        </div>
        <div className="space-y-3 p-5 font-mono text-xs leading-relaxed sm:p-6 sm:text-sm">
          <p><span className="text-emerald-400">monitor:</span> <span className="break-words text-white">{selectedMonitor?.name ?? 'Selecione um monitor'}</span></p>
          <p><span className="text-emerald-400">plano:</span> <span className="text-white">{interval === 'MONTHLY' ? billingType === 'PIX' ? 'Mensal · pagamento único para 1 mês' : billingType === 'CREDIT_CARD' ? 'Mensal recorrente' : 'Mensal · acesso por 1 mês' : 'Anual · 12 meses'}</span></p>
          <p><span className="text-emerald-400">pagamento:</span> <span className="text-white">{billingType ? billingType === 'PIX' ? 'Pix' : 'Cartão de crédito' : 'Selecione uma forma'}</span></p>
          <div><p><span className="text-emerald-400">alunos:</span> <span className="text-white">{emails.length}</span></p>{emails.length > 0 && <ul className="mt-1 max-h-36 space-y-1 overflow-auto pl-4 text-emerald-100/80">{emails.map((email) => <li key={email} className="break-all">{email}</li>)}</ul>}</div>
          {quote && <div className="space-y-2 border-t border-emerald-400/20 pt-3"><p className="text-emerald-300">valor_por_vaga: <span className="text-white">{money(quote.platformAmountCents)}</span></p><p className="text-base font-extrabold text-emerald-300">total: <span className="text-white">{money(quote.totalAmountCents)}{interval === 'MONTHLY' ? billingType === 'PIX' ? ' · pagamento único para 1 mês' : '/mês' : ''}</span></p>{showAnnualCardEstimate && <><p className="font-semibold text-emerald-200">estimativa: <span className="text-white">até 12x de {money(quote.totalAmountCents / 12)}</span></p><p className="text-[11px] text-emerald-100/80">Estimativa informativa; condições e valor final serão confirmados no checkout Asaas.</p></>}</div>}
          <p className="border-t border-white/10 pt-3 text-[11px] text-emerald-100/80">O valor é calculado pela plataforma. Nenhum repasse será feito ao professor.</p>
        </div>
      </aside>
    </section>

    <section className="space-y-4"><div className="flex items-end justify-between"><div><h2 className="text-xl font-extrabold text-[#132E20]">Turmas e alunos</h2><p className="mt-1 text-sm text-slate-600">Acompanhe o cadastro e o período de acesso de cada aluno.</p></div><span className="inline-flex items-center gap-1 text-sm text-slate-500"><Users className="h-4 w-4"/>{new Set(batches.flatMap((batch) => batch.seats.map((seat) => seat.email.toLowerCase()))).size} alunos</span></div>
      {loading ? <p className="text-sm text-slate-500">Carregando suas turmas…</p> : monitorsWithBatches.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">Você ainda não tem monitores cadastrados.</div> : <div className="space-y-3">{monitorsWithBatches.map(({ monitor, batches: monitorBatches }) => {
        const selectedFilter = monitorIntervalFilters[monitor.id] ?? 'ALL';
        const visibleBatches = monitorBatches.filter((batch) => selectedFilter === 'ALL' || batch.interval === selectedFilter);
        const studentCount = new Set(visibleBatches.flatMap((batch) => batch.seats.map((seat) => seat.email.toLowerCase()))).size;
        const latestBatchByEmail = new Map<string, SponsoredSeatBatch>();
        for (const item of visibleBatches) for (const seat of item.seats) {
          const current = latestBatchByEmail.get(seat.email.toLowerCase());
          if (!current || new Date(item.createdAt).getTime() > new Date(current.createdAt).getTime()) latestBatchByEmail.set(seat.email.toLowerCase(), item);
        }
        return <details key={monitor.id} open={expandedMonitors[monitor.id] ?? false} className="overflow-hidden rounded-2xl border border-[#d8c4a5] bg-white shadow-[0_5px_16px_rgba(83,57,30,0.10)]"><summary onClick={(event) => { event.preventDefault(); setExpandedMonitors((current) => ({ ...current, [monitor.id]: !current[monitor.id] })); }} aria-expanded={expandedMonitors[monitor.id] ?? false} className="flex cursor-pointer list-none items-center justify-between bg-gradient-to-r from-[#f3eadc] to-[#e8f3eb] px-5 py-4 font-bold text-[#26392b] transition-colors hover:from-[#eadcc8] hover:to-[#dcecdf]">{monitor.name}<ChevronDown className={`h-4 w-4 transition-transform ${expandedMonitors[monitor.id] ? 'rotate-180 text-emerald-800' : 'text-[#755b3e]'}`}/></summary>{expandedMonitors[monitor.id] && <div className="bg-transparent">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#e8f0e9] px-4 py-3 sm:px-5"><div className="inline-flex rounded-lg bg-[#dce7dd] p-1" role="group" aria-label={`Filtrar alunos de ${monitor.name} por plano`}>{([{ key: 'ALL', label: 'Todos' }, { key: 'MONTHLY', label: 'Mensal' }, { key: 'ANNUAL', label: 'Anual' }] as const).map(({ key, label }) => <button key={key} type="button" aria-pressed={selectedFilter === key} onClick={() => setMonitorIntervalFilters((current) => ({ ...current, [monitor.id]: key }))} className={`min-h-9 rounded-md px-3 text-xs font-semibold ${selectedFilter === key ? 'bg-white text-emerald-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>)}</div><span className="text-sm font-semibold text-slate-700">{studentCount} {studentCount === 1 ? 'aluno' : 'alunos'}</span></div>
          {studentCount === 0 ? <p className="p-5 text-sm text-slate-500">{historyError ? 'Não foi possível carregar os alunos desta turma.' : 'Ainda não há alunos neste plano.'}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left text-xs sm:text-sm"><thead><tr className="border-b border-[#bdcbbd] bg-[#dfe9e1] text-[10px] uppercase tracking-wide text-slate-700 sm:text-xs"><th scope="col" className="px-3 py-2">Aluno</th><th scope="col" className="px-3 py-2">Status</th><th scope="col" className="px-3 py-2">Plano</th><th scope="col" className="px-3 py-2">Acesso até</th><th scope="col" className="px-3 py-2">Ação</th></tr></thead><tbody className="">{visibleBatches.flatMap((batch) => batch.seats.filter((seat) => latestBatchByEmail.get(seat.email.toLowerCase())?.id === batch.id).map((seat) => ({ batch, seat }))).map(({ batch, seat }, rowIndex) => {
            const isExpired = Boolean(seat.endsAt && new Date(seat.endsAt).getTime() <= Date.now());
            const status = isExpired ? 'Expirado' : seat.status === 'PAID_UNCLAIMED' ? 'Pago · aguardando vínculo' : seat.status === 'ACTIVE' ? 'Vinculado · acesso ativo' : seatStatus[seat.status] ?? seat.status;
            const statusStyle = isExpired ? 'bg-rose-50 text-rose-700' : seat.status === 'PAID_UNCLAIMED' ? 'bg-amber-50 text-amber-800' : seat.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700';
            const canEditPending = ['PENDING', 'CHECKOUT_PENDING', 'CHECKOUT_CREATION_FAILED'].includes(batch.status);
            const canCancelRenewal = batch.interval === 'MONTHLY' && batch.billingType === 'CREDIT_CARD' && batch.status === 'ACTIVE' && batch.seats[0]?.id === seat.id;
            return <tr key={seat.id} className={`transition-colors ${rowIndex % 2 === 0 ? 'bg-[#f2e8da] hover:bg-[#eadcc9]' : 'bg-[#dce9df] hover:bg-[#ccdfd1]'}`}><td className="max-w-[280px] px-3 py-2"><span className="block break-all font-medium text-slate-900">{seat.email}</span>{seat.studentName && <span className="block text-[11px] text-slate-700 sm:text-xs">{seat.studentName}</span>}</td><td className="px-3 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold sm:text-xs ${statusStyle}`}>{status}</span></td><td className="px-3 py-2 text-slate-800">{batch.interval === 'MONTHLY' ? 'Mensal' : 'Anual · 12 meses'}</td><td className="px-3 py-2 text-slate-800">{seat.endsAt ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(seat.endsAt)) : ['PENDING_PAYMENT', 'CHECKOUT_PENDING', 'CHECKOUT_PAID_PENDING_PAYMENT'].includes(seat.status) ? 'Aguardando pagamento' : 'Data indisponível'}{isExpired && <button type="button" onClick={() => setRenewalTarget({ batch, email: seat.email, interval: batch.interval, billingType: batch.billingType, quote: null, busy: false, error: null })} className="ml-2 inline-flex min-h-8 items-center rounded-md bg-emerald-800 px-2.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-emerald-900 sm:text-xs">Comprar novamente</button>}</td><td className="px-3 py-2">{canEditPending && <button type="button" onClick={() => { setEditingBatchId(batch.id); setEditingEmailsText(batch.seats.map((item) => item.email).join('\n')); }} className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-emerald-900 hover:bg-white/60"><Pencil className="h-3.5 w-3.5"/>Editar alunos</button>}{canCancelRenewal && <button type="button" disabled={cancellingId === batch.id} onClick={() => void cancelBatch(batch.id)} className="ml-1 inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">{cancellingId === batch.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin"/> : <XCircle className="h-3.5 w-3.5"/>}Cancelar renovação</button>}</td></tr>;
          })}</tbody></table></div>}
          {visibleBatches.filter((batch) => editingBatchId === batch.id).map((batch) => <div key={batch.id} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && updatingBatchId !== batch.id) setEditingBatchId(null); }}><section role="dialog" aria-modal="true" aria-labelledby="sponsored-edit-title" className="w-full max-w-xl space-y-5 rounded-2xl border border-emerald-500/40 bg-[#12382d] p-5 text-white shadow-2xl sm:p-6"><header className="flex items-start justify-between gap-4"><div><h2 id="sponsored-edit-title" className="text-lg font-extrabold text-white">Editar alunos</h2><p className="mt-1 text-sm text-white">{batch.monitorName} · {batch.interval === 'MONTHLY' ? 'Mensal' : 'Anual · 12 meses'} · {batch.billingType === 'PIX' ? 'Pix' : 'Cartão de crédito'}</p></div><button type="button" aria-label="Fechar" disabled={updatingBatchId === batch.id} onClick={() => setEditingBatchId(null)} className="rounded-lg px-3 py-1 text-white hover:bg-white/15">×</button></header><div className="max-h-56 space-y-2 overflow-y-auto">{batch.seats.map((seat) => <div key={seat.id} className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 p-3"><div aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-700 text-sm font-bold text-white">{seat.studentName?.trim().charAt(0).toUpperCase() || seat.email.charAt(0).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{seat.studentName || 'Aluno sem nome cadastrado'}</p><p className="break-all text-xs text-white">{seat.email}</p><p className="mt-1 text-xs text-white">{seat.status === 'ACTIVE' ? 'Vinculado · acesso ativo' : seat.status === 'PAID_UNCLAIMED' ? 'Pago · aguardando vínculo' : seatStatus[seat.status] ?? seat.status} · {seat.endsAt ? `Acesso até ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(seat.endsAt))}` : 'Sem data de término'}</p></div></div>)}</div><label className="block text-sm font-semibold text-white">E-mails dos alunos<textarea value={editingEmailsText} onChange={(event) => setEditingEmailsText(event.target.value)} rows={4} className="mt-2 w-full rounded-lg border border-white/30 bg-[#0c2b23] p-3 text-sm text-white placeholder:text-white focus:border-emerald-300 focus:outline-none"/></label><div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={updatingBatchId === batch.id} onClick={() => setEditingBatchId(null)} className="min-h-10 rounded-lg px-4 text-sm font-semibold text-white hover:bg-white/15">Fechar</button><button type="button" disabled={updatingBatchId === batch.id} onClick={() => void updatePendingBatch(batch)} className="min-h-10 rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white">{updatingBatchId === batch.id ? 'Atualizando…' : 'Salvar e continuar pagamento'}</button></div></section></div>)}
        </div>}</details>;
      })}</div>}
    </section>
    {renewalTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !renewalTarget.busy) setRenewalTarget(null); }}><section role="dialog" aria-modal="true" aria-labelledby="sponsored-renewal-title" className="w-full max-w-lg space-y-5 rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div><h2 id="sponsored-renewal-title" className="text-lg font-extrabold text-slate-900">Renovar acesso</h2><p className="mt-1 break-all text-sm text-slate-600">{renewalTarget.email} · {renewalTarget.batch.monitorName}</p><p className="mt-2 text-xs text-slate-500">Será criada uma nova compra individual para este aluno.</p></div><fieldset><legend className="mb-2 text-sm font-semibold">Período</legend><div className="grid grid-cols-2 gap-2">{(['MONTHLY', 'ANNUAL'] as const).map((value) => { const available = value === 'MONTHLY' || Boolean(monitors.find((item) => item.id === renewalTarget.batch.monitorId)?.annualPriceCents); return <button key={value} type="button" disabled={!available || renewalTarget.busy} aria-pressed={renewalTarget.interval === value} onClick={() => setRenewalTarget((current) => current ? { ...current, interval: value, quote: null, error: null } : current)} className={`min-h-11 rounded-xl border px-3 text-sm font-semibold disabled:opacity-50 ${renewalTarget.interval === value ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-700'}`}>{value === 'MONTHLY' ? 'Mensal · 1 mês' : 'Anual · 12 meses'}</button>; })}</div></fieldset><fieldset><legend className="mb-2 text-sm font-semibold">Forma de pagamento</legend><div className="grid grid-cols-2 gap-2">{(['PIX', 'CREDIT_CARD'] as const).map((value) => <button key={value} type="button" disabled={renewalTarget.busy} aria-pressed={renewalTarget.billingType === value} onClick={() => setRenewalTarget((current) => current ? { ...current, billingType: value, quote: null, error: null } : current)} className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${renewalTarget.billingType === value ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-700'}`}>{value === 'PIX' ? 'Pix' : 'Cartão de crédito'}</button>)}</div></fieldset>{renewalTarget.quote && <div className="rounded-xl bg-slate-50 p-4 text-sm"><p>{renewalTarget.quote.interval === 'MONTHLY' ? 'Acesso mensal · 1 mês' : 'Acesso anual · 12 meses'}</p><p className="mt-2 text-lg font-extrabold">Total: {money(renewalTarget.quote.totalAmountCents)}</p>{renewalTarget.billingType === 'CREDIT_CARD' && renewalTarget.interval === 'MONTHLY' && <p className="mt-1 text-xs text-slate-600">A cobrança no cartão será recorrente mensalmente.</p>}</div>}{renewalTarget.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{renewalTarget.error}</p>}<div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={renewalTarget.busy} onClick={() => setRenewalTarget(null)} className="min-h-10 rounded-lg px-4 text-sm font-semibold text-slate-700">Fechar</button>{renewalTarget.quote ? <button type="button" disabled={renewalTarget.busy} onClick={() => void checkoutRenewal()} className="min-h-10 rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white disabled:opacity-50">{renewalTarget.busy ? 'Abrindo pagamento…' : 'Ir para pagamento'}</button> : <button type="button" disabled={renewalTarget.busy} onClick={() => void quoteRenewal()} className="min-h-10 rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white disabled:opacity-50">{renewalTarget.busy ? 'Calculando…' : 'Calcular valor'}</button>}</div></section></div>}
  </main>;
}
