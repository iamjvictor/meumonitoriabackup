import { expect, test } from 'vitest';
import { isPurchaseSuccessStatus } from '@/app/(student-app)/areadoaluno/models/purchase-return';

test('reconhece somente o retorno de compra com status success', () => {
  expect(isPurchaseSuccessStatus('success')).toBe(true);
  expect(isPurchaseSuccessStatus('cancelled')).toBe(false);
  expect(isPurchaseSuccessStatus(null)).toBe(false);
});
