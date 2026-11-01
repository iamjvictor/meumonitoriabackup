export function calculateAnnualPriceCents(monthlyPriceCents: number): number {
  if (!Number.isInteger(monthlyPriceCents) || monthlyPriceCents <= 0) throw new Error('MONTHLY_PRICE_INVALID');
  return Math.round(monthlyPriceCents * 12 * 0.8);
}
