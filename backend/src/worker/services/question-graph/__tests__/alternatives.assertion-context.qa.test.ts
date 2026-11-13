import assert from 'node:assert/strict';
import test from 'node:test';
import { createAlternativesAgentNode } from '../alternatives.agent.js';
import type { QuestionGraphState } from '../state.js';

const choices = ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Alternativa ${label}` }));
const statement = 'Com base no texto, assinale a alternativa correta.';
const assertion = 'I. A substância permanece estável em temperatura ambiente.';
function state(): QuestionGraphState {
  return {
    executionId: 'run-assertion-scope', documentId: 'document-mixed-exams', documentVersion: 'v1', model: 'test', promptVersion: 'p1',
    segments: [
      { segmentId: 'exam-blue', pageStart: 1, pageEnd: 4, institution: 'IF', examName: 'Blue', year: 2025, modality: null, version: null, evidenceRefs: ['chunk-blue-q1'] },
      { segmentId: 'exam-green', pageStart: 20, pageEnd: 25, institution: 'IF', examName: 'Green', year: 2024, modality: null, version: null, evidenceRefs: ['chunk-green-q8'] },
    ],
    contextRefs: { chunkIds: ['chunk-blue-q1', 'chunk-green-q8'], pageNumbers: [1, 22], formulaEvidenceRefs: [], imageAssetIds: [] },
    candidates: [{ candidateId: 'blue-q1', id: 'blue-q1', segmentId: 'exam-blue', number: '1', statement, alternatives: [
      ...choices, { label: 'F', text: assertion },
    ], correctAnswer: null, sourceChunkIds: ['chunk-blue-q1'], sourceRefs: {
      chunkIds: ['chunk-blue-q1'], pageNumbers: [1], evidenceRefs: ['chunk-blue-q1'], visualAssetIds: [],
    } }],
    reviewDecisions: [{ candidateId: 'blue-q1', route: 'alternatives', missingAlternativeLabels: [], alternativesNeedRepair: true, missingAnswer: true, pendingIssues: ['ALTERNATIVES_INCOMPLETE_OR_INVALID'] }],
    agentResults: {}, selectedRoute: 'alternatives', nextNode: 'alternatives_agent', selectedCandidateId: 'blue-q1',
    stage: 'awaiting_alternatives', attempts: {}, errors: [], backendOutput: [],
  };
}
function completion() {
  return { alternatives: choices.map((choice) => ({
    ...choice, origin: 'SOURCE_DOCUMENT' as const, evidenceQuote: choice.text,
  })), corrections: [], pendingIssue: null };
}

 test('assertion from another exam segment is not inserted into the current question stem', async () => {
  const input = state();
  const unrelatedChunk = `[páginas 22-22; chunk chunk-green-q8]\nQuestão 8 do caderno Green:\n${assertion}\nGabarito: B`;
  const context = `[páginas 1-1; chunk chunk-blue-q1]\n${statement}\n${choices.map(({ text }) => text).join('\n')}\n\n${unrelatedChunk}`;
  const node = createAlternativesAgentNode({
    contextProvider: { async load() { return { text: context, images: [] }; } },
    client: { async createStructuredChatCompletion<T>() { return completion() as T; } },
  });
  const result = await node(input);
  assert.equal(result.candidates?.[0]?.statement.includes(assertion), false, 'text from another segment cannot contaminate this candidate');
  assert.ok(result.agentResults?.['blue-q1']?.pendingIssues.includes('ALTERNATIVES_AGENT_ASSERTION_CONTEXT_UNVERIFIED'));
});

test('assertion with no candidate-local position anchor remains pending instead of being inserted by heuristic', async () => {
  const input = state();
  const context = `[páginas 1-1; chunk chunk-blue-q1]\n${statement}\n${choices.map(({ text }) => text).join('\n')}\n\n[páginas 2-2; chunk continuation-unknown]\n${assertion}`;
  const node = createAlternativesAgentNode({
    contextProvider: { async load() { return { text: context, images: [] }; } },
    client: { async createStructuredChatCompletion<T>() { return completion() as T; } },
  });
  const result = await node(input);
  assert.equal(result.candidates?.[0]?.statement, statement, 'without a source anchor, do not guess insertion order around the instruction');
  assert.ok(result.agentResults?.['blue-q1']?.pendingIssues.includes('ALTERNATIVES_AGENT_ASSERTION_POSITION_UNVERIFIED'));
});
