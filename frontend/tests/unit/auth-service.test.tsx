import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@/modules/marketing/services/AuthService';

const { resetPasswordForEmailMock } = vi.hoisted(() => ({
  resetPasswordForEmailMock: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      resetPasswordForEmail: resetPasswordForEmailMock,
    },
  }),
}));

describe('AuthService.login', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    vi.restoreAllMocks();
  });

  it('persists the flat access token returned by the backend', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { userId: 'user-a', email: 'a@example.com', role: 'student', accessToken: 'token-a' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await AuthService.login({ email: 'a@example.com', password: 'secret' });

    expect(localStorage.getItem('mm_access_token')).toBe('token-a');
    expect(localStorage.getItem('mm_user_role')).toBe('student');
  });

  it('requests password recovery through Supabase with the production reset route', async () => {
    resetPasswordForEmailMock.mockResolvedValueOnce({ data: {}, error: null });

    await AuthService.requestPasswordReset('student@example.com');

    expect(resetPasswordForEmailMock).toHaveBeenCalledWith('student@example.com', {
      redirectTo: 'http://localhost:3000/redefinir-senha',
    });
  });

  it('propagates Supabase recovery errors', async () => {
    resetPasswordForEmailMock.mockResolvedValueOnce({
      data: null,
      error: new Error('SMTP indisponível'),
    });

    await expect(AuthService.requestPasswordReset('student@example.com'))
      .rejects.toThrow('SMTP indisponível');
  });
});
