import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createQuestionGraphInput, createQuestionReviewerGraph } from '../reviewer.js';
import type { ExtractedQuestionCandidate, QuestionGraphExecutionMetadata } from '../state.js';

const options = ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Opção ${label}` }));
function candidate(overrides: Partial<ExtractedQuestionCandidate> = {}): ExtractedQuestionCandidate {
  return {
    candidateId: 'candidate-1', number: '1', statement: 'Qual é a alternativa correta?', alternatives: options,
    correctAnswer: 'C', sourceChunkIds: ['chunk-1'], segmentId: 'segment-a',
    sourceRefs: { chunkIds: ['chunk-1'], pageNumbers: [1], evidenceRefs: ['ev-1'], visualAssetIds: [] },
    ...overrides,
  };
}
function state(candidates: ExtractedQuestionCandidate[], execution?: QuestionGraphExecutionMetadata) {
  return createQuestionGraphInput({
    executionId: 'run-qa', documentId: 'doc-qa', documentVersion: 'doc-v1', model: 'test-model', promptVersion: 'p1',
    contextRefs: { chunkIds: ['chunk-1'], pageNumbers: [1], formulaEvidenceRefs: [], imageAssetIds: [] },
    candidates, ...(execution ? { execution } : {}),
  });
}
function versionFor(item: ExtractedQuestionCandidate): string {
  return createHash('sha256').update(JSON.stringify({
    base: item.contentVersion ?? item.originalSnapshot?.contentVersion ?? null,
    alternatives: item.alternatives.map(({ label, text }) => ({ label, text })),
  })).digest('hex');
}

test('terminal clean execution is marked completed instead of remaining running', async () => {
  const item = candidate();
  const initial = state([item], { pipelineVersion: 'qa', status: 'running' });
  initial.agentResults[item.candidateId!] = {
    inputVersion: versionFor(item), correctAnswer: 'C', correctAnswerOrigin: 'AI_GENERATED', pendingIssues: [],
  };
  const result = await createQuestionReviewerGraph().invoke(initial);
  assert.equal(result.nextNode, 'end');
  assert.equal(result.stage, 'ready');
  assert.equal(result.execution?.status, 'completed');
});

test('verified duplicate candidates sharing segment and evidence are consolidated before backend output', async () => {
  const original = candidate({ candidateId: 'candidate-a', id: undefined });
  const duplicate = candidate({ candidateId: 'candidate-b', id: undefined });
  const result = await createQuestionReviewerGraph().invoke(state([original, duplicate]));
  assert.equal(result.backendOutput.length, 1, 'same proven question must not be emitted twice');
});

test('same question number in distinct evidence-backed exam segments remains two candidates and is flagged', async () => {
  const first = candidate({ candidateId: 'candidate-a', segmentId: 'book-blue', sourceRefs: { chunkIds: ['c1'], pageNumbers: [1], evidenceRefs: ['blue-ev'], visualAssetIds: [] }, sourceChunkIds: ['c1'] });
  const second = candidate({ candidateId: 'candidate-b', segmentId: 'book-green', sourceRefs: { chunkIds: ['c2'], pageNumbers: [12], evidenceRefs: ['green-ev'], visualAssetIds: [] }, sourceChunkIds: ['c2'] });
  const result = await createQuestionReviewerGraph().invoke(state([first, second]));
  assert.equal(result.backendOutput.length, 2);
  assert.ok(result.backendOutput.every((question) => question.pendingIssues.some((issue) => issue.includes('SEGMENT') || issue.includes('DUPLICATE'))));
});

test('failed completion agent ends with completed_with_issues and retains public review status', async () => {
  const item = candidate({ candidateId: 'candidate-failed', alternatives: options.slice(0, 4), correctAnswer: null });
  const graph = createQuestionReviewerGraph({
    contextProvider: { async load() { return { text: 'context', images: [] }; } },
    client: { async createStructuredChatCompletion() { throw new Error('provider unavailable'); } },
  });
  const result = await graph.invoke(state([item], { pipelineVersion: 'qa', status: 'running' }));
  assert.equal(result.nextNode, 'end');
  assert.equal(result.execution?.status, 'completed_with_issues');
  assert.equal(result.backendOutput[0]?.status, 'PENDING_REVIEW');
  assert.equal(result.backendOutput[0]?.needsReview, true);
  assert.ok(result.backendOutput[0]?.pendingIssues.some((issue) => issue.includes('AGENT_FAILED')));
});
