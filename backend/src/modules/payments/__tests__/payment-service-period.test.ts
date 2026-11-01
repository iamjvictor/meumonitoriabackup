import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateServicePeriod } from '../infrastructure/persistence/payment-event.repository.js';

test('um plano anual inicia na confirmação e termina doze meses depois', () => {
  const period = calculateServicePeriod(new Date('2026-10-24T00:00:00.000Z'), null, 12);
  assert.equal(period.startsAt.toISOString(), '2026-10-24T00:00:00.000Z');
  assert.equal(period.endsAt.toISOString(), '2027-10-24T00:00:00.000Z');
});

test('renovação anual antecipada começa no fim do período já pago', () => {
  const period = calculateServicePeriod(new Date('2026-10-24T00:00:00.000Z'), new Date('2027-01-31T00:00:00.000Z'), 12);
  assert.equal(period.startsAt.toISOString(), '2027-01-31T00:00:00.000Z');
  assert.equal(period.endsAt.toISOString(), '2028-01-31T00:00:00.000Z');
});
