import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const page = fs.readFileSync(path.join(root, 'src/app/(student-app)/areadoaluno/pratica/page.tsx'), 'utf8');

test('a página de prática usa o cabeçalho de proveniência com os dados da questão', () => {
  assert.match(page, /PracticeQuestionHeading/);
  assert.match(page, /provenance=\{q\.provenance\}/);
});
