import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
test('dashboard route preserves original behavior while extracting verified sections', () => {
  const page = read('src/app/(student-app)/areadoaluno/page.tsx');
  assert.ok(page.split('\n').length < 150, 'the route should be a composition shell after phase 3');
  for (const name of ['dailyChallenges', 'performanceStats', 'consistencySummary', 'openChallengeModal', 'isChallengeModalOpen', 'useFlashcardReview', 'DashboardStudyActions', 'DashboardPerformanceSection', 'DashboardChallengeSection']) {
    assert.match(page, new RegExp(`\\b${name}\\b`), `missing original implementation marker ${name}`);
  }
  for (const name of ['StudentAppShell', 'StudentHeader', 'useStudent']) {
    assert.match(page, new RegExp(`\\b${name}\\b`), `missing shell/import marker ${name}`);
  }
  assert.match(read('src/modules/student/components/StudentAppShell.tsx'), /min-h-screen w-full/);
  assert.doesNotMatch(page, /max-w-7xl/);
  assert.match(page, /DashboardStudyActions/);
  assert.match(page, /DashboardPerformanceSection/);
});
test('all dashboard route-local units exist', () => {
  for (const path of ['services/student-dashboard.service.ts', 'hooks/useStudentDashboard.ts', 'hooks/useDailyChallenge.ts', 'hooks/useFlashcardReview.ts', 'components/DashboardChallengeSection.tsx', 'components/DashboardStudyActions.tsx', 'components/DashboardPerformanceSection.tsx', 'components/DashboardAgentsSection.tsx', 'components/DailyChallengeModal.tsx', 'components/FlashcardReviewModal.tsx']) assert.equal(existsSync(resolve(root, `src/app/(student-app)/areadoaluno/${path}`)), true);
});
