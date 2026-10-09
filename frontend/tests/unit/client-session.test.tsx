import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearClientSession, notifyAuthStateChanged, revokeClientSession } from '@/shared/auth/client-session';

describe('client session lifecycle', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        get length() { return values.size; },
      },
    });
    vi.restoreAllMocks();
  });

  it('clears every client credential and profile key', () => {
    for (const key of ['mm_teacher_profile', 'mm_access_token', 'mm_refresh_token', 'mm_user_role', 'mm_user_info']) {
      localStorage.setItem(key, 'stale');
    }

    clearClientSession();

    expect(localStorage.length).toBe(0);
  });

  it('clears local credentials when backend logout fails', async () => {
    localStorage.setItem('mm_access_token', 'token-a');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await revokeClientSession('https://api.example.test');

    expect(localStorage.getItem('mm_access_token')).toBeNull();
  });

  it('notifies the mounted app after same-tab auth changes', () => {
    const listener = vi.fn();
    window.addEventListener('meumonitor:auth-state-changed', listener);

    notifyAuthStateChanged();

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('meumonitor:auth-state-changed', listener);
  });
});
