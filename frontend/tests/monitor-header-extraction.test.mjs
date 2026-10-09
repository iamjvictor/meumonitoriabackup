import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url).pathname;
const file = (p) => readFile(`${root}${p}`, 'utf8');

const visualMarkers = [
  'HEADER DO AGENTE',
  'Configurações do Agente',
  'PUBLICADO',
  'PRONTO PARA PUBLICAR',
  'PAUSADO',
  'RASCUNHO',
  'Matérias',
  'Específicas',
  'Base Conhecimento',
  'Banco Questões',
  'Flashcards',
  'Agente Publicado',
  'Publicar Agente',
];

const classMarkers = [
  'shrink-0 bg-white border-b border-slate-200',
  'shadow-2xs z-20 px-6',
  'font-heading text-lg font-bold sm:text-xl',
  'rounded-xl border border-slate-200',
  'bg-[#0F2942] text-white',
];

test('o header original do monitor é extraído para um componente real', async () => {
  const component = await file('src/modules/teacher/components/monitor/MonitorHeader.tsx');
  const page = await file('src/modules/teacher/components/monitor/MonitorWorkspace.tsx');

  for (const marker of [...visualMarkers, ...classMarkers]) {
    assert.match(component, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `header perdeu o marcador: ${marker}`);
  }

  assert.match(page, /import\s+\{?\s*MonitorHeader\s*\}?\s+from\s+['"]@\/modules\/teacher\/components\/monitor\/MonitorHeader['"]/);
  assert.match(page, /<MonitorHeader\b/);
  assert.doesNotMatch(page, /<header className=\{`shrink-0 bg-white border-b border-slate-200/);
});
