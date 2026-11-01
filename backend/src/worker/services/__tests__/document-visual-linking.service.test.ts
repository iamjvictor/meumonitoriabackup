import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentVisualLinkingService } from '../document-visual-linking.service.js';

const assets = [
  { id: 'asset-a', assetKey: 'a'.repeat(32), sourceItemRef: '#/pictures/0', readingOrder: 2, pageNumber: 1,
    bbox: [0, 0, 40, 40], caption: 'Gráfico de temperatura', contentAvailable: true },
  { id: 'asset-b', assetKey: 'b'.repeat(32), sourceItemRef: '#/pictures/1', readingOrder: 5, pageNumber: 1,
    bbox: [60, 60, 100, 100], caption: 'Ciclo da água', contentAvailable: true },
  { id: 'asset-c', assetKey: 'c'.repeat(32), sourceItemRef: '#/pictures/2', readingOrder: 8, pageNumber: 2,
    bbox: [0, 0, 40, 40], caption: 'Equação', contentAvailable: false },
];

function fixture() {
  const chunkLinks: unknown[] = [];
  const questionLinks: unknown[] = [];
  const questionSpanLinks: unknown[] = [];
  const spanStatuses: unknown[] = [];
  const store = {
    findAssetsForParseRun: async () => assets,
    findAssetsForDocument: async () => assets,
    persistChunkLinks: async (links: unknown[]) => { chunkLinks.push(...links); },
    persistQuestionLinks: async (links: unknown[]) => { questionLinks.push(...links); },
    persistQuestionSpanLinks: async (links: unknown[]) => { questionSpanLinks.push(...links); },
    updateQuestionSpanVisualStatuses: async (rows: unknown[]) => { spanStatuses.push(...rows); },
  };
  return { service: new DocumentVisualLinkingService(store), chunkLinks, questionLinks, questionSpanLinks, spanStatuses };
}

test('links two figures on the same page to chunks by exact Docling item reference', async () => {
  const state = fixture();
  const result = await state.service.linkVisualAssetsToChunks('parse-1', [
    { id: 'chunk-a', text: 'Gráfico A', pages: [1], provenance: [{ page: 1, item_ref: '#/pictures/0' }] },
    { id: 'chunk-b', text: 'Figura B', pages: [1], provenance: [{ page: 1, item_ref: '#/pictures/1' }] },
  ]);
  assert.equal(result.linked.length, 2);
  assert.equal(result.linked[0]!.assetId, 'asset-a');
  assert.equal(result.linked[1]!.assetId, 'asset-b');
  assert.ok(result.linked.every((link) => link.method === 'ITEM_REF'));
  assert.equal(state.chunkLinks.length, 2);
});

test('uses a unique bbox intersection when item reference is absent', async () => {
  const state = fixture();
  const result = await state.service.linkVisualAssetsToChunks('parse-1', [
    { id: 'chunk-box', text: 'região ilustrada', pages: [1], provenance: [{ page: 1, bbox: [5, 5, 35, 35] }] },
  ]);
  assert.equal(result.linked[0]?.assetId, 'asset-a');
  assert.equal(result.linked[0]?.method, 'BBOX');
});

test('uses reading order to disambiguate overlapping bboxes', async () => {
  const overlapping = [
    { ...assets[0]!, bbox: [0, 0, 40, 40] },
    { ...assets[1]!, bbox: [0, 0, 40, 40] },
  ];
  const state = fixtureWithAssets(overlapping);
  const result = await state.service.linkVisualAssetsToChunks('parse-1', [
    { id: 'chunk-order', text: 'figura da direita', pages: [1], provenance: [{ page: 1, bbox: [0, 0, 40, 40], reading_order: 5 }] },
  ]);
  assert.equal(result.linked[0]?.assetId, 'asset-b');
  assert.equal(result.linked[0]?.method, 'BBOX');
});

