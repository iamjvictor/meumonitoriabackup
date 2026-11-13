import assert from 'node:assert/strict';
import test from 'node:test';
import { buildActiveSponsoredEntitlementWhere, buildPaymentEntitlementSubscriptionWhere } from '../payment-entitlement.repository.js';

test('entitlement snapshot reads only valid active SponsoredSeats from the running ASAAS environment', () => {
  const now = new Date('2026-11-02T12:00:00.000Z');
  const where = buildActiveSponsoredEntitlementWhere('student-1', now, 'PRODUCTION');

  assert.equal(where.status, 'ACTIVE');
  assert.equal(where.accessRevokedAt, null);
  assert.deepEqual(where.batch, { environment: 'PRODUCTION' });
  assert.deepEqual(where.startsAt, { lte: now });
  assert.deepEqual(where.endsAt, { gt: now });
  assert.equal('OR' in where, false);
});

test('payment entitlements only read subscription rows from the running environment', () => {
  assert.deepEqual(buildPaymentEntitlementSubscriptionWhere('student-1', 'SANDBOX'), { studentId: 'student-1', environment: 'SANDBOX' });
  assert.deepEqual(buildPaymentEntitlementSubscriptionWhere('student-1', 'PRODUCTION'), { studentId: 'student-1', environment: 'PRODUCTION' });
});

test('SponsoredSeat entitlement excludes missing or out-of-window dates, wrong environment and revoked state', () => {
  const now = new Date('2026-11-02T12:00:00.000Z');
  const where = buildActiveSponsoredEntitlementWhere('student-1', now, 'PRODUCTION');
  const allowed = (seat: { status?: string; accessRevokedAt?: Date | null; environment: string; startsAt: Date | null; endsAt: Date | null }) =>
    seat.status === where.status && seat.accessRevokedAt === where.accessRevokedAt && seat.environment === where.batch.environment &&
    Boolean(seat.startsAt && seat.startsAt <= where.startsAt.lte && seat.endsAt && seat.endsAt > where.endsAt.gt);
  const inWindow = { status: 'ACTIVE', accessRevokedAt: null, environment: 'PRODUCTION', startsAt: new Date(now.getTime() - 1), endsAt: new Date(now.getTime() + 1) };

  assert.equal(allowed(inWindow), true);
  assert.equal(allowed({ ...inWindow, startsAt: null }), false);
  assert.equal(allowed({ ...inWindow, endsAt: null }), false);
  assert.equal(allowed({ ...inWindow, startsAt: new Date(now.getTime() + 1) }), false);
  assert.equal(allowed({ ...inWindow, endsAt: now }), false);
  assert.equal(allowed({ ...inWindow, environment: 'SANDBOX' }), false);
  assert.equal(allowed({ ...inWindow, accessRevokedAt: now }), false);
  assert.equal(allowed({ ...inWindow, status: 'CANCELLED' }), false);
});
