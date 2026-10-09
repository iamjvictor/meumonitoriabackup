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
    'CARD UNIFICADO DE DESEMPENHO E CONSTÂNCIA',
    'Frequência nos últimos 7 dias',
    'Frequência no Desafio Diário',
    'Colocação no Ranking',
    'rounded-[28px]',
    'bg-gradient-to-br from-[#1B4332] via-[#2E5B37] to-[#133024]',
  ]) {
    assert.equal(component.includes(marker), true, `missing literal marker ${marker}`);
  }
  assert.match(page, /<DashboardPerformanceSection\b/);
  assert.doesNotMatch(page, /CARD UNIFICADO DE DESEMPENHO E CONSTÂNCIA/);
  assert.match(page, /performanceStats=\{performanceStats\}/);
  assert.match(page, /consistencySummary=\{consistencySummary\}/);
  assert.match(page, /visibleConsistencyDays=\{visibleConsistencyDays\}/);
  assert.match(page, /activePeriod=\{activePeriod\}/);
});
