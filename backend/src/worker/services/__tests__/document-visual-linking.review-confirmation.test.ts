import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentVisualLinkingService } from '../document-visual-linking.service.js';

const assets = [
  { id: 'marker', assetKey: 'a'.repeat(32), sourceItemRef: 'marker', pageNumber: 5, readingOrder: 38, bbox: [33, 680, 71, 719], caption: null, contentAvailable: true },
  { id: 'retinoid-structures', assetKey: 'b'.repeat(32), sourceItemRef: 'structures', pageNumber: 5, readingOrder: 41, bbox: [126, 594, 506, 671], caption: null, contentAvailable: true },
];

function fixture() {
  const confirmations: unknown[] = [];
  const logs: Array<{ event: string; fields: Record<string, unknown> }> = [];
  const store = {
    findAssetsForParseRun: async () => assets,
    findAssetsForDocument: async () => assets,
    persistChunkLinks: async () => {},
    persistQuestionLinks: async () => {},
    persistQuestionSpanLinks: async () => {},
    updateQuestionSpanVisualStatuses: async () => {},
    confirmQuestionVisualReview: async (documentId: string, link: unknown, actorUserId: string) => { confirmations.push({ documentId, link, actorUserId }); return { teacherId: 'teacher-1' }; },
  };
  return { service: new DocumentVisualLinkingService(store, (event, fields) => logs.push({ event, fields })), confirmations, logs };
}

test('confirms only the reviewer-selected page asset and marks its question visual available', async () => {
  const state = fixture();
  const link = await state.service.confirmQuestionVisualReview({
    documentId: 'doc-1', questionSpanId: 'span-q3', questionId: 'question-q3',
    assetId: 'retinoid-structures', actorUserId: 'user-teacher-1',
  });

  assert.deepEqual(link, {
    assetId: 'retinoid-structures', assetKey: 'b'.repeat(32), method: 'REVIEW',
    confidence: 1, role: 'STATEMENT', questionSpanId: 'span-q3', questionId: 'question-q3',
  });
  assert.deepEqual(state.confirmations, [{ documentId: 'doc-1', link, actorUserId: 'user-teacher-1' }]);
  assert.deepEqual(state.logs[0], {
    event: 'document_visual_assets.question_link_review_confirmed',
    fields: {
      documentId: 'doc-1', questionSpanId: 'span-q3', questionId: 'question-q3',
      assetId: 'retinoid-structures', pageNumber: 5, associationMethod: 'REVIEW',
      actorUserId: 'user-teacher-1', actorTeacherId: 'teacher-1',
    },
  });
});

test('rejects a review selection for an asset not found in the requested document', async () => {
  const state = fixture();
  await assert.rejects(state.service.confirmQuestionVisualReview({
    documentId: 'doc-1', questionSpanId: 'span-q3', questionId: 'question-q3',
    assetId: 'asset-from-another-document', actorUserId: 'user-teacher-1',
  }), /não pertence ao documento/);
  assert.equal(state.confirmations.length, 0);
});

test('requires an authenticated actor identity before confirming a review', async () => {
  const state = fixture();
  await assert.rejects(state.service.confirmQuestionVisualReview({
    documentId: 'doc-1', questionSpanId: 'span-q3', questionId: 'question-q3',
    assetId: 'retinoid-structures', actorUserId: '',
  }), /identidade do professor/);
  assert.equal(state.confirmations.length, 0);
});
