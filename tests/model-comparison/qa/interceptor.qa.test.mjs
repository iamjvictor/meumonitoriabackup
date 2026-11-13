import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installOpenRouterInterceptor } from '../runner/openrouter-interceptor.mjs';

test('paid inference stays blocked by default and does not call the network', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'model-qa-'));
  const previous = process.env.MODEL_COMPARISON_ALLOW_PAID;
  delete process.env.MODEL_COMPARISON_ALLOW_PAID;
  const restore = installOpenRouterInterceptor({
    testName: 'e2e_economica_qwen30b_deepseek', runId: 'qa-isolated-run', outputDir,
  });
  try {
    await assert.rejects(
      fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', body: JSON.stringify({ model: 'invalid', response_format: { json_schema: { name: 'question_alternatives' } }, messages: [] }),
      }),
      /Chamada paga bloqueada/,
    );
    const lines = (await readFile(path.join(outputDir, 'calls.jsonl'), 'utf8')).trim().split('\n');
    assert.equal(lines.length, 1);
    const event = JSON.parse(lines[0]);
    assert.equal(event.outcome, 'BLOCKED_DRY_RUN');
    assert.equal(event.runId, 'qa-isolated-run');
    assert.equal(event.latencyMs, 'NAO_VERIFICADO');
    assert.ok(!JSON.stringify(event).match(/sk-[A-Za-z0-9_-]{12,}|Bearer\s+\S+/i));
  } finally {
    restore();
    if (previous === undefined) delete process.env.MODEL_COMPARISON_ALLOW_PAID;
    else process.env.MODEL_COMPARISON_ALLOW_PAID = previous;
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('interceptor blocks hosts, paths and methods outside the exact offline allowlist', async () => {
  let outboundAttempts = 0;
  const restore = installOpenRouterInterceptor({
    testName: 'e2e_economica_qwen30b_deepseek', runId: 'qa-isolated-run', outputDir: os.tmpdir(),
    transport: async () => { outboundAttempts += 1; return Response.json({}); },
    metadataTransport: async () => { outboundAttempts += 1; return Response.json({}); },
    localSupabaseTransport: async () => { outboundAttempts += 1; return Response.json({}); },
  });
  try {
    await assert.rejects(fetch('https://evil.example/api/v1/chat/completions', { method: 'POST', body: '{}' }), /Fetch bloqueado/u);
    await assert.rejects(fetch('https://openrouter.ai/api/v1/chat/completions.extra', { method: 'POST', body: '{}' }), /Fetch bloqueado/u);
    await assert.rejects(fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'GET' }), /Fetch bloqueado/u);
    await assert.rejects(fetch(new Request('https://openrouter.ai/api/v1/models', { method: 'POST' })), /Fetch bloqueado/u);
    assert.equal(outboundAttempts, 0);
  } finally { restore(); }
});
