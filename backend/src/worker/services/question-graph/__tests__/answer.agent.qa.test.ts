import assert from 'node:assert/strict';
import test from 'node:test';
import type { QuestionGraphState } from '../state.js';
import { createQuestionAnswerAgentNode } from '../answer.agent.js';

const alternatives = ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Opção ${label}` }));
const baseState = (): QuestionGraphState => ({
  executionId: 'qa-run', documentId: 'doc-isolated-1', documentVersion: 'sha256:v1', model: 'deepseek/test', promptVersion: 'qa-v1',
  contextRefs: { chunkIds: ['chunk-question'], pageNumbers: [3], formulaEvidenceRefs: [], imageAssetIds: [] },
  candidates: [{ id: 'candidate-blue-q1', number: '1', segmentId: 'blue-book', institution: 'Example Institute', year: 2026, statement: 'Qual alternativa corresponde ao texto?', alternatives, correctAnswer: 'B', sourceChunkIds: ['chunk-question'] }],
  reviewDecisions: [{ candidateId: 'candidate-blue-q1', route: 'complete', missingAlternativeLabels: [], alternativesNeedRepair: false, missingAnswer: false, pendingIssues: [] }],
  agentResults: {}, selectedRoute: 'complete', nextNode: null, selectedCandidateId: 'candidate-blue-q1', stage: 'ready', attempts: {}, errors: [], backendOutput: [],
});

function harness(response: unknown, context = 'Gabarito da prova verde: questão 1 = C.') {
  const calls: any[] = [];
  const node = createQuestionAnswerAgentNode({
    async createStructuredChatCompletion(input: any) { calls.push(input); return response; },
  } as any, {
    async load() { return { text: context, images: [] }; },
  });
  return { node, calls };
}

test('QA AC-003: validates a prefilled compatible answer when it has no auditable source evidence', async () => {
  const { node, calls } = harness({ answerLabel: 'C', foundInSource: false, evidence: 'resolvido pela questão', confidence: 0.9, unresolvedReason: null });
  await node(baseState());
  assert.equal(calls.length, 1, 'compatible A-E answer alone must not bypass source/answer review');
});

test('QA AC-005: rejects a model claim of source evidence that is absent from retrieved context', async () => {
  const { node } = harness({ answerLabel: 'C', foundInSource: true, evidence: 'Gabarito oficial do caderno azul: questão 1 = C.', confidence: 0.99, unresolvedReason: null });
  const initial = baseState();
  const result = await node({ ...initial, candidates: [{ ...initial.candidates[0]!, correctAnswer: null }] });
  const answer = result.agentResults?.['candidate-blue-q1'];
  assert.notEqual(answer?.correctAnswerOrigin, 'SOURCE_DOCUMENT', 'source origin requires evidence verified against retrieval');
  assert.ok(answer?.pendingIssues.length, 'an unsupported citation must remain visible for review');
});

test('QA AC-003: gives the model the question number and segment identity', async () => {
  const { node, calls } = harness({ answerLabel: 'C', foundInSource: false, evidence: 'resolvido pela questão', confidence: 0.9, unresolvedReason: null });
  const initial = baseState();
  await node({ ...initial, candidates: [{ ...initial.candidates[0]!, correctAnswer: null }] });
  const prompt = calls[0].messages[0].content[0].text as string;
  assert.match(prompt, /questão\s*1/i);
  assert.match(prompt, /blue-book/i);
  assert.match(prompt, /candidate-blue-q1/i);
  assert.match(prompt, /sha256:v1/i);
});

test('QA AC-005: does not match a question number and answer split across separate answer-key rows', async () => {
  const state = baseState();
  state.candidates[0]!.correctAnswer = null;
  const node = createQuestionAnswerAgentNode({
    async createStructuredChatCompletion() {
      return { answerLabel: 'C', foundInSource: true, evidence: 'Prova azul questão 1 = A. Prova verde questão 1 = C.', confidence: 0.99, unresolvedReason: null };
    },
  } as any, {
    async load() { return { text: '', images: [] }; },
    async searchEvidence() { return { query: 'gabarito', coverage: 'complete', hits: [{ evidenceId: 'table:two-rows', kind: 'table', pageNumber: 10, segmentId: 'blue-book', excerpt: 'Prova azul questão 1 = A. Prova verde questão 1 = C.' }] }; },
  });
  const result = await node(state);
  assert.equal(result.agentResults?.['candidate-blue-q1']?.correctAnswerOrigin, 'AI_GENERATED');
  assert.ok(result.agentResults?.['candidate-blue-q1']?.pendingIssues.includes('ANSWER_SOURCE_EVIDENCE_UNVERIFIED'));
});

test('QA AC-005: does not accept inverse substring evidence that adds unsupported claims', async () => {
  const state = baseState();
  state.candidates[0]!.correctAnswer = null;
  const node = createQuestionAnswerAgentNode({
    async createStructuredChatCompletion() {
      return { answerLabel: 'C', foundInSource: true, evidence: 'Prova azul questão 1 = C. Esta linha também confirma o caderno verde e a página de aplicação.', confidence: 0.99, unresolvedReason: null };
    },
  } as any, {
    async load() { return { text: '', images: [] }; },
    async searchEvidence() { return { query: 'gabarito', coverage: 'complete', hits: [{ evidenceId: 'table:line', kind: 'table', pageNumber: 10, segmentId: 'blue-book', excerpt: 'Prova azul questão 1 = C.' }] }; },
  });
  const result = await node(state);
  assert.equal(result.agentResults?.['candidate-blue-q1']?.correctAnswerOrigin, 'AI_GENERATED');
  assert.ok(result.agentResults?.['candidate-blue-q1']?.pendingIssues.includes('ANSWER_SOURCE_EVIDENCE_UNVERIFIED'));
});
