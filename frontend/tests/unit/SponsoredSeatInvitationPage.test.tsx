import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SponsoredSeatInvitationPage from '@/modules/student/components/SponsoredSeatInvitationPage';
import { activateSponsoredSeatInvitation, resolveSponsoredSeatInvitation } from '@/modules/student/services/sponsored-seat-invitation.service';

const { routerPushMock, routerReplaceMock } = vi.hoisted(() => ({ routerPushMock: vi.fn(), routerReplaceMock: vi.fn() }));

vi.mock('@/modules/student/services/sponsored-seat-invitation.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/student/services/sponsored-seat-invitation.service')>();
  return { ...actual, resolveSponsoredSeatInvitation: vi.fn(), activateSponsoredSeatInvitation: vi.fn() };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPushMock, replace: routerReplaceMock }) }));

const invitation = {
  email: 'aluna@example.com', teacherName: 'Prof. Ana', monitorName: 'Matemática',
  interval: 'ANNUAL' as const, startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2027-10-31T23:59:59.000Z',
};

describe('SponsoredSeatInvitationPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    routerPushMock.mockReset();
    routerReplaceMock.mockReset();
    window.location.hash = '#token=invite-secret';
    vi.mocked(resolveSponsoredSeatInvitation).mockResolvedValue(invitation);
    vi.mocked(activateSponsoredSeatInvitation).mockResolvedValue({ accessToken: 'session-token', user: { email: invitation.email, fullName: 'Aluna Silva' }, claimedCount: 1 });
  });
  afterEach(() => vi.clearAllMocks());

  it('mostra dados do convite e mantém o e-mail bloqueado', async () => {
    render(<SponsoredSeatInvitationPage />);
    expect((await screen.findAllByText('Prof. Ana')).length).toBeGreaterThan(0);
    expect(screen.getByText('Matemática')).toBeInTheDocument();
    expect(screen.getByText('Anual')).toBeInTheDocument();
    expect(screen.getByDisplayValue(invitation.email)).toHaveAttribute('readOnly');
    expect(resolveSponsoredSeatInvitation).toHaveBeenCalledWith('invite-secret');
  });

  it('impede envio de senha inválida e ativa com apenas nome e senha', async () => {
    render(<SponsoredSeatInvitationPage />);
    await screen.findByDisplayValue(invitation.email);
    const submit = screen.getByRole('button', { name: /criar minha conta/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Aluna Silva' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText('Confirme sua senha'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /termos/i }));
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'Senha123' } });
    fireEvent.change(screen.getByLabelText('Confirme sua senha'), { target: { value: 'Senha123' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(activateSponsoredSeatInvitation).toHaveBeenCalledWith('invite-secret', { name: 'Aluna Silva', password: 'Senha123' }));
    expect(await screen.findByText(/conta criada/i)).toBeInTheDocument();
  });

  it.each([
    ['invalid', 'Este convite é inválido ou não está mais disponível.'],
    ['expired', 'Este convite expirou.'],
    ['used', 'Este convite já foi utilizado.'],
  ])('apresenta estado %s', async (code, message) => {
    vi.mocked(resolveSponsoredSeatInvitation).mockRejectedValue(Object.assign(new Error(message), { code }));
    render(<SponsoredSeatInvitationPage />);
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('oferece login quando o e-mail já tem cadastro e informa erro de rede', async () => {
    vi.mocked(activateSponsoredSeatInvitation).mockRejectedValueOnce(Object.assign(new Error('E-mail já cadastrado'), { code: 'EMAIL_ALREADY_REGISTERED' }));
    render(<SponsoredSeatInvitationPage />);
    await screen.findByDisplayValue(invitation.email);
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Aluna Silva' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'Senha123' } });
    fireEvent.change(screen.getByLabelText('Confirme sua senha'), { target: { value: 'Senha123' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /termos/i }));
    fireEvent.click(screen.getByRole('button', { name: /criar minha conta/i }));
    const loginLink = await screen.findByRole('link', { name: /entrar e vincular minha vaga/i });
    expect(loginLink).toHaveAttribute('href', '/?login=true&redirect=/areadoaluno');
    fireEvent.click(loginLink);
    expect(sessionStorage.getItem('mm_pending_sponsored_invitation')).toContain('invite-secret');
    expect(routerPushMock).toHaveBeenCalledWith('/?login=true&redirect=/areadoaluno');

    vi.mocked(resolveSponsoredSeatInvitation).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    window.location.hash = '#token=other';
    render(<SponsoredSeatInvitationPage />);
    expect(await screen.findByText(/verifique sua conexão/i)).toBeInTheDocument();
  });

  it('mantém o convite válido após erro inesperado na ativação e oferece login para vincular', async () => {
    vi.mocked(activateSponsoredSeatInvitation).mockRejectedValueOnce(Object.assign(new Error('Internal server error'), { status: 500 }));
    render(<SponsoredSeatInvitationPage />);
    await screen.findByDisplayValue(invitation.email);
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Aluna Silva' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'Senha123' } });
    fireEvent.change(screen.getByLabelText('Confirme sua senha'), { target: { value: 'Senha123' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /termos/i }));
    fireEvent.click(screen.getByRole('button', { name: /criar minha conta/i }));

    expect(await screen.findByText(/sua conta pode já ter sido criada/i)).toBeInTheDocument();
    expect(screen.getByText(invitation.email)).toBeInTheDocument();
    expect(screen.queryByText('Este convite é inválido ou não está mais disponível.')).not.toBeInTheDocument();
    const loginLink = screen.getByRole('link', { name: /entrar e vincular minha vaga/i });
    fireEvent.click(loginLink);
    expect(sessionStorage.getItem('mm_pending_sponsored_invitation')).toContain('invite-secret');
    expect(routerPushMock).toHaveBeenCalledWith('/?login=true&redirect=/areadoaluno');
  });
});
