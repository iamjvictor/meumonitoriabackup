export interface MonitorWithMonthlyPrice {
  priceCents?: number | null;
}

export function getMonthlyTotalCents(monitors: MonitorWithMonthlyPrice[]): number {
  return monitors.reduce((total, monitor) => {
    const priceCents = monitor.priceCents;
    return typeof priceCents === 'number' && Number.isFinite(priceCents) && priceCents >= 0
      ? total + priceCents
      : total;
  }, 0);
}
