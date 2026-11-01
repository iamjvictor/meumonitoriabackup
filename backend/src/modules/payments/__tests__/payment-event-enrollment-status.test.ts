import assert from 'node:assert/strict';
import test from 'node:test';
import { getStudentEnrollmentStatusForSubscriptionEvent } from '../infrastructure/persistence/payment-event.repository.js';

test('mantém acesso pago até o fim do período quando a assinatura é removida', () => {
  assert.equal(getStudentEnrollmentStatusForSubscriptionEvent('SUBSCRIPTION_DELETED'), 'ACTIVE');
});

test('revoga enrollment após estorno ou chargeback', () => {
  assert.equal(getStudentEnrollmentStatusForSubscriptionEvent('PAYMENT_REFUNDED'), 'REMOVED');
  assert.equal(getStudentEnrollmentStatusForSubscriptionEvent('PAYMENT_CHARGEBACK_REQUESTED'), 'REMOVED');
});

test('mantém enrollment quando a assinatura só foi alterada ou inativada', () => {
  assert.equal(getStudentEnrollmentStatusForSubscriptionEvent('SUBSCRIPTION_UPDATED'), 'ACTIVE');
  assert.equal(getStudentEnrollmentStatusForSubscriptionEvent('SUBSCRIPTION_INACTIVATED'), 'ACTIVE');
});
