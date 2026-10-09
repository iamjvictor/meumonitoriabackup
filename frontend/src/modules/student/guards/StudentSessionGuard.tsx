'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useStudent } from '../context/StudentContext';

export function StudentSessionGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status } = useStudent();

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

  return <>{children}</>;
}
