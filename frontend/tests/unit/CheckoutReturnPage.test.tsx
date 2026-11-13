import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CheckoutReturnPage from '@/app/(student-app)/checkout/retorno/page';

const { routerReplace } = vi.hoisted(() => ({ routerReplace: vi.fn() }));
let search = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => search,
}));

describe('CheckoutReturnPage', () => {
  beforeEach(() => {
    routerReplace.mockReset();
    search = new URLSearchParams('orderId=order-123&status=success');
  });

  afterEach(() => vi.useRealTimers());

  it('returns a successful Asaas checkout to the signed-in student area', async () => {
    vi.useFakeTimers();
    render(<CheckoutReturnPage />);

    expect(screen.getByRole('heading', { name: /checkout recebido/i })).toBeInTheDocument();
    expect(screen.getByText(/confirmando seu pagamento/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /área do aluno/i }));
    expect(routerReplace).toHaveBeenCalledWith('/areadoaluno');

    routerReplace.mockReset();
    await vi.advanceTimersByTimeAsync(2000);
    expect(routerReplace).toHaveBeenCalledWith('/areadoaluno');
  });

  it('does not redirect automatically when payment was cancelled', async () => {
    search = new URLSearchParams('orderId=order-123&status=cancelled');
    vi.useFakeTimers();
    render(<CheckoutReturnPage />);

    expect(screen.getByRole('heading', { name: /pagamento não concluído/i })).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(2000);
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('does not redirect automatically when the checkout expired', async () => {
    search = new URLSearchParams('orderId=order-123&status=expired');
    vi.useFakeTimers();
    render(<CheckoutReturnPage />);

    expect(screen.getByRole('heading', { name: /checkout expirado/i })).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(2000);
    expect(routerReplace).not.toHaveBeenCalled();
  });
});
