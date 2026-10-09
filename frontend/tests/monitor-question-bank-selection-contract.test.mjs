import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const modalPath = new URL('../src/modules/teacher/components/TeacherMonitorCreationModal.tsx', import.meta.url);
const modalSource = fs.readFileSync(modalPath, 'utf8');
const servicePath = new URL('../src/modules/teacher/services/TeacherMonitorService.ts', import.meta.url);
const serviceSource = fs.readFileSync(servicePath, 'utf8');

test('allows monitor creation without selecting the question bank', () => {
  assert.doesNotMatch(
    modalSource,
    /if \(selectedCatalogSubjects\.length === 0 && totalSelectedSubtopicsCount === 0\)/,
  );
  assert.match(modalSource, /questionBankSelections/);
});

test('keeps manual and question-bank content as separate creation inputs', () => {
  assert.match(modalSource, /subjects: subjects\.map/);
  assert.match(modalSource, /questionBankSelections:/);
  assert.match(modalSource, /source: 'MANUAL'|source: 'QUESTION_BANK'|source: 'MIXED'/);
});

test('preserves manual topics when synchronizing catalog topics', () => {
  assert.match(modalSource, /const manualSubjects|manualSubjects/);
  assert.match(modalSource, /newSubjects\.push\(existing\)/);
  assert.match(modalSource, /questionBankSelections/);
});

test('sends optional question-bank selections with monitor creation', () => {
  assert.match(serviceSource, /questionBankSelections:\s*monitor\.questionBankSelections\s*\?\?\s*\[\]/);
  assert.match(serviceSource, /console\.debug\('\[TeacherMonitorService\] Enviando criação de monitor'/);
});

test('requires an exam profile only when the question bank is selected', () => {
  assert.match(
    modalSource,
    /selectedExamProfiles\.length === 0 && \(selectedCatalogSubjects\.length > 0 \|\| totalSelectedSubtopicsCount > 0\)/,
  );
});
