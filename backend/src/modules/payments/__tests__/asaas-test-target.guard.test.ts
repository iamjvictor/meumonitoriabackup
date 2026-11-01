import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNgrokSandboxWebhookTarget, assertSafeAsaasWebhookTestTarget, assertSandboxTestDatabase } from '../infrastructure/providers/asaas/asaas-test-target.guard.js';

test('script sintético falha fechado sem Sandbox e allowlist de homologação', () => {
  assert.throws(() => assertSafeAsaasWebhookTestTarget('PRODUCTION', 'https://staging.example.test/webhook', ['staging.example.test']), /SANDBOX/);
  assert.throws(() => assertSafeAsaasWebhookTestTarget('SANDBOX', 'https://api.example.com/webhook', ['staging.example.test']), /allowlist/);
  assert.throws(() => assertSafeAsaasWebhookTestTarget('SANDBOX', 'https://meumonitor-api-worker-production.up.railway.app/webhook', ['meumonitor-api-worker-production.up.railway.app']), /production/);
  assert.throws(() => assertSafeAsaasWebhookTestTarget('SANDBOX', 'http://staging.example.test/webhook', ['staging.example.test']), /HTTPS/);
  assert.doesNotThrow(() => assertSafeAsaasWebhookTestTarget('SANDBOX', 'https://staging.example.test/webhook', ['staging.example.test']));
});

test('sandbox checkout rejeita banco remoto e aceita banco local isolado', () => {
  assert.throws(() => assertSandboxTestDatabase('postgresql://user:pass@db.example.com:5432/postgres'), /local test database/i);
  assert.throws(() => assertSandboxTestDatabase('postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres'), /local test database/i);
  assert.doesNotThrow(() => assertSandboxTestDatabase('postgresql://test:test@127.0.0.1:32775/asaas_sandbox_test'));
});

test('webhook temporário aceita apenas ngrok HTTPS no Sandbox', () => {
  assert.doesNotThrow(() => assertNgrokSandboxWebhookTarget('sandbox', 'https://abc.ngrok-free.app/api/v1/payments/webhooks/asaas'));
  assert.throws(() => assertNgrokSandboxWebhookTarget('production', 'https://abc.ngrok-free.app/webhook'), /SANDBOX/);
  assert.throws(() => assertNgrokSandboxWebhookTarget('sandbox', 'https://api.example.com/webhook'), /ngrok/);
  assert.throws(() => assertNgrokSandboxWebhookTarget('sandbox', 'http://abc.ngrok-free.app/webhook'), /HTTPS/);
});
