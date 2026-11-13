import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuestionGraphInput, createQuestionReviewerGraph } from '../reviewer.js';
import type { ExtractedQuestionCandidate } from '../state.js';

const completeAlternatives = [
  { label: 'A', text: 'one' }, { label: 'B', text: 'two' }, { label: 'C', text: 'three' },
  { label: 'D', text: 'four' }, { label: 'E', text: 'five' },
];

function candidate(overrides: Partial<ExtractedQuestionCandidate> = {}): ExtractedQuestionCandidate {
  return {
    id: 'q-1', number: '01', statement: 'Qual opção corresponde ao enunciado?',
    alternatives: completeAlternatives, correctAnswer: 'C', sourceChunkIds: ['chunk-1'],
    visualEvidence: [{ assetId: 'asset-1', role: 'STATEMENT', alternativeLabel: null, anchorText: 'enunciado' }],
    ...overrides,
  };
}

function input(candidates: ExtractedQuestionCandidate[]) {
  return createQuestionGraphInput({
    executionId: 'run-1', documentId: 'doc-1', documentVersion: 'sha256:abc',
    model: 'deepseek/test', promptVersion: 'question-v1',
    contextRefs: { chunkIds: ['chunk-1'], pageNumbers: [3], formulaEvidenceRefs: ['formula-1'], imageAssetIds: ['asset-1'] },
    candidates,
  });
}

test('retains extracted candidates and context references while routing a missing alternative only', async () => {
  const original = candidate({ alternatives: completeAlternatives.filter(({ label }) => label !== 'D') });
  const result = await createQuestionReviewerGraph().invoke(input([original]));

  assert.equal(result.selectedRoute, 'alternatives');
  assert.equal(result.stage, 'awaiting_alternatives');
  assert.deepEqual(result.reviewDecisions, [{
    candidateId: 'q-1', route: 'alternatives', missingAlternativeLabels: ['D'], alternativesNeedRepair: true, missingAnswer: false,
    pendingIssues: ['ALTERNATIVES_INCOMPLETE_OR_INVALID'],
  }]);
  assert.deepEqual(result.candidates, [original], 'reviewer records gaps without rewriting extracted content');
  assert.deepEqual(result.contextRefs, input([original]).contextRefs);
});

test('routes simultaneous alternatives and answer gaps and identifies an incompatible answer', async () => {
  const result = await createQuestionReviewerGraph().invoke(input([candidate({ alternatives: [], correctAnswer: 'Z' })]));

  assert.equal(result.selectedRoute, 'both');
  assert.equal(result.stage, 'awaiting_both');
  assert.deepEqual(result.reviewDecisions[0]?.missingAlternativeLabels, ['A', 'B', 'C', 'D', 'E']);
  assert.equal(result.reviewDecisions[0]?.missingAnswer, true);
  assert.deepEqual(result.reviewDecisions[0]?.pendingIssues, ['ALTERNATIVES_INCOMPLETE_OR_INVALID', 'ANSWER_NOT_MATCHING_FINAL_ALTERNATIVE']);
  assert.deepEqual(result.candidates[0]?.alternatives, [], 'no completion agent has been invoked in this stage');
});

test('requires all five unique nonblank labels and verified answer provenance before marking ready', async () => {
  const result = await createQuestionReviewerGraph().invoke(input([candidate({ correctAnswer: 'Alternativa C' })]));
  assert.equal(result.selectedRoute, 'answer');
  assert.equal(result.stage, 'awaiting_answer');
  assert.deepEqual(result.reviewDecisions[0]?.missingAlternativeLabels, []);
  assert.equal(result.reviewDecisions[0]?.alternativesNeedRepair, false);
  assert.equal(result.reviewDecisions[0]?.missingAnswer, true);
  assert.ok(result.reviewDecisions[0]?.pendingIssues.includes('ANSWER_SOURCE_UNVERIFIED'));
});

test('routes answer-only gaps even when all alternatives exist', async () => {
  const result = await createQuestionReviewerGraph().invoke(input([candidate({ correctAnswer: null })]));
  assert.equal(result.selectedRoute, 'answer');
  assert.equal(result.stage, 'awaiting_answer');
  assert.equal(result.reviewDecisions[0]?.missingAnswer, true);
  assert.deepEqual(result.reviewDecisions[0]?.missingAlternativeLabels, []);
  assert.equal(result.reviewDecisions[0]?.alternativesNeedRepair, false);
});

test('routes an A-H list with assertion statements to alternatives repair instead of marking ready', async () => {
  const assertions = 'Analise as afirmativas I, II e III e marque a combinação correta.';
  const alternatives = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((label) => ({ label, text: `Item ${label}` }));
  const result = await createQuestionReviewerGraph().invoke(input([candidate({ statement: assertions, alternatives, correctAnswer: 'D' })]));

  assert.equal(result.selectedRoute, 'alternatives');
  assert.equal(result.stage, 'awaiting_alternatives');
  assert.equal(result.reviewDecisions[0]?.alternativesNeedRepair, true);
  assert.deepEqual(result.reviewDecisions[0]?.missingAlternativeLabels, []);
  assert.notEqual(result.stage, 'ready');
  assert.match(result.candidates[0]!.statement, /afirmativas I, II e III/);
});

test('routes duplicate or empty A-E entries to repair', async () => {
  const alternatives = [
    ...completeAlternatives.filter(({ label }) => label !== 'E'),
    { label: 'D', text: 'Duplicada e vazia   ' },
  ];
  const result = await createQuestionReviewerGraph().invoke(input([candidate({ alternatives })]));

  assert.equal(result.reviewDecisions[0]?.alternativesNeedRepair, true);
  assert.equal(result.selectedRoute, 'alternatives');
  assert.notEqual(result.stage, 'ready');
});
