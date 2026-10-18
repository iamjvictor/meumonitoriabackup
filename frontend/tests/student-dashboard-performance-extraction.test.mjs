import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const routeRoot = 'src/app/(student-app)/areadoaluno';
const componentPath = `${routeRoot}/components/DashboardPerformanceSection.tsx`;
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');

test('second extraction keeps the literal performance and consistency card route-local', () => {
  assert.equal(existsSync(resolve(root, componentPath)), true);

  const component = read(componentPath);
  const page = read(`${routeRoot}/page.tsx`);

  for (const marker of ['performanceStats', 'consistencySummary', 'visibleConsistencyDays', 'activePeriod']) {
    assert.match(component, new RegExp(`\\b${marker}\\b`), `missing component marker ${marker}`);
  }
  for (const marker of [
    'Seu progresso',
    'Constância semanal',
    'Desafio diário',
    'Ranking',
    'rounded-[24px]',
    'bg-gradient-to-br from-[#1B4332] via-[#245337] to-[#122B20]',
  ]) {
    assert.equal(component.includes(marker), true, `missing literal marker ${marker}`);
  }
  assert.match(page, /<DashboardPerformanceSection\b/);
  assert.doesNotMatch(page, /Seu progresso/);
  assert.match(page, /performanceStats=\{performanceStats\}/);
  assert.match(page, /consistencySummary=\{consistencySummary\}/);
  assert.match(page, /visibleConsistencyDays=\{visibleConsistencyDays\}/);
  assert.match(page, /activePeriod=\{activePeriod\}/);
});
