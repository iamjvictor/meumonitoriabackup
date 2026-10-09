const CLIENT_SESSION_KEYS = [
  'mm_teacher_profile',
  'mm_access_token',
  'mm_refresh_token',
  'mm_user_role',
  'mm_user_info',
] as const;

export const AUTH_STATE_CHANGED_EVENT = 'meumonitor:auth-state-changed';

export function notifyAuthStateChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_STATE_CHANGED_EVENT));
  }
}

export function clearClientSession() {
  if (typeof window === 'undefined') return;

  for (const key of CLIENT_SESSION_KEYS) {
    window.localStorage.removeItem(key);
  }
  notifyAuthStateChanged();
}

export async function revokeClientSession(apiUrl: string): Promise<void> {
  try {
    await fetch(`${apiUrl}/api/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Mesmo sem resposta do backend, removemos o token local para impedir novas requisições autenticadas.
  } finally {
    clearClientSession();
  }
}
