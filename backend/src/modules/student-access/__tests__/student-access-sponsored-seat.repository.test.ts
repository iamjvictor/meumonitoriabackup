import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from '../../../config/env.js';

test('weekly simulation access accepts only currently valid SponsoredSeats from the service environment', async (t) => {
  if (typeof t.mock.module !== 'function') {
    t.skip('Execute com --experimental-test-module-mocks para simular a fronteira Prisma.');
    return;
  }
  const calls: Array<{ operation: string; args: Record<string, any> }> = [];
  const fakePrisma = {
    studentSubscription: {
      async updateMany(args: Record<string, any>) { calls.push({ operation: 'subscription:update', args }); return { count: 1 }; },
    },
    studentEnrollment: {
      async findFirst(args: Record<string, any>) { calls.push({ operation: 'enrollment:first', args }); return null; },
      async findMany(args: Record<string, any>) { calls.push({ operation: 'enrollment:many', args }); return []; },
      async updateMany(args: Record<string, any>) { calls.push({ operation: 'enrollment:update', args }); return { count: 1 }; },
    },
    sponsoredSeat: {
      async findFirst(args: Record<string, any>) { calls.push({ operation: 'seat:first', args }); return { id: 'seat-1' }; },
      async findMany(args: Record<string, any>) { calls.push({ operation: 'seat:many', args }); return [{ batch: { monitorId: 'monitor-1' } }]; },
    },
  };
  await t.mock.module('../../../lib/prisma.js', { namedExports: { prisma: fakePrisma } });
  const { PrismaStudentAccessRepository } = await import('../student-access.repository.js');
  const repository = new PrismaStudentAccessRepository();

  assert.equal(await repository.hasActiveEnrollment('student-1', 'monitor-1'), true);
  assert.deepEqual(await repository.listEnrolledMonitorIds('student-1'), ['monitor-1']);
  await repository.cancelSubscription('student-1', 'monitor-1');
  await repository.cancelEnrollment('student-1', 'monitor-1');
  const productionRepository = new PrismaStudentAccessRepository('PRODUCTION');
  await productionRepository.cancelSubscription('student-1', 'monitor-1');
  await productionRepository.cancelEnrollment('student-1', 'monitor-1');
  const firstSeatWhere = calls.find((call) => call.operation === 'seat:first')?.args.where;
  const listSeatWhere = calls.find((call) => call.operation === 'seat:many')?.args.where;
  const expectedEnvironmentFilter = (environment: string) => environment === 'PRODUCTION'
    ? [{ OR: [{ paymentSubscriptionItem: { subscription: { environment } } }, { paymentSubscriptionItemId: null }] }]
    : [{ paymentSubscriptionItem: { subscription: { environment } } }];
  for (const where of [firstSeatWhere, listSeatWhere]) {
    assert.equal(where.status, 'ACTIVE');
    assert.equal(where.accessRevokedAt, null);
    assert.equal(where.batch.environment, env.ASAAS_ENV.toUpperCase());
    assert.ok(where.startsAt.lte instanceof Date);
    assert.ok(where.endsAt.gt instanceof Date);
  }
  const subscriptionCancel = calls.find((call) => call.operation === 'subscription:update')?.args;
  const enrollmentCancel = calls.find((call) => call.operation === 'enrollment:update')?.args;
  assert.equal(subscriptionCancel?.where.studentId, 'student-1');
  assert.deepEqual(subscriptionCancel?.where.AND, expectedEnvironmentFilter(env.ASAAS_ENV.toUpperCase()));
  assert.equal(enrollmentCancel?.where.monitorId, 'monitor-1');
  assert.deepEqual(enrollmentCancel?.where.AND, expectedEnvironmentFilter(env.ASAAS_ENV.toUpperCase()));
  const productionSubscriptionCancel = calls.filter((call) => call.operation === 'subscription:update').at(-1)?.args;
  const productionEnrollmentCancel = calls.filter((call) => call.operation === 'enrollment:update').at(-1)?.args;
  const productionLegacyFilter = [{ OR: [
    { paymentSubscriptionItem: { subscription: { environment: 'PRODUCTION' } } },
    { paymentSubscriptionItemId: null },
  ] }];
  assert.deepEqual(productionSubscriptionCancel?.where.AND, productionLegacyFilter);
  assert.deepEqual(productionEnrollmentCancel?.where.AND, productionLegacyFilter);
  assert.equal(calls.some((call) => call.operation === 'seat:update'), false);
});
