import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAnnualPriceCents } from '../domain/annual-plan-price.js';

test('calcula anual como doze mensalidades com 20% de desconto', () => {
  assert.equal(calculateAnnualPriceCents(10000), 96000);
  assert.equal(calculateAnnualPriceCents(5990), 57504);
});

test('arredonda centavos ao inteiro mais próximo e rejeita preço mensal inválido', () => {
  assert.equal(calculateAnnualPriceCents(1), 10);
  assert.throws(() => calculateAnnualPriceCents(0), /MONTHLY_PRICE_INVALID/);
  assert.throws(() => calculateAnnualPriceCents(-1), /MONTHLY_PRICE_INVALID/);
});
