import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudentInvitationRoute from '@/app/convite/aluno/page';
import { LoginModal } from '@/modules/marketing/components/LoginModal';

const { routerPushMock, routerReplaceMock, showAlertMock } = vi.hoisted(() => ({
  routerPushMock: vi.fn(), routerReplaceMock: vi.fn(), showAlertMock: vi.fn(),
}));
vi.mock('next/image', () => ({ default: ({ alt, ...props }: Record<string, unknown>) => <span aria-label={String(alt || '')} {...props} /> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPushMock, replace: routerReplaceMock }) }));
vi.mock('@/shared', () => ({ useAlert: () => ({ showAlert: showAlertMock }) }));

const localValues = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => localValues.get(key) ?? null,
  setItem: (key: string, value: string) => localValues.set(key, value),
  removeItem: (key: string) => localValues.delete(key),
  clear: () => localValues.clear(),
};

const invitationToken = 'qa-invitation-secret';
const accessToken = 'qa-login-access-secret';
const invitation = {
  email: 'student@example.test', teacherName: 'Prof. Juarez', monitorName: 'Exatas ENEM',
  interval: 'ANNUAL', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2027-10-31T23:59:59.000Z',
};

type MockOptions = { includeAccessToken: boolean; failFirstRedeem?: boolean };
function installApiMock({ includeAccessToken, failFirstRedeem = false }: MockOptions) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let redeemCount = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/api/v1/student/sponsored-seat-invitations/resolve')) {
      return new Response(JSON.stringify({ data: invitation }), { status: 200 });
    }
    if (url.endsWith('/api/v1/auth/login')) {
      // Deliberately return no Set-Cookie header: the bearer token from login
      // must authenticate the subsequent cross-origin redeem request.
      return new Response(JSON.stringify({ data: { role: 'student', ...(includeAccessToken ? { accessToken } : {}) } }), { status: 200 });
    }
    if (url.endsWith('/api/v1/student/sponsored-seat-invitations/redeem')) {
      redeemCount += 1;
      if (failFirstRedeem && redeemCount === 1) return new Response(JSON.stringify({ error: { code: 'TEMPORARY_FAILURE' } }), { status: 503 });
      return new Response(JSON.stringify({ data: { claimedCount: 1 } }), { status: 200 });
    }
    throw new Error(`Unexpected mocked fetch URL: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

async function startFromInvitationRoute() {
  window.location.hash = `#token=${invitationToken}`;
  const route = render(<StudentInvitationRoute />);
  await screen.findByDisplayValue(invitation.email);
  const loginLink = screen.getByRole('link', { name: /entrar$/i });
  expect(loginLink).toHaveAttribute('href', '/?login=true&redirect=/areadoaluno');
  expect(loginLink.getAttribute('href')).not.toContain(invitationToken);
  fireEvent.click(loginLink);
  expect(routerPushMock).toHaveBeenCalledWith('/?login=true&redirect=/areadoaluno');
  route.unmount();
}

async function loginAsStudent() {
  const user = userEvent.setup();
  render(<LoginModal isOpen onClose={vi.fn()} />);
  await user.type(screen.getByRole('textbox', { name: /e-mail/i }), invitation.email);
  await user.type(screen.getByLabelText(/^Senha \*$/i), 'student-password');
  await user.click(screen.getByRole('button', { name: /Entrar na Plataforma/i }));
  await waitFor(() => expect(routerReplaceMock).toHaveBeenCalledWith('/convite/aluno'));
}

