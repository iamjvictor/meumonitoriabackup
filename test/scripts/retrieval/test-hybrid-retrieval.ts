import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HybridRetrievalService,
  calculateRetrievalOfflineMetrics,
  rankHybridRetrievalCandidates,
  type HybridRetrievalCandidate,
  type HybridRetrievalInput,
} from '../../../backend/src/worker/services/hybrid-retrieval.service.js';

function makeCandidate(overrides: Partial<HybridRetrievalCandidate> & Pick<HybridRetrievalCandidate, 'chunkId'>): HybridRetrievalCandidate {
  return {
    chunkId: overrides.chunkId,
    documentId: overrides.documentId ?? 'document-1',
    blockId: overrides.blockId ?? 'block-1',
    parentBlockId: overrides.parentBlockId ?? null,
    chunkIndex: overrides.chunkIndex ?? 0,
    blockType: overrides.blockType ?? 'THEORY',
    similarity: overrides.similarity ?? 0,
    lexicalScore: overrides.lexicalScore ?? 0,
    fusedScore: overrides.fusedScore ?? null,
    content: overrides.content ?? 'conteudo',
    pageStart: overrides.pageStart ?? null,
    pageEnd: overrides.pageEnd ?? null,
    sectionPath: overrides.sectionPath ?? null,
    isComplete: overrides.isComplete ?? true,
    incompleteReason: overrides.incompleteReason ?? null,
    reason: overrides.reason ?? null,
  };
}

test('faz fusao híbrida, exclui chunks incompletos e tira a própria questao do suporte externo', () => {
  const ranked = rankHybridRetrievalCandidates(
    [
      makeCandidate({
        chunkId: 'question',
        blockId: 'question-block',
        blockType: 'QUESTION',
        similarity: 0.99,
        lexicalScore: 0.99,
        content: 'questao atual',
        reason: 'CURRENT_QUESTION',
      }),
      makeCandidate({
        chunkId: 'theory-1',
        blockId: 'theory-block',
        parentBlockId: 'parent-a',
        blockType: 'THEORY',
        similarity: 0.46,
        lexicalScore: 0.94,
        content: 'definicao importante com termo exato',
      }),
      makeCandidate({
        chunkId: 'example-1',
        blockId: 'example-block',
        parentBlockId: 'parent-b',
        blockType: 'WORKED_EXAMPLE',
        similarity: 0.88,
        lexicalScore: 0.22,
        content: 'exemplo análogo',
      }),
      makeCandidate({
        chunkId: 'duplicate-child',
        blockId: 'theory-block-child',
        parentBlockId: 'parent-a',
        blockType: 'THEORY',
        similarity: 0.62,
        lexicalScore: 0.61,
        content: 'duplicado por parent',
      }),
      makeCandidate({
        chunkId: 'incomplete',
        blockId: 'incomplete-block',
        blockType: 'THEORY',
        similarity: 0.95,
        lexicalScore: 0.95,
        isComplete: false,
        incompleteReason: 'BROKEN_PARSE',
      }),
    ],
    {
      queryText: 'definicao importante',
      supportOnly: true,
      excludeChunkIds: ['question'],
      excludedBlockIds: ['question-block'],
      limit: 10,
    },
  );

  assert.equal(ranked[0]?.chunkId, 'theory-1');
  assert.equal(ranked.some((candidate) => candidate.chunkId === 'question'), false);
  assert.equal(ranked.some((candidate) => candidate.chunkId === 'incomplete'), false);
  assert.equal(ranked.filter((candidate) => candidate.parentBlockId === 'parent-a').length, 1);
  assert.equal(ranked.every((candidate) => candidate.blockType !== 'QUESTION'), true);
  assert.ok((ranked[0]?.fusedScore ?? 0) > (ranked[1]?.fusedScore ?? 0));
});

