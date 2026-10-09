export interface BillingSubscriptionCandidate {
  id: string;
  status?: string;
  items?: Array<{
    id?: string;
    monitorId?: string;
    monitorName?: string;
    status?: string;
    priceCents?: number | null;
  }>;
  currentPeriodEnd?: string;
}

export interface CancelableSubscriptionItem {
  subscriptionId: string;
  itemId: string;
  monitorId: string;
  monitorName: string;
  status: string;
  priceCents: number | null;
}

export function findSubscriptionForMonitor(
  subscriptions: BillingSubscriptionCandidate[],
  monitorId: string,
) {
  return subscriptions.find((candidate) => candidate.items?.some((item) => item.monitorId === monitorId));
}

export function getCancelableSubscriptionItems(
  subscriptions: BillingSubscriptionCandidate[],
): CancelableSubscriptionItem[] {
  return subscriptions.flatMap((subscription) => {
    if (subscription.status !== 'ACTIVE' && subscription.status !== 'CANCEL_PENDING') return [];
    return (subscription.items ?? []).flatMap((item) => {
      if (!item.id || !item.monitorId || !item.monitorName) return [];
      if (item.status !== 'ACTIVE' && item.status !== 'CANCEL_PENDING') return [];
      return [{
        subscriptionId: subscription.id,
        itemId: item.id,
        monitorId: item.monitorId,
        monitorName: item.monitorName,
        status: item.status ?? 'ACTIVE',
        priceCents: typeof item.priceCents === 'number' ? item.priceCents : null,
      }];
    });
  });
}

export function buildCancellationHeaders(
  authHeaders: Record<string, string>,
  idempotencyKey: string,
) {
  const { 'Content-Type': _contentType, ...headersWithoutBodyContentType } = authHeaders;
  return { ...headersWithoutBodyContentType, 'Idempotency-Key': idempotencyKey };
}

const fallbackCancellationErrorMessage = 'Não foi possível processar o cancelamento no momento. Tente novamente ou entre em contato com o suporte.';

export function getCancellationErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') return fallbackCancellationErrorMessage;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return fallbackCancellationErrorMessage;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() ? message : fallbackCancellationErrorMessage;
}
