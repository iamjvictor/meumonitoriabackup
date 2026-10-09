import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');

test('dashboard uses the route-local study actions component with the original UI contract', () => {
  const page = read('src/app/(student-app)/areadoaluno/page.tsx');
  const component = read('src/app/(student-app)/areadoaluno/components/DashboardStudyActions.tsx');

  assert.match(page, /from ['"]\.\/components\/DashboardStudyActions['"]/);
  assert.match(page, /<DashboardStudyActions\s+onFlashcards=\{handleOpenFlashcardModal\}\s+hasDailyChallenges=\{dailyChallenges\.length > 0\}\s*\/>/);
  assert.match(component, /onFlashcards: \(\) => void/);
  assert.match(component, /Seu espaço de estudos/);
  assert.match(component, /Praticar Questões/);
  assert.match(component, /Simulados/);
  assert.match(component, /Flashcards/);
  assert.match(component, /Resolva exercícios comentados pela IA e consolide seu conhecimento\./);
  assert.match(component, /Avalie seu desempenho com exames no modelo oficial de bancas\./);
  assert.match(component, /Revisão espaçada ativa para memorização de conceitos\./);
  assert.match(component, /Tirar um Card/);
  for (const className of [
    'sm:grid-cols-3',
    'rounded-[24px]',
    'bg-[#F5EBE6]',
    'bg-indigo-50',
    'bg-emerald-50',
    'transition-all duration-300 hover:-translate-y-1',
  ]) assert.ok(component.includes(className), `missing class ${className}`);
  assert.match(component, /onClick=\{onFlashcards\}/);
});
