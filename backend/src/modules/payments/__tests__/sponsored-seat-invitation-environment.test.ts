import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SponsoredSeatInvitationError } from '../application/commands/sponsored-seat-invitation.use-case.js';
import { PrismaSponsoredSeatInvitationRepository } from '../infrastructure/persistence/sponsored-seat-invitation.repository.js';

test('issue and resolve scope invitations to the configured environment', async () => {
  let issueWhere: any;
  let resolveWhere: any;
  const database = {
    sponsoredSeat: { findFirst: async ({ where }: any) => { issueWhere = where; return null; } },
    sponsoredSeatBatch: { findFirst: async () => ({ id: 'owned-batch' }) },
    sponsoredSeatInvitation: { findFirst: async ({ where }: any) => { resolveWhere = where; return null; } },
  };
  const repository = new PrismaSponsoredSeatInvitationRepository(undefined, database as never, 'PRODUCTION');

  await assert.rejects(() => repository.issue({ teacherUserId: 'teacher', batchId: 'batch', seatId: 'seat', tokenHash: 'hash', expiresAt: new Date(Date.now() + 60_000), now: new Date() }), (error: unknown) => error instanceof SponsoredSeatInvitationError && error.code === 'SEAT_NOT_ELIGIBLE');
  assert.equal(issueWhere.batch.environment, 'PRODUCTION');
  assert.equal(await repository.resolve('hash', new Date()), null);
  assert.equal(resolveWhere.seat.batch.environment, 'PRODUCTION');
});

test('redeem scopes the token query to the configured environment before consuming it', async () => {
  let redeemWhere: any;
  const transaction = {
    sponsoredSeatInvitation: { findFirst: async ({ where }: any) => { redeemWhere = where; return null; } },
  };
  const database = { $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction) };
  const repository = new PrismaSponsoredSeatInvitationRepository(undefined, database as never, 'SANDBOX');
  await assert.rejects(() => repository.redeem({ tokenHash: 'hash', studentUserId: 'student', email: 'student@example.test', now: new Date() }), (error: unknown) => error instanceof SponsoredSeatInvitationError && error.code === 'INVALID_INVITATION');
  assert.equal(redeemWhere.seat.batch.environment, 'SANDBOX');
});

test('rejects missing or unsupported configured environment', () => {
  assert.throws(() => new PrismaSponsoredSeatInvitationRepository(undefined, {} as never, ''), /environment is required/);
  assert.throws(() => new PrismaSponsoredSeatInvitationRepository(undefined, {} as never, 'STAGING'), /environment is required/);
});