test('uses a distinctive caption as a secondary association signal', async () => {
  const state = fixture();
  const result = await state.service.linkVisualAssetsToChunks('parse-1', [
    { id: 'chunk-caption', text: 'O gráfico de temperatura mostra a variação ao longo do dia', pages: [1], provenance: [] },
  ]);
  assert.equal(result.linked[0]?.assetId, 'asset-a');
  assert.equal(result.linked[0]?.method, 'CAPTION');
});

test('cross-page question links only referenced figures in its page interval', async () => {
  const linkedAssets = assets.map((asset) => asset.id === 'asset-c' ? { ...asset, contentAvailable: true } : asset);
  const state = fixtureWithAssets(linkedAssets);
  const result = await state.service.linkVisualAssetsToQuestions('doc-1', [
    { questionSpanId: 'span-cross', questionId: 'question-1', pages: [1, 2],
      provenance: [{ page: 2, item_ref: '#/pictures/2' }], text: 'Considere a equação da figura', visualRequired: true },
  ]);
  assert.equal(result.linked.length, 1);
  assert.equal(result.linked[0]?.assetId, 'asset-c');
  assert.equal(result.linked[0]?.method, 'ITEM_REF');
  assert.equal(state.questionLinks.length, 1);
  assert.equal(state.questionSpanLinks.length, 1);
  assert.deepEqual(state.spanStatuses, [{ questionSpanId: 'span-cross', status: 'AVAILABLE' }]);
});

test('page-only matches remain ambiguous and mark the question span VISUAL_PENDING', async () => {
  const state = fixture();
  const result = await state.service.linkVisualAssetsToQuestions('doc-1', [
    { questionSpanId: 'span-page', questionId: null, pages: [1], provenance: [], text: 'Questão sobre o gráfico', visualRequired: true },
  ]);
  assert.equal(result.linked.length, 0);
  assert.equal(result.ambiguous.length, 1);
  assert.equal(result.ambiguous[0]?.method, 'PAGE_CANDIDATE');
  assert.deepEqual(state.spanStatuses, [{ questionSpanId: 'span-page', status: 'PENDING_EXTRACTION' }]);
  assert.equal(state.questionLinks.length, 0);
  assert.equal(state.questionSpanLinks.length, 2);
});

test('reports a missing crop separately from a missing page candidate', async () => {
  const state = fixture();
  const result = await state.service.linkVisualAssetsToQuestions('doc-1', [
    { questionSpanId: 'span-no-crop', questionId: 'question-2', pages: [2],
      provenance: [{ page: 2, item_ref: '#/pictures/2' }], text: 'Equação', visualRequired: true },
    { questionSpanId: 'span-no-asset', questionId: null, pages: [3], provenance: [], text: 'Texto', visualRequired: true },
  ]);
  assert.equal(result.missing.length, 2);
  assert.equal(result.ambiguous.length, 0);
  assert.ok(result.missing.some((item) => item.targetId === 'span-no-crop' && item.reason === 'CROP_UNAVAILABLE'));
  assert.ok(result.missing.some((item) => item.targetId === 'span-no-asset' && item.reason === 'NO_ASSET_ON_PAGE'));
  assert.equal(result.linked.length, 0);
});

function fixtureWithAssets(assetRows: typeof assets) {
  const chunkLinks: unknown[] = [];
  const questionLinks: unknown[] = [];
  const questionSpanLinks: unknown[] = [];
  const spanStatuses: unknown[] = [];
  const store = {
    findAssetsForParseRun: async () => assetRows,
    findAssetsForDocument: async () => assetRows,
    persistChunkLinks: async (links: unknown[]) => { chunkLinks.push(...links); },
    persistQuestionLinks: async (links: unknown[]) => { questionLinks.push(...links); },
    persistQuestionSpanLinks: async (links: unknown[]) => { questionSpanLinks.push(...links); },
    updateQuestionSpanVisualStatuses: async (rows: unknown[]) => { spanStatuses.push(...rows); },
  };
  return { service: new DocumentVisualLinkingService(store), chunkLinks, questionLinks, questionSpanLinks, spanStatuses };
}
