import assert from 'node:assert/strict';
import test from 'node:test';
import { getWebhookRetryState, isRecoverableWebhookState } from '../infrastructure/persistence/prisma-webhook.repository.js';

test('retoma webhook aguardando correlação depois que o prazo vencer', () => {
  assert.equal(isRecoverableWebhookState('WAITING_CORRELATION', { nextAttemptAt: new Date('2026-10-25T10:00:00Z') }, new Date('2026-10-25T10:00:01Z')), true);
  assert.equal(isRecoverableWebhookState('WAITING_CORRELATION', { nextAttemptAt: new Date('2026-10-25T10:01:00Z') }, new Date('2026-10-25T10:00:00Z')), false);
});

test('retoma processamento apenas após o lease expirar', () => {
  assert.equal(isRecoverableWebhookState('PROCESSING', { leaseUntil: new Date('2026-10-25T10:00:00Z') }, new Date('2026-10-25T10:00:01Z')), true);
  assert.equal(isRecoverableWebhookState('PROCESSING', { leaseUntil: new Date('2026-10-25T10:01:00Z') }, new Date('2026-10-25T10:00:00Z')), false);
});

test('agenda webhooks recebidos e falhos para recuperação', () => {
  assert.equal(isRecoverableWebhookState('RECEIVED'), true);
  assert.equal(isRecoverableWebhookState('FAILED', { nextAttemptAt: new Date('2026-10-25T10:00:00Z') }, new Date('2026-10-25T10:00:01Z')), true);
});

test('encerra em estado terminal as tentativas que atingiram o limite', () => {
  assert.equal(getWebhookRetryState(9), 'WAITING_CORRELATION');
  assert.equal(getWebhookRetryState(10), 'DEAD_LETTER');
  assert.equal(getWebhookRetryState(11), 'DEAD_LETTER');
});
