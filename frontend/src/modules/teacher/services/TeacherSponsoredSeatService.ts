import { TeacherSessionError } from './TeacherSessionError';

const getBackendUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';

export type SponsoredSeatInterval = 'MONTHLY' | 'ANNUAL';
export type SponsoredSeatBillingType = 'PIX' | 'CREDIT_CARD';
export type SponsoredSeat = { id: string; email: string; status: string; startsAt: string | null; endsAt: string | null; studentName: string | null };
export type SponsoredSeatBatch = {
  id: string;
  monitorId: string;
  monitorName: string;
  interval: SponsoredSeatInterval;
  billingType: SponsoredSeatBillingType;
  serviceMonths: number;
  status: string;
  seatCount: number;
  grossPriceCents: number;
  platformAmountCents: number;
  totalAmountCents: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  checkoutUrl: string | null;
  seats: SponsoredSeat[];
  createdAt: string;
};
export type SponsoredBatchCheckout = { batchId: string; amountCents: number; checkoutUrl: string; expiresAt: string | null };
export type SponsoredBatchQuote = { monitorId: string; monitorName: string; interval: SponsoredSeatInterval; serviceMonths: number; seatCount: number; beneficiaryEmails: string[]; grossPriceCents: number; platformAmountCents: number; totalAmountCents: number };

export class TeacherSponsoredSeatApiError extends Error {
  constructor(message: string, public readonly code?: string, public readonly statusCode?: number) { super(message); this.name = 'TeacherSponsoredSeatApiError'; }
}

export function parseSponsoredEmails(value: string) {
  const raw = value.split(/[\s,;]+/).map((email) => email.trim()).filter(Boolean);
  const emails = raw.map((email) => email.toLowerCase());
  const invalid = emails.filter((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const email of emails) {
    if (!invalid.includes(email) && seen.has(email) && !duplicates.includes(email)) duplicates.push(email);
    seen.add(email);
  }
  return { emails, invalid, duplicates };
}

export const TeacherSponsoredSeatService = {
  async listSponsoredBatches(): Promise<SponsoredSeatBatch[]> {
    const response = await fetch(`${getBackendUrl()}/api/v1/teachers/me/sponsored-batches`, { credentials: 'include' });
    const batches = await unwrap<Array<SponsoredSeatBatch & { billingType?: SponsoredSeatBillingType }>>(response);
    return batches.map((batch) => ({ ...batch, billingType: batch.billingType ?? 'CREDIT_CARD' }));
  },

  async createSponsoredBatch(input: { monitorId: string; interval: SponsoredSeatInterval; billingType: SponsoredSeatBillingType; beneficiaryEmails: string[]; expectedTotalAmountCents?: number }): Promise<SponsoredBatchCheckout> {
    const idempotencyStorageKey = sponsoredBatchIdempotencyStorageKey(input);
    const idempotencyKey = sessionStorage.getItem(idempotencyStorageKey) ?? crypto.randomUUID();
    sessionStorage.setItem(idempotencyStorageKey, idempotencyKey);
    const response = await fetch(`${getBackendUrl()}/api/v1/payments/teacher-sponsored-batches`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input),
    });
    const result = await unwrap<SponsoredBatchCheckout>(response);
    sessionStorage.removeItem(idempotencyStorageKey);
    return result;
  },

  async quoteSponsoredBatch(input: { monitorId: string; interval: SponsoredSeatInterval; beneficiaryEmails: string[] }): Promise<SponsoredBatchQuote> {
    const response = await fetch(`${getBackendUrl()}/api/v1/payments/teacher-sponsored-batches/quote`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    return unwrap<SponsoredBatchQuote>(response);
  },

  async updateSponsoredBatch(batchId: string, input: { beneficiaryEmails: string[]; expectedTotalAmountCents: number }): Promise<SponsoredBatchCheckout> {
    const response = await fetch(`${getBackendUrl()}/api/v1/teachers/me/sponsored-batches/${encodeURIComponent(batchId)}`, {
      method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    return unwrap<SponsoredBatchCheckout>(response);
  },

  async cancelSponsoredBatch(batchId: string) {
    const response = await fetch(`${getBackendUrl()}/api/v1/teachers/me/sponsored-batches/${encodeURIComponent(batchId)}/cancel`, { method: 'POST', credentials: 'include' });
    return unwrap<{ batchId: string; status: string; endsAt: string | null }>(response);
  },
};

function sponsoredBatchIdempotencyStorageKey(input: { monitorId: string; interval: SponsoredSeatInterval; billingType: SponsoredSeatBillingType; beneficiaryEmails: string[] }) {
  const sortedEmails = input.beneficiaryEmails.map((email) => email.trim().toLowerCase()).sort();
  return `mm_sponsored_batch_idempotency:v2:${input.monitorId}:${input.interval}:${input.billingType}:${sortedEmails.join(',')}`;
}

async function unwrap<T>(response: Response): Promise<T> {
  if (response.status === 401) throw new TeacherSessionError();
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new TeacherSponsoredSeatApiError(body.error?.message || body.message || 'Não foi possível concluir a operação das vagas.', body.error?.code || body.code, response.status);
  }
  return body.data as T;
}
