import assert from 'node:assert/strict';
import test from 'node:test';
import { AsaasApiError, AsaasHttpClient } from '../infrastructure/providers/asaas/asaas-http.client.js';

test('cliente Asaas envia access_token, user-agent e corpo JSON', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new AsaasHttpClient({
    apiKey: 'sandbox-secret',
    baseUrl: 'https://api-sandbox.asaas.com/v3',
    timeoutMs: 1000,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init: init as RequestInit });
      return new Response(JSON.stringify({ id: 'co_123' }), { status: 200 });
    },
  });

  const result = await client.request<{ id: string }>('/checkouts', {
    method: 'POST',
    body: { name: 'Monitor' },
  });

  assert.deepEqual(result, { id: 'co_123' });
  assert.equal(calls[0]?.url, 'https://api-sandbox.asaas.com/v3/checkouts');
  assert.equal(new Headers(calls[0]?.init.headers).get('access_token'), 'sandbox-secret');
  assert.equal(new Headers(calls[0]?.init.headers).get('user-agent'), 'MeuMonitorAI');
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { name: 'Monitor' });
});

test('cliente Asaas sanitiza corpo e mensagem de erro do provedor', async () => {
  const client = new AsaasHttpClient({
    apiKey: 'secret',
    baseUrl: 'https://api-sandbox.asaas.com/v3',
    timeoutMs: 1000,
    fetchImpl: async () => new Response(JSON.stringify({ errors: [{ description: 'CPF interno' }] }), { status: 401 }),
  });

  await assert.rejects(
    client.request('/customers', { method: 'GET' }),
    (error: unknown) => error instanceof AsaasApiError && error.status === 401 && !error.message.includes('CPF interno') && JSON.stringify(error).includes('CPF interno') === false,
  );
});

test('cliente Asaas preserva descrições sanitizadas para diagnóstico sem dados pessoais', async () => {
  const client = new AsaasHttpClient({
    apiKey: 'secret',
    baseUrl: 'https://api-sandbox.asaas.com/v3',
    timeoutMs: 1000,
    fetchImpl: async () => new Response(JSON.stringify({ errors: [
      { code: 'invalid_object', description: 'O CEP informado 24912710 não foi localizado para ana@example.com.' },
    ] }), { status: 400 }),
  });

  await assert.rejects(
    client.request('/accounts', { method: 'POST', body: { postalCode: '24912-710' } }),
    (error: unknown) => error instanceof AsaasApiError
      && error.responseBody?.code === 'invalid_object'
      && error.responseBody.descriptions?.[0] === 'O CEP informado [number] não foi localizado para [email].',
  );
});

test('cliente preserva status HTTP quando erros do provedor contêm entradas inválidas', async () => {
  const client = new AsaasHttpClient({
    apiKey: 'secret',
    baseUrl: 'https://api-sandbox.asaas.com/v3',
    timeoutMs: 1000,
    fetchImpl: async () => new Response(JSON.stringify({ errors: [null, 'invalid', 42] }), { status: 400 }),
  });

  await assert.rejects(
    client.request('/checkouts', { method: 'POST' }),
    (error: unknown) => error instanceof AsaasApiError && error.status === 400,
  );
});

test('cliente registra descrições de validação sanitizadas e limitadas sem dados sensíveis', async () => {
  const warnings: Array<{ message: string; context?: Record<string, unknown> }> = [];
  const originalWarn = console.warn;
  console.warn = (message?: unknown, context?: unknown) => {
    warnings.push({
      message: String(message),
      context: context && typeof context === 'object' ? context as Record<string, unknown> : undefined,
    });
  };

  try {
    const client = new AsaasHttpClient({
      apiKey: 'api-key-super-secreta',
      baseUrl: 'https://api-sandbox.asaas.com/v3',
      timeoutMs: 1000,
      fetchImpl: async () => new Response(JSON.stringify({
        errors: [
          { code: 'invalid_object', description: 'Campo email ana.silva@example.com inválido para CPF 123.456.789-01.' },
          { description: 'Cartão 4111 1111 1111 1111 recusado; token tok_live_secret_value.' },
          { description: 'API key=asaas_private_key não autorizada.' },
          { description: 'Falha no campo customer.' },
          { description: `Falha no campo billingType. ${'x'.repeat(300)}` },
          { description: 'Esta sexta mensagem não deve aparecer.' },
        ],
      }), { status: 400 }),
    });

    await assert.rejects(client.request('/checkouts', { method: 'POST', body: { creditCard: { number: '4111111111111111' } } }), AsaasApiError);
  } finally {
    console.warn = originalWarn;
  }

  const failureLog = warnings.find(({ context }) => context?.event === 'payments.asaas_http_failed');
  assert.ok(failureLog, 'deve registrar o erro HTTP do Asaas');
  const context = failureLog.context;
  assert.deepEqual((context?.providerErrorDescriptions as string[]).slice(0, 4), [
    'Campo email [email] inválido para [sensitive-field] [number].',
    '[sensitive-field] [number] recusado; [sensitive-field] [redacted]',
    '[sensitive-field]=[redacted] não autorizada.',
    'Falha no campo customer.',
  ]);
  assert.equal((context?.providerErrorDescriptions as string[])[4]?.length, 240, 'cada descrição deve ser limitada a 240 caracteres');
  assert.equal((context?.providerErrorDescriptions as string[])[4]?.startsWith('Falha no campo billingType.'), true);
  assert.equal((context?.providerErrorDescriptions as string[]).length, 5, 'o log deve conter no máximo cinco descrições');
  const serialized = JSON.stringify(context);
  for (const sensitive of ['ana.silva@example.com', '123.456.789-01', '4111 1111 1111 1111', 'tok_live_secret_value', 'asaas_private_key', 'api-key-super-secreta']) {
    assert.equal(serialized.includes(sensitive), false, `o log não deve conter ${sensitive}`);
  }
});

test('cliente Asaas converte timeout em erro estável', async () => {
  const client = new AsaasHttpClient({
    apiKey: 'secret',
    baseUrl: 'https://api-sandbox.asaas.com/v3',
    timeoutMs: 1,
    fetchImpl: async (_url, init) => {
      await new Promise<void>((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
      throw new Error('unreachable');
    },
  });

  await assert.rejects(client.request('/payments', { method: 'GET' }), /Asaas request timed out/);
});

test('cliente impede credencial de ambiente diferente da URL configurada', async () => {
  const client = new AsaasHttpClient({ apiKey: 'production-secret', baseUrl: 'https://api.asaas.com/v3', environment: 'production', timeoutMs: 1000 });
  await assert.rejects(client.request('/finance/balance', { method: 'GET', credential: 'sandbox-secret', environment: 'sandbox' }), /environment mismatch/);
});
