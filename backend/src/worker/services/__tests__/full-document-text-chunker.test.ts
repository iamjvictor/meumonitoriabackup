import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFullDocumentTextChunks } from '../full-document-text-chunker.js';

test('preserva todos os caracteres da página em chunks ordenados, com proveniência por página', () => {
  const pages = [
    { num: 2, text: 'Teoria e fórmula: E = mc². Questão longa. '.repeat(300) },
    { num: 1, text: '  Texto nativo e alternativas A) um B) dois.\n' },
  ];
  const result = buildFullDocumentTextChunks(pages);
  assert.deepEqual(result.uncoveredPages, []);
  for (const page of pages) {
    const actual = result.chunks.filter((chunk) => chunk.pages[0] === page.num).map((chunk) => chunk.rawText).join('');
    assert.equal(actual, page.text);
    assert.equal(result.coveredCharsByPage[page.num], page.text.length);
  }
  assert.ok(result.chunks.every((chunk) => chunk.tokens <= 450));
  assert.deepEqual(result.chunks.map((chunk) => chunk.index), result.chunks.map((_, index) => index));
});

test('expõe páginas sem texto reconhecido como lacuna', () => {
  const result = buildFullDocumentTextChunks([{ num: 1, text: '' }, { num: 2, text: 'texto' }]);
  assert.deepEqual(result.uncoveredPages, [1]);
});
