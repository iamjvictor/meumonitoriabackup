import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { prisma } from '../../../lib/prisma.js';
import { EmailOutboxCipher } from '../outbox-crypto.js';
import { EmailOutboxRepository } from '../outbox.repository.js';

const databaseUrl = process.env.PAYMENTS_TEST_DATABASE_URL;
const canRun = Boolean(databaseUrl && process.env.DATABASE_URL === databaseUrl && databaseUrl.includes('mm_asaas_flow_test'));
after(async () => { if (canRun) await prisma.$disconnect(); });

test('sandbox and production accept the same idempotency key and list only their own messages', { skip: !canRun }, async () => {
  const idempotencyKey = `cross-environment-${randomUUID()}`;
  const cipher = new EmailOutboxCipher(randomBytes(32).toString('base64'));
  const sandbox = new EmailOutboxRepository(cipher, prisma, 'SANDBOX');
  const production = new EmailOutboxRepository(cipher, prisma, 'PRODUCTION');
  const input = { idempotencyKey, purpose: 'ENVIRONMENT_ISOLATION_TEST', recipient: 'test@example.test', payload: { from: 'noreply@example.test', to: 'test@example.test', subject: 'Test', html: '<p>Test</p>' } };
  try {
    const [sandboxInsert, productionInsert] = await Promise.all([sandbox.enqueueTransaction(input), production.enqueueTransaction(input)]);
    assert.equal(sandboxInsert.duplicate, false);
    assert.equal(productionInsert.duplicate, false);
    const rows = await prisma.emailOutboxMessage.findMany({ where: { idempotencyKey }, select: { id: true, environment: true } });
    assert.deepEqual(rows.map((row) => row.environment).sort(), ['PRODUCTION', 'SANDBOX']);
    assert.ok((await sandbox.listPending(100)).some(({ id }) => id === sandboxInsert.id));
    assert.ok(!(await sandbox.listPending(100)).some(({ id }) => id === productionInsert.id));
    assert.ok((await production.listPending(100)).some(({ id }) => id === productionInsert.id));
    assert.ok(!(await production.listPending(100)).some(({ id }) => id === sandboxInsert.id));
  } finally {
    await prisma.emailOutboxMessage.deleteMany({ where: { idempotencyKey } });
  }
});
