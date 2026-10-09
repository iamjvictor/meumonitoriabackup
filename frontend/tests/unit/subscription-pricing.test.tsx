import { describe, expect, it } from 'vitest';
import { getMonthlyTotalCents } from '@/modules/student/utils/subscription-pricing';

describe('getMonthlyTotalCents', () => {
  it('soma o preço mensal real dos monitores ativos', () => {
    expect(
      getMonthlyTotalCents([
        { priceCents: 1990 },
        { priceCents: 2490 },
      ]),
    ).toBe(4480);
  });

  it('não inventa preço quando o backend não envia o valor', () => {
    expect(getMonthlyTotalCents([{ priceCents: null }, {}])).toBe(0);
  });
});
