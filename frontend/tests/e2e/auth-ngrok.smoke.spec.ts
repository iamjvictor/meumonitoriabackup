import { expect, test } from '@playwright/test';

const requiredEnv = [
  'AUTH_SMOKE_FRONTEND_URL',
  'AUTH_SMOKE_API_URL',
  'AUTH_SMOKE_USER_A_EMAIL',
  'AUTH_SMOKE_USER_A_PASSWORD',
  'AUTH_SMOKE_USER_B_EMAIL',
  'AUTH_SMOKE_USER_B_PASSWORD',
] as const;

type SmokeConfig = {
  missing: string[];
  frontendUrl: string;
  apiUrl: string;
  userA: { email: string; password: string };
  userB: { email: string; password: string };
};

function smokeConfig(): SmokeConfig {
  const missing = requiredEnv.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    return { missing, frontendUrl: '', apiUrl: '', userA: { email: '', password: '' }, userB: { email: '', password: '' } };
  }

  return {
    missing: [],
    frontendUrl: process.env.AUTH_SMOKE_FRONTEND_URL!,
    apiUrl: process.env.AUTH_SMOKE_API_URL!.replace(/\/+$/, ''),
    userA: { email: process.env.AUTH_SMOKE_USER_A_EMAIL!, password: process.env.AUTH_SMOKE_USER_A_PASSWORD! },
    userB: { email: process.env.AUTH_SMOKE_USER_B_EMAIL!, password: process.env.AUTH_SMOKE_USER_B_PASSWORD! },
  };
}

const configuredSmoke = smokeConfig();
test.skip(configuredSmoke.missing.length > 0, `configure ${configuredSmoke.missing.join(', ')} to run the ngrok smoke test`);

test('login, logout and account switching work from a public ngrok origin', async ({ page }) => {
  const config = configuredSmoke;
  if (config.missing.length > 0) {
    test.skip(true, `configure ${config.missing.join(', ')} to run the ngrok smoke test`);
    return;
  }

  await page.goto(config.frontendUrl);

  const result = await page.evaluate(async ({ apiUrl, userA, userB }) => {
    const request = async (path: string, init?: RequestInit) => {
      const response = await fetch(`${apiUrl}${path}`, { ...init, credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      return { status: response.status, body };
    };

    const login = async (user: { email: string; password: string }) => {
      const response = await request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });
      const token = response.body?.data?.accessToken;
      if (typeof token !== 'string') throw new Error(`login did not return accessToken (status ${response.status})`);
      return { response, token };
    };

    const first = await login(userA);
    const sessionA = await request('/api/v1/session', { headers: { Authorization: `Bearer ${first.token}` } });
    const logout = await request('/api/v1/auth/logout', { method: 'POST' });
    const anonymous = await request('/api/v1/session');
    const second = await login(userB);
    const sessionB = await request('/api/v1/session', { headers: { Authorization: `Bearer ${second.token}` } });

    return {
      loginA: first.response.status,
      sessionA: { status: sessionA.status, userId: sessionA.body?.data?.userId },
      logout: logout.status,
      anonymous: anonymous.status,
      loginB: second.response.status,
      sessionB: { status: sessionB.status, userId: sessionB.body?.data?.userId },
      tokensDiffer: first.token !== second.token,
    };
  }, {
    apiUrl: config.apiUrl,
    userA: config.userA,
    userB: config.userB,
  });

  expect(result.loginA).toBe(200);
  expect(result.sessionA.status).toBe(200);
  expect(result.logout).toBe(204);
  expect(result.anonymous).toBe(401);
  expect(result.loginB).toBe(200);
  expect(result.sessionB.status).toBe(200);
  expect(result.sessionA.userId).not.toBe(result.sessionB.userId);
  expect(result.tokensDiffer).toBe(true);
});
