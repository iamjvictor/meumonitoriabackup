import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const content = readFileSync(resolve(root, 'src/app/(student-app)/areadoaluno/components/PracticeWeeklySimulationsSection.tsx'), 'utf8');

test('revisão preserva o id da questão oficial para o contexto da IA', () => {
  assert.match(content, /questionId\?: string/);
  assert.match(content, /questionId: item\.question\.id/);
  assert.match(content, /id: q\.questionId \|\| q\.id/);
});
