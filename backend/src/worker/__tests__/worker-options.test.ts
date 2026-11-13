import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_WORKER_STALLED_INTERVAL_MS, PAYMENT_WORKER_STALLED_INTERVAL_MS, WORKER_DRAIN_DELAY_SECONDS, createQueueWorkerOptions } from '../worker-options.js';

test('mantém workers ociosos por um minuto antes de consultar novamente', () => {
  const options = createQueueWorkerOptions('redis-connection', 2, 'documents');

  assert.equal(WORKER_DRAIN_DELAY_SECONDS, 300);
  assert.equal(options.drainDelay, 300);
  assert.equal(options.concurrency, 2);
});

test('usa dez minutos para filas comuns e mantém pagamentos em cinco minutos', () => {
  assert.equal(DEFAULT_WORKER_STALLED_INTERVAL_MS, 600_000);
  assert.equal(PAYMENT_WORKER_STALLED_INTERVAL_MS, 300_000);
  assert.equal(createQueueWorkerOptions('redis-connection', 1, 'documents').stalledInterval, 600_000);
  assert.equal(createQueueWorkerOptions('redis-connection', 1, 'paymentWebhook').stalledInterval, 300_000);
});
