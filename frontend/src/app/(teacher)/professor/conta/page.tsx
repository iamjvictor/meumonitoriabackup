'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Clock3, CreditCard, Loader2, WalletCards } from 'lucide-react';
import { TeacherHeader } from '@/modules/teacher/components/TeacherHeader';
import { TeacherProfileService, type TeacherProfile, type UserInfo } from '@/modules/teacher/services/TeacherProfileService';
import { TeacherPaymentAccountService, type PaymentAccount } from '@/modules/teacher/services/TeacherPaymentAccountService';
import { TeacherSessionError } from '@/modules/teacher/services/TeacherSessionError';
import { TeacherPaymentAccountPanel } from '@/modules/teacher/components/TeacherPaymentAccountPanel';

function statusView(account: PaymentAccount) {
  const status = account.status.toUpperCase();
  if (status === 'APPROVED' || account.generalStatus?.toUpperCase() === 'APPROVED') return { label: 'Aprovado', className: 'bg-emerald-100 text-emerald-800 border-emerald-200', Icon: CheckCircle2 };
  return { label: status === 'SUSPENDED' ? 'Suspenso' : 'Em análise', className: 'bg-amber-100 text-amber-800 border-amber-200', Icon: Clock3 };
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><span className="block text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">{label}</span><span className="mt-1 block break-words text-sm font-semibold text-[#132E20]">{value || 'Não informado'}</span></div>;
}

export default function TeacherAccountPage() {
  const router = useRouter();
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [account, setAccount] = useState<PaymentAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([TeacherProfileService.getMyProfile(), TeacherPaymentAccountService.get()])
      .then(([profile, paymentAccount]) => {
        setTeacher(profile.teacher ?? null);
        setUser(profile.user ?? null);
        setAccount(paymentAccount);
      })
      .catch((reason) => {
        if (reason instanceof TeacherSessionError) router.replace('/?login=true&perfil=professor&session=expired');
        else setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os dados da conta.');
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#F5F1E8] text-slate-600"><div className="flex items-center gap-3 text-sm font-semibold"><Loader2 className="h-5 w-5 animate-spin text-emerald-700" />Carregando dados da conta...</div></main>;

  const profile = account?.paymentProfile;
  const status = account ? statusView(account) : null;
  const StatusIcon = status?.Icon;

  return <div className="min-h-screen bg-[#F5F1E8] text-[#132E20]"><TeacherHeader teacher={teacher} user={user} hasProfile={Boolean(teacher)} onOpenOnboarding={() => router.push('/professor/perfil')} />
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <button type="button" onClick={() => router.push('/professor')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 shadow-sm hover:text-[#132E20]"><ArrowLeft className="h-4 w-4" />Voltar ao painel</button>
      <TeacherPaymentAccountPanel teacher={teacher} initialAccount={account} onSessionExpired={() => router.replace('/?login=true&perfil=professor&session=expired')} />
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</div>}
      {account && status && StatusIcon ? <>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${status.className}`}><StatusIcon className="h-5 w-5" /></div><div><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Status do recebimento</p><h2 className="mt-1 text-xl font-bold text-[#132E20]">{status.label}</h2></div></div><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">{account.environment}</span></div><div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3"><Field label="ID da subconta Asaas" value={account.providerAccountId} /><Field label="Wallet ID" value={account.walletId} /><Field label="Revisão" value={account.revision} /><Field label="Status geral" value={account.generalStatus} /><Field label="Informações comerciais" value={account.commercialInfoStatus} /><Field label="Documentação" value={account.documentationStatus} /><Field label="Conta bancária" value={account.bankAccountStatus} /><Field label="Verificado em" value={account.verifiedAt ? new Date(account.verifiedAt).toLocaleString('pt-BR') : null} /><Field label="Último evento" value={account.lastEventAt ? new Date(account.lastEventAt).toLocaleString('pt-BR') : null} /></div></section>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><CreditCard className="h-5 w-5 text-[#2E5B37]" /><h2 className="text-lg font-bold text-[#132E20]">Dados enviados para o Asaas</h2></div>{profile ? <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Nome/Razão social" value={profile.name} /><Field label="E-mail" value={profile.email} /><Field label="CPF/CNPJ" value={profile.cpfCnpj} /><Field label="Data de nascimento" value={profile.birthDate} /><Field label="Tipo de empresa" value={profile.companyType} /><Field label="Celular" value={profile.mobilePhone} /><Field label="Renda/Faturamento mensal" value={profile.incomeValue} /><Field label="Endereço" value={profile.address} /><Field label="Número" value={profile.addressNumber} /><Field label="Complemento" value={profile.complement} /><Field label="Bairro" value={profile.province} /><Field label="CEP" value={profile.postalCode} /><Field label="Site" value={profile.site} /></div> : <p className="mt-4 text-sm text-slate-500">Nenhum perfil cadastral encontrado para esta conta.</p>}</section>
      </> : <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm font-semibold text-amber-900">Ainda não existe uma conta de recebimento configurada.</section>}
    </main>
  </div>;
}
