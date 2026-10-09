import { describe, expect, it } from 'vitest';
import { getRemainingSimulationSeconds } from '../../src/app/(student-app)/areadoaluno/models/weekly-simulation-timer';
import { getNextWeeklySimulationRelease } from '../../src/app/(student-app)/areadoaluno/models/weekly-simulation-release';

describe('weekly simulation timer', () => {
  it('calcula o tempo restante até o prazo do simulado', () => {
    expect(getRemainingSimulationSeconds('2026-09-09T13:01:00.000Z', Date.parse('2026-09-09T13:00:00.000Z'))).toBe(60);
  });

  it('não retorna tempo negativo quando o prazo expirou', () => {
    expect(getRemainingSimulationSeconds('2026-09-09T13:00:00.000Z', Date.parse('2026-09-09T13:01:00.000Z'))).toBe(0);
  });

  it('calcula a próxima liberação para sexta-feira às 23:59', () => {
    expect(getNextWeeklySimulationRelease(new Date('2026-09-10T15:00:00.000Z')).toISOString()).toBe('2026-09-12T02:59:00.000Z');
  });

  it('considera a próxima semana depois da liberação de sexta-feira', () => {
    expect(getNextWeeklySimulationRelease(new Date('2026-09-12T03:00:00.000Z')).toISOString()).toBe('2026-09-19T02:59:00.000Z');
  });
});
