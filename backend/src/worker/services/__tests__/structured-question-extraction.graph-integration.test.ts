import assert from 'node:assert/strict';
import test from 'node:test';
import { MemorySaver } from '@langchain/langgraph';
import type { QuestionGraphState } from '../question-graph/state.js';
import { DurableQuestionGraphCheckpointBackend } from '../question-graph/checkpoint.js';
import { StructuredQuestionExtractionService } from '../structured-question-extraction.service.js';

const sourceQuestion = {
  number: '04', statement: 'Analise a figura apresentada no gráfico e responda.',
  alternatives: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Opção ${label}` })),
  correctAnswer: null, institution: 'IF', year: 2026, sourceChunkIds: ['chunk-1'],
  visualEvidence: [{ assetId: 'figure-1', role: 'STATEMENT' as const, alternativeLabel: null, anchorText: 'figura apresentada' }],
};

function makeHarness(
  graphOutput: QuestionGraphState['backendOutput'],
  events: string[],
  graphEnabled = false,
  checkpointBackend?: { saver: object },
  onGraphInput?: (input: QuestionGraphState) => void,
) {
  const document = {
    id: 'doc-graph', teacherId: 'teacher', monitorId: 'monitor', subjectId: 'subject', topicId: null,
    chunks: [{ id: 'chunk-1', chunkIndex: 0, text: 'Questão 04: Analise a figura apresentada no gráfico e responda.', pages: [4], status: 'READY', docHash: 'a'.repeat(64) }],
    images: [{ id: 'figure-1', assetKind: 'FIGURE' as const, pageNumber: 4, storagePath: 'figures/q4.png', mimeType: 'image/png', chunkIds: ['chunk-1'], width: 320, height: 200, caption: null, bbox: [10, 20, 330, 220], readingOrder: 2, sourceItemRef: '#/pictures/4' }],
  };
  const client = { async createStructuredChatCompletion() { events.push('extract'); return { questions: [sourceQuestion] }; } };
  const repository = {
    async load() { return document; },
    async save(_document: unknown, candidate: Record<string, unknown>, images: unknown[]) {
      events.push('save');
      return JSON.stringify({ candidate, images });
    },
  };
  const graphRunner = {
    async invoke(input: QuestionGraphState) {
      events.push('graph');
      onGraphInput?.(input);
      assert.equal(input.documentId, document.id);
      assert.equal(input.documentVersion, 'a'.repeat(64));
      assert.deepEqual(input.contextRefs.chunkIds, ['chunk-1']);
      assert.deepEqual(input.contextRefs.imageAssetIds, ['figure-1']);
      assert.equal(input.candidates[0]?.number, '04');
      assert.ok(input.candidates[0]?.candidateId);
      assert.equal(input.candidates[0]?.sourceRefs?.evidenceRefs[0], 'chunk-1');
      const state = { ...input, backendOutput: graphOutput };
      return state;
    },
  };
  return new StructuredQuestionExtractionService(client as never, repository as never, 1000,
    async () => ({ dataUrl: 'data:image/png;base64,cG5n', error: false }), graphRunner as never, graphEnabled,
    checkpointBackend as never);
}

test('executa LangGraph antes de persistir e mantém proveniência, pendências e figura', async () => {
  const events: string[] = [];
  const output = {
    questionNumber: '04', statement: sourceQuestion.statement, kind: 'MULTIPLE_CHOICE' as const,
    alternatives: sourceQuestion.alternatives, correctAnswer: 'C', institution: 'IF', year: 2026,
    alternativesGenerated: false, answerGenerated: true, alternativesOrigin: 'SOURCE_DOCUMENT' as const,
    correctAnswerOrigin: 'AI_GENERATED' as const, sourceChunkIds: ['chunk-1'], visualEvidence: sourceQuestion.visualEvidence,
    needsReview: true as const, status: 'PENDING_REVIEW' as const, pendingIssues: ['ANSWER_PROPOSAL_REQUIRES_TEACHER_REVIEW'],
  };
  const service = makeHarness([output], events);
  const result = await service.processDocument('doc-graph');

  assert.deepEqual(events, ['extract', 'graph', 'save']);
  assert.equal(result.graphStatus, 'completed_with_issues');
  const persisted = JSON.parse(result.questions[0]!.id) as { candidate: Record<string, unknown>; images: Array<{ id: string }> };
  assert.equal(persisted.candidate.correctAnswer, 'C');
  assert.equal(persisted.candidate.correctAnswerOrigin, 'AI_GENERATED');
  assert.deepEqual(persisted.candidate.pendingIssues, ['ANSWER_PROPOSAL_REQUIRES_TEACHER_REVIEW']);
  assert.equal(persisted.candidate.reviewStatus, 'PENDING_REVIEW');
  assert.equal(persisted.candidate.contentReview, 'needs_review');
  assert.deepEqual(persisted.images.map(({ id }) => id), ['figure-1']);
});

test('não persiste fragmento sinalizado pelo revisor do grafo', async () => {
  const events: string[] = [];
  const output = {
    questionNumber: '04', statement: 'https://example.test/q4', kind: 'MULTIPLE_CHOICE' as const,
    alternatives: [], correctAnswer: null, institution: null, year: null,
    alternativesGenerated: false, answerGenerated: false, alternativesOrigin: null, correctAnswerOrigin: null,
    sourceChunkIds: ['chunk-1'], visualEvidence: [], needsReview: true as const, status: 'PENDING_REVIEW' as const,
    pendingIssues: ['STATEMENT_URL_OR_EMPTY_FRAGMENT'],
  };
  const service = makeHarness([output], events);
  const result = await service.processDocument('doc-graph');
  assert.deepEqual(events, ['extract', 'graph']);
  assert.equal(result.questions.length, 0);
  assert.equal(result.graphStatus, 'completed_with_issues');
  assert.deepEqual(result.skippedCandidates, [{ questionNumber: '04', pendingIssues: ['STATEMENT_URL_OR_EMPTY_FRAGMENT'] }]);
});

test('falha fechado se a flag ligar o grafo sem checkpointer durável injetado', async () => {
  const events: string[] = [];
  const service = new StructuredQuestionExtractionService(
    { async createStructuredChatCompletion() { events.push('extract'); return { questions: [{ ...sourceQuestion, visualEvidence: [] }] }; } } as never,
    { async load() { return {
      id: 'doc-graph', teacherId: 'teacher', monitorId: 'monitor', subjectId: 'subject', topicId: null,
      chunks: [{ id: 'chunk-1', chunkIndex: 0, text: 'Questão 04: Analise a figura apresentada no gráfico e responda.', pages: [4], status: 'READY', docHash: 'a'.repeat(64) }],
      images: [],
    }; }, async save() { events.push('save'); return 'unexpected'; } } as never,
    1000, async () => ({ dataUrl: null, error: false }), undefined, true,
    { saver: new MemorySaver() } as never,
  );

  await assert.rejects(service.processDocument('doc-graph'), /checkpointer Postgres durável/i);
  assert.deepEqual(events, [], 'o fluxo deve falhar fechado antes de chamar o extrator se não há saver durável');
});

test('executionId permanece igual em tentativas da mesma versão de documento, pipeline e prompt', async () => {
  const events: string[] = [];
  const executionIds: string[] = [];
  // This runner seam verifies service identity wiring only; the checkpoint QA
  // suite separately verifies persistence/restart behavior against saver APIs.
  const durableSaverMarker = Object.create(DurableQuestionGraphCheckpointBackend.prototype);
  const service = makeHarness([
    {
      questionNumber: '04', statement: sourceQuestion.statement, kind: 'MULTIPLE_CHOICE',
      alternatives: sourceQuestion.alternatives, correctAnswer: 'C', institution: 'IF', year: 2026,
      alternativesGenerated: false, answerGenerated: true, alternativesOrigin: 'SOURCE_DOCUMENT',
      correctAnswerOrigin: 'AI_GENERATED', sourceChunkIds: ['chunk-1'], visualEvidence: sourceQuestion.visualEvidence,
      needsReview: true, status: 'PENDING_REVIEW', pendingIssues: ['ANSWER_PROPOSAL_REQUIRES_TEACHER_REVIEW'],
    },
  ], events, true, { saver: durableSaverMarker }, (input) => executionIds.push(input.executionId));

  await service.processDocument('doc-graph');
  await service.processDocument('doc-graph');

  assert.equal(executionIds.length, 2);
  assert.equal(executionIds[0], executionIds[1]);
  assert.match(executionIds[0]!, /:questions-langgraph-v1:question-extraction-review-2026-11-06$/);
  assert.deepEqual(events, ['extract', 'graph', 'save', 'extract', 'graph', 'save']);
});

test('flag ativa falha com instrução clara antes da extração se DATABASE_URL não estiver configurada', async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const events: string[] = [];
  const service = new StructuredQuestionExtractionService(
    { async createStructuredChatCompletion() { events.push('extract'); return { questions: [sourceQuestion] }; } } as never,
    { async load() { return {
      id: 'doc-graph', teacherId: 'teacher', monitorId: 'monitor', subjectId: 'subject', topicId: null,
      chunks: [{ id: 'chunk-1', chunkIndex: 0, text: 'Questão 04: Analise a figura apresentada no gráfico e responda.', pages: [4], status: 'READY', docHash: 'a'.repeat(64) }],
      images: [],
    }; }, async save() { events.push('save'); return 'unexpected'; } } as never,
    1000, async () => ({ dataUrl: null, error: false }), undefined, true,
  );

  try {
    await assert.rejects(service.processDocument('doc-graph'), /banco ou schema dedicado.*não está disponível/i);
    assert.deepEqual(events, [], 'checkpoint indisponível deve falhar antes de chamar extração ou persistência');
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});
