import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('start modal presents the weekly simulation rules before solving', () => {
  const root = resolve(import.meta.dirname, '..');
  const source = readFileSync(resolve(root, 'src/app/(student-app)/areadoaluno/components/WeeklySimulationStartModal.tsx'), 'utf8');
  assert.match(source, /1 hora para concluir/);
  assert.match(source, /A IA não ficará disponível durante o simulado/);
  assert.match(source, /o progresso não será salvo/);
  assert.match(source, /Object\.entries\(topics\)/);
});
