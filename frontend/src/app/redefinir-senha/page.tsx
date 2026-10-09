'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Eye, EyeOff, LockKeyhole, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    const checkRecoverySession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setIsReady(Boolean(data.session));
      setCheckingLink(false);
    };

    void checkRecoverySession();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' || session) setIsReady(true);
      setCheckingLink(false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (password !== confirmation) {
      setError('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) throw updateError;

      await createClient().auth.signOut();
      setCompleted(true);
    } catch (updateError: unknown) {
      setError(updateError instanceof Error ? updateError.message : 'Não foi possível atualizar sua senha.');
    } finally {
      setSubmitting(false);
    }
  };

  if (completed) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#F5F1E8] p-6">
        <section className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl border border-slate-200">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-[#2E5B37]" />
          <h1 className="text-2xl font-bold text-[#0F2942]">Senha atualizada</h1>
          <p className="mt-3 text-sm text-slate-600">Sua senha foi redefinida com sucesso.</p>
          <button
            type="button"
            onClick={() => router.replace('/?login=true')}
            className="mt-6 w-full rounded-xl bg-[#0F2942] px-4 py-3 text-sm font-bold text-white hover:bg-[#1E3A8A]"
          >
            Voltar para o login
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F5F1E8] p-6">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl border border-slate-200">
        <div className="mb-6 text-center">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-[#2E5B37]" />
          <h1 className="text-2xl font-bold text-[#0F2942]">Redefinir senha</h1>
          <p className="mt-2 text-sm text-slate-600">Escolha uma nova senha para sua conta.</p>
        </div>

        {checkingLink ? (
          <p className="text-center text-sm text-slate-600">Validando seu link de recuperação...</p>
        ) : !isReady ? (
          <div className="text-center" role="alert">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-rose-600" />
            <p className="text-sm text-slate-700">Este link de recuperação é inválido ou expirou.</p>
            <button
              type="button"
              onClick={() => router.replace('/?login=true')}
              className="mt-5 rounded-xl bg-[#0F2942] px-5 py-3 text-sm font-bold text-white"
            >
              Voltar para o login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <PasswordInput
              id="new-password"
              label="Nova senha"
              value={password}
              visible={showPassword}
              onChange={setPassword}
              onToggle={() => setShowPassword((visible) => !visible)}
            />
            <PasswordInput
              id="confirm-password"
              label="Confirmar nova senha"
              value={confirmation}
              visible={showConfirmation}
              onChange={setConfirmation}
              onToggle={() => setShowConfirmation((visible) => !visible)}
            />

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-[#0F2942] px-4 py-3.5 text-sm font-bold text-white hover:bg-[#1E3A8A] disabled:opacity-50"
            >
              {submitting ? 'Atualizando...' : 'Atualizar senha'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function PasswordInput({
  id,
  label,
  value,
  visible,
  onChange,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  visible: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#0F2942]">{label}</label>
      <div className="relative">
        <LockKeyhole className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="new-password"
          className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-10 text-sm text-slate-800 focus:border-[#0F2942] focus:outline-none"
          required
        />
        <button type="button" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} onClick={onToggle} className="absolute right-3 top-3.5 text-slate-400">
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
