import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const routeRoot = 'src/app/(student-app)/areadoaluno';
const read = (file) => readFileSync(resolve(root, file), 'utf8');

test('dashboard page delegates data, challenge, and flashcard state to route-local hooks', () => {
  const page = read(`${routeRoot}/page.tsx`);
  for (const hook of ['useStudentDashboard', 'useDailyChallenge', 'useFlashcardReview']) {
    assert.match(page, new RegExp(`\\b${hook}\\b`), `missing ${hook} integration`);
  }
  assert.doesNotMatch(page, /fetch\(\`\$\{apiUrl\}\/api\/v1\/student\/(daily-challenges|questions|consistency|flashcards)/);
  assert.doesNotMatch(page, /const \[dailyChallenges, setDailyChallenges\]/);
  assert.doesNotMatch(page, /const \[currentFlashcard, setCurrentFlashcard\]/);
});

test('dashboard hooks use the route-local service for every request', () => {
  for (const file of ['hooks/useStudentDashboard.ts', 'hooks/useDailyChallenge.ts', 'hooks/useFlashcardReview.ts']) {
    const source = read(`${routeRoot}/${file}`);
    assert.match(source, /studentDashboardService/);
  }
});
