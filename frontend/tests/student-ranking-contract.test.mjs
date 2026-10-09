import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pagePath = new URL('../src/app/(student-app)/areadoaluno/ranking/page.tsx', import.meta.url);

test('student ranking does not generate or inject fictional participants', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.doesNotMatch(page, /Math\.random\(\)/);
  assert.doesNotMatch(page, /DEMO_RANKING_DATA/);
  assert.doesNotMatch(page, /score: 1450/);
  assert.match(page, /Ainda não há participantes/);
});

test('student ranking consumes backend metrics and current student summary', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /rankData\.data\.ranking/);
  assert.match(page, /rankData\.data\.currentStudent/);
  assert.match(page, /totalAnswered/);
  assert.match(page, /accuracy/);
  assert.match(page, /streakDays/);
});
