import assert from 'node:assert/strict';
import test from 'node:test';
import { StructuredCompletionError } from '../../../client/openrouter.client.js';
import type { QuestionGraphState } from '../state.js';
import { createQuestionAnswerAgentNode } from '../answer.agent.js';

const alternatives = ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Resposta ${label}` }));
function state(overrides: Partial<QuestionGraphState> = {}): QuestionGraphState {
  return {
    executionId: 'run-1', documentId: 'doc-1', documentVersion: 'v1', model: 'deepseek/deepseek-v4.1-flash', promptVersion: 'p1',
    segments: [{ segmentId: 'exam-blue', pageStart: 1, pageEnd: 10, institution: 'IFF', examName: 'Seleção', year: 2026, modality: 'Regular', version: 'A', evidenceRefs: [] }],
    contextRefs: { chunkIds: ['chunk-1'], pageNumbers: [1], formulaEvidenceRefs: [], imageAssetIds: ['asset-1'] },
    candidates: [{ number: '01', segmentId: 'exam-blue', statement: 'Qual alternativa está correta?', alternatives, correctAnswer: null, sourceChunkIds: ['chunk-1'], visualAssetIds: ['asset-1'] }],
    reviewDecisions: [{ candidateId: 'candidate-1', route: 'answer', missingAlternativeLabels: [], alternativesNeedRepair: false, missingAnswer: true, pendingIssues: ['ANSWER_MISSING'] }],
    agentResults: {}, selectedRoute: 'answer', nextNode: null, selectedCandidateId: null, stage: 'awaiting_answer', attempts: {}, errors: [], backendOutput: [], ...overrides,
  };
}

function harness(response: unknown) {
  const calls: any[] = [];
  const contexts: any[] = [];
  const node = createQuestionAnswerAgentNode({
    async createStructuredChatCompletion(input: any) { calls.push(input); return response; },
  } as any, {
    async load(currentState, candidate) { contexts.push({ currentState, candidate }); return { text: 'Gabarito: alternativa C.', images: [] }; },
    async searchEvidence({ candidate, segmentId }: any) { return { query: 'gabarito', coverage: 'complete', hits: [{ evidenceId: 'answer-key-row-q1', kind: 'table', pageNumber: 9, segmentId, excerpt: `Gabarito ${candidate.number}: C` }] }; },
  });
  return { node, calls, contexts };
}

test('answer agent refuses to call the model without final A-E alternatives', async () => {
  const { node, calls, contexts } = harness({ answerLabel: 'C', foundInSource: true, evidence: 'Gabarito C', confidence: 0.9, unresolvedReason: null });
  const result = await node(state({ candidates: [{ ...state().candidates[0]!, alternatives: alternatives.slice(0, 3) }] }));
  assert.deepEqual(result, {});
  assert.equal(calls.length, 0);
  assert.equal(contexts.length, 0);
});

test('answer agent stores a source-supported answer against final alternatives', async () => {
  const { node, calls, contexts } = harness({ answerLabel: 'C', foundInSource: true, evidence: 'Gabarito 01: C', confidence: 0.94, unresolvedReason: null });
  const result = await node(state());
  assert.equal(calls.length, 1);
  assert.equal(contexts.length, 1);
  assert.equal(calls[0].model, 'deepseek/deepseek-v4.1-flash');
  assert.equal(calls[0].schemaName, 'question_answer_key');
  assert.equal(calls[0].maxTokens, null);
  assert.equal(calls[0].timeoutMs, null);
  assert.equal(calls[0].schema.properties.confidence.minimum, 0);
  assert.equal(calls[0].schema.properties.confidence.maximum, 1);
  assert.match(calls[0].messages[0].content[0].text, /Gabarito 01: C/);
  assert.equal(result.agentResults?.['candidate-1']?.correctAnswerOrigin, 'SOURCE_DOCUMENT');
  assert.deepEqual(result.agentResults?.['candidate-1']?.evidenceRefs?.map(({ evidenceId }) => evidenceId), ['answer-key-row-q1']);
});

test('answer agent maps a solved answer to the final alternative and marks AI origin', async () => {
  const { node } = harness({ answerLabel: 'B', foundInSource: false, evidence: 'A solução corresponde à alternativa B.', confidence: 0.88, unresolvedReason: null });
  const result = await node(state());
  assert.equal(result.agentResults?.['candidate-1']?.correctAnswer, 'B');
  assert.equal(result.agentResults?.['candidate-1']?.correctAnswerOrigin, 'AI_GENERATED');
});

test('answer agent resolves from the question when the context has no answer and retains low-confidence choice', async () => {
  const calls: any[] = [];
  const node = createQuestionAnswerAgentNode({
    async createStructuredChatCompletion<T>(input: any) {
      calls.push(input);
      return { answerLabel: 'C', foundInSource: false, evidence: 'Pelo enunciado e pelas alternativas, C é a melhor resposta.', confidence: 0.3, unresolvedReason: null } as T;
    },
  }, { async load() { return { text: '', images: [] }; } });
  const result = await node(state());
  assert.equal(calls.length, 1);
  assert.match(calls[0].messages[0].content[0].text, /Se não encontrar gabarito verificável, resolva a questão/);
  assert.equal(result.agentResults?.['candidate-1']?.correctAnswer, 'C');
  assert.equal(result.agentResults?.['candidate-1']?.correctAnswerOrigin, 'AI_GENERATED');
  assert.deepEqual(result.agentResults?.['candidate-1']?.pendingIssues, ['ANSWER_LOW_CONFIDENCE']);
});

test('answer agent retries a response outside the structured schema with corrective feedback', async () => {
  const calls: any[] = [];
  const node = createQuestionAnswerAgentNode({
    async createStructuredChatCompletion<T>(input: any) {
      calls.push(input);
      if (calls.length === 1) {
        throw new StructuredCompletionError('INVALID_SCHEMA', 'invalid schema', {
          model: 'deepseek/test', responseContent: '{"answerLabel":null}',
          validationError: { issueDetails: [{ path: ['answerLabel'], code: 'invalid_type' }] },
        });
      }
      return { answerLabel: 'B', foundInSource: false, evidence: 'A alternativa B resolve o problema.', confidence: 0.9, unresolvedReason: null } as T;
    },
  }, { async load() { return { text: '', images: [] }; } });
  const result = await node(state());
  assert.equal(calls.length, 2);
  assert.match(calls[1].messages.map((message: any) => typeof message.content === 'string' ? message.content : message.content.map((part: any) => part.text ?? '').join('\n')).join('\n'), /resposta anterior violou o schema/i);
  assert.equal(result.agentResults?.['candidate-1']?.correctAnswer, 'B');
  assert.deepEqual(result.agentResults?.['candidate-1']?.pendingIssues, []);
});

test('answer agent records model truncation as pending instead of aborting the document', async () => {
  const node = createQuestionAnswerAgentNode({
    async createStructuredChatCompletion() { throw new Error('A resposta estruturada terminou por limite de tokens.'); },
  }, {
    async load() { return { text: 'Contexto da questão.', images: [] }; },
  });
  const result = await node(state());
  assert.equal(result.agentResults?.['candidate-1']?.correctAnswer, null);
  assert.deepEqual(result.agentResults?.['candidate-1']?.pendingIssues, ['ANSWER_AGENT_FAILED']);
  assert.equal(result.errors?.[0]?.code, 'ANSWER_AGENT_FAILED');
});

test('answer agent forwards relevant image data URLs with the document context', async () => {
  const { node, calls } = harness({ answerLabel: 'A', foundInSource: true, evidence: 'Gabarito visual A', confidence: 0.9, unresolvedReason: null });
  const imageNode = createQuestionAnswerAgentNode({
    async createStructuredChatCompletion(input: any) { calls.push(input); return { answerLabel: 'A', foundInSource: true, evidence: 'Gabarito visual A', confidence: 0.9, unresolvedReason: null }; },
  } as any, {
    async load() { return { text: 'Questão sobre gráfico.', images: [{ assetId: 'asset-1', mimeType: 'image/png', dataUrl: 'data:image/png;base64,aW1hZ2U=', pageNumber: 1 }] }; },
  });
  await imageNode(state());
  const content = calls[0].messages[0].content as Array<{ type: string; image_url?: { url: string } }>;
  assert.equal(content[1]?.type, 'image_url');
  assert.equal(content[1]?.image_url?.url, 'data:image/png;base64,aW1hZ2U=');
  assert.equal(await node(state()).then((result) => result.agentResults?.['candidate-1']?.correctAnswer), 'A');
});
