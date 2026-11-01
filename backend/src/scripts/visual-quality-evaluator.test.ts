import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateVisualCase } from './visual-quality-evaluator.js';

const expected = {
  caseId: 'q1-periodic-table',
  category: 'figure-required',
  critical: true,
  requiresImage: true,
  expectedAssets: [{ sha256: 'a'.repeat(64), page: 15 }],
  expectedFactIds: ['bromine-group-17', 'bromine-period-4'],
};

const observed = {
  extractedAssets: [{ assetId: 'asset-periodic-table', sha256: 'a'.repeat(64), page: 15 }],
  linkedAssets: [{ assetId: 'asset-periodic-table', sha256: 'a'.repeat(64), page: 15 }],
  retrievedAssets: [],
  contextManifest: [{ assetId: 'asset-periodic-table', sha256: 'a'.repeat(64), page: 15, source: 'QUESTION' as const }],
  sentImageSha256: ['a'.repeat(64)],
  answer: 'O bromo está no grupo 17 e período 4.',
  baselineAnswer: 'O bromo está no grupo 17 e período 4.',
  humanReview: {
    questionUnderstood: true,
    visualFactsCorrect: true,
    relationToQuestionCorrect: true,
    pedagogicalReasoning: true,
    sourcePageCorrect: true,
    limitationHonest: true,
    matchedFactIds: ['bromine-group-17', 'bromine-period-4'],
    unsupportedVisualClaims: false,
  },
};

test('não aprova resposta correta por conhecimento geral quando falta evidência visual', () => {
  const result = evaluateVisualCase(expected, {
    ...observed,
    humanReview: { ...observed.humanReview, visualFactsCorrect: false, matchedFactIds: [] },
  });
  assert.equal(result.answerPass, false);
  assert.deepEqual(result.missingFactIds, ['bromine-group-17', 'bromine-period-4']);
});

test('reprova imagem de outra questão mesmo quando a imagem esperada também foi enviada', () => {
  const result = evaluateVisualCase(expected, {
    ...observed,
    contextManifest: [
      ...observed.contextManifest,
      { assetId: 'asset-other-question', sha256: 'b'.repeat(64), page: 15, source: 'QUESTION' },
    ],
    linkedAssets: [
      ...observed.linkedAssets,
      { assetId: 'asset-other-question', sha256: 'b'.repeat(64), page: 15 },
    ],
    sentImageSha256: ['a'.repeat(64), 'b'.repeat(64)],
  });
  assert.equal(result.contextPass, false);
  assert.deepEqual(result.foreignAssets.map((asset) => asset.assetId), ['asset-other-question']);
});

test('reprova alegação de que viu imagem quando nenhum byte foi enviado', () => {
  const result = evaluateVisualCase(expected, {
    ...observed,
    contextManifest: [],
    sentImageSha256: [],
    humanReview: { ...observed.humanReview, limitationHonest: false, unsupportedVisualClaims: true },
  });
  assert.equal(result.contextPass, false);
  assert.equal(result.answerPass, false);
});

test('mantém a avaliação humana pendente como não aprovada, sem inferir do texto da resposta', () => {
  const result = evaluateVisualCase(expected, { ...observed, humanReview: null });
  assert.equal(result.answerPass, false);
  assert.equal(result.reviewStatus, 'PENDING');
});

test('não aceita um caso que exige imagem sem anotação de asset esperado', () => {
  const result = evaluateVisualCase({ ...expected, expectedAssets: [] }, {
    ...observed,
    extractedAssets: [], linkedAssets: [], contextManifest: [], sentImageSha256: [],
  });
  assert.equal(result.contextPass, false);
});
