import assert from 'node:assert/strict';
import test from 'node:test';
import { QuestionDocumentEvidenceSearch, type EvidenceSearchDataSource } from '../search-document-evidence.js';
import type { QuestionGraphState } from '../state.js';

const base = (): QuestionGraphState => ({
  executionId: 'qa-run', documentId: 'doc-scoped', documentVersion: 'hash-v1', model: 'test', promptVersion: 'p1',
  contextRefs: { chunkIds: [], pageNumbers: [], formulaEvidenceRefs: [], imageAssetIds: [] },
  candidates: [{ candidateId: 'q-blue-1', segmentId: 'blue', number: '1', statement: 'Questão azul', alternatives: [], correctAnswer: null, sourceChunkIds: [] }],
  segments: [{ segmentId: 'blue', pageStart: 2, pageEnd: 4, institution: 'Instituto azul', examName: 'Prova azul', year: 2025, modality: null, version: null, evidenceRefs: ['chunk-1'] }],
  reviewDecisions: [], agentResults: {}, selectedRoute: null, nextNode: null, selectedCandidateId: null, stage: null, attempts: {}, errors: [], backendOutput: [],
});
function source(overrides: Partial<EvidenceSearchDataSource> = {}): EvidenceSearchDataSource {
  return {
    async verifyDocument(id, version) { assert.equal(id, 'doc-scoped'); assert.equal(version, 'hash-v1'); return 'match'; },
    async lexicalChunks(_id, _q, _offset, _limit) { return [{ id: 'chunk-1', content: 'context', pageStart: 2, pageEnd: 2, chunkIndex: 0 }]; },
    async lexicalTables() { return []; }, async lexicalVisuals() { return []; }, async semanticChunks() { return []; }, async semanticVisuals() { return []; },
    async hasUnindexedVisuals() { return false; }, async hasMissingEmbeddings() { return false; }, ...overrides,
  };
}

test('QA AC-004: does not advertise a next page when the result count exactly exhausts the hits', async () => {
  const search = new QuestionDocumentEvidenceSearch(source(), { async createEmbeddings() { return [[0.1]]; } });
  const result = await search.search({ state: base(), candidateId: 'q-blue-1', query: 'context', intent: 'question_context', limit: 1 });
  assert.equal(result.hits.length, 1);
  assert.equal(result.nextCursor, null);
});

test('QA AC-002/005: retrieved hits preserve the authorized candidate segment association', async () => {
  const search = new QuestionDocumentEvidenceSearch(source(), { async createEmbeddings() { return [[0.1]]; } });
  const result = await search.search({ state: base(), candidateId: 'q-blue-1', query: 'context', intent: 'answer_key', segmentId: 'blue' });
  assert.ok(result.hits.length > 0);
  assert.ok(result.hits.every((hit) => hit.segmentId === 'blue'), 'evidence must retain the exam segment identity used to associate answer keys');
});

test('candidate segmentId alone does not associate unrelated evidence with that exam segment', async () => {
  const state = base();
  state.segments = [];
  const search = new QuestionDocumentEvidenceSearch(source(), { async createEmbeddings() { return [[0.1]]; } });
  const result = await search.search({ state, candidateId: 'q-blue-1', query: 'context', intent: 'answer_key', segmentId: 'blue' });
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0]?.segmentId, undefined, 'an unverified candidate.segmentId cannot be copied onto an unrelated hit');
  assert.ok(result.unresolvedReason?.includes('não puderam ser associadas'));
});

test('QA AC-004: rejects a pagination cursor reused for another query', async () => {
  const many = source({
    async lexicalChunks(_id, query, _offset, limit) { return Array.from({ length: Math.min(limit, 3) }, (_, i) => ({ id: `${query}-${i}`, content: query, pageStart: i + 1, pageEnd: i + 1, chunkIndex: i })); },
  });
  const search = new QuestionDocumentEvidenceSearch(many, { async createEmbeddings() { return [[0.1]]; } });
  const first = await search.search({ state: base(), candidateId: 'q-blue-1', query: 'gabarito', intent: 'answer_key', limit: 1 });
  assert.ok(first.nextCursor);
  const reused = await search.search({ state: base(), candidateId: 'q-blue-1', query: 'questão', intent: 'question_context', limit: 1, cursor: first.nextCursor });
  assert.equal(reused.coverage, 'failed', 'cursor scope must include query and execution identity');
});
