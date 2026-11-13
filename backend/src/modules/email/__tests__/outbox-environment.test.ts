import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EmailOutboxCipher } from '../outbox-crypto.js';
import { EmailOutboxRepository } from '../outbox.repository.js';
import { PrismaEmailOutboxStore } from '../outbox.processor.js';

test('outbox write takes trusted configured environment and listPending is scoped to it', async () => {
  const writes: Array<Record<string, unknown>> = [];
  let capturedWhere: Record<string, unknown> | undefined;
  const tx = {
    emailOutboxMessage: {
      findUnique: async () => null,
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { writes.push(...data); return { count: data.length }; },
      findUniqueAfterWrite: async () => ({ id: 'message-1' }),
    },
  };
  tx.emailOutboxMessage.findUnique = async () => writes.length ? { id: 'message-1' } as never : null;
  const database = {
    emailOutboxMessage: { findMany: async ({ where }: { where: Record<string, unknown> }) => { capturedWhere = where; return []; } },
  };
  const repository = new EmailOutboxRepository(new EmailOutboxCipher(Buffer.alloc(32, 7).toString('base64')), database as never, 'SANDBOX');
  await repository.enqueue(tx as never, { idempotencyKey: 'key', purpose: 'TEST', recipient: 'student@example.test', payload: { from: 'noreply@example.test', to: 'student@example.test', subject: 'Test', html: '<p>Test</p>' } });
  assert.equal(writes[0]?.environment, 'SANDBOX');
  await repository.listPending();
  assert.equal(capturedWhere?.environment, 'SANDBOX');
});

test('outbox rejects unsupported environments instead of creating unscoped messages', () => {
  assert.throws(() => new EmailOutboxRepository(new EmailOutboxCipher(Buffer.alloc(32, 8).toString('base64')), {} as never, 'STAGING' as never), /environment must be SANDBOX or PRODUCTION/);
});

test('same idempotency key can create one independent outbox intent in each environment', async () => {
  const rows = new Map<string, Record<string, unknown>>();
  const tx = {
    emailOutboxMessage: {
      findUnique: async ({ where }: { where: { environment_idempotencyKey: { environment: string; idempotencyKey: string } } }) => rows.get(`${where.environment_idempotencyKey.environment}:${where.environment_idempotencyKey.idempotencyKey}`) ?? null,
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        let count = 0;
        for (const row of data) {
          const key = `${row.environment}:${row.idempotencyKey}`;
          if (!rows.has(key)) { rows.set(key, row); count += 1; }
        }
        return { count };
      },
    },
  };
  const cipher = new EmailOutboxCipher(Buffer.alloc(32, 19).toString('base64'));
  const sandbox = new EmailOutboxRepository(cipher, {} as never, 'SANDBOX');
  const production = new EmailOutboxRepository(cipher, {} as never, 'PRODUCTION');
  const input = { idempotencyKey: 'business-key', purpose: 'TEST', recipient: 'student@example.test', payload: { from: 'noreply@example.test', to: 'student@example.test', subject: 'Test', html: '<p>Test</p>' } };
  assert.equal((await sandbox.enqueue(tx as never, input)).duplicate, false);
  assert.equal((await production.enqueue(tx as never, input)).duplicate, false);
  assert.equal(rows.size, 2);
  assert.equal(rows.get('SANDBOX:business-key')?.environment, 'SANDBOX');
  assert.equal(rows.get('PRODUCTION:business-key')?.environment, 'PRODUCTION');
});

test('claim and subsequent worker status writes stay in the configured environment', async () => {
  const updateFilters: Array<Record<string, unknown>> = [];
  const findFilters: Array<Record<string, unknown>> = [];
  const database = {
    emailOutboxMessage: {
      updateMany: async ({ where }: { where: Record<string, unknown> }) => { updateFilters.push(where); return { count: 1 }; },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => { findFilters.push(where); return { id: 'message-1', encryptedPayload: 'cipher', idempotencyKey: 'key', createdAt: new Date(), attempts: 1 }; },
    },
  };
  const store = new PrismaEmailOutboxStore('PRODUCTION', database as never);
  assert.ok(await store.claim('message-1', new Date()));
  await store.markAccepted('message-1', 'resend-id', new Date());
  await store.markFailure('message-1', 'retry', new Date(), false);
  assert.equal(updateFilters.length, 3);
  assert.ok(updateFilters.every((where) => where.environment === 'PRODUCTION'));
  assert.ok(findFilters.every((where) => where.environment === 'PRODUCTION'));
});
