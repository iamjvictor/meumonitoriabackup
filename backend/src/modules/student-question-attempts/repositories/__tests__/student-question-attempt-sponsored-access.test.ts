import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from '../../../../config/env.js';

test('accessible practice monitors include SponsoredSeats active in the current service environment and date window', async (t) => {
  if (typeof t.mock.module !== 'function') {
    t.skip('Execute com --experimental-test-module-mocks para simular a fronteira Prisma.');
    return;
  }
  const queries: Record<string, any>[] = [];
  const fakePrisma = {
    studentSubscription: { async findMany() { return []; } },
    studentEnrollment: { async findMany() { return []; } },
    sponsoredSeat: { async findMany(args: Record<string, any>) { queries.push(args); return [{ batch: { monitorId: 'monitor-sponsored' } }]; } },
    teacher: { async findUnique() { return null; } },
  };
  await t.mock.module('../../../../lib/prisma.js', { namedExports: { prisma: fakePrisma } });
  const { StudentQuestionAttemptRepository } = await import('../student-question-attempt.repository.js');
  const monitorIds = await new StudentQuestionAttemptRepository().findAccessibleMonitorIds('student-1', 'user-1');

  assert.deepEqual(monitorIds, ['monitor-sponsored']);
  assert.equal(queries[0]?.where.status, 'ACTIVE');
  assert.equal(queries[0]?.where.accessRevokedAt, null);
  assert.ok(queries[0]?.where.startsAt.lte instanceof Date);
  assert.ok(queries[0]?.where.endsAt.gt instanceof Date);
  assert.equal(queries[0]?.where.batch.environment, env.ASAAS_ENV.toUpperCase());
});
