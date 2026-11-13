import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaSponsoredSeatInvitationRepository } from '../infrastructure/persistence/sponsored-seat-invitation.repository.js';

const now = new Date('2026-11-01T12:00:00.000Z');
const expiresAt = new Date('2026-12-01T12:00:00.000Z');

function fixture(failEmail = false) {
  const outbox = new Map<string, { id: string }>();
  let invitation: { tokenHash: string; expiresAt: Date; usedAt: null } | null = null;
  const eligible = {
    id: 'seat-1', emailNormalized: 'student@example.test', startsAt: new Date('2026-10-31T00:00:00Z'), endsAt: new Date('2026-12-01T00:00:00Z'),
    batch: { environment: 'SANDBOX', billingInterval: 'MONTHLY', monitor: { name: 'Matemática' }, teacher: { fullName: 'Professora Ana' } },
  };
  const tx = {
    $queryRaw: async () => [],
    sponsoredSeat: { findFirst: async () => eligible },
    sponsoredSeatBatch: { findFirst: async () => ({ id: 'batch-1' }) },
    emailOutboxMessage: { findUnique: async ({ where }: { where: { environment_idempotencyKey: { idempotencyKey: string } } }) => outbox.get(where.environment_idempotencyKey.idempotencyKey) ?? null },
    sponsoredSeatInvitation: {
      findUnique: async () => invitation ? { expiresAt: invitation.expiresAt } : null,
      upsert: async ({ create, update }: { create: typeof invitation; update: Partial<NonNullable<typeof invitation>> }) => {
        invitation = { ...(invitation ?? create!), ...update };
        return invitation;
      },
    },
    student: { findFirst: async () => null },
  };
  const database = {
    $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
  };
  const emailCalls: string[] = [];
  const emailIntents = {
    enqueueInvitationReissue: async (_transaction: typeof tx, input: { idempotencyKey: string; token: string }) => {
      emailCalls.push(input.token);
      if (failEmail) throw new Error('outbox unavailable');
      if (!outbox.has(input.idempotencyKey)) outbox.set(input.idempotencyKey, { id: `message-${outbox.size + 1}` });
    },
  };
  const repository = new PrismaSponsoredSeatInvitationRepository(emailIntents as never, database as never, 'SANDBOX');
  return { repository, emailCalls, outbox, get invitation() { return invitation; } };
}

test('reenvio grava outbox e novo hash, retry com mesma chave preserva convite e não duplica e-mail', async () => {
  const f = fixture();
  const base = { teacherUserId: 'teacher-1', batchId: 'batch-1', seatId: 'seat-1', expiresAt, now };
  const first = await f.repository.issue({ ...base, token: 'first-secret', tokenHash: 'hash-first', idempotencyKey: 'key-a' });
  assert.equal(first.duplicate, false);
  assert.equal(f.invitation?.tokenHash, 'hash-first');
  assert.deepEqual(f.emailCalls, ['first-secret']);
  assert.equal(f.outbox.size, 1);

  const replay = await f.repository.issue({ ...base, token: 'new-random-token-discarded', tokenHash: 'hash-discarded', idempotencyKey: 'key-a' });
  assert.equal(replay.duplicate, true);
  assert.equal(f.invitation?.tokenHash, 'hash-first');
  assert.equal(f.outbox.size, 1);

  const reissued = await f.repository.issue({ ...base, token: 'second-secret', tokenHash: 'hash-second', idempotencyKey: 'key-b' });
  assert.equal(reissued.duplicate, false);
  assert.equal(f.invitation?.tokenHash, 'hash-second');
  assert.equal(f.outbox.size, 2);
});

test('falha ao enfileirar não invalida o link atual', async () => {
  const f = fixture(true);
  await assert.rejects(() => f.repository.issue({
    teacherUserId: 'teacher-1', batchId: 'batch-1', seatId: 'seat-1', token: 'secret', tokenHash: 'hash', idempotencyKey: 'key', expiresAt, now,
  }), /outbox unavailable/);
  assert.equal(f.invitation, null);
});
