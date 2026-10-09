import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const pagePath = `${root}src/modules/teacher/components/monitor/MonitorWorkspace.tsx`;
const sidebarPath = `${root}src/modules/teacher/components/monitor/MonitorStructureSidebar.tsx`;

const read = (file) => fs.readFileSync(file, 'utf8');

test('extrai a sidebar original de estrutura sem simplificar seu conteúdo', () => {
  const sidebar = read(sidebarPath);

  for (const marker of [
    'Estrutura do Monitor',
    'Adicionar Nova Matéria',
    'Matéria possui conteúdos pendentes de revisão',
    'Tópico pronto: Base de Conhecimento e Questões verificadas',
    'Falta Base',
    'Falta Questões',
    'Remover Tópico',
  ]) {
    assert.match(sidebar, new RegExp(marker.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')));
  }

  for (const classMarker of ['h-[40vh] w-full', 'lg:h-full lg:w-80', 'overflow-y-auto p-4 space-y-3.5', 'rounded-xl border overflow-hidden']) {
    assert.ok(sidebar.includes(classMarker), `classe ausente: ${classMarker}`);
  }
});

test('conecta a sidebar extraída à página com estado e callbacks originais', () => {
  const page = read(pagePath);
  assert.match(page, /MonitorStructureSidebar/);
  assert.match(page, /selectedSubjectId/);
  assert.match(page, /selectedTopicId/);
  assert.match(page, /sidebarView/);
  assert.match(page, /publishValidation/);
  assert.doesNotMatch(page, /<aside[\s\S]*Estrutura do Monitor[\s\S]*<\/aside>/);
});
