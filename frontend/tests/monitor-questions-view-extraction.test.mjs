import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pagePath = path.join(root, 'src/modules/teacher/components/monitor/MonitorWorkspace.tsx');
const componentPath = path.join(root, 'src/modules/teacher/components/monitor/MonitorQuestionsReviewTab.tsx');

const read = (file) => fs.readFileSync(file, 'utf8');

test('extrai a view original de revisão de questões e conecta a página', () => {
  const page = read(pagePath);
  const component = read(componentPath);

  for (const marker of [
    'Geração Inteligente de Questões via IA',
    'Pendentes (',
    'Aprovadas (',
    'Revisão',
    'Selecionar Arquivo',
    'filteredQuestions',
  ]) {
    assert.match(component, new RegExp(marker.replace(/[()]/g, '\\$&')), `marcador ausente: ${marker}`);
  }

  assert.match(component, /export interface MonitorQuestionsReviewTabProps/);
  assert.match(page, /<MonitorQuestionsReviewTab\b/);
  assert.match(component, /handleOpenCreateQuestion/);
  assert.doesNotMatch(component, /setQuestions\(\(prev\) => \[newQ, \s*\.\.\.prev\]\)/);
  assert.match(page, /editQuestionDraft\.id\.startsWith\('q-'\)[\s\S]{0,120}\[updatedQuestion, \.\.\.prev\]/);
  assert.match(page, />\('pending'\);/, 'o filtro inicial deve ser Pendentes');
  assert.match(page, /reviewFilter === 'pending'\) return q\.status === 'pending_review'/);
  assert.doesNotMatch(page, /VIEW 2: BANCO DE QUESTÕES/);
  assert.doesNotMatch(page, /Geração Inteligente de Questões via IA/);
});
