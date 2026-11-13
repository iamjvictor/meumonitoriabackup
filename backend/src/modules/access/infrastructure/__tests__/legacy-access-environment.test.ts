import assert from 'node:assert/strict';
import test from 'node:test';
import { legacyStudentEnrollmentEnvironmentFilter, legacyStudentSubscriptionEnvironmentFilter } from '../legacy-access-environment.js';

test('legacy rows without an environment bridge are production-only; bridged rows follow their payment environment', () => {
  for (const filter of [legacyStudentSubscriptionEnvironmentFilter, legacyStudentEnrollmentEnvironmentFilter]) {
    assert.deepEqual(filter('SANDBOX'), {
      AND: [{ paymentSubscriptionItem: { subscription: { environment: 'SANDBOX' } } }],
    });
    assert.deepEqual(filter('PRODUCTION'), {
      AND: [{ OR: [
        { paymentSubscriptionItem: { subscription: { environment: 'PRODUCTION' } } },
        { paymentSubscriptionItemId: null },
      ] }],
    });
  }
});
