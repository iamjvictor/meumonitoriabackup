import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginModal } from '../../src/modules/marketing/components/LoginModal';

const { loginMock, routerReplaceMock, showAlertMock } = vi.hoisted(() => ({ loginMock: vi.fn(), routerReplaceMock: vi.fn(), showAlertMock: vi.fn() }));
vi.mock('next/image', () => ({ default: ({ alt, ...props }: Record<string, unknown>) => <span aria-label={String(alt || '')} {...props} /> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: routerReplaceMock }) }));
vi.mock('@/shared', () => ({ useAlert: () => ({ showAlert: showAlertMock }) }));
vi.mock('../../src/modules/marketing/services/AuthService', async (load) => ({ ...(await load()), AuthService: { login: loginMock, requestPasswordReset: vi.fn() } }));

describe('QA independent: LoginModal invitation handoff', () => {
  beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });
  async function submitLogin() {
    const user = userEvent.setup();
    render(<LoginModal isOpen onClose={vi.fn()} />);
    await user.type(screen.getByRole('textbox', { name: /e-mail/i }), 'student@example.test');
    await user.type(screen.getByLabelText(/^Senha \*$/i), 'password');
    await user.click(screen.getByRole('button', { name: /Entrar na Plataforma/i }));
  }
  function saveToken() { sessionStorage.setItem('mm_pending_sponsored_invitation', JSON.stringify({ token: 'fragment-secret', savedAt: Date.now() })); }

  it('uses authenticated login session for redeem, clears pending token and returns to invitation on success', async () => {
    loginMock.mockResolvedValue({ data: { role: 'student' } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { claimedCount: 1 } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    saveToken();
    await submitLogin();
    await waitFor(() => expect(routerReplaceMock).toHaveBeenCalledWith('/convite/aluno'));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/student/sponsored-seat-invitations/redeem'), expect.objectContaining({ method: 'POST', credentials: 'include', headers: expect.objectContaining({ 'X-Sponsored-Invitation-Token': 'fragment-secret' }) }));
    expect(sessionStorage.getItem('mm_pending_sponsored_invitation')).toBeNull();
    expect(sessionStorage.getItem('mm_sponsored_invitation_redeemed')).toBe('1');
    vi.unstubAllGlobals();
  });

  it('preserves invitation token and marks retry when authenticated redeem fails', async () => {
    loginMock.mockResolvedValue({ data: { role: 'student' } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'TEMPORARY_FAILURE' } }), { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    saveToken();
    await submitLogin();
    await waitFor(() => expect(routerReplaceMock).toHaveBeenCalledWith('/convite/aluno'));
    expect(sessionStorage.getItem('mm_pending_sponsored_invitation')).toContain('fragment-secret');
    expect(sessionStorage.getItem('mm_sponsored_invitation_redeem_failed')).toBe('1');
    expect(sessionStorage.getItem('mm_sponsored_invitation_redeemed')).toBeNull();
    vi.unstubAllGlobals();
  });
});
