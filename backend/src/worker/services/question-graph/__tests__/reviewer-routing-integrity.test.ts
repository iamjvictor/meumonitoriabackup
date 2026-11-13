import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuestionGraphInput, createQuestionReviewerGraph } from '../reviewer.js';
import type { ExtractedQuestionCandidate, QuestionGraphState } from '../state.js';

const alternatives = ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Opção ${label}` }));

function state(candidate: ExtractedQuestionCandidate): QuestionGraphState {
  return createQuestionGraphInput({
    executionId: 'reviewer-integrity-test', documentId: 'doc-reviewer', documentVersion: 'v1', model: 'test-model', promptVersion: 'p1',
    execution: { pipelineVersion: 'test', status: 'running' },
    contextRefs: { chunkIds: ['chunk-1'], pageNumbers: [1], formulaEvidenceRefs: [], imageAssetIds: candidate.visualAssetIds ?? [] },
    candidates: [candidate],
  });
}

function candidate(overrides: Partial<ExtractedQuestionCandidate> = {}): ExtractedQuestionCandidate {
  return {
    candidateId: 'question-1', number: '1', statement: 'Qual alternativa responde à questão?',
    alternatives, correctAnswer: null, sourceChunkIds: ['chunk-1'], ...overrides,
  };
}

test('pedagogical alternatives alert is preserved while the answer agent still receives valid A-E', async () => {
  const initial = state(candidate());
  initial.agentResults['question-1'] = {
    alternatives, alternativesOrigin: 'AI_GENERATED',
    pendingIssues: ['ALTERNATIVES_CONTENT_REQUIRES_TEACHER_REVIEW', 'O contexto admite mais de uma interpretação pedagógica.'],
  };
  const answerRequests: string[] = [];
  const graph = createQuestionReviewerGraph({
    contextProvider: { async load() { return { text: 'Contexto da questão.', images: [] }; } },
    client: { async createStructuredChatCompletion<T>(request: any) {
      answerRequests.push(request.schemaName);
      return { answerLabel: 'A', foundInSource: false, evidence: 'Resolução pelo enunciado.', confidence: 0.9, unresolvedReason: null } as T;
    } },
  });

  const result = await graph.invoke(initial);

  assert.deepEqual(answerRequests, ['question_answer_key']);
  assert.equal(result.backendOutput[0]?.correctAnswer, 'A');
  assert.equal(result.stage, 'ready', 'the graph is complete while the question remains pending human review');
  assert.equal(result.execution?.status, 'completed_with_issues');
  assert.ok(result.backendOutput[0]?.pendingIssues.includes('ALTERNATIVES_CONTENT_REQUIRES_TEACHER_REVIEW'));
  assert.ok(result.backendOutput[0]?.pendingIssues.includes('O contexto admite mais de uma interpretação pedagógica.'));
  assert.equal(result.backendOutput[0]?.status, 'PENDING_REVIEW');
});

for (const issue of [
  'ALTERNATIVES_AGENT_FAILED',
  'ALTERNATIVES_AGENT_SCHEMA_INVALID',
  'ALTERNATIVES_AGENT_UNVERIFIED_CORRECTION',
  'ALTERNATIVES_AGENT_ASSERTIONS_NOT_PRESERVED',
  'ALTERNATIVES_AGENT_ASSERTION_CONTEXT_UNVERIFIED',
  'ALTERNATIVES_AGENT_ASSERTION_POSITION_UNVERIFIED',
  'ALTERNATIVES_AGENT_INCOMPLETE',
]) {
  test(`blocks answer routing when alternative integrity issue is unresolved: ${issue}`, async () => {
    const initial = state(candidate());
    initial.agentResults['question-1'] = { alternatives, pendingIssues: [issue] };

    const result = await createQuestionReviewerGraph().invoke(initial);

    assert.equal(result.attempts['question-1:answer'], undefined);
    assert.ok(result.backendOutput[0]?.pendingIssues.includes(issue));
    assert.equal(result.backendOutput[0]?.correctAnswer, null);
    assert.equal(result.execution?.status, 'completed_with_issues');
    assert.notEqual(result.stage, 'ready');
  });
}

test('missing explicitly linked image blocks answer routing even when A-E are structurally complete', async () => {
  const imageIssue = 'VISUAL_CONTEXT_VISUAL_ASSET_DOWNLOAD_FAILED:asset-required-by-question';
  const initial = state(candidate({ visualAssetIds: ['asset-required-by-question'] }));
  initial.agentResults['question-1'] = { alternatives, pendingIssues: [imageIssue] };

  const result = await createQuestionReviewerGraph().invoke(initial);

  assert.equal(result.attempts['question-1:answer'], undefined);
  assert.ok(result.backendOutput[0]?.pendingIssues.includes(imageIssue));
  assert.equal(result.execution?.status, 'completed_with_issues');
  assert.notEqual(result.stage, 'ready');
});

test('unavailable unrelated global image does not block a candidate without a visual reference', async () => {
  const globalImageIssue = 'VISUAL_CONTEXT_VISUAL_ASSET_DOWNLOAD_FAILED:unrelated-image';
  const initial = state(candidate());
  initial.agentResults['question-1'] = { alternatives, pendingIssues: [globalImageIssue] };

  const result = await createQuestionReviewerGraph().invoke(initial);

  assert.equal(result.attempts['question-1:answer'], 1);
  assert.ok(result.backendOutput[0]?.pendingIssues.includes(globalImageIssue));
});
