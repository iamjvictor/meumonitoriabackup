'use client';

import { useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, LoaderCircle, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import Image from 'next/image';
import {
  activateSponsoredSeatInvitation,
  clearPendingSponsoredSeatInvitationToken,
  consumeSponsoredSeatInvitationRedeemFailed,
  consumeSponsoredSeatInvitationRedeemed,
  getPendingSponsoredSeatInvitationToken,
  markSponsoredSeatInvitationRedeemed,
  preserveSponsoredSeatInvitationToken,
  redeemSponsoredSeatInvitationForExistingAccount,
  resolveSponsoredSeatInvitation,
  type SponsoredSeatInvitation,
} from '@/modules/student/services/sponsored-seat-invitation.service';

type PageStatus = 'loading' | 'ready' | 'invalid' | 'expired' | 'used' | 'network' | 'existing' | 'activationFailed' | 'redeemFailed' | 'success';

const loginHref = '/?login=true&redirect=/areadoaluno';

function classifyInvitationError(error: unknown): PageStatus {
  const failure = error as { code?: string; status?: number; message?: string };
  const code = `${failure?.code || ''} ${failure?.message || ''}`.toLowerCase();
  if (failure?.code === 'NETWORK_ERROR' || error instanceof TypeError) return 'network';
  if (code.includes('expir')) return 'expired';
  if (code.includes('used') || code.includes('utiliz') || code.includes('claimed')) return 'used';
  if ((code.includes('email') && (code.includes('already') || code.includes('exists') || code.includes('cadastrado'))) || code.includes('already_registered') || failure?.status === 409) return 'existing';
  return 'invalid';
}

function classifyActivationError(error: unknown): PageStatus {
  const classified = classifyInvitationError(error);
  // A server failure after account creation can leave a valid invite awaiting
  // authenticated redemption. Keep that distinct from resolve-time invalidity.
  return classified === 'invalid' || classified === 'network' ? 'activationFailed' : classified;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(date);
}

export default function SponsoredSeatInvitationPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [invitation, setInvitation] = useState<SponsoredSeatInvitation | null>(null);
  const [status, setStatus] = useState<PageStatus>('loading');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [successForExistingAccount, setSuccessForExistingAccount] = useState(false);

  useEffect(() => {
    if (consumeSponsoredSeatInvitationRedeemed()) {
      void Promise.resolve().then(() => { setSuccessForExistingAccount(true); setStatus('success'); });
      window.setTimeout(() => router.replace('/areadoaluno'), 1600);
      return;
    }
    const hashToken = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    const currentToken = hashToken || getPendingSponsoredSeatInvitationToken();
    if (!currentToken) {
      void Promise.resolve().then(() => setStatus('invalid'));
      return;
    }
    let active = true;
    void resolveSponsoredSeatInvitation(currentToken).then((result) => {
      if (!active) return;
      setToken(currentToken);
      setInvitation(result);
      setStatus(consumeSponsoredSeatInvitationRedeemFailed() ? 'redeemFailed' : 'ready');
    }).catch((error: unknown) => {
      if (active) setStatus(classifyInvitationError(error));
    });
    return () => { active = false; };
  }, []);

  function goToLogin(event: MouseEvent<HTMLAnchorElement>) {
    const currentToken = token || new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    preserveSponsoredSeatInvitationToken(currentToken);
    event.preventDefault();
    router.push(loginHref);
  }

  async function retryExistingAccountRedemption() {
    setBusy(true);
    try {
      await redeemSponsoredSeatInvitationForExistingAccount(token);
      clearPendingSponsoredSeatInvitationToken();
      markSponsoredSeatInvitationRedeemed();
      setSuccessForExistingAccount(true);
      setStatus('success');
      window.setTimeout(() => router.replace('/areadoaluno'), 1600);
    } catch {
      setStatus('redeemFailed');
    } finally {
      setBusy(false);
    }
  }

  const passwordValid = password.length >= 8 && /[A-Z]/.test(password) && /\d/.test(password) && password === confirmation;
  const canSubmit = Boolean(invitation && name.trim() && passwordValid && termsAccepted && !busy);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      await activateSponsoredSeatInvitation(token, { name: name.trim(), password });
      setStatus('success');
      window.setTimeout(() => router.replace('/areadoaluno'), 1600);
    } catch (error) {
      const nextStatus = classifyActivationError(error);
      setStatus(nextStatus);
      if (nextStatus === 'invalid' || nextStatus === 'expired' || nextStatus === 'used') setInvitation(null);
    } finally {
      setBusy(false);
    }
  }

  const statusMessage: Partial<Record<PageStatus, string>> = {
    invalid: 'Este convite é inválido ou não está mais disponível.',
    expired: 'Este convite expirou.',
    used: 'Este convite já foi utilizado.',
    network: 'Não foi possível carregar o convite. Verifique sua conexão e tente novamente.',
    existing: 'Este e-mail já possui uma conta. Entre para vincular a vaga patrocinada.',
    activationFailed: 'Não foi possível concluir a ativação agora. Sua conta pode já ter sido criada. O convite continua válido; entre com o mesmo e-mail e a senha que você escolheu para tentar vincular a vaga.',
    redeemFailed: 'Não foi possível vincular a vaga agora. Sua sessão continua ativa; tente novamente.',
  };

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 py-8 text-slate-900 sm:px-6 sm:py-12">
      <div className="mx-auto grid min-h-[min(820px,calc(100vh-4rem))] max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-xl shadow-slate-900/5 lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="relative flex flex-col justify-between overflow-hidden bg-[#102b45] p-7 text-white sm:p-10">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-300/10 blur-2xl" />
          <div className="relative flex items-center gap-2 text-sm font-bold tracking-wide"><Image src="/logoSemfundo.png" alt="MeuMonitor AI" width={36} height={36} className="h-9 w-9 object-contain" /><span>MeuMonitor <span className="text-[#76D69B]">AI</span></span></div>
          <div className="relative py-12 lg:py-0">
            <div className="mb-5 inline-flex rounded-full border border-white/15 bg-white/10 p-3"><Sparkles aria-hidden="true" className="h-5 w-5 text-cyan-200" /></div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-white">Um convite para você</p>
            <h1 className="max-w-md text-3xl font-bold leading-tight text-[#76D69B] sm:text-4xl">Seu próximo passo nos estudos começa aqui.</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-white">Crie sua conta para acessar o monitor que foi preparado especialmente para você.</p>
          </div>
          <div className="relative flex items-center gap-2 text-xs text-slate-300"><ShieldCheck aria-hidden="true" className="h-4 w-4" /> Seus dados são protegidos.</div>
        </aside>

        <section className="flex items-center px-6 py-8 sm:px-10 sm:py-10">
          <div className="mx-auto w-full max-w-lg">
            {status === 'loading' && <div role="status" className="flex items-center gap-3 text-slate-600"><LoaderCircle className="h-5 w-5 animate-spin" /> Validando seu convite…</div>}
            {statusMessage[status] && <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><div className="mb-2 flex items-center gap-2 font-bold"><AlertCircle aria-hidden="true" className="h-5 w-5" /> Não foi possível continuar</div><p>{statusMessage[status]}</p>{status === 'activationFailed' && invitation && <p className="mt-3">Convite de <strong>{invitation.teacherName}</strong> para <strong>{invitation.monitorName}</strong> ({invitation.interval === 'ANNUAL' ? 'anual' : 'mensal'}) permanece disponível para <strong>{invitation.email}</strong>.</p>}{(status === 'existing' || status === 'activationFailed') && <a onClick={goToLogin} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#102b45] px-4 py-3 font-semibold text-white focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:ring-offset-2" href={loginHref}>Entrar e vincular minha vaga <ArrowRight aria-hidden="true" className="h-4 w-4" /></a>}{status === 'redeemFailed' && <button type="button" onClick={retryExistingAccountRedemption} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#102b45] px-4 py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Vinculando…' : 'Tentar novamente'} <ArrowRight aria-hidden="true" className="h-4 w-4" /></button>}</div>}
            {status === 'success' && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6"><h2 className="text-xl font-bold text-emerald-900">{successForExistingAccount ? 'Vaga vinculada com sucesso!' : 'Conta criada com sucesso!'}</h2><p className="mt-2 text-sm text-emerald-800">Sua vaga patrocinada está vinculada. Vamos levar você para sua área de estudos.</p></div>}

            {status === 'ready' && invitation && <>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-800">Boas-vindas</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Finalize seu cadastro</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">O convite de <strong>{invitation.teacherName}</strong> está pronto para você.</p>

              <div className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <div><p className="text-xs font-medium text-slate-500">Professor(a)</p><p className="mt-1 font-semibold">{invitation.teacherName}</p></div>
                <div><p className="text-xs font-medium text-slate-500">Monitor</p><p className="mt-1 font-semibold">{invitation.monitorName}</p></div>
                <div><p className="text-xs font-medium text-slate-500">Período</p><p className="mt-1 font-semibold">{invitation.interval === 'ANNUAL' ? 'Anual' : 'Mensal'}</p></div>
                <div><p className="text-xs font-medium text-slate-500">Acesso</p><p className="mt-1 font-semibold">{formatDate(invitation.startsAt)} – {formatDate(invitation.endsAt)}</p></div>
              </div>

              <form className="mt-6 space-y-4" onSubmit={submit}>
                <div>
                  <label htmlFor="invitation-email" className="mb-1.5 block text-sm font-semibold">E-mail do convite</label>
                  <div className="relative"><Mail aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input id="invitation-email" type="email" readOnly value={invitation.email} className="w-full rounded-xl border border-slate-200 bg-slate-100 py-3 pl-10 pr-3 text-sm text-slate-600" /></div>
                </div>
                <div>
                  <label htmlFor="invitation-name" className="mb-1.5 block text-sm font-semibold">Nome completo</label>
                  <input id="invitation-name" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/20" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><label htmlFor="invitation-password" className="mb-1.5 block text-sm font-semibold">Senha</label><input id="invitation-password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby="password-hint" className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/20" /><p id="password-hint" className="mt-1 text-xs text-slate-500">Mínimo de 8 caracteres, uma letra maiúscula e um número.</p></div>
                  <div><label htmlFor="invitation-confirm" className="mb-1.5 block text-sm font-semibold">Confirme sua senha</label><input id="invitation-confirm" type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/20" /></div>
                </div>
                {password.length > 0 && !passwordValid && <p role="status" className="text-xs text-rose-700">Confira os requisitos e confirme que as senhas coincidem.</p>}
                <label className="flex items-start gap-3 text-sm leading-5 text-slate-600"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#102b45]" /><span>Li e aceito os <a className="font-semibold text-cyan-900 underline" href="/termos" target="_blank" rel="noreferrer">Termos de Uso e a Política de Privacidade</a>.</span></label>
                <button type="submit" disabled={!canSubmit} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#102b45] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-[#194367] focus:outline-none focus:ring-2 focus:ring-cyan-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">{busy ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Criando conta…</> : <>Criar minha conta <ArrowRight aria-hidden="true" className="h-4 w-4" /></>}</button>
              </form>
              <p className="mt-5 text-center text-sm text-slate-600">Já tem uma conta? <a onClick={goToLogin} className="font-semibold text-cyan-900 underline" href={loginHref}>Entrar</a></p>
            </>}
          </div>
        </section>
      </div>
    </main>
  );
}
