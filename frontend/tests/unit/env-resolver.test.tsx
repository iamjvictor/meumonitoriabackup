import { afterEach, describe, expect, it } from 'vitest';
import { getApiUrl, getAppUrl } from '@/shared/utils/env';

describe('env resolver helpers', () => {
  const originalApi = process.env.NEXT_PUBLIC_API_URL;
  const originalApp = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = originalApi;
    process.env.NEXT_PUBLIC_APP_URL = originalApp;
  });

  it('retorna fallback padrão para API quando variável ausente', () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(getApiUrl()).toBe('http://localhost:8443');
  });

  it('retorna NEXT_PUBLIC_API_URL configurada', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.meumonitor.ai';
    expect(getApiUrl()).toBe('https://api.meumonitor.ai');
  });

  it('retorna fallback padrão para APP quando variável ausente', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(getAppUrl()).toBe('http://localhost:3000');
  });

  it('retorna NEXT_PUBLIC_APP_URL configurada', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://meumonitor.ai';
    expect(getAppUrl()).toBe('https://meumonitor.ai');
  });
});
