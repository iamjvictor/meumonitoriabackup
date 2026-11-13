import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SponsoredSeatInvitationPage from '@/modules/student/components/SponsoredSeatInvitationPage';
import { activateSponsoredSeatInvitation, resolveSponsoredSeatInvitation } from '@/modules/student/services/sponsored-seat-invitation.service';

const { routerPushMock, routerReplaceMock } = vi.hoisted(() => ({ routerPushMock: vi.fn(), routerReplaceMock: vi.fn() }));

vi.mock('@/modules/student/services/sponsored-seat-invitation.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/student/services/sponsored-seat-invitation.service')>();
  return { ...actual, resolveSponsoredSeatInvitation: vi.fn(), activateSponsoredSeatInvitation: vi.fn() };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPushMock, replace: routerReplaceMock }) }));

const invitation = {
  email: 'student@example.test',
  teacherName: 'Prof. Juarez',
  monitorName: 'Exatas ENEM',
  interval: 'ANNUAL' as const,
  startsAt: '2026-11-01T00:00:00.000Z',
  endsAt: '2027-10-31T23:59:59.000Z',
};
const secret = 'qa-only-invitation-secret';

function completeActivationForm() {
  fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Aluna Silva' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'Senha123' } });
  fireEvent.change(screen.getByLabelText('Confirme sua senha'), { target: { value: 'Senha123' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /termos/i }));
}

describe('QA independente: recuperação de convite após falha de ativação', () => {
  beforeEach(() => {
    sessionStorage.clear();
    routerPushMock.mockReset();
    routerReplaceMock.mockReset();
    window.location.hash = `#token=${secret}`;
    vi.mocked(resolveSponsoredSeatInvitation).mockResolvedValue(invitation);
    vi.mocked(activateSponsoredSeatInvitation).mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('mantém o convite válido e seus dados após HTTP 500 e oferece login recuperável', async () => {
    vi.mocked(activateSponsoredSeatInvitation).mockRejectedValueOnce(Object.assign(new Error('Internal server error'), { status: 500 }));
    render(<SponsoredSeatInvitationPage />);
    await screen.findByDisplayValue(invitation.email);
    completeActivationForm();
    fireEvent.click(screen.getByRole('button', { name: /criar minha conta/i }));

    expect(await screen.findByText(/sua conta pode já ter sido criada/i)).toBeInTheDocument();
    expect(screen.getByText(/Prof\. Juarez/)).toBeInTheDocument();
    expect(screen.getByText(/Exatas ENEM/)).toBeInTheDocument();
    expect(screen.getByText(invitation.email)).toBeInTheDocument();
    expect(screen.queryByText('Este convite é inválido ou não está mais disponível.')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(invitation.email);
  });

  it('preserva o token para o login sem expô-lo no CTA, em href ou na navegação', async () => {
    vi.mocked(activateSponsoredSeatInvitation).mockRejectedValueOnce(Object.assign(new Error('Internal server error'), { status: 500 }));
    render(<SponsoredSeatInvitationPage />);
    await screen.findByDisplayValue(invitation.email);
    completeActivationForm();
    fireEvent.click(screen.getByRole('button', { name: /criar minha conta/i }));

    const link = await screen.findByRole('link', { name: /entrar e vincular minha vaga/i });
    expect(link).toHaveAttribute('href', '/?login=true&redirect=/areadoaluno');
    expect(link.getAttribute('href')).not.toContain(secret);
    expect(document.body.textContent).not.toContain(secret);
    fireEvent.click(link);

    expect(JSON.parse(sessionStorage.getItem('mm_pending_sponsored_invitation') || '{}')).toMatchObject({ token: secret });
    expect(routerPushMock).toHaveBeenCalledWith('/?login=true&redirect=/areadoaluno');
    expect(JSON.stringify(routerPushMock.mock.calls)).not.toContain(secret);
  });

  it('continua distinguindo convite inválido no carregamento de falha recuperável na ativação', async () => {
    vi.mocked(resolveSponsoredSeatInvitation).mockRejectedValueOnce(Object.assign(new Error('Invalid invitation'), { code: 'INVALID_INVITATION' }));
    render(<SponsoredSeatInvitationPage />);
    expect(await screen.findByText('Este convite é inválido ou não está mais disponível.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /entrar e vincular minha vaga/i })).not.toBeInTheDocument();
  });
});
