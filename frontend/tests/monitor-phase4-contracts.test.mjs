import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url).pathname;
const file = (p) => readFile(`${root}${p}`, 'utf8');

test('rota do monitor permanece fina e delega para o workspace funcional', async () => {
  const page = await file('src/app/(teacher)/professor/monitores/[monitorId]/page.tsx');
  const workspace = await file('src/modules/teacher/components/monitor/MonitorWorkspace.tsx');
  assert.ok(page.split('\n').length < 150, 'a rota deve ser apenas um entrypoint');
  assert.match(page, /MonitorWorkspace/);
  for (const marker of ['selectedSubjectId', 'uploadsByView', 'documents', 'publishValidation', 'isAddSubjectModalOpen', 'handleSubmitSubjectModal']) {
    assert.match(workspace, new RegExp(`\\b${marker}\\b`), `missing functional marker: ${marker}`);
  }
});

test('hooks de monitor expõem contratos da Fase 4', async () => {
  for (const name of ['useMonitorQuestions','useMonitorFlashcards','useMonitorSettings','useQuestionUpload']) {
    const source = await file(`src/modules/teacher/hooks/${name}.ts`);
    assert.match(source, new RegExp(`export (function|const) ${name}`));
  }
  assert.match(await file('src/modules/teacher/hooks/useMonitorQuestions.ts'), /useState|useCallback/);
  assert.match(await file('src/modules/teacher/hooks/useQuestionUpload.ts'), /File|FormData|TeacherMonitorService/);
});

test('workspace usa os hooks de domínio da Fase 4', async () => {
  const workspace = await file('src/modules/teacher/components/monitor/MonitorWorkspace.tsx');
  for (const hook of ['useMonitorQuestions', 'useMonitorFlashcards', 'useMonitorSettings', 'useQuestionUpload']) {
    assert.match(workspace, new RegExp(`\\b${hook}\\b`), `workspace não integra ${hook}`);
  }
  assert.match(workspace, /uploadDocument\(/, 'upload deve passar pelo hook de upload');
  assert.match(workspace, /saveMonitorSettings\(/, 'configurações devem passar pelo hook de settings');
});
