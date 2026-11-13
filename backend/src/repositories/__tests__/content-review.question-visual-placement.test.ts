import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQuestionVisualAssetPlacement, isFigureAsset } from '../content-review.repository.js';

test('returns the exact anchor and Docling source position for a linked figure', () => {
  const asset = { id: 'figure-1', assetType: 'figure', width: 400, height: 300, bbox: [20, 700, 500, 300], metadata: {
    assetKind: 'FIGURE', readingOrder: 17, sourceItemRef: '#/pictures/17',
  } } as never;
  const questionMetadata = { visualEvidence: [{ assetId: 'figure-1', anchorText: 'Observe a figura 1.',
    pageNumber: 4, readingOrder: 17, bbox: [20, 30, 500, 600], sourceItemRef: '#/pictures/17' }] } as never;

  assert.equal(isFigureAsset(asset), true);
  assert.deepEqual(buildQuestionVisualAssetPlacement(asset, questionMetadata), {
    anchorText: 'Observe a figura 1.', readingOrder: 17, sourceItemRef: '#/pictures/17',
  });
});

test('excludes PAGE assets from question review payload placement', () => {
  const pageAsset = { id: 'page-1', assetType: 'page', width: 1000, height: 1000, bbox: null, metadata: { assetKind: 'PAGE' } } as never;
  assert.equal(isFigureAsset(pageAsset), false);
  assert.equal(buildQuestionVisualAssetPlacement(pageAsset, {} as never), null);
});

test('filters the 41 by 40 pixel unc captioned upper-left question badge from review visuals', () => {
  const badge = { id: 'question-badge', assetType: 'figure', width: 41, height: 40, bbox: [32.49, 719.01, 73.42, 680.51], metadata: { assetKind: 'FIGURE', caption: null } } as never;
  assert.equal(isFigureAsset(badge), false);
  assert.equal(buildQuestionVisualAssetPlacement(badge, {} as never), null);
});

test('keeps a small unc captioned figure when its bbox is outside the question-badge corner', () => {
  const diagram = { id: 'small-diagram', assetType: 'figure', width: 41, height: 40, bbox: [200, 500, 241, 460], metadata: { assetKind: 'FIGURE', caption: null } } as never;
  assert.equal(isFigureAsset(diagram), true);
  assert.ok(buildQuestionVisualAssetPlacement(diagram, {} as never));
});
