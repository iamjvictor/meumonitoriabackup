import { notifyAuthStateChanged } from '@/shared/auth/client-session';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';
const basePath = '/api/v1/student/sponsored-seat-invitations';
const pendingTokenStorageKey = 'mm_pending_sponsored_invitation';
const redeemedMarkerStorageKey = 'mm_sponsored_invitation_redeemed';
const redeemFailureMarkerStorageKey = 'mm_sponsored_invitation_redeem_failed';
const pendingTokenMaxAgeMs = 30 * 60 * 1000;

export interface SponsoredSeatInvitation {
  email: string;
  teacherName: string;
  monitorName: string;
  interval: 'MONTHLY' | 'ANNUAL';
  startsAt: string;
  endsAt: string;
}

interface ApiPayload {
  data?: Record<string, unknown>;
  error?: { code?: string; message?: string } | string;
  message?: string;
  code?: string;
}

export class SponsoredInvitationError extends Error {
  constructor(message: string, public readonly code: string, public readonly status?: number) {
    super(message);
    this.name = 'SponsoredInvitationError';
  }
}

export function preserveSponsoredSeatInvitationToken(token: string) {
  if (typeof window === 'undefined' || !token) return;
  window.sessionStorage.removeItem(redeemedMarkerStorageKey);
  window.sessionStorage.removeItem(redeemFailureMarkerStorageKey);
  window.sessionStorage.setItem(pendingTokenStorageKey, JSON.stringify({ token, savedAt: Date.now() }));
}

export function getPendingSponsoredSeatInvitationToken() {
  if (typeof window === 'undefined') return '';
  const stored = window.sessionStorage.getItem(pendingTokenStorageKey);
  if (!stored) return '';
  try {
    const value = JSON.parse(stored) as { token?: unknown; savedAt?: unknown };
    if (typeof value.token !== 'string' || !value.token || typeof value.savedAt !== 'number' || Date.now() - value.savedAt > pendingTokenMaxAgeMs) {
      clearPendingSponsoredSeatInvitationToken();
      return '';
    }
    return value.token;
  } catch {
    clearPendingSponsoredSeatInvitationToken();
    return '';
  }
}

export function clearPendingSponsoredSeatInvitationToken() {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(pendingTokenStorageKey);
}

export function markSponsoredSeatInvitationRedeemed() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(redeemFailureMarkerStorageKey);
  window.sessionStorage.setItem(redeemedMarkerStorageKey, '1');
}

export function consumeSponsoredSeatInvitationRedeemed() {
  if (typeof window === 'undefined') return false;
  const redeemed = window.sessionStorage.getItem(redeemedMarkerStorageKey) === '1';
  window.sessionStorage.removeItem(redeemedMarkerStorageKey);
  return redeemed;
}

export function markSponsoredSeatInvitationRedeemFailed() {
  if (typeof window !== 'undefined') window.sessionStorage.setItem(redeemFailureMarkerStorageKey, '1');
}

export function consumeSponsoredSeatInvitationRedeemFailed() {
  if (typeof window === 'undefined') return false;
  const failed = window.sessionStorage.getItem(redeemFailureMarkerStorageKey) === '1';
  window.sessionStorage.removeItem(redeemFailureMarkerStorageKey);
  return failed;
}

async function request(path: string, token: string, init?: RequestInit): Promise<ApiPayload> {
  let response: Response;
  try {
    const headers: Record<string, string> = { 'X-Sponsored-Invitation-Token': token };
    if (init?.headers instanceof Headers) init.headers.forEach((value, name) => { headers[name] = value; });
    else if (Array.isArray(init?.headers)) init.headers.forEach(([name, value]) => { headers[name] = value; });
    else Object.assign(headers, init?.headers || {});
    // This endpoint is cross-origin in local/test deployments, where the API
    // cannot receive the app's host-only session cookie. Keep cookies as a
    // fallback, and add the session bearer only for authenticated redemption.
    if (path === 'redeem' && typeof window !== 'undefined') {
      let accessToken: string | null = null;
      try { accessToken = window.localStorage.getItem('mm_access_token'); } catch { /* Cookie auth remains available. */ }
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    }
    response = await fetch(`${apiUrl}${basePath}/${path}`, {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new SponsoredInvitationError('Não foi possível carregar o convite. Verifique sua conexão e tente novamente.', 'NETWORK_ERROR');
  }
  const payload = await response.json().catch(() => ({})) as ApiPayload;
  if (!response.ok) {
    const rawError = typeof payload.error === 'object' ? payload.error : undefined;
    const code = rawError?.code || payload.code || (typeof payload.error === 'string' ? payload.error : '') || '';
    const message = rawError?.message || payload.message || '';
    throw new SponsoredInvitationError(message || 'Não foi possível concluir esta solicitação.', code, response.status);
  }
  return payload;
}

export async function resolveSponsoredSeatInvitation(token: string): Promise<SponsoredSeatInvitation> {
  const payload = await request('resolve', token, { method: 'GET' });
  if (!payload.data) throw new SponsoredInvitationError('Não foi possível carregar os dados deste convite.', 'INVALID_RESPONSE');
  return payload.data as unknown as SponsoredSeatInvitation;
}

export async function activateSponsoredSeatInvitation(token: string, input: { name: string; password: string }) {
  const payload = await request('activate', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input.name, password: input.password }),
  });
  const data = payload.data || {};
  const accessToken = typeof data.accessToken === 'string' ? data.accessToken : '';
  if (accessToken && typeof window !== 'undefined') {
    localStorage.setItem('mm_access_token', accessToken);
    localStorage.setItem('mm_user_role', 'student');
    localStorage.setItem('mm_user_info', JSON.stringify({ email: data.email, fullName: input.name, role: 'student' }));
    notifyAuthStateChanged();
  }
  return data;
}

export async function redeemSponsoredSeatInvitationForExistingAccount(token: string) {
  const payload = await request('redeem', token, { method: 'POST' });
  return payload.data || {};
}
