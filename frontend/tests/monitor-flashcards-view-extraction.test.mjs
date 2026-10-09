import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pagePath = path.join(root, 'src/modules/teacher/components/monitor/MonitorWorkspace.tsx');
const componentPath = path.join(root, 'src/modules/teacher/components/monitor/MonitorFlashcardsReviewTab.tsx');

const read = (file) => fs.readFileSync(file, 'utf8');

test('extrai a view original de revisão de flashcards e conecta a página', () => {
  const page = read(pagePath);
  const component = read(componentPath);

  for (const marker of [
    'Geração Inteligente de Flashcards via IA',
    'Selecionar Arquivo',
    'Todos (',
    'Pendentes (',
    'Aprovados (',
    'Revisão Simples (',
    'Revisão de IA (',
    'Adicionar Flashcard Manual',
    'Aprovar Flashcard',
    'Simular / Testar no Modal',
    'filteredFlashcards',
  ]) {
    assert.match(component, new RegExp(marker.replace(/[()]/g, '\\$&')), `marcador ausente: ${marker}`);
  }

  assert.match(component, /export interface MonitorFlashcardsReviewTabProps/);
  assert.match(page, /<MonitorFlashcardsReviewTab\b/);
  assert.doesNotMatch(page, /VIEW 3: FLASHCARDS \(ESTEIRA DE REVISÃO DE FLASHCARDS\)/);
  assert.doesNotMatch(page, /Geração Inteligente de Flashcards via IA/);
  assert.doesNotMatch(page, /MonitorFlashcardsTab/);
});
