import assert from 'node:assert/strict';
import test from 'node:test';

function setBackendEnv() {
  process.env.NODE_ENV = 'test';
  process.env.HOST = '127.0.0.1';
  process.env.PORT = '3000';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.DATABASE_URL = 'https://database.example.com';
  process.env.REDIS_URL = 'https://redis.example.com';
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  process.env.OPENROUTER_EMBEDDING_MODEL = 'openrouter/test-embedding';
  process.env.OPENROUTER_QUESTION_MODEL = 'openrouter/test-chat';
}

test('createStructuredChatCompletion rejeita resposta que falha na validacao local do schema', { concurrency: false }, async () => {
  setBackendEnv();
  const { OpenRouterClient, StructuredCompletionError } = await import('../openrouter.client.js');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ ok: false }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const client = new OpenRouterClient();

  await assert.rejects(
    client.createStructuredChatCompletion({
      schemaName: 'test_schema',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { ok: { type: 'boolean', const: true } },
        required: ['ok'],
      },
      messages: [{ role: 'user', content: 'retorne {"ok": true}' }],
      validate: (value: unknown) => {
        const parsed = value as { ok?: boolean };
        if (parsed.ok !== true) {
          const error = new Error('schema mismatch');
          Object.assign(error, { issues: [{ message: 'schema mismatch' }] });
          throw error;
        }
        return parsed;
      },
    } as never),
    (error: unknown) => (
      error instanceof StructuredCompletionError
      && error.code === 'INVALID_SCHEMA'
    ),
  );

  globalThis.fetch = originalFetch;
});

test('createStructuredChatCompletion rejeita resposta vazia ou somente com espacos', { concurrency: false }, async () => {
  setBackendEnv();
  const { OpenRouterClient, StructuredCompletionError } = await import('../openrouter.client.js');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { content: '   ' } }],
  }), { status: 200 });
  await assert.rejects(
    new OpenRouterClient().createStructuredChatCompletion({
      schemaName: 'test_schema', schema: {}, messages: [{ role: 'user', content: 'retorne JSON' }],
    }),
    (error: unknown) => error instanceof StructuredCompletionError && error.code === 'EMPTY_RESPONSE',
  );
  globalThis.fetch = originalFetch;
});

test('createStructuredChatCompletion rejeita resposta truncada', { concurrency: false }, async () => {
  setBackendEnv();
  const { OpenRouterClient, StructuredCompletionError } = await import('../openrouter.client.js');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ finish_reason: 'length', message: { content: '{"ok":' } }],
  }), { status: 200 });
  await assert.rejects(
    new OpenRouterClient().createStructuredChatCompletion({
      schemaName: 'test_schema', schema: {}, messages: [{ role: 'user', content: 'retorne JSON' }],
    }),
    (error: unknown) => error instanceof StructuredCompletionError && error.code === 'MODEL_OUTPUT_TRUNCATED',
  );
  globalThis.fetch = originalFetch;
});

test('reporta reasoning_tokens apenas como contagem e respeita reasoning/timeout/orçamento da extração', { concurrency: false }, async () => {
  setBackendEnv();
  const { OpenRouterClient, StructuredCompletionError } = await import('../openrouter.client.js');
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  let requestBody: Record<string, unknown> | undefined;
  const logs: string[] = [];
  let observedUsage: { reasoningTokens?: number; completionTokens: number } | undefined;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      choices: [{ finish_reason: 'length', native_finish_reason: 'length', message: { content: '', reasoning: 'texto privado de raciocínio que nunca deve ir ao log' } }],
      usage: { prompt_tokens: 3000, completion_tokens: 4000, total_tokens: 7000, completion_tokens_details: { reasoning_tokens: 3900 } },
    }), { status: 200 });
  };
  console.log = (...args: unknown[]) => { logs.push(args.map((value) => typeof value === 'object' ? JSON.stringify(value) : String(value)).join(' ')); };
  try {
    await assert.rejects(new OpenRouterClient().createStructuredChatCompletion({
      schemaName: 'questions', schema: {}, messages: [{ role: 'user', content: 'documento completo' }],
      maxTokens: 4000, timeoutMs: 180_000, reasoningEffort: 'none',
      onUsage(usage) { observedUsage = usage; },
    }), (error: unknown) => error instanceof StructuredCompletionError
      && error.code === 'MODEL_OUTPUT_TRUNCATED'
      && error.details.reasoningTokens === 3900
      && error.details.completionTokens === 4000);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
  assert.deepEqual(requestBody?.max_tokens, 4000, 'o cliente encaminha exatamente o orçamento configurado');
  assert.deepEqual(requestBody?.reasoning, { effort: 'none' });
  assert.equal(observedUsage?.reasoningTokens, 3900);
  assert.ok(logs.some((line) => line.includes('"reasoningTokens":3900')));
  assert.ok(!logs.some((line) => line.includes('texto privado de raciocínio')));
});

