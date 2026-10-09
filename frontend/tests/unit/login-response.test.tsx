import { describe, expect, it } from 'vitest';
import { extractAccessToken } from '@/shared/auth/login-response';

describe('extractAccessToken', () => {
  it('reads the normative flat token', () => {
    expect(extractAccessToken({ data: { accessToken: 'token-a' } })).toBe('token-a');
  });

  it('keeps legacy nested access tokens compatible during migration', () => {
    expect(extractAccessToken({ data: { session: { accessToken: 'legacy-token' } } })).toBe('legacy-token');
  });

  it('does not expose refresh tokens as access tokens', () => {
    expect(extractAccessToken({ data: { refreshToken: 'refresh-a' } })).toBeNull();
  });
});
