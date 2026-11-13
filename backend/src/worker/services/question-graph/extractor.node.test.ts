import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuestionExtractorGraph, createQuestionExtractorNode } from './extractor.node.js';

const candidate = {
  number: '01',
  statement: 'Calcule dois mais dois.',
  alternatives: [{ label: 'A', text: '4' }],
  correctAnswer: null,
  institution: null,
  year: null,
  sourceChunkIds: ['chunk-1'],
  visualEvidence: [],
};

test('extractor node returns the validated structured candidates and LLM call count', async () => {
  const calls: string[] = [];
  const node = createQuestionExtractorNode({
    extractCandidates: async (documentId: string) => {
      calls.push(documentId);
      return { questions: [candidate], llmCalls: 1 };
    },
  } as never);

  const result = await node({ documentId: 'document-1', questions: [], llmCalls: 0 });

  assert.deepEqual(calls, ['document-1']);
  assert.deepEqual(result, { questions: [candidate], llmCalls: 1 });
});

test('extractor graph invokes the extraction node and returns its structured output', async () => {
  const graph = createQuestionExtractorGraph({
    extractCandidates: async (documentId: string) => ({
      questions: [{ ...candidate, statement: `Extraído de ${documentId}.` }],
      llmCalls: 1,
    }),
  } as never);

  const result = await graph.invoke({ documentId: 'document-2' });

  assert.equal(result.documentId, 'document-2');
  assert.equal(result.llmCalls, 1);
  assert.equal(result.questions[0]?.statement, 'Extraído de document-2.');
});
