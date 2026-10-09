export type PaymentAccountOverviewMetrics = {
  availableBalanceCents: number;
  receivedThisMonthCents: number;
  pendingReceivablesCents: number;
  pendingTransfersCount: number;
  currency: 'BRL';
  asOf: string;
};

export type PaymentAccountOverview = {
  account: {
    status: string;
    generalStatus: string | null;
    onboardingUrl: string | null;
    dashboardUrl: string | null;
    providerAccountId: string;
    walletId: string | null;
  };
  metrics: PaymentAccountOverviewMetrics | null;
};

export function formatPaymentAmount(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100).replace(/\u00a0/g, ' ');
}

export function getMetricsAvailability(metrics: PaymentAccountOverviewMetrics | null): string {
  return metrics ? formatPaymentAmount(metrics.availableBalanceCents) : 'Indisponível';
}

export function getDashboardUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getPaymentAccountStatusCopy(status: string | null | undefined): { label: string; description: string } {
  switch (status?.toUpperCase()) {
    case 'APPROVED': return { label: 'Aprovada', description: 'Sua conta está apta a receber.' };
    case 'REJECTED': return { label: 'Rejeitada', description: 'Revise os dados enviados para regularizar sua conta.' };
    case 'SUSPENDED': return { label: 'Suspensa', description: 'Sua conta precisa de atenção antes de operar.' };
    default: return { label: 'Pendente', description: 'O Asaas enviou um e-mail para concluir a ativação. Após confirmar, a aprovação será atualizada aqui.' };
  }
}

export function isRetryablePaymentOverviewError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    return status >= 500 || status === 408 || status === 429;
  }
  return error instanceof TypeError;
}
