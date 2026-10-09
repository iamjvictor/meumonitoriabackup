import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const routeRoot = 'src/app/(student-app)/areadoaluno';
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');

const requiredFiles = [
  'services/student-dashboard.service.ts',
  'hooks/useStudentDashboard.ts',
  'hooks/useDailyChallenge.ts',
  'hooks/useFlashcardReview.ts',
  'components/DashboardChallengeSection.tsx',
  'components/DashboardStudyActions.tsx',
  'components/DashboardPerformanceSection.tsx',
  'components/DashboardAgentsSection.tsx',
  'components/DailyChallengeModal.tsx',
  'components/FlashcardReviewModal.tsx',
].map((file) => `${routeRoot}/${file}`);

test('student dashboard owns route-local service, hooks, and visual components', () => {
  for (const file of requiredFiles) assert.equal(existsSync(resolve(root, file)), true, `missing ${file}`);
});

test('route-local service owns every dashboard endpoint', () => {
  const service = read(`${routeRoot}/services/student-dashboard.service.ts`);
  for (const endpoint of ['daily-challenges', 'questions?pageSize=100', 'consistency', 'flashcards/random', 'flashcards/']) {
    assert.match(service, new RegExp(endpoint.replace(/[?]/g, '\\?')));
  }
});

test('route-local pieces are connected without replacing the original dashboard behavior', () => {
  const page = read(`${routeRoot}/page.tsx`);
  assert.ok(page.split('\n').length < 150, 'the route should be a composition shell after phase 3');
  for (const marker of ['dailyChallenges', 'performanceStats', 'consistencySummary', 'openChallengeModal', 'isChallengeModalOpen', 'useStudentDashboard', 'useDailyChallenge', 'useFlashcardReview']) {
    assert.match(page, new RegExp(`\\b${marker}\\b`), `missing original page marker ${marker}`);
  }
  for (const marker of ['StudentAppShell', 'StudentHeader', 'useStudent']) {
    assert.match(page, new RegExp(`\\b${marker}\\b`), `missing shell marker ${marker}`);
  }
  assert.match(read('src/modules/student/components/StudentAppShell.tsx'), /min-h-screen w-full/);
  assert.doesNotMatch(page, /max-w-7xl/);
  assert.match(page, /DashboardStudyActions/);
  assert.match(page, /DashboardPerformanceSection/);
  assert.match(page, /DashboardChallengeSection/);
});

test('study actions extraction retains its original UI contract', () => {
  const source = read(`${routeRoot}/components/DashboardStudyActions.tsx`);
  for (const marker of ['Seu espaço de estudos', 'O que você quer fazer?', 'Praticar Questões', 'Simulados', 'Flashcards']) {
    assert.match(source, new RegExp(marker));
  }
  for (const marker of ['sm:grid-cols-3', 'rounded-[24px]']) {
    assert.match(source, new RegExp(marker.replace(/[.[\]#]/g, '\\$&')));
  }
});

test('performance extraction retains its original UI contract', () => {
  const source = read(`${routeRoot}/components/DashboardPerformanceSection.tsx`);
  for (const marker of ['CARD UNIFICADO DE DESEMPENHO E CONSTÂNCIA', 'Frequência no Desafio Diário', 'Colocação no Ranking']) {
    assert.match(source, new RegExp(marker));
  }
  for (const marker of ['lg:grid-cols-12', 'rounded-[28px]', 'bg-gradient-to-br from-[#1B4332] via-[#2E5B37] to-[#133024]']) {
    assert.match(source, new RegExp(marker.replace(/[.[\]#]/g, '\\$&')));
  }
});