test('prioriza suporte explicito antes do retrieval e preserva o contexto estrutural', async () => {
  const service = new HybridRetrievalService({
    searchCandidates: async () => [
      makeCandidate({
        chunkId: 'fallback-theory',
        blockId: 'fallback-block',
        blockType: 'THEORY',
        similarity: 0.5,
        lexicalScore: 0.5,
      }),
    ],
    loadKnowledgeContext: async (candidates) => candidates.map((candidate) => ({
      id: candidate.blockId ?? candidate.chunkId,
      documentId: candidate.documentId,
      parentBlockId: candidate.parentBlockId,
      blockIndex: candidate.chunkIndex,
      type: candidate.blockType,
      title: null,
      normalizedContent: candidate.content,
      sectionPath: candidate.sectionPath,
      pageStart: candidate.pageStart,
      pageEnd: candidate.pageEnd,
      topicLinks: [],
      parent: candidate.parentBlockId
        ? {
          id: candidate.parentBlockId,
          title: 'parent',
          type: 'SECTION',
          normalizedContent: 'parent content',
          sectionPath: candidate.sectionPath,
          pageStart: candidate.pageStart,
          pageEnd: candidate.pageEnd,
        }
        : null,
    })),
    searchExplicitSupport: async () => ([
      makeCandidate({
        chunkId: 'answer-key',
        blockId: 'answer-key-block',
        blockType: 'ANSWER_KEY',
        similarity: 1,
        lexicalScore: 1,
        reason: 'EXPLICIT_SUPPORT',
      }),
    ]),
  });

  const result = await service.search({
    teacherId: 'teacher-1',
    monitorId: 'monitor-1',
    subjectId: 'subject-1',
    queryText: 'qual e o gabarito',
    queryEmbedding: [0.1, 0.2, 0.3],
    questionBlockId: 'question-block',
    questionDocumentId: 'document-1',
    questionNumber: '12',
    limit: 5,
  });

  assert.equal(result.citations[0]?.chunkId, 'answer-key');
  assert.equal(result.citations[0]?.reason, 'EXPLICIT_SUPPORT');
  assert.equal(result.contextBlocks[0]?.id, 'answer-key-block');
  assert.ok(result.metrics.recallAtK >= 0);
});

