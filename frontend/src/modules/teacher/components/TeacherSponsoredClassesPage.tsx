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
  const [monitors, setMonitors] = useState<TeacherMonitor[]>([]);
  const [batches, setBatches] = useState<SponsoredSeatBatch[]>([]);
  const [monitorId, setMonitorId] = useState('');
  const [interval, setInterval] = useState<SponsoredSeatInterval>('MONTHLY');
  const [billingType, setBillingType] = useState<SponsoredSeatBillingType | null>(null);
  const [paymentMenuOpen, setPaymentMenuOpen] = useState(false);
  const [emailsText, setEmailsText] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [expandedMonitors, setExpandedMonitors] = useState<Record<string, boolean>>({});
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editingEmailsText, setEditingEmailsText] = useState('');
  const [updatingBatchId, setUpdatingBatchId] = useState<string | null>(null);
  const [quote, setQuote] = useState<SponsoredBatchQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorPlacement, setErrorPlacement] = useState<'general' | 'quote' | 'checkout'>('general');
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
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

  const startCheckout = async () => {
    if (!quote || !billingType) return;
    setCreating(true); showError(null);
    try {
      const result = await TeacherSponsoredSeatService.createSponsoredBatch({ monitorId, interval, billingType, beneficiaryEmails: parsedEmails.emails, expectedTotalAmountCents: quote.totalAmountCents });
      window.location.assign(result.checkoutUrl);
    } catch (cause) {
      if (cause instanceof TeacherSponsoredSeatApiError && cause.code === 'PRICE_CHANGED') {
        setQuote(null);
        setError('O preço foi atualizado. Revise a cotação antes de continuar.');
        setErrorPlacement('quote');
      } else {
        setError(userFacingError(cause, 'Não foi possível abrir o checkout.'));
        setErrorPlacement('checkout');
      }
    } finally { setCreating(false); }
  };

  const cancelBatch = async (batchId: string) => {
    setCancellingId(batchId); showError(null);
    try { await TeacherSponsoredSeatService.cancelSponsoredBatch(batchId); setNotice('A renovação foi cancelada. Os alunos mantêm acesso até o fim do período pago.'); await reload(); }
    catch (cause) { showError(userFacingError(cause, 'Não foi possível cancelar a renovação.')); }
    finally { setCancellingId(null); }
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
          <div><label htmlFor="sponsored-student-email" className="block text-sm font-semibold text-slate-700">4. Adicione os alunos um por vez</label><div className="mt-1.5 flex gap-2"><input id="sponsored-student-email" type="email" value={emailInput} onChange={(event) => setEmailInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addEmail(); } }} placeholder="aluno@email.com" className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm"/><button type="button" onClick={addEmail} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-700 px-4 text-sm font-bold text-emerald-900"><Plus className="h-4 w-4"/>Adicionar</button></div><ul className="mt-3 space-y-2">{emails.map((email) => <li key={email} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"><span>{email}</span><button type="button" aria-label={`Remover ${email}`} onClick={() => removeEmail(email)} className="text-rose-700"><Trash2 className="h-4 w-4"/></button></li>)}</ul><span className="mt-1 block text-xs text-slate-500">{emails.length} {emails.length === 1 ? 'aluno' : 'alunos'} na compra.</span></div>
          {!!parsedEmails.duplicates.length && <p className="text-sm text-rose-700">E-mails repetidos: {parsedEmails.duplicates.join(', ')}</p>}
          {!!parsedEmails.invalid.length && <p className="text-sm text-rose-700">E-mails inválidos: {parsedEmails.invalid.join(', ')}</p>}
          {!quote ? <><button type="button" disabled={quoting || !billingType || !monitorId || !parsedEmails.emails.length || !!parsedEmails.invalid.length || !!parsedEmails.duplicates.length} onClick={() => void requestQuote()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#132E20] px-5 text-sm font-bold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50">{quoting && <LoaderCircle className="h-4 w-4 animate-spin"/>}Revisar valores</button>{error && errorPlacement === 'quote' && <div role="alert" className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}</> : <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4" aria-label="Revisão da compra"><h3 className="font-bold text-emerald-950">Revise a compra</h3><div className="mt-3 space-y-2 text-sm text-emerald-950"><p>{quote.seatCount} vagas · {interval === 'MONTHLY' ? billingType === 'PIX' ? 'mensal, pagamento único para 1 mês' : 'mensal, recorrente' : 'anual, 12 meses'}</p><p>Forma de pagamento: {billingType === 'PIX' ? 'Pix' : 'Cartão de crédito'}</p><p>Valor por vaga: {money(quote.platformAmountCents)}</p><p className="border-t border-emerald-200 pt-2 text-base font-extrabold">Total: {money(quote.totalAmountCents)}{interval === 'MONTHLY' ? billingType === 'PIX' ? ' (pagamento único para 1 mês)' : '/mês' : billingType === 'CREDIT_CARD' ? ' (à vista ou em até 12x no cartão)' : ' (pagamento único)'}</p>{showAnnualCardEstimate && <p className="font-bold">Estimativa: até 12x de {money(quote.totalAmountCents / 12)}</p>}{showAnnualCardEstimate && <p className="text-xs">Estimativa informativa; condições e valor final serão confirmados no checkout Asaas.</p>}<p className="text-xs">Não há repasse ao professor nesta compra. O checkout cobra somente a parte da plataforma.</p></div><div className="mt-4"><div className="flex flex-wrap gap-2"><button type="button" disabled={creating} onClick={() => void startCheckout()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white disabled:opacity-50">{creating && <LoaderCircle className="h-4 w-4 animate-spin"/>}Ir para pagamento</button><button type="button" onClick={() => { showError(null); setQuote(null); }} className="min-h-10 rounded-xl px-4 text-sm font-semibold text-emerald-900">Editar dados</button></div>{error && errorPlacement === 'checkout' && <div role="alert" className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}</div></div>}
          </>}
        </div>}
      </div>
      <aside className="rounded-2xl border border-slate-200 bg-[#F8FAF8] p-5 sm:p-6"><h2 className="font-bold text-slate-900">Resumo da compra</h2><div className="mt-3 space-y-2 text-sm text-slate-600"><p><strong>Monitor:</strong> {selectedMonitor?.name ?? 'Selecione um monitor'}</p><p><strong>Plano:</strong> {interval === 'MONTHLY' ? billingType === 'PIX' ? 'Mensal · pagamento único para 1 mês' : billingType === 'CREDIT_CARD' ? 'Mensal recorrente' : 'Mensal · acesso por 1 mês' : 'Anual · 12 meses'}</p><p><strong>Forma de pagamento:</strong> {billingType ? billingType === 'PIX' ? 'Pix' : 'Cartão de crédito' : 'Selecione uma forma'}</p><p><strong>Alunos:</strong> {emails.length}</p><ul className="max-h-36 space-y-1 overflow-auto">{emails.map((email) => <li key={email}>{email}</li>)}</ul>{quote && <><p className="border-t border-slate-200 pt-2 text-base font-extrabold text-slate-900">Total: {money(quote.totalAmountCents)}{interval === 'MONTHLY' ? billingType === 'PIX' ? ' · pagamento único para 1 mês' : '/mês' : ''}</p>{showAnnualCardEstimate && <><p className="font-semibold text-slate-900">Estimativa: até 12x de {money(quote.totalAmountCents / 12)}</p><p className="text-xs">Estimativa informativa; condições e valor final serão confirmados no checkout Asaas.</p></>}</>}<p className="text-xs">O valor é calculado pela plataforma. Nenhum repasse será feito ao professor.</p></div></aside>
    </section>

    <section className="space-y-4"><div className="flex items-end justify-between"><div><h2 className="text-xl font-extrabold text-[#132E20]">Turmas e vagas</h2><p className="mt-1 text-sm text-slate-600">Monitores e alunos vinculados às vagas patrocinadas.</p></div><span className="inline-flex items-center gap-1 text-sm text-slate-500"><Users className="h-4 w-4"/>{batches.reduce((total, batch) => total + batch.seatCount, 0)} vagas</span></div>
      {loading ? <p className="text-sm text-slate-500">Carregando suas turmas…</p> : monitorsWithBatches.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">Você ainda não tem monitores cadastrados.</div> : <div className="space-y-3">{monitorsWithBatches.map(({ monitor, batches: monitorBatches }) => <details key={monitor.id} open={expandedMonitors[monitor.id] ?? false} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><summary onClick={(event) => { event.preventDefault(); setExpandedMonitors((current) => ({ ...current, [monitor.id]: !current[monitor.id] })); }} aria-expanded={expandedMonitors[monitor.id] ?? false} className="flex cursor-pointer list-none items-center justify-between bg-slate-50 px-5 py-4 font-bold text-slate-900">{monitor.name}<ChevronDown className="h-4 w-4"/></summary>{expandedMonitors[monitor.id] && <div className="divide-y divide-slate-100">{monitorBatches.length === 0 ? <p className="p-5 text-sm text-slate-500">{historyError ? 'Não foi possível carregar os alunos desta turma.' : 'Ainda não há alunos nesta turma.'}</p> : monitorBatches.map((batch) => <article key={batch.id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="flex flex-wrap items-center gap-2 font-semibold text-slate-800"><span>{batch.interval === 'MONTHLY' ? 'Plano mensal' : 'Plano anual · 12 meses'}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">{batchStatus[batch.status] ?? batch.status}</span></p><p className="mt-1 text-xs text-slate-500">Forma de pagamento: {batch.billingType === 'PIX' ? 'Pix' : 'Cartão de crédito'}</p><p className="mt-1 text-xs text-slate-500">{batch.seatCount} vagas · total {money(batch.totalAmountCents)}{batch.interval === 'MONTHLY' ? batch.billingType === 'PIX' ? ' · pagamento único para 1 mês' : '/mês' : ''}</p>{batch.currentPeriodEnd && <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><CalendarClock className="h-3.5 w-3.5"/>Até {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(batch.currentPeriodEnd))}</p>}</div>{batch.interval === 'MONTHLY' && batch.billingType === 'CREDIT_CARD' && batch.status === 'ACTIVE' && <button type="button" disabled={cancellingId === batch.id} onClick={() => void cancelBatch(batch.id)} className="inline-flex min-h-9 items-center justify-center gap-2 self-start rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">{cancellingId === batch.id ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <XCircle className="h-4 w-4"/>}Cancelar renovação</button>}</div>{batch.seats.length === 0 ? <p className="mt-4 text-sm text-slate-500">Ainda não há alunos nesta turma.</p> : <ul className="mt-4 grid gap-2 sm:grid-cols-2">{batch.seats.map((seat) => <li key={seat.id} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"><span className="truncate text-slate-700">{seat.email}{seat.studentName && <span className="ml-1 text-slate-400">· {seat.studentName}</span>}</span><span className="shrink-0 rounded-full bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">{seatStatus[seat.status] ?? seat.status}</span></li>)}</ul>}{['PENDING', 'CHECKOUT_PENDING', 'CHECKOUT_CREATION_FAILED'].includes(batch.status) && <div className="mt-4">{editingBatchId === batch.id ? <><p className="mb-2 text-xs text-slate-600">Forma de pagamento: {batch.billingType === 'PIX' ? 'Pix' : 'Cartão de crédito'} (mantida neste checkout)</p><label className="block text-sm font-semibold">Editar e-mails (um por linha)<textarea value={editingEmailsText} onChange={(event) => setEditingEmailsText(event.target.value)} rows={4} className="mt-2 w-full rounded-lg border p-3"/></label><div className="mt-2 flex gap-2"><button type="button" disabled={updatingBatchId === batch.id} onClick={() => void updatePendingBatch(batch)} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-bold text-white">{updatingBatchId === batch.id ? 'Atualizando…' : 'Salvar e continuar pagamento'}</button><button type="button" onClick={() => setEditingBatchId(null)} className="px-3 text-sm">Cancelar</button></div></> : <button type="button" onClick={() => { setEditingBatchId(batch.id); setEditingEmailsText(batch.seats.map((seat) => seat.email).join('\n')); }} className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-900"><Pencil className="h-4 w-4"/>Editar alunos (pagamento pendente)</button>}</div>}</article>)}</div>}</details>)}</div>}
    </section>
  </main>;
}
