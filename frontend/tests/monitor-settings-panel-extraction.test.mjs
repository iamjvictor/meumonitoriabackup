import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pagePath = path.join(root, 'src/modules/teacher/components/monitor/MonitorWorkspace.tsx');
const panelPath = path.join(root, 'src/modules/teacher/components/monitor/MonitorSettingsPanel.tsx');

const read = (file) => fs.readFileSync(file, 'utf8');
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');

test('extrai o painel original de configurações sem simplificar a UI', () => {
  const panel = read(panelPath);

  for (const marker of [
    'Informações Básicas',
    'Nome do Agente',
    'Foto de Perfil / Avatar do Monitor',
    'Salvar Alterações',
    'Resumo de Conteúdo',
    'Matérias e Tópicos Ativos',
    'Criado em:',
    'Visualização na Página de Vendas',
    'Destaque',
    'Adicionar ao Carrinho',
    'Questões',
    'Flashcards',
    'Início imediato',
  ]) {
    assert.match(panel, new RegExp(escapeRegex(marker)), `marcador ausente: ${marker}`);
  }

  for (const classMarker of [
    'xl:grid-cols-12',
    'xl:col-span-7',
    'xl:col-span-5',
    'rounded-2xl border border-slate-200/80',
    'bg-[#F5F1E8]',
  ]) {
    assert.ok(panel.includes(classMarker), `classe ausente: ${classMarker}`);
  }

  assert.match(panel, /export interface MonitorSettingsPanelProps/);
});

test('conecta o painel de configurações à página somente na view settings', () => {
  const page = read(pagePath);

  assert.match(page, /sidebarView === 'settings'/);
  assert.match(page, /<MonitorSettingsPanel\b/);
  assert.doesNotMatch(page, /Informações Básicas/);
  assert.doesNotMatch(page, /Visualização na Página de Vendas/);
});
