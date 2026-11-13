import assert from 'node:assert/strict';
import test from 'node:test';
import { buildActiveSponsoredSeatWhere } from '../daily-challenge.repository.js';

test('daily challenge sponsored access requires active, unrevoked, in-period seat from the service ASAAS environment', () => {
  const now = new Date('2026-11-02T12:00:00.000Z');
  const where = buildActiveSponsoredSeatWhere('student-1', 'monitor-1', now, 'SANDBOX');

  assert.equal(where.studentId, 'student-1');
  assert.equal(where.status, 'ACTIVE');
  assert.equal(where.accessRevokedAt, null);
  assert.deepEqual(where.batch, { environment: 'SANDBOX', monitorId: 'monitor-1' });
  assert.deepEqual(where.startsAt, { lte: now });
  assert.deepEqual(where.endsAt, { gt: now });
  assert.equal('OR' in where, false);
});

test('production daily challenge lookup cannot match a sandbox sponsored seat in the shared database', () => {
  const where = buildActiveSponsoredSeatWhere('student-1', undefined, new Date('2026-11-02T12:00:00.000Z'), 'PRODUCTION');

  assert.deepEqual(where.batch, { environment: 'PRODUCTION' });
});
