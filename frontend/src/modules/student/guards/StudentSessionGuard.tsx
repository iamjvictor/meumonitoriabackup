'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useStudent } from '../context/StudentContext';

export function StudentSessionGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, error, refreshSession } = useStudent();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/?login=true&perfil=aluno&session=expired');
    }
  }, [router, status]);

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F5F1E8] text-sm font-semibold text-[#0F2942]/60">
        Validando sua sessão...
      </main>
    );
  }

  if (status === 'unauthenticated') {
    return <main className="min-h-screen bg-[#F5F1E8]" />;
  }

  if (status === 'error') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F5F1E8] px-6 text-center text-[#0F2942]">
        <p role="alert" className="max-w-md text-sm font-semibold text-[#0F2942]/70">
          {error || 'Não foi possível validar sua sessão agora. Verifique sua conexão e tente novamente.'}
        </p>
        <button
          type="button"
          onClick={() => void refreshSession()}
          className="rounded-xl bg-[#0F2942] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#173d5f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2942]"
        >
          Tentar novamente
        </button>
      </main>
    );
  }

  return <>{children}</>;
}
