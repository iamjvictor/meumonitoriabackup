import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingSponsoredSeatInvitationToken,
  getPendingSponsoredSeatInvitationToken,
  preserveSponsoredSeatInvitationToken,
  redeemSponsoredSeatInvitationForExistingAccount,
  resolveSponsoredSeatInvitation,
} from '@/modules/student/services/sponsored-seat-invitation.service';

describe('SponsoredSeatInvitationService', () => {
  const localValues = new Map<string, string>();
  afterEach(() => {
    sessionStorage.clear();
    localValues.clear();
    vi.unstubAllGlobals();
  });

  function stubLocalStorage() {
    const storage = {
      getItem: (key: string) => localValues.get(key) ?? null,
      setItem: (key: string, value: string) => localValues.set(key, value),
      removeItem: (key: string) => localValues.delete(key),
    };
    vi.stubGlobal('localStorage', storage);
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
  }

  it('preserves the invitation token only in temporary session storage and expires stale values', () => {
    preserveSponsoredSeatInvitationToken('secret-token');
    expect(window.location.search).not.toContain('secret-token');
    expect(getPendingSponsoredSeatInvitationToken()).toBe('secret-token');

    sessionStorage.setItem('mm_pending_sponsored_invitation', JSON.stringify({ token: 'expired-token', savedAt: Date.now() - 31 * 60 * 1000 }));
    expect(getPendingSponsoredSeatInvitationToken()).toBe('');
    expect(sessionStorage.getItem('mm_pending_sponsored_invitation')).toBeNull();

    preserveSponsoredSeatInvitationToken('another-token');
    clearPendingSponsoredSeatInvitationToken();
    expect(sessionStorage.getItem('mm_pending_sponsored_invitation')).toBeNull();
  });

  it('redeems using the invitation header and authenticated cookies without sending a body', async () => {
    stubLocalStorage();
    localStorage.setItem('mm_access_token', 'private-access-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { claimedCount: 1 } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(redeemSponsoredSeatInvitationForExistingAccount('secret-token')).resolves.toEqual({ claimedCount: 1 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1/student/sponsored-seat-invitations/redeem');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('X-Sponsored-Invitation-Token')).toBe('secret-token');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer private-access-token');
    expect(init.body).toBeUndefined();
  });

  it('keeps cookie fallback when no access token exists and limits bearer auth to redeem', async () => {
    stubLocalStorage();
    const fetchMock = vi.fn().mockImplementation(() => new Response(JSON.stringify({ data: { email: 'student@example.test', teacherName: 'Prof. Ana', monitorName: 'Matemática', interval: 'MONTHLY', startsAt: '2026-11-01', endsAt: '2026-12-01' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await redeemSponsoredSeatInvitationForExistingAccount('secret-token');
    let init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('Authorization')).toBeNull();

    localStorage.setItem('mm_access_token', 'private-access-token');
    await resolveSponsoredSeatInvitation('secret-token');
    init = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBeNull();
  });
});
