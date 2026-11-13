import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuestionGraphInput, createQuestionReviewerGraph } from '../reviewer.js';

test('unverified corrections to existing A-E choices leave the question pending rather than ready', async () => {
  const sourceOptions = ['Apenas I e III.', 'Apenas I e II.', 'Apenas II e III.', 'Todas corretas.', 'Todas falsas.'];
  const original = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((label, index) => ({
    label,
    text: `Misread ${label}: ${sourceOptions[index % sourceOptions.length]}`,
  }));
  const graph = createQuestionReviewerGraph({
    contextProvider: { load: async () => ({ text: `Afirmações I, II e III.\n${sourceOptions.join('\n')}`, images: [] }) },
    client: {
      async createStructuredChatCompletion<T>(request: any): Promise<T> {
        if (request.schemaName === 'question_alternatives_completion') {
          return {
            alternatives: ['A', 'B', 'C', 'D', 'E'].map((label, index) => ({
              label,
              text: sourceOptions[index],
              origin: 'SOURCE_DOCUMENT',
              evidenceQuote: ['A', 'B', 'C'].includes(label) ? 'quote not present in source' : sourceOptions[index],
            })),
            corrections: ['A', 'B', 'C'].map((label, index) => ({ label, text: sourceOptions[index], evidenceQuote: 'quote not present in source' })),
            pendingIssue: null,
            optionsUsable: true,
          } as T;
        }
        return {
          answerLabel: 'D', foundInSource: true, evidence: 'Gabarito D', confidence: 0.9, unresolvedReason: null,
        } as T;
      },
    },
  });
  const result = await graph.invoke(createQuestionGraphInput({
    executionId: 'qa-unverified-correction', documentId: 'iff', documentVersion: 'v1',
    model: 'deepseek/test', promptVersion: 'qa',
    contextRefs: { chunkIds: ['c1'], pageNumbers: [1], formulaEvidenceRefs: [], imageAssetIds: [] },
    candidates: [{
      id: 'q28', number: '28', statement: 'Analise as afirmações I, II e III.', alternatives: original,
      correctAnswer: 'D', sourceChunkIds: ['c1'],
    }],
  }));

  assert.notEqual(result.stage, 'ready');
  assert.ok(result.backendOutput[0]?.pendingIssues.length);
});

test('source-supported final choices are accepted even when corrections do not repeat their evidence', async () => {
  const sourceOptions = ['Apenas I e III.', 'Apenas I e II.', 'Apenas II e III.', 'Todas corretas.', 'Todas falsas.'];
  const original = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((label, index) => ({
    label,
    text: `Misread ${label}: ${sourceOptions[index % sourceOptions.length]}`,
  }));
  const graph = createQuestionReviewerGraph({
    contextProvider: {
      load: async () => ({ text: `Afirmações I, II e III.\n${sourceOptions.join('\n')}`, images: [] }),
      searchEvidence: async () => ({ query: 'gabarito questão 28', coverage: 'complete', hits: [{
        evidenceId: 'answer-key-row-28', kind: 'table', pageNumber: 9, segmentId: 'exam-iff-2026', excerpt: 'Gabarito questão 28: D',
      }], nextCursor: null, unresolvedReason: null }),
    },
    client: {
      async createStructuredChatCompletion<T>(request: any): Promise<T> {
        if (request.schemaName === 'question_alternatives_completion') {
          return {
            alternatives: ['A', 'B', 'C', 'D', 'E'].map((label, index) => ({
              label, text: sourceOptions[index], origin: 'SOURCE_DOCUMENT', evidenceQuote: sourceOptions[index],
            })),
            // This metadata can describe movement but is not the evidence
            // source for the final alternative text.
            corrections: [{ label: 'A', text: 'Realocada da alternativa F', evidenceQuote: 'divergent correction metadata' }],
            pendingIssue: null,
            optionsUsable: true,
          } as T;
        }
        return {
          answerLabel: 'D', foundInSource: true, evidence: 'Gabarito questão 28: D', confidence: 0.9, unresolvedReason: null,
        } as T;
      },
    },
  });
  const result = await graph.invoke(createQuestionGraphInput({
    executionId: 'qa-source-supported-final-options', documentId: 'iff', documentVersion: 'v1',
    model: 'deepseek/test', promptVersion: 'qa',
    contextRefs: { chunkIds: ['c1'], pageNumbers: [1], formulaEvidenceRefs: [], imageAssetIds: [] },
    segments: [{ segmentId: 'exam-iff-2026', pageStart: 1, pageEnd: 12, institution: 'IF', examName: 'Prova 2026', year: 2026, modality: null, version: null, evidenceRefs: ['c1'] }],
    candidates: [{
      id: 'q28', candidateId: 'candidate-28', segmentId: 'exam-iff-2026', number: '28', statement: 'Analise as afirmações I, II e III.', alternatives: original,
      correctAnswer: 'D', sourceChunkIds: ['c1'], sourceRefs: { chunkIds: ['c1'], pageNumbers: [1], evidenceRefs: ['c1'], visualAssetIds: [] },
    }],
  }));

  assert.equal(result.stage, 'ready');
  assert.deepEqual(result.backendOutput[0]?.alternatives, ['A', 'B', 'C', 'D', 'E'].map((label, index) => ({ label, text: sourceOptions[index] })));
  assert.equal(result.backendOutput[0]?.pendingIssues.some((issue) => issue.startsWith('ALTERNATIVES_AGENT_')), false);
  assert.equal(result.backendOutput[0]?.correctAnswerOrigin, 'SOURCE_DOCUMENT');
  assert.deepEqual(result.backendOutput[0]?.sourceChunkIds, ['c1']);
});
