import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url).pathname;
const file = (p) => readFile(`${root}${p}`, 'utf8');

const modalContracts = [
  {
    component: 'MonitorFlashcardEditorModal.tsx',
    markers: ['Editar Flashcard', 'Novo Flashcard Manual', 'Preencha os campos', 'handleSaveFlashcardEdit'],
  },
  {
    component: 'AddSubjectModal.tsx',
    markers: ['Adicionar Nova Matéria', 'Defina o nome da disciplina', 'Adicionar outro tópico', 'Criar Matéria'],
  },
  {
    component: 'UploadConfirmationModal.tsx',
    markers: ['Confirmar Envio para Processamento', 'Ferramenta de auxílio', 'Revisão necessária', 'Confirmar e Enviar para IA'],
  },
];

test('componentes de modais preservam os marcadores visuais e de fluxo originais', async () => {
  for (const contract of modalContracts) {
    const source = await file(`src/modules/teacher/components/monitor/${contract.component}`);
    for (const marker of contract.markers) {
      assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${contract.component} perdeu ${marker}`);
    }
  }
});

test('page conecta os três modais pelos estados e callbacks originais', async () => {
  const page = await file('src/modules/teacher/components/monitor/MonitorWorkspace.tsx');
  for (const marker of [
    'MonitorFlashcardEditorModal',
    'AddSubjectModal',
    'UploadConfirmationModal',
    'isFlashcardModalOpen',
    'isAddSubjectModalOpen',
    'isUploadConfirmModalOpen',
    'handleSaveFlashcardEdit',
    'handleSubmitSubjectModal',
    'handleSendQueuedFiles',
  ]) {
    assert.match(page, new RegExp(`\\b${marker}\\b`), `page não conecta ${marker}`);
  }
});

test('os blocos inline dos três modais não permanecem na page', async () => {
  const page = await file('src/modules/teacher/components/monitor/MonitorWorkspace.tsx');
  assert.doesNotMatch(page, /isFlashcardModalOpen && editFlashcardDraft && \(\s*<div/);
  assert.doesNotMatch(page, /isAddSubjectModalOpen && \(\s*<div/);
  assert.doesNotMatch(page, /isUploadConfirmModalOpen && \(\s*<div/);
});
