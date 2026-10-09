import { describe, expect, it, vi } from 'vitest';
import {
  formatPaymentAmount,
  getDashboardUrl,
  getPaymentAccountStatusCopy,
  getMetricsAvailability,
  isRetryablePaymentOverviewError,
} from '@/modules/teacher/utils/payment-account-overview';
import { TeacherPaymentOverviewService } from '@/modules/teacher/services/TeacherPaymentOverviewService';

describe('payment account overview helpers', () => {
  it('formats integer cents as BRL', () => {
    expect(formatPaymentAmount(125000)).toBe('R$ 1.250,00');
    expect(formatPaymentAmount(0)).toBe('R$ 0,00');
  });

  it('maps unavailable metrics without inventing zero', () => {
    expect(getMetricsAvailability(null)).toBe('Indisponível');
  });

  it('accepts only safe absolute dashboard URLs', () => {
    expect(getDashboardUrl('https://www.asaas.com/login')).toBe('https://www.asaas.com/login');
    expect(getDashboardUrl('/login')).toBeNull();
    expect(getDashboardUrl('javascript:alert(1)')).toBeNull();
    expect(getDashboardUrl(null)).toBeNull();
  });

  it('provides copy for pending and rejected account statuses', () => {
    expect(getPaymentAccountStatusCopy('PENDING').label).toMatch(/pendente/i);
    expect(getPaymentAccountStatusCopy('PENDING').description).toMatch(/e-mail/i);
    expect(getPaymentAccountStatusCopy('REJECTED').label).toMatch(/rejeitad/i);
  });

  it('classifies transient errors as retryable', () => {
    expect(isRetryablePaymentOverviewError({ status: 503 })).toBe(true);
    expect(isRetryablePaymentOverviewError({ status: 400 })).toBe(false);
    expect(isRetryablePaymentOverviewError(new TypeError('Failed to fetch'))).toBe(true);
  });
});

describe('TeacherPaymentOverviewService', () => {
  it('fetches the documented endpoint with cookies and deduplicates concurrent requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {
      account: { status: 'APPROVED', generalStatus: 'APPROVED', onboardingUrl: null, dashboardUrl: 'https://www.asaas.com/login', providerAccountId: 'acc', walletId: 'wallet' },
      metrics: { availableBalanceCents: 125000, receivedThisMonthCents: 278900, pendingReceivablesCents: 34900, pendingTransfersCount: 1, currency: 'BRL', asOf: '2026-09-25T15:00:00.000Z' },
    } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([
      TeacherPaymentOverviewService.get(),
      TeacherPaymentOverviewService.get(),
    ]);

    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/teachers/me/payment-account/overview'), expect.objectContaining({ credentials: 'include' }));
  });

  it('throws a safe error for a failed response and can be retried after rejection', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'temporary failure' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { account: { status: 'PENDING', generalStatus: null, onboardingUrl: null, dashboardUrl: null, providerAccountId: 'acc', walletId: null }, metrics: null } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(TeacherPaymentOverviewService.get()).rejects.toMatchObject({ status: 503 });
    await expect(TeacherPaymentOverviewService.get()).resolves.toMatchObject({ metrics: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
