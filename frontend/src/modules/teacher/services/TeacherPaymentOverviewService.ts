import { dedupeAsyncRequest, type InFlightRequest } from '@/shared/utils/async-request-deduper';
import type { PaymentAccountOverview } from '../utils/payment-account-overview';
export type { PaymentAccountOverview } from '../utils/payment-account-overview';

const getBackendUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';
const requestState: InFlightRequest<PaymentAccountOverview> = { current: null };

export class PaymentOverviewRequestError extends Error {
  constructor(public readonly status: number, message = 'Não foi possível carregar os dados da conta de recebimento.') {
    super(message);
    this.name = 'PaymentOverviewRequestError';
  }
}

function isMetrics(value: unknown): value is PaymentAccountOverview['metrics'] {
  if (value === null) return true;
  if (typeof value !== 'object' || value === null) return false;
  const metrics = value as Record<string, unknown>;
  return metrics.currency === 'BRL'
    && typeof metrics.asOf === 'string'
    && ['availableBalanceCents', 'receivedThisMonthCents', 'pendingReceivablesCents', 'pendingTransfersCount'].every((key) => Number.isInteger(metrics[key]) && Number(metrics[key]) >= 0);
}

function parseOverview(value: unknown): PaymentAccountOverview {
  const data = (value as { data?: unknown } | null)?.data;
  if (typeof data !== 'object' || data === null) throw new PaymentOverviewRequestError(502);
  const { account, metrics } = data as { account?: unknown; metrics?: unknown };
  const normalizedMetrics = metrics ?? null;
  if (typeof account !== 'object' || account === null || !isMetrics(normalizedMetrics)) throw new PaymentOverviewRequestError(502);
  const candidate = account as Record<string, unknown>;
  if (typeof candidate.status !== 'string' || typeof candidate.providerAccountId !== 'string') throw new PaymentOverviewRequestError(502);
  return {
    account: {
      status: candidate.status,
      generalStatus: typeof candidate.generalStatus === 'string' ? candidate.generalStatus : null,
      onboardingUrl: typeof candidate.onboardingUrl === 'string' ? candidate.onboardingUrl : null,
      dashboardUrl: typeof candidate.dashboardUrl === 'string' ? candidate.dashboardUrl : null,
      providerAccountId: candidate.providerAccountId,
      walletId: typeof candidate.walletId === 'string' ? candidate.walletId : null,
    },
    metrics: normalizedMetrics,
  };
}

async function request(): Promise<PaymentAccountOverview> {
  const response = await fetch(`${getBackendUrl()}/api/v1/teachers/me/payment-account/overview`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new PaymentOverviewRequestError(response.status);
  }
  return parseOverview(await response.json().catch(() => null));
}

export const TeacherPaymentOverviewService = {
  get(): Promise<PaymentAccountOverview> {
    return dedupeAsyncRequest(requestState, request);
  },
};
