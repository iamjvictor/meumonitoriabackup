import { expect, test } from 'vitest';
import { withStoredAccessToken } from '@/shared/context/SessionAuthInterceptor';

test('adiciona o token salvo ao Authorization sem sobrescrever um header explícito', () => {
  const request = withStoredAccessToken({ headers: { 'Content-Type': 'application/json' } }, 'token-de-teste');
  expect(new Headers(request?.headers).get('Authorization')).toBe('Bearer token-de-teste');

  const explicit = withStoredAccessToken({ headers: { Authorization: 'Bearer token-explicito' } }, 'token-salvo');
  expect(new Headers(explicit?.headers).get('Authorization')).toBe('Bearer token-explicito');
});

test('não altera a requisição quando não existe token salvo', () => {
  const init = { credentials: 'include' as const };
  expect(withStoredAccessToken(init, null)).toBe(init);
});