test('aplica filtros de documento, seção e tipo e mantém rerank deterministico', async () => {
  const searchInputs: HybridRetrievalInput[] = [];
  const service = new HybridRetrievalService({
    searchCandidates: async (input) => {
      searchInputs.push(input);
      return [
        makeCandidate({
          chunkId: 'wrong-document',
          documentId: 'document-2',
          blockId: 'wrong-document-block',
          blockType: 'THEORY',
          sectionPath: ['Capitulo 2', 'Frações'],
          similarity: 0.99,
          lexicalScore: 0.99,
        }),
        makeCandidate({
          chunkId: 'wrong-section',
          documentId: 'document-1',
          blockId: 'wrong-section-block',
          blockType: 'THEORY',
          sectionPath: ['Capitulo 3', 'Regra de três'],
          similarity: 0.98,
          lexicalScore: 0.98,
        }),
        makeCandidate({
          chunkId: 'wrong-type',
          documentId: 'document-1',
          blockId: 'wrong-type-block',
          blockType: 'QUESTION',
          sectionPath: ['Capitulo 2', 'Frações'],
          similarity: 0.97,
          lexicalScore: 0.97,
        }),
        makeCandidate({
          chunkId: 'deterministic-b',
          documentId: 'document-1',
          blockId: 'deterministic-block-b',
          chunkIndex: 2,
          blockType: 'THEORY',
          sectionPath: ['Capitulo 2', 'Frações'],
          similarity: 0.8,
          lexicalScore: 0.8,
        }),
        makeCandidate({
          chunkId: 'deterministic-a',
          documentId: 'document-1',
          blockId: 'deterministic-block-a',
          chunkIndex: 1,
          blockType: 'THEORY',
          sectionPath: ['Capitulo 2', 'Frações'],
          similarity: 0.8,
          lexicalScore: 0.8,
        }),
        makeCandidate({
          chunkId: 'incomplete',
          documentId: 'document-1',
          blockId: 'incomplete-block',
          blockType: 'THEORY',
          sectionPath: ['Capitulo 2', 'Frações'],
          similarity: 0.95,
          lexicalScore: 0.95,
          isComplete: false,
          incompleteReason: 'BROKEN_PARSE',
        }),
      ];
    },
    loadKnowledgeContext: async (candidates) => candidates.map((candidate) => ({
      id: candidate.blockId ?? candidate.chunkId,
      documentId: candidate.documentId,
      parentBlockId: candidate.parentBlockId,
      blockIndex: candidate.chunkIndex,
      type: candidate.blockType,
      title: null,
      normalizedContent: candidate.content,
      sectionPath: candidate.sectionPath,
      pageStart: candidate.pageStart,
      pageEnd: candidate.pageEnd,
      topicLinks: [],
      parent: candidate.parentBlockId
        ? {
          id: candidate.parentBlockId,
          title: 'parent',
          type: 'SECTION',
          normalizedContent: 'parent content',
          sectionPath: candidate.sectionPath,
          pageStart: candidate.pageStart,
          pageEnd: candidate.pageEnd,
        }
        : null,
    })),
    searchExplicitSupport: async () => [],
  });

  const result = await service.search({
    teacherId: 'teacher-1',
    monitorId: 'monitor-1',
    subjectId: 'subject-1',
    documentId: 'document-1',
    sectionPath: ['Capitulo 2', 'Frações'],
    blockTypes: ['THEORY', 'WORKED_EXAMPLE'],
    queryText: 'frações',
    queryEmbedding: [0.1, 0.2, 0.3],
    limit: 5,
  });

  assert.equal(searchInputs[0]?.documentId, 'document-1');
  assert.deepEqual(searchInputs[0]?.sectionPath, ['Capitulo 2', 'Frações']);
  assert.deepEqual(searchInputs[0]?.blockTypes, ['THEORY', 'WORKED_EXAMPLE']);
  assert.equal(result.citations.map((candidate) => candidate.chunkId).join(','), 'deterministic-a,deterministic-b');
  assert.equal(result.citations.some((candidate) => candidate.chunkId === 'wrong-document'), false);
  assert.equal(result.citations.some((candidate) => candidate.chunkId === 'wrong-section'), false);
  assert.equal(result.citations.some((candidate) => candidate.chunkId === 'wrong-type'), false);
  assert.equal(result.citations.some((candidate) => candidate.chunkId === 'incomplete'), false);
});

test('calcula metricas offline de retrieval sem persistir colunas novas', () => {
  const metrics = calculateRetrievalOfflineMetrics({
    expectedChunkIds: ['a', 'b'],
    expectedBlockIds: ['block-a', 'block-b'],
    returnedChunkIds: ['x', 'a'],
    returnedBlockIds: ['block-x', 'block-a'],
    relevantReturnedChunkIds: ['a'],
  });

  assert.equal(metrics.recallAtK, 0.5);
  assert.equal(metrics.precisionAtK, 0.5);
  assert.equal(metrics.reciprocalRank, 0.5);
  assert.equal(metrics.mrr, 0.5);
  assert.ok(metrics.ndcg > 0);
  assert.equal(metrics.contextPrecision, 0.5);
  assert.equal(metrics.contextRecall, 0.5);
  assert.equal(metrics.irrelevantEvidenceRate, 0.5);
});

test('mantem a assinatura de entrada amigavel para o pipeline atual', () => {
  const input: HybridRetrievalInput = {
    teacherId: 'teacher-1',
    monitorId: 'monitor-1',
    subjectId: 'subject-1',
    queryText: 'definicao de fração',
    queryEmbedding: [0.1, 0.2],
  };

  assert.equal(input.teacherId, 'teacher-1');
  assert.equal(input.queryEmbedding.length, 2);
});
