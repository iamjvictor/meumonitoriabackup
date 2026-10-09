const TIMEZONE = 'America/Sao_Paulo';

function localDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')) };
}

export function getNextWeeklySimulationRelease(now: Date) {
  const { year, month, day, weekday } = localDateParts(now);
  const daysUntilFriday = (5 - weekday + 7) % 7;
  const release = new Date(Date.UTC(year, month - 1, day + daysUntilFriday + 1, 2, 59));
  return release.getTime() > now.getTime() ? release : new Date(release.getTime() + 7 * 24 * 60 * 60 * 1000);
}
