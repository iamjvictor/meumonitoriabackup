import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentVisualLinkingService } from '../document-visual-linking.service.js';

const assets = [
  { id: 'figure-left', assetKey: 'a'.repeat(32), sourceItemRef: 'picture-left', pageNumber: 3, readingOrder: 4, bbox: [0, 0, 40, 40], caption: null, contentAvailable: true },
  { id: 'figure-right', assetKey: 'b'.repeat(32), sourceItemRef: 'picture-right', pageNumber: 3, readingOrder: 8, bbox: [60, 0, 100, 40], caption: null, contentAvailable: true },
];

function fixture() {
  const persistedSpanLinks: unknown[] = [];
  const persistedQuestionLinks: unknown[] = [];
  const statuses: unknown[] = [];
  const store = {
    findAssetsForParseRun: async () => assets,
    findAssetsForDocument: async () => assets,
    persistChunkLinks: async () => {},
    persistQuestionLinks: async (links: unknown[]) => { persistedQuestionLinks.push(...links); },
    persistQuestionSpanLinks: async (links: unknown[]) => { persistedSpanLinks.push(...links); },
    updateQuestionSpanVisualStatuses: async (rows: unknown[]) => { statuses.push(...rows); },
  };
  return { service: new DocumentVisualLinkingService(store), persistedSpanLinks, persistedQuestionLinks, statuses };
}

test('page-only image candidates remain review-only and preserve both candidate identities', async () => {
  const state = fixture();
  const report = await state.service.linkVisualAssetsToQuestions('doc-qa', [{
    questionSpanId: 'span-q1', questionId: 'question-q1', pages: [3], provenance: [],
    text: 'Questão 01 considere a figura', visualRequired: true,
  }]);

  assert.deepEqual(report.linked, []);
  assert.deepEqual(report.ambiguous, [{ targetId: 'span-q1', method: 'PAGE_CANDIDATE', candidateAssetIds: ['figure-left', 'figure-right'] }]);
  assert.equal(state.persistedQuestionLinks.length, 0, 'ambiguous page candidates must not become question visual links');
  assert.deepEqual(state.persistedSpanLinks.map((link: any) => [link.assetId, link.method, link.role, link.questionSpanId]), [
    ['figure-left', 'PAGE_CANDIDATE', 'REVIEW_CANDIDATE', 'span-q1'],
    ['figure-right', 'PAGE_CANDIDATE', 'REVIEW_CANDIDATE', 'span-q1'],
  ]);
  assert.deepEqual(state.statuses, [{ questionSpanId: 'span-q1', status: 'PENDING_EXTRACTION' }]);
});

test('exact provenance selects only its referenced image when several share a page', async () => {
  const state = fixture();
  const report = await state.service.linkVisualAssetsToQuestions('doc-qa', [{
    questionSpanId: 'span-q2', questionId: 'question-q2', pages: [3],
    provenance: [{ page: 3, item_ref: 'picture-right' }], text: 'Use figure', visualRequired: true,
  }]);

  assert.equal(report.linked.length, 1);
  assert.equal(report.linked[0]?.assetId, 'figure-right');
  assert.equal(report.linked[0]?.method, 'ITEM_REF');
  assert.equal(state.persistedQuestionLinks.length, 1);
  assert.deepEqual(state.statuses, [{ questionSpanId: 'span-q2', status: 'AVAILABLE' }]);
});