describe('QA independente: rota real de convite → login → resgate', () => {
  const capturedLogs: string[] = [];
  beforeEach(() => {
    sessionStorage.clear();
    localValues.clear();
    vi.stubGlobal('localStorage', localStorageMock);
    Object.defineProperty(window, 'localStorage', { configurable: true, value: localStorageMock });
    routerPushMock.mockReset();
    routerReplaceMock.mockReset();
    showAlertMock.mockReset();
    capturedLogs.length = 0;
    vi.spyOn(console, 'log').mockImplementation((...args) => capturedLogs.push(args.join(' ')));
    vi.spyOn(console, 'info').mockImplementation((...args) => capturedLogs.push(args.join(' ')));
    vi.spyOn(console, 'warn').mockImplementation((...args) => capturedLogs.push(args.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...args) => capturedLogs.push(args.join(' ')));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('usa bearer retornado no login e credenciais de cookie mesmo quando login não define cookie acessível', async () => {
    const api = installApiMock({ includeAccessToken: true });
    await startFromInvitationRoute();
    await loginAsStudent();

    const loginCall = api.calls.find(({ url }) => url.endsWith('/api/v1/auth/login'))!;
    expect(loginCall.init.credentials).toBe('include');
    const redeemCall = api.calls.find(({ url }) => url.endsWith('/api/v1/student/sponsored-seat-invitations/redeem'))!;
    expect(redeemCall.init.method).toBe('POST');
    expect(redeemCall.init.credentials).toBe('include');
    const headers = new Headers(redeemCall.init.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${accessToken}`);
    expect(headers.get('X-Sponsored-Invitation-Token')).toBe(invitationToken);
    expect(redeemCall.url).not.toContain(invitationToken);
    expect(redeemCall.url).not.toContain(accessToken);
    expect(sessionStorage.getItem('mm_pending_sponsored_invitation')).toBeNull();
    expect(sessionStorage.getItem('mm_sponsored_invitation_redeemed')).toBe('1');
    expect(JSON.stringify([...routerPushMock.mock.calls, ...routerReplaceMock.mock.calls])).not.toContain(invitationToken);
    expect(JSON.stringify([...routerPushMock.mock.calls, ...routerReplaceMock.mock.calls])).not.toContain(accessToken);
    expect(capturedLogs.join(' ')).not.toContain(invitationToken);
    expect(capturedLogs.join(' ')).not.toContain(accessToken);
  });

  it('mantém fallback por cookie quando o login não retorna bearer e reusa a sessão na rota protegida', async () => {
    const api = installApiMock({ includeAccessToken: false });
    await startFromInvitationRoute();
    await loginAsStudent();

    const redeemCall = api.calls.find(({ url }) => url.endsWith('/api/v1/student/sponsored-seat-invitations/redeem'))!;
    expect(redeemCall.init.credentials).toBe('include');
    expect(new Headers(redeemCall.init.headers).get('Authorization')).toBeNull();
    expect(new Headers(redeemCall.init.headers).get('X-Sponsored-Invitation-Token')).toBe(invitationToken);
    expect(redeemCall.url).not.toContain(invitationToken);
    expect(sessionStorage.getItem('mm_sponsored_invitation_redeemed')).toBe('1');
  });

  it('usa cookie fallback mesmo se restou bearer antigo de outra sessão', async () => {
    const api = installApiMock({ includeAccessToken: false });
    localStorage.setItem('mm_access_token', 'stale-access-from-previous-session');
    await startFromInvitationRoute();
    await loginAsStudent();

    const redeemCall = api.calls.find(({ url }) => url.endsWith('/api/v1/student/sponsored-seat-invitations/redeem'))!;
    expect(redeemCall.init.credentials).toBe('include');
    expect(new Headers(redeemCall.init.headers).get('Authorization')).toBeNull();
    expect(new Headers(redeemCall.init.headers).get('X-Sponsored-Invitation-Token')).toBe(invitationToken);
  });

  it('preserva convite após falha do resgate e conclui retry sem segredo em URL ou logs', async () => {
    const api = installApiMock({ includeAccessToken: true, failFirstRedeem: true });
    await startFromInvitationRoute();
    await loginAsStudent();

    expect(sessionStorage.getItem('mm_pending_sponsored_invitation')).toContain(invitationToken);
    expect(sessionStorage.getItem('mm_sponsored_invitation_redeem_failed')).toBe('1');
    expect(JSON.stringify([...routerPushMock.mock.calls, ...routerReplaceMock.mock.calls])).not.toContain(invitationToken);
    expect(capturedLogs.join(' ')).not.toContain(invitationToken);

    cleanup();
    window.location.hash = '';
    render(<StudentInvitationRoute />);
    const retry = await screen.findByRole('button', { name: /tentar novamente/i });
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByText(/vaga vinculada com sucesso/i)).toBeInTheDocument());
    const redeemCalls = api.calls.filter(({ url }) => url.endsWith('/api/v1/student/sponsored-seat-invitations/redeem'));
    expect(redeemCalls).toHaveLength(2);
    expect(new Headers(redeemCalls[1]!.init.headers).get('Authorization')).toBe(`Bearer ${accessToken}`);
    expect(redeemCalls[1]!.init.credentials).toBe('include');
    expect(sessionStorage.getItem('mm_pending_sponsored_invitation')).toBeNull();
    expect(capturedLogs.join(' ')).not.toContain(invitationToken);
    expect(capturedLogs.join(' ')).not.toContain(accessToken);
  });
});
