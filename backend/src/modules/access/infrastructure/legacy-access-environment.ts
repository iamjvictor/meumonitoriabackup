import { env } from '../../../config/env.js';

function matchingPaymentSubscriptionRelation(serviceEnvironment: string) {
  return { paymentSubscriptionItem: { subscription: { environment: serviceEnvironment } } };
}

/**
 * Legacy projections have no environment column. A payment-item bridge is
 * authoritative when present; unlinked legacy rows remain production-only
 * for backwards compatibility with existing production customers.
 */
export function legacyStudentSubscriptionEnvironmentFilter(serviceEnvironment = env.ASAAS_ENV.toUpperCase()) {
  const linkedToEnvironment = matchingPaymentSubscriptionRelation(serviceEnvironment);
  return {
    AND: [serviceEnvironment === 'PRODUCTION'
      ? { OR: [linkedToEnvironment, { paymentSubscriptionItemId: null }] }
      : linkedToEnvironment],
  };
}

export function legacyStudentEnrollmentEnvironmentFilter(serviceEnvironment = env.ASAAS_ENV.toUpperCase()) {
  const linkedToEnvironment = matchingPaymentSubscriptionRelation(serviceEnvironment);
  return {
    AND: [serviceEnvironment === 'PRODUCTION'
      ? { OR: [linkedToEnvironment, { paymentSubscriptionItemId: null }] }
      : linkedToEnvironment],
  };
}
