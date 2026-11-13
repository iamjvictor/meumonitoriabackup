import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { planDocumentBlockReplacement } from '../document-block.repository.js';

const block = {
  blockIndex: 5,
  type: 'QUESTION' as const,
  contentHash: createHash('sha256').update('Conteúdo idêntico da questão').digest('hex'),
  questionNumber: '01',
  pageStart: 3,
  pageEnd: 3,
  charStart: 100,
  charEnd: 250,
  normalizedContent: 'Conteúdo idêntico da questão',
};

test('reaproveita o ID do bloco referenciado quando a origem não mudou', () => {
  const plan = planDocumentBlockReplacement([
    { id: 'stable-block-id', ...block, referenced: true },
  ], [block]);

  assert.deepEqual(plan.idsByBlockIndex, new Map([[5, 'stable-block-id']]));
  assert.deepEqual(plan.deleteIds, []);
  assert.deepEqual(plan.createIndexes, []);
});

test('aborta substituição se um bloco referenciado mudou de conteúdo', () => {
  assert.throws(() => planDocumentBlockReplacement([
    { id: 'old-block-id', ...block, referenced: true },
  ], [{ ...block, normalizedContent: 'Conteúdo alterado' }]), /bloco referenciado.*nao pode ser remapeado/i);
});

test('substitui blocos alterados sem referências e cria o novo mapeamento', () => {
  const plan = planDocumentBlockReplacement([
    { id: 'old-block-id', ...block, referenced: false },
  ], [{ ...block, normalizedContent: 'Conteúdo alterado' }]);

  assert.deepEqual(plan.idsByBlockIndex, new Map());
  assert.deepEqual(plan.deleteIds, ['old-block-id']);
  assert.deepEqual(plan.createIndexes, [5]);
});
