import assert from 'node:assert/strict';
import test from 'node:test';
import { MemorySaver } from '@langchain/langgraph';
import type { QuestionGraphState } from '../question-graph/state.js';
import { StructuredQuestionExtractionService } from '../structured-question-extraction.service.js';

const choices = ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Opção ${label}` }));
function extractedQuestion(number: string, chunkId: string, statement = `Questão ${number} avalia o conceito apresentado.`) {
  return { number, statement, alternatives: choices, correctAnswer: null, institution: 'IF', year: 2026, sourceChunkIds: [chunkId], visualEvidence: [] };
}
function document(chunks: string[]) {
  return {
    id: 'doc-qa-graph', teacherId: 'teacher', monitorId: 'monitor', subjectId: 'subject', topicId: null,
    chunks: chunks.map((id, index) => ({ id, chunkIndex: index, text: `Conteúdo do ${id}.`, pages: [index + 1], status: 'READY', docHash: 'b'.repeat(64) })),
    images: [],
  };
}

function output(questionNumber: string, sourceChunkIds: string[], overrides: Record<string, unknown> = {}) {
  return {
    questionNumber, statement: `Questão ${questionNumber} avalia o conceito apresentado.`, kind: 'MULTIPLE_CHOICE' as const,
    alternatives: choices, correctAnswer: null, institution: 'IF', year: 2026,
    alternativesGenerated: false, answerGenerated: false, alternativesOrigin: 'SOURCE_DOCUMENT' as const,
    correctAnswerOrigin: null, sourceChunkIds, visualEvidence: [], needsReview: true as const,
    status: 'PENDING_REVIEW' as const, pendingIssues: [], ...overrides,
  };
}

test('P5 QA: persists a graph-consolidated candidate using its merged source refs, not source array index', async () => {
  const doc = document(['chunk-a', 'chunk-b']);
  const sourceQuestions = [extractedQuestion('01', 'chunk-a'), extractedQuestion('01', 'chunk-b')];
  const saved: Array<Record<string, unknown>> = [];
  const graphRunner = {
    async invoke(input: QuestionGraphState) {
      const canonical = {
        ...input.candidates[0]!, sourceChunkIds: ['chunk-a', 'chunk-b'],
        sourceRefs: { chunkIds: ['chunk-a', 'chunk-b'], pageNumbers: [1, 2], evidenceRefs: ['chunk-a', 'chunk-b'], visualAssetIds: [] },
      };
      return {
        ...input, candidates: [canonical],
        reviewDecisions: [{ candidateId: canonical.candidateId!, route: 'complete', missingAlternativeLabels: [], alternativesNeedRepair: false, missingAnswer: false, pendingIssues: [] }],
        backendOutput: [output('01', ['chunk-a', 'chunk-b'])],
      } as QuestionGraphState;
    },
  };
  const service = new StructuredQuestionExtractionService(
    { async createStructuredChatCompletion() { return { questions: sourceQuestions }; } } as never,
    { async load() { return doc; }, async save(_doc: unknown, candidate: Record<string, unknown>) { saved.push(candidate); return `saved-${saved.length}`; } } as never,
    1000, async () => ({ dataUrl: null, error: false }), graphRunner as never, false,
  );

  const result = await service.processDocument(doc.id);
  assert.equal(result.questions.length, 1);
  assert.deepEqual(saved[0]?.sourceChunkIds, ['chunk-a', 'chunk-b']);
});

test('P5 QA: feature flag off does not invoke graph and keeps the legacy persistence path explicit', async () => {
  const doc = document(['chunk-a']);
  const source = extractedQuestion('02', 'chunk-a', 'https://example.org/not-a-question');
  let saveCalls = 0;
  const service = new StructuredQuestionExtractionService(
    { async createStructuredChatCompletion() { return { questions: [source] }; } } as never,
    { async load() { return doc; }, async save() { saveCalls += 1; return 'legacy-saved'; } } as never,
    1000, async () => ({ dataUrl: null, error: false }), undefined, false,
  );

  const result = await service.processDocument(doc.id);
  assert.equal(saveCalls, 1);
  assert.equal(result.graphStatus, 'not_enabled');
  assert.equal(result.skippedCandidates.length, 0);
});

test('P5 QA: does not report a graph execution failure as completed when output is empty', async () => {
  const doc = document(['chunk-a']);
  let saveCalls = 0;
  const graphRunner = {
    async invoke(input: QuestionGraphState) {
      return { ...input, execution: { pipelineVersion: 'questions-langgraph-v1', status: 'failed' }, backendOutput: [] } as QuestionGraphState;
    },
  };
  const service = new StructuredQuestionExtractionService(
    { async createStructuredChatCompletion() { return { questions: [extractedQuestion('03', 'chunk-a')] }; } } as never,
    { async load() { return doc; }, async save() { saveCalls += 1; return 'saved'; } } as never,
    1000, async () => ({ dataUrl: null, error: false }), graphRunner as never, false,
  );

  const result = await service.processDocument(doc.id);
  assert.equal(result.graphStatus, 'failed');
  assert.equal(result.questions.length, 0);
  assert.equal(saveCalls, 0);
});

test('P5 QA: validates all graph outputs before the first persistence write', async () => {
  const doc = document(['chunk-a', 'chunk-b']);
  const sourceQuestions = [extractedQuestion('01', 'chunk-a'), extractedQuestion('02', 'chunk-b')];
  let saveCalls = 0;
  const graphRunner = {
    async invoke(input: QuestionGraphState) {
      return {
        ...input,
        backendOutput: [output('01', ['chunk-a']), output('02', ['chunk-not-in-document'])],
      } as QuestionGraphState;
    },
  };
  const service = new StructuredQuestionExtractionService(
    { async createStructuredChatCompletion() { return { questions: sourceQuestions }; } } as never,
    { async load() { return doc; }, async save() { saveCalls += 1; return `saved-${saveCalls}`; } } as never,
    1000, async () => ({ dataUrl: null, error: false }), graphRunner as never, false,
  );

  await assert.rejects(service.processDocument(doc.id), /identidade\/proveniência/);
  assert.equal(saveCalls, 0, 'invalid later output must not leave earlier candidates persisted');
});


test('P5 QA: MemorySaver cannot qualify as durable merely because the caller sets durable=true', async () => {
  const doc = document(['chunk-a']);
  const service = new StructuredQuestionExtractionService(
    { async createStructuredChatCompletion() { return { questions: [extractedQuestion('04', 'chunk-a', 'https://example.org/not-a-question')] }; } } as never,
    { async load() { return doc; }, async save() { return 'should-not-persist'; } } as never,
    1000, async () => ({ dataUrl: null, error: false }), undefined, true,
    { saver: new MemorySaver(), durable: true } as never,
  );

  await assert.rejects(service.processDocument(doc.id), /durable.*approved|persistent saver/i);
});

test('P5 QA: injected graph runner cannot bypass durable-checkpoint gate by omitting getState', async () => {
  const doc = document(['chunk-a']);
  let graphCalls = 0;
  const graphRunner = {
    async invoke(input: QuestionGraphState) {
      graphCalls += 1;
      return { ...input, backendOutput: [output('05', ['chunk-a'])] } as QuestionGraphState;
    },
  };
  const service = new StructuredQuestionExtractionService(
    { async createStructuredChatCompletion() { return { questions: [extractedQuestion('05', 'chunk-a')] }; } } as never,
    { async load() { return doc; }, async save() { return 'should-not-persist'; } } as never,
    1000, async () => ({ dataUrl: null, error: false }), graphRunner as never, true,
  );

  await assert.rejects(service.processDocument(doc.id), /durable.*approved|persistent saver/i);
  assert.equal(graphCalls, 0);
});
