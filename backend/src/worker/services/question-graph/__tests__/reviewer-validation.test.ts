import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuestionGraphInput, createQuestionReviewerGraph, stableCandidateId } from '../reviewer.js';
import type { ExtractedQuestionCandidate, QuestionGraphState } from '../state.js';

const alternatives = ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Opção ${label}` }));
const candidate = (overrides: Partial<ExtractedQuestionCandidate> = {}): ExtractedQuestionCandidate => ({
  number: '1', statement: 'Qual é a resposta da questão?', alternatives, correctAnswer: null,
  sourceChunkIds: ['chunk-1'], ...overrides,
});
const input = (candidates: ExtractedQuestionCandidate[], overrides: Partial<QuestionGraphState> = {}) => createQuestionGraphInput({
  executionId: 'run-1', documentId: 'doc-1', documentVersion: 'v1', model: 'test-model', promptVersion: 'p1',
  contextRefs: { chunkIds: ['chunk-1'], pageNumbers: [1], formulaEvidenceRefs: [], imageAssetIds: [] }, candidates, ...overrides,
});

test('stable candidate identity does not depend on array index/order', () => {
  const first = candidate({ id: undefined });
  const second = candidate({ id: undefined, sourceChunkIds: ['chunk-0', 'chunk-1'] });
  const idsBefore = [stableCandidateId(first), stableCandidateId(second)].sort();
  const idsAfter = [stableCandidateId(second), stableCandidateId(first)].sort();
  assert.deepEqual(idsBefore, idsAfter);
  assert.ok(idsBefore.every((id) => !/:\d+$/.test(id)));
});

test('URL-only candidate is held as a fragment and never sent to agents or marked ready', async () => {
  let calls = 0;
  const graph = createQuestionReviewerGraph({
    contextProvider: { async load() { return { text: '', images: [] }; } },
    client: { async createStructuredChatCompletion() { calls += 1; throw new Error('must not be called'); } },
  });
  const result = await graph.invoke(input([candidate({ statement: 'https://example.org/image.png', alternatives: [] })]));
  assert.equal(calls, 0);
  assert.notEqual(result.stage, 'ready');
  assert.ok(result.backendOutput[0]?.pendingIssues.includes('STATEMENT_URL_OR_EMPTY_FRAGMENT'));
});

test('source answer without verified provenance is rechecked even when label matches A-E', async () => {
  let calls = 0;
  const graph = createQuestionReviewerGraph({
    contextProvider: { async load() { return { text: 'Gabarito questão 1: C', images: [] }; } },
    client: { async createStructuredChatCompletion<T>(request: any) { calls += 1; assert.equal(request.schemaName, 'question_answer_key'); return { answerLabel: 'C', foundInSource: false, evidence: 'resolvida', confidence: 0.9, unresolvedReason: null } as T; } },
  });
  const result = await graph.invoke(input([candidate({ correctAnswer: 'C', candidateId: 'candidate-1' })]));
  assert.equal(calls, 1);
  assert.equal(result.backendOutput[0]?.correctAnswer, 'C');
  assert.equal(result.backendOutput[0]?.answerGenerated, true);
  assert.equal(result.stage, 'ready');
});

test('unresolved answer evidence prevents ready even when a valid A-E answer is returned', async () => {
  const graph = createQuestionReviewerGraph({
    contextProvider: {
      async load() { return { text: 'Possível gabarito, sem vínculo seguro.', images: [] }; },
      async searchEvidence() { return { query: 'gabarito', coverage: 'partial', hits: [], unresolvedReason: 'Assets visuais sem descrição.' }; },
    },
    client: { async createStructuredChatCompletion<T>() { return { answerLabel: 'C', foundInSource: true, evidence: 'Gabarito questão 1 C', confidence: 0.9, unresolvedReason: 'Não consegui associar o caderno.' } as T; } },
  });
  const result = await graph.invoke(input([candidate({ correctAnswer: null, candidateId: 'candidate-1', segmentId: 'seg-1' })]));
  assert.notEqual(result.stage, 'ready');
  assert.ok(result.backendOutput[0]?.pendingIssues.includes('ANSWER_CONTEXT_INSUFFICIENT'));
});

test('exact clones without explicit IDs are consolidated', async () => {
  const clone = candidate({
    id: undefined, candidateId: undefined, segmentId: 'segment-a',
    sourceRefs: { chunkIds: ['chunk-1'], pageNumbers: [1], evidenceRefs: ['shared-evidence'], visualAssetIds: [] },
  });
  const result = await createQuestionReviewerGraph().invoke(input([clone, { ...clone }]));
  assert.equal(result.backendOutput.length, 1);
});

test('proven duplicate candidates retain merged source references', async () => {
  const first = candidate({
    id: undefined, candidateId: undefined, segmentId: 'segment-a',
    sourceChunkIds: ['chunk-1'],
    sourceRefs: { chunkIds: ['chunk-1'], pageNumbers: [1], evidenceRefs: ['shared-evidence', 'evidence-a'], visualAssetIds: ['asset-a'] },
    visualEvidence: [{ assetId: 'asset-a', role: 'STATEMENT', alternativeLabel: null, anchorText: 'figura da questão' }],
  });
  const second = candidate({
    id: undefined, candidateId: undefined, segmentId: 'segment-a',
    sourceChunkIds: ['chunk-2'],
    sourceRefs: { chunkIds: ['chunk-2'], pageNumbers: [2], evidenceRefs: ['shared-evidence', 'evidence-b'], visualAssetIds: ['asset-b'] },
    visualEvidence: [{ assetId: 'asset-b', role: 'STATEMENT', alternativeLabel: null, anchorText: 'figura da questão' }],
  });
  const result = await createQuestionReviewerGraph().invoke(input([first, second]));

  assert.equal(result.backendOutput.length, 1);
  assert.deepEqual(result.backendOutput[0]?.sourceChunkIds.sort(), ['chunk-1', 'chunk-2']);
  assert.deepEqual(result.candidates[0]?.sourceRefs?.evidenceRefs.sort(), ['evidence-a', 'evidence-b', 'shared-evidence']);
  assert.deepEqual(result.candidates[0]?.sourceRefs?.pageNumbers.sort(), [1, 2]);
  assert.deepEqual(result.backendOutput[0]?.visualEvidence.map(({ assetId }) => assetId).sort(), ['asset-a', 'asset-b']);
});

test('same question number without proven segment association is not consolidated', async () => {
  const first = candidate({ id: undefined, candidateId: undefined, segmentId: null, sourceRefs: { chunkIds: ['chunk-1'], pageNumbers: [1], evidenceRefs: ['shared-evidence'], visualAssetIds: [] } });
  const second = candidate({ id: undefined, candidateId: undefined, segmentId: null, sourceRefs: { chunkIds: ['chunk-2'], pageNumbers: [2], evidenceRefs: ['shared-evidence'], visualAssetIds: [] } });
  const result = await createQuestionReviewerGraph().invoke(input([first, second]));

  assert.equal(result.backendOutput.length, 2);
});
