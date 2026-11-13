import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentAuthModal } from '@/modules/student/components/StudentAuthModal';

vi.mock('next/image', () => ({ default: ({ alt, ...props }: Record<string, unknown>) => <span aria-label={String(alt || '')} {...props} /> }));

describe('StudentAuthModal session storage', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    values.set('mm_access_token', 'expired-token-from-previous-session');
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { userId: 'student-1', role: 'student', email: 'maria@example.com' } }),
    }));
  });

  it('removes an old access token after signup when the new session is cookie-based', async () => {
    render(<StudentAuthModal isOpen onClose={vi.fn()} checkoutMode />);

    fireEvent.change(screen.getByPlaceholderText('Maria Silva'), { target: { value: 'Maria Silva' } });
    fireEvent.change(screen.getByPlaceholderText('maria@email.com'), { target: { value: 'maria@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar para criar senha/i }));

    const passwordFields = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(passwordFields[0], { target: { value: 'Senha123' } });
    fireEvent.change(passwordFields[1], { target: { value: 'Senha123' } });
    fireEvent.click(screen.getByRole('button', { name: /concluir e ir para pagamento/i }));

    await waitFor(() => expect(screen.getByText('Conta de Aluno criada com sucesso!')).toBeInTheDocument());
    expect(localStorage.getItem('mm_access_token')).toBeNull();
  });
});
