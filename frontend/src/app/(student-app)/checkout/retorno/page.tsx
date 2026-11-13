'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const STUDENT_AREA_REDIRECT_DELAY_MS = 2000;

function CheckoutReturnContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = searchParams.get('status');
  const orderId = searchParams.get('orderId');
  const isSuccessfulReturn = status === 'success';

  useEffect(() => {
    if (!isSuccessfulReturn) return;

    const redirectTimer = window.setTimeout(() => {
      router.replace('/areadoaluno');
    }, STUDENT_AREA_REDIRECT_DELAY_MS);

    return () => window.clearTimeout(redirectTimer);
  }, [isSuccessfulReturn, router]);

  const title = status === 'cancelled'
    ? 'Pagamento não concluído'
    : status === 'expired'
      ? 'Checkout expirado'
      : 'Checkout recebido';
  const message = status === 'cancelled'
    ? 'O checkout foi cancelado. Você pode voltar à área do aluno e tentar novamente quando quiser.'
    : status === 'expired'
      ? 'O prazo deste checkout terminou. Volte à área do aluno para iniciar uma nova tentativa.'
      : 'Estamos confirmando seu pagamento. O acesso será liberado depois que o Asaas enviar a confirmação financeira. Você será levado à área do aluno em instantes.';

  return (
    <main className="flex min-h-screen items-start justify-center bg-[#f7f3ea] px-4 py-16 text-center text-[#0f2942] sm:items-center sm:px-6 sm:py-20">
      <section className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-sm sm:p-8" aria-labelledby="checkout-return-title">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-800" aria-hidden="true">
          {isSuccessfulReturn ? '✓' : '•'}
        </div>
        <h1 id="checkout-return-title" className="text-2xl font-bold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#0f2942]/70" role={isSuccessfulReturn ? 'status' : undefined}>
          {message}
        </p>
        {orderId && <p className="mt-4 text-xs text-slate-500">Pedido: <span className="font-mono">{orderId}</span></p>}
        <button
          type="button"
          onClick={() => router.replace('/areadoaluno')}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0f2942] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#183d5d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f2942]"
        >
          Ir para a área do aluno
        </button>
      </section>
    </main>
  );
}

export default function CheckoutReturnPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#f7f3ea]" />}>
      <CheckoutReturnContent />
    </Suspense>
  );
}
