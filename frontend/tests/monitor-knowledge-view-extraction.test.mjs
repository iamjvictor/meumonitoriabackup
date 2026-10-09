import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const pagePath = 'src/modules/teacher/components/monitor/MonitorWorkspace.tsx';
const componentPath = 'src/modules/teacher/components/monitor/MonitorKnowledgeTab.tsx';

const read = (path) => fs.readFileSync(path, 'utf8');

test('knowledge view is extracted with its original upload and document UI', () => {
  const page = read(pagePath);
  const component = read(componentPath);

  assert.match(component, /Documentos Integrados \(\{filteredDocuments\.length\}\)/);
  assert.match(component, /Adicionar Materiais/);
  assert.match(component, /Arraste arquivos aqui ou clique para selecionar/);
  assert.match(component, /Fila de Envio \(\{queuedUploads\.length\}\)/);
  assert.match(component, /Enviar para IA/);
  assert.match(component, /lg:grid-cols-12/);
  assert.match(component, /rounded-2xl border border-slate-200/);
  assert.match(component, /uploadInputRef/);
  assert.match(component, /onDrop=/);
  assert.match(component, /onQueueFiles/);

  assert.match(page, /activeView === 'knowledge'/);
  assert.match(page, /<MonitorKnowledgeTab\b/);
  assert.doesNotMatch(page, /MonitorQuestionsTab/);
});
