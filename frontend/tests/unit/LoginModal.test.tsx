import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginModal } from '../../src/modules/marketing/components/LoginModal';

const { loginMock, resetPasswordMock, showAlertMock, redeemInvitationMock, routerPushMock, routerReplaceMock } = vi.hoisted(() => ({
  loginMock: vi.fn(),
  resetPasswordMock: vi.fn(),
  showAlertMock: vi.fn(),
  redeemInvitationMock: vi.fn(),
  routerPushMock: vi.fn(),
  routerReplaceMock: vi.fn(),
}));

vi.mock('next/image', () => ({ default: ({ alt, ...props }: Record<string, unknown>) => <span aria-label={String(alt || '')} {...props} /> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPushMock, replace: routerReplaceMock }) }));
vi.mock('@/shared', () => ({ useAlert: () => ({ showAlert: showAlertMock }) }));
vi.mock('../../src/modules/marketing/services/AuthService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/modules/marketing/services/AuthService')>();
  return {
    ...actual,
    AuthService: { login: loginMock, requestPasswordReset: resetPasswordMock },
  };
});
vi.mock('@/modules/student/services/sponsored-seat-invitation.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/student/services/sponsored-seat-invitation.service')>();
  return { ...actual, redeemSponsoredSeatInvitationForExistingAccount: redeemInvitationMock };
});

describe('LoginModal', () => {
  beforeEach(() => {
    loginMock.mockReset();
    redeemInvitationMock.mockReset();
    routerPushMock.mockReset();
    routerReplaceMock.mockReset();
    sessionStorage.clear();
  });

  it('renders accessible controls and validates required credentials', async () => {
    const user = userEvent.setup();
    render(<LoginModal isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /MeuMonitorAI/i })).toBeVisible();
    expect(screen.getByRole('textbox', { name: /e-mail/i })).toBeVisible();
    expect(screen.getByLabelText(/^Senha \*$/i)).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /Entrar na Plataforma/i }));

    expect(await screen.findByText(/preencha o e-mail e a senha/i)).toBeVisible();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('supports keyboard password visibility and exposes friendly server errors for retry', async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValueOnce(new Error('INVALID_CREDENTIALS')).mockResolvedValueOnce({ data: { role: 'student' } });
    render(<LoginModal isOpen onClose={vi.fn()} />);

    await user.type(screen.getByRole('textbox', { name: /e-mail/i }), 'student@example.com');
    const password = screen.getByLabelText(/^Senha \*$/i);
    await user.type(password, 'secret');
    await user.click(screen.getByRole('button', { name: /mostrar senha|exibir senha/i }));
    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: /Entrar na Plataforma/i }));
    expect(await screen.findByText(/E-mail ou senha incorretos\. Verifique suas credenciais e tente novamente\./i)).toBeVisible();
    await waitFor(() => expect(loginMock).toHaveBeenCalledTimes(1));
  });

  it('redeems a pending sponsored invitation after login and returns to its page without a token in the URL', async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValue({ data: { role: 'student' } });
    redeemInvitationMock.mockResolvedValue({ claimedCount: 1 });
    sessionStorage.setItem('mm_pending_sponsored_invitation', JSON.stringify({ token: 'invite-secret', savedAt: Date.now() }));
    render(<LoginModal isOpen onClose={vi.fn()} />);

    await user.type(screen.getByRole('textbox', { name: /e-mail/i }), 'student@example.com');
    await user.type(screen.getByLabelText(/^Senha \*$/i), 'secret');
    await user.click(screen.getByRole('button', { name: /Entrar na Plataforma/i }));

    await waitFor(() => expect(redeemInvitationMock).toHaveBeenCalledWith('invite-secret'));
    expect(sessionStorage.getItem('mm_pending_sponsored_invitation')).toBeNull();
    expect(sessionStorage.getItem('mm_sponsored_invitation_redeemed')).toBe('1');
    expect(routerReplaceMock).toHaveBeenCalledWith('/convite/aluno');
  });

  it('does not submit when closed', () => {
    render(<LoginModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('heading', { name: /MeuMonitor AI/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Entrar na Plataforma/i })).not.toBeInTheDocument();
  });

  it('sends a real password recovery request for the entered email', async () => {
    const user = userEvent.setup();
    resetPasswordMock.mockResolvedValueOnce(undefined);
    render(<LoginModal isOpen onClose={vi.fn()} />);

    await user.type(screen.getByRole('textbox', { name: /e-mail/i }), 'student@example.com');
    await user.click(screen.getByRole('link', { name: /Esqueceu a senha/i }));

    await waitFor(() => expect(resetPasswordMock).toHaveBeenCalledWith('student@example.com'));
    expect(showAlertMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Recuperação de Senha',
      type: 'success',
    }));
  });

  it('explains that the session expired and keeps the dialog dismissible', async () => {
    window.history.pushState({}, '', '/?session=expired');
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<LoginModal isOpen onClose={onClose} />);

    expect(await screen.findByText(/Sua sessão expirou/i)).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Fechar login/i }));
    expect(onClose).toHaveBeenCalled();
    window.history.pushState({}, '', '/');
  });
});
