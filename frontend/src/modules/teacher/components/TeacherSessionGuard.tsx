'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import { TeacherProfileService } from '../services/TeacherProfileService';

type TeacherSessionGuardProps = {
  children: ReactNode;
};

export function TeacherSessionGuard({ children }: TeacherSessionGuardProps) {
  const router = useRouter();
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    let isCurrent = true;
    let shouldRenderChildren = true;

    TeacherProfileService.getMyProfile()
      .then((data) => {
        if (!isCurrent) return;
        // Se nao tem perfil e nem id de usuario autenticado, a sessao e invalida
        if (!data.hasProfile && !data.user?.id) {
          shouldRenderChildren = false;
          router.replace('/?login=true&perfil=professor&session=expired');
          return;
        }
      })
      .catch((error) => {
        if (!isCurrent) return;
        shouldRenderChildren = false;
        console.warn('Sessão expirada ou falha de conexão na área do professor:', error);
        router.replace('/?login=true&perfil=professor&session=expired');
      })
      .finally(() => {
        if (isCurrent && shouldRenderChildren) setIsCheckingSession(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [router]);

  if (isCheckingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F5F1E8] text-[#132E20]">
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-600">
          <LoaderCircle className="h-5 w-5 animate-spin text-emerald-700" aria-hidden="true" />
          Verificando sua sessão...
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
