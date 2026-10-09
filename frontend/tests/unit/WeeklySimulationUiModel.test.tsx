import { describe, expect, it } from 'vitest';
import {
  findNextUnansweredIndex,
  getWeeklySimulationActionLabel,
  isWeeklySimulationActionable,
  isWeeklySimulationPolling,
} from '../../src/app/(student-app)/areadoaluno/models/weekly-simulation-ui';

describe('weekly simulation UI model', () => {
  it('marks only pending and processing as polling states', () => {
    expect(isWeeklySimulationPolling('PENDING')).toBe(true);
    expect(isWeeklySimulationPolling('PROCESSING')).toBe(true);
    expect(isWeeklySimulationPolling('READY')).toBe(false);
  });

  it('maps each backend state to a clear student action', () => {
    expect(getWeeklySimulationActionLabel('AVAILABLE_TO_GENERATE')).toBe('Gerar simulado');
    expect(getWeeklySimulationActionLabel('IN_PROGRESS')).toBe('Continuar simulado');
    expect(getWeeklySimulationActionLabel('BLOCKED_BY_PREVIOUS')).toBe('Continuar anterior');
  });

  it('allows requesting generation when the weekly cycle is available', () => {
    expect(isWeeklySimulationActionable('AVAILABLE_TO_GENERATE')).toBe(true);
    expect(isWeeklySimulationActionable('PENDING')).toBe(false);
    expect(isWeeklySimulationActionable('PROCESSING')).toBe(false);
  });

  it('finds the next unanswered item and wraps around', () => {
    const items = [{ answered: true }, { answered: false }, { answered: true }];
    expect(findNextUnansweredIndex(items, 0)).toBe(1);
    expect(findNextUnansweredIndex(items, 2)).toBe(1);
    expect(findNextUnansweredIndex([{ answered: true }])).toBe(-1);
  });
});
