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

const teacher = { fullName: 'Professora Ana', username: 'ana', area: 'Matemática', customArea: null, bio: null, pageSlug: 'ana', avatarUrl: null, bannerUrl: null, instagram: null, tiktok: null, youtube: null, status: 'active', monitors: [
  { id: 'm1', name: 'Monitor de Matemática', priceCents: 10000, annualPriceCents: 96000, description: null },
] } as any;

function mockCheckoutFetch() {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { role: 'student', email: 'aluno@example.com' } }), { status: 200 }))
    .mockResolvedValue(new Response(JSON.stringify({ data: { orderId: 'order-1', checkoutUrl: 'https://checkout.test' } }), { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function openPlan() {
  fireEvent.click(screen.getByText('Monitor de Matemática'));
}

beforeEach(() => {
  routerPush.mockReset();
  const localValues = new Map<string, string>([['mm_user_info', JSON.stringify({ email: 'aluno@example.com', fullName: 'Aluno' })]]);
  const sessionValues = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: vi.fn((key: string) => localValues.get(key) ?? null), setItem: vi.fn((key: string, value: string) => localValues.set(key, value)), removeItem: vi.fn((key: string) => localValues.delete(key)) });
  vi.stubGlobal('sessionStorage', { getItem: vi.fn((key: string) => sessionValues.get(key) ?? null), setItem: vi.fn((key: string, value: string) => sessionValues.set(key, value)), removeItem: vi.fn((key: string) => sessionValues.delete(key)) });
  let id = 0;
  vi.stubGlobal('crypto', { randomUUID: () => `checkout-key-${++id}` });
});

describe('Teacher storefront payment method selection', () => {
  it('requires an explicit method before enabling checkout', () => {
    render(<StorefrontClient teacher={teacher} />);
    openPlan();

    expect(screen.getByRole('button', { name: /comprar 12 meses/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /anual.*recomendado/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Recomendado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^mensal/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('radio', { name: /cartão de crédito.*em até 12 parcelas/i })).toBeInTheDocument();
    const paymentGroup = screen.getByRole('group', { name: 'Forma de pagamento' });
    expect(paymentGroup.querySelector('div')?.className).toContain('grid-cols-2');
    expect(screen.getByRole('radio', { name: /pix.*pagamento à vista por 12 meses/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /pix.*pagamento à vista por 12 meses/i }));
    expect(screen.getByRole('button', { name: /comprar 12 meses/i })).toBeEnabled();
  });

  it('shows only annual methods and clears the choice when the interval changes', () => {
    render(<StorefrontClient teacher={teacher} />);
    openPlan();

    fireEvent.click(screen.getByRole('button', { name: /^mensal/i }));
    const monthlyCard = screen.getByRole('radio', { name: /cartão de crédito.*cobrança recorrente mensal/i });
    fireEvent.click(monthlyCard);
    expect(monthlyCard).toBeChecked();
    expect(screen.getByRole('button', { name: /assinar agora/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /anual · 12 meses/i }));
    expect(screen.getByRole('radio', { name: /pix.*pagamento à vista por 12 meses/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /cartão de crédito.*à vista ou em até 12 parcelas/i })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole('button', { name: /comprar 12 meses/i })).toBeDisabled();
  });

  it('defaults to monthly without an available annual plan', () => {
    const teacherWithoutAnnual = {
      ...teacher,
      monitors: [{ ...teacher.monitors[0], annualPriceCents: null }],
    };
    render(<StorefrontClient teacher={teacherWithoutAnnual} />);
    openPlan();

    expect(screen.getByRole('button', { name: /^mensal/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /anual/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Recomendado')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /pix.*pagamento único por 1 mês/i })).toBeInTheDocument();
  });

  it('sends the selected interval and payment method with a distinct idempotency key per combination', async () => {
    const fetchMock = mockCheckoutFetch();
    render(<StorefrontClient teacher={teacher} />);
    await screen.findByText('Entrar como Aluno');

    openPlan();
    fireEvent.click(screen.getByRole('button', { name: /^mensal/i }));
    fireEvent.click(screen.getByRole('radio', { name: /cartão de crédito.*cobrança recorrente mensal/i }));
    fireEvent.click(screen.getByRole('button', { name: /assinar agora/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const cardRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(cardRequest.body))).toEqual({ monitorId: 'm1', interval: 'MONTHLY', billingType: 'CREDIT_CARD' });
    const idempotencyKeys = [new Headers(cardRequest.headers).get('Idempotency-Key')];

    openPlan();
    fireEvent.click(screen.getByRole('button', { name: /^mensal/i }));
    fireEvent.click(screen.getByRole('radio', { name: /pix.*pagamento único por 1 mês/i }));
    fireEvent.click(screen.getByRole('button', { name: /assinar agora/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const pixRequest = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(JSON.parse(String(pixRequest.body))).toEqual({ monitorId: 'm1', interval: 'MONTHLY', billingType: 'PIX' });
    idempotencyKeys.push(new Headers(pixRequest.headers).get('Idempotency-Key'));

    openPlan();
    fireEvent.click(screen.getByRole('button', { name: /anual · 12 meses/i }));
    fireEvent.click(screen.getByRole('radio', { name: /pix.*pagamento à vista por 12 meses/i }));
    fireEvent.click(screen.getByRole('button', { name: /comprar 12 meses/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const annualPixRequest = fetchMock.mock.calls[3]?.[1] as RequestInit;
    expect(JSON.parse(String(annualPixRequest.body))).toEqual({ monitorId: 'm1', interval: 'ANNUAL', billingType: 'PIX' });
    idempotencyKeys.push(new Headers(annualPixRequest.headers).get('Idempotency-Key'));

    openPlan();
    fireEvent.click(screen.getByRole('button', { name: /anual · 12 meses/i }));
    fireEvent.click(screen.getByRole('radio', { name: /cartão de crédito.*à vista ou em até 12 parcelas/i }));
    fireEvent.click(screen.getByRole('button', { name: /comprar 12 meses/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    const annualCardRequest = fetchMock.mock.calls[4]?.[1] as RequestInit;
    expect(JSON.parse(String(annualCardRequest.body))).toEqual({ monitorId: 'm1', interval: 'ANNUAL', billingType: 'CREDIT_CARD' });
    idempotencyKeys.push(new Headers(annualCardRequest.headers).get('Idempotency-Key'));

    expect(idempotencyKeys.every(Boolean)).toBe(true);
    expect(new Set(idempotencyKeys).size).toBe(4);
  });
});
