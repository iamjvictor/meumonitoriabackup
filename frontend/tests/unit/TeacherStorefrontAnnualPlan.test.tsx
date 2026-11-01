import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StorefrontClient from '../../src/app/(public-teacher)/p/[teacherSlug]/StorefrontClient';

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next/image', () => ({ default: (props: any) => <img {...props} /> }));
vi.mock('@/shared', () => ({ OptimizedImage: (props: any) => <img {...props} />, useAlert: () => ({ showAlert: vi.fn() }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/ui/feature-shader-cards', () => ({ default: () => null }));
vi.mock('@/shared/auth/session-headers', () => ({ buildStudentAuthHeaders: () => ({}) }));
vi.mock('@/shared/auth/client-session', () => ({ AUTH_STATE_CHANGED_EVENT: 'auth', revokeClientSession: vi.fn() }));

beforeEach(() => {
  routerPush.mockReset();
  const localValues = new Map<string, string>([['mm_user_info', JSON.stringify({ email: 'aluno@example.com', fullName: 'Aluno' })]]);
  vi.stubGlobal('localStorage', { getItem: vi.fn((key: string) => localValues.get(key) ?? null), setItem: vi.fn((key: string, value: string) => localValues.set(key, value)), removeItem: vi.fn((key: string) => localValues.delete(key)) });
  vi.stubGlobal('sessionStorage', { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal('crypto', { randomUUID: () => 'checkout-key' });
});

describe('Teacher storefront annual plan', () => {
  it('shows the annual choice only for monitors with an annual price', () => {
    const teacher = { fullName: 'Professora Ana', username: 'ana', area: 'Matemática', customArea: null, bio: null, pageSlug: 'ana', avatarUrl: null, bannerUrl: null, instagram: null, tiktok: null, youtube: null, status: 'active', monitors: [
      { id: 'm1', name: 'Com anual', priceCents: 10000, annualPriceCents: 96000, description: null },
      { id: 'm2', name: 'Sem anual', priceCents: 10000, annualPriceCents: null, description: null },
    ] } as any;
    render(<StorefrontClient teacher={teacher} />);
    fireEvent.click(screen.getByText('Com anual'));
    expect(screen.getByText(/Anual · 12 meses/)).toBeInTheDocument();
    expect(screen.getAllByText(/R\$ 960,00|R\$ 960,00/).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/Plano anual indisponível/)).not.toBeInTheDocument();
  });

  it('sends the selected annual interval to checkout', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { role: 'student', email: 'aluno@example.com' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { orderId: 'order-1', checkoutUrl: 'https://checkout.test' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const teacher = { fullName: 'Professora Ana', username: 'ana', area: 'Matemática', customArea: null, bio: null, pageSlug: 'ana', avatarUrl: null, bannerUrl: null, instagram: null, tiktok: null, youtube: null, status: 'active', monitors: [
      { id: 'm1', name: 'Com anual', priceCents: 10000, annualPriceCents: 96000, description: null },
    ] } as any;
    render(<StorefrontClient teacher={teacher} />);
    await screen.findByText('Entrar como Aluno');
    fireEvent.click(screen.getByText('Com anual'));
    fireEvent.click(screen.getByRole('button', { name: /anual · 12 meses/i }));
    fireEvent.click(screen.getByRole('button', { name: /comprar 12 meses/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const checkoutRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(checkoutRequest.body))).toEqual({ monitorId: 'm1', interval: 'ANNUAL' });
    expect(routerPush).toHaveBeenCalledWith('https://checkout.test');
  });

  it('sends the selected monthly interval to checkout for a student', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { role: 'student', email: 'aluno@example.com' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { orderId: 'order-monthly', checkoutUrl: 'https://checkout.test/monthly' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const teacher = { fullName: 'Professora Ana', username: 'ana', area: 'Matemática', customArea: null, bio: null, pageSlug: 'ana', avatarUrl: null, bannerUrl: null, instagram: null, tiktok: null, youtube: null, status: 'active', monitors: [
      { id: 'm1', name: 'Monitor mensal', priceCents: 10000, annualPriceCents: 96000, description: null },
    ] } as any;
    render(<StorefrontClient teacher={teacher} />);
    await screen.findByText('Entrar como Aluno');
    fireEvent.click(screen.getByText('Monitor mensal'));
    fireEvent.click(screen.getByRole('button', { name: /assinar agora/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const checkoutRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(checkoutRequest.body))).toEqual({ monitorId: 'm1', interval: 'MONTHLY' });
    expect(routerPush).toHaveBeenCalledWith('https://checkout.test/monthly');
  });
});
