import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = () => readFileSync(resolve(root, 'src/app/(student-app)/areadoaluno/components/PracticeWeeklySimulationsSection.tsx'), 'utf8');

test('seção de simulados não exibe histórico mockado', () => {
  const content = source();
  assert.match(content, /role="timer"/);
  assert.doesNotMatch(content, /Simulados anteriores/);
  assert.doesNotMatch(content, /mockHistory/);
});
