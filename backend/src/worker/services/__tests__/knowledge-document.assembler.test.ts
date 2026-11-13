import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleKnowledgeChunks } from '../knowledge-document.assembler.js';

const page = (pageNumber: number, batchKey: string, elements: Array<{ externalIndex: number; type: string; text: string; level?: number | null }>) => ({
  page: { pageNumber, elements: elements.map((element) => ({ ...element, bbox: null, level: element.level ?? null })) },
  batchKey,
});

test('assembles complete paragraphs in order across a batch boundary at pages 10–11', () => {
  const chunks = assembleKnowledgeChunks([
    page(10, 'batch-1-10', [
      { externalIndex: 0, level: 0, type: 'TITLE', text: 'Capítulo 2' },
      { externalIndex: 1, type: 'TEXT', text: 'O parágrafo termina por completo na página 10.' },
    ]),
    page(11, 'batch-11-20', [
      { externalIndex: 0, type: 'TEXT', text: 'Este é outro parágrafo completo na página 11.' },
    ]),
  ]);

  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0]?.pages, [10, 11]);
  assert.deepEqual(chunks[0]?.headings, ['Capítulo 2']);
  assert.ok(chunks[0]?.content.includes('página 10.\nEste é outro parágrafo'));
});

test('fails closed for a paragraph fragment at the pages 10–11 batch boundary', () => {
  assert.throws(() => assembleKnowledgeChunks([
    page(10, 'batch-1-10', [
      { externalIndex: 0, level: 0, type: 'TITLE', text: 'Capítulo 2' },
      { externalIndex: 1, type: 'TEXT', text: 'O parágrafo fica interrompido na página 10 e' },
    ]),
    page(11, 'batch-11-20', [
      { externalIndex: 0, type: 'TEXT', text: 'continua na página 11 sem identificador estável.' },
    ]),
  ]), /Continuidade estrutural não comprovada.*páginas 10 e 11/u);
});

test('fails closed when table elements touch across the pages 10–11 batch boundary', () => {
  assert.throws(() => assembleKnowledgeChunks([
    page(10, 'batch-1-10', [
      { externalIndex: 0, type: 'TABLE', text: '| Item | Valor |\n| A | 10 |' },
    ]),
    page(11, 'batch-11-20', [
      { externalIndex: 0, type: 'TABLE', text: '| B | 11 |' },
    ]),
  ]), /Continuidade estrutural não comprovada.*TABLE → TABLE/u);
});