test('omits max_tokens only when explicitly requested by a structured call', { concurrency: false }, async () => {
  setBackendEnv();
  const { OpenRouterClient } = await import('../openrouter.client.js');
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] }), { status: 200 });
  };
  try {
    await new OpenRouterClient().createStructuredChatCompletion({
      schemaName: 'no_output_cap', schema: {}, messages: [{ role: 'user', content: 'responda' }], maxTokens: null,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(Object.hasOwn(requestBody ?? {}, 'max_tokens'), false);
});

test('aborta chamada estruturada após timeout configurado', { concurrency: false }, async () => {
  setBackendEnv();
  const { OpenRouterClient, StructuredCompletionError } = await import('../openrouter.client.js');
  const originalFetch = globalThis.fetch;
  let aborted = false;
  globalThis.fetch = async (_url, init) => await new Promise((_resolve, reject) => {
    (init?.signal as AbortSignal).addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
  });
  await assert.rejects(new OpenRouterClient().createStructuredChatCompletion({ schemaName: 'x', schema: {}, messages: [{ role: 'user', content: 'x' }], timeoutMs: 5 }), (error: unknown) => error instanceof StructuredCompletionError && error.code === 'TIMEOUT');
  assert.equal(aborted, true);
  globalThis.fetch = originalFetch;
});

test('permite chamada estruturada sem timeout local quando solicitado explicitamente', { concurrency: false }, async () => {
  setBackendEnv();
  process.env.OPENROUTER_STRUCTURED_TIMEOUT_MS = '5';
  const { OpenRouterClient } = await import('../openrouter.client.js');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] }), { status: 200 });
  };
  try {
    const result = await new OpenRouterClient().createStructuredChatCompletion({
      schemaName: 'no_local_timeout', schema: {}, messages: [{ role: 'user', content: 'x' }], timeoutMs: null,
    });
    assert.deepEqual(result, { ok: true });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OPENROUTER_STRUCTURED_TIMEOUT_MS;
  }
});

test('respeita signal previamente abortado', { concurrency: false }, async () => {
  setBackendEnv();
  const { OpenRouterClient, StructuredCompletionError } = await import('../openrouter.client.js');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(new OpenRouterClient().createStructuredChatCompletion({
    schemaName: 'x', schema: {}, messages: [{ role: 'user', content: 'x' }], signal: controller.signal,
  }), (error: unknown) => error instanceof StructuredCompletionError && error.code === 'TIMEOUT');
});

test('timeout continua ativo durante o consumo do body', { concurrency: false }, async () => {
  setBackendEnv();
  const { OpenRouterClient, StructuredCompletionError } = await import('../openrouter.client.js');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true, status: 200, headers: new Headers(),
    json: () => new Promise((_resolve) => undefined),
  } as Response);
  await assert.rejects(new OpenRouterClient().createStructuredChatCompletion({
    schemaName: 'x', schema: {}, messages: [{ role: 'user', content: 'x' }], timeoutMs: 5,
  }), (error: unknown) => error instanceof StructuredCompletionError && error.code === 'TIMEOUT');
  globalThis.fetch = originalFetch;
});

test('createChatCompletion envia completion textual com configuração do chat', { concurrency: false }, async () => {
  setBackendEnv();
  const { OpenRouterClient } = await import('../openrouter.client.js');
  const originalFetch = globalThis.fetch;
  let receivedUrl = '';
  let receivedBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (url, init) => {
    receivedUrl = String(url);
    receivedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: 'Resposta pedagógica.' } }],
      usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await new OpenRouterClient().createChatCompletion({
    model: 'openrouter/chat-test',
    maxTokens: 321,
    temperature: 0.4,
    timeoutMs: 1_000,
    messages: [{ role: 'system', content: 'Você é um tutor.' }, { role: 'user', content: 'Explique.' }],
  });

  assert.equal(result.content, 'Resposta pedagógica.');
  assert.equal(receivedUrl, 'https://openrouter.ai/api/v1/chat/completions');
  assert.deepEqual(receivedBody?.model, 'openrouter/chat-test');
  assert.deepEqual(receivedBody?.max_tokens, 321);
  assert.deepEqual(receivedBody?.temperature, 0.4);
  assert.deepEqual(receivedBody?.messages, [
    { role: 'system', content: 'Você é um tutor.' },
    { role: 'user', content: 'Explique.' },
  ]);

  globalThis.fetch = originalFetch;
});

test('createChatCompletion encaminha imagem como parte multimodal sem modificar o payload', { concurrency: false }, async () => {
  setBackendEnv();
  const { OpenRouterClient } = await import('../openrouter.client.js');
  const originalFetch = globalThis.fetch;
  let receivedBody: Record<string, any> | undefined;
  globalThis.fetch = async (_url, init) => {
    receivedBody = JSON.parse(String(init?.body)) as Record<string, any>;
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'Entendi a figura.' } }] }), { status: 200 });
  };
  const messages = [{ role: 'user' as const, content: [
    { type: 'text' as const, text: 'Leia o gráfico.' },
    { type: 'image_url' as const, image_url: { url: 'data:image/png;base64,cG5n' } },
  ] }];
  await new OpenRouterClient().createChatCompletion({ model: 'google/gemini-2.5-flash', messages });
  assert.deepEqual(receivedBody?.messages, messages);
  globalThis.fetch = originalFetch;
});
