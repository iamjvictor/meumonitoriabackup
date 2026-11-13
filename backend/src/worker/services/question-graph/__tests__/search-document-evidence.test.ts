import assert from 'node:assert/strict';
import test from 'node:test';
import { QuestionDocumentEvidenceSearch, type EvidenceSearchDataSource } from '../search-document-evidence.js';
import type { QuestionGraphState } from '../state.js';

const state = (): QuestionGraphState => ({
  executionId: 'exec-1', documentId: 'doc-authorized', documentVersion: 'hash-1', model: 'test-model', promptVersion: 'p1',
  contextRefs: { chunkIds: [], pageNumbers: [], formulaEvidenceRefs: [], imageAssetIds: [] },
  candidates: [{ candidateId: 'candidate-1', segmentId: 'seg-1', number: '1', statement: 'Questão teste', alternatives: [], correctAnswer: null, sourceChunkIds: [] }],
  reviewDecisions: [], agentResults: {}, selectedRoute: null, nextNode: null, selectedCandidateId: null, stage: null, attempts: {}, errors: [], backendOutput: [],
});

function source(overrides: Partial<EvidenceSearchDataSource> = {}): EvidenceSearchDataSource {
  return {
    async verifyDocument(id, version) { assert.equal(id, 'doc-authorized'); assert.equal(version, 'hash-1'); return 'match'; },
    async lexicalChunks(_id, _query, offset, limit) { return Array.from({ length: Math.min(limit, 3) }, (_, i) => ({ id: `chunk-${offset + i}`, content: 'gabarito questão', pageStart: offset + i + 1, pageEnd: offset + i + 1, chunkIndex: offset + i })); },
    async lexicalTables() { return [{ id: 'table-1', content: '1 A 2 B', pageStart: 20, pageEnd: 21, blockIndex: 1 }]; },
    async lexicalVisuals() { return [{ id: 'asset-1', description: 'Tabela de respostas', pageNumber: 22, bbox: { x: 1, y: 2, width: 3, height: 4 } }]; },
    async semanticChunks() { return [{ id: 'chunk-semantic', content: 'respostas', pageStart: 25, pageEnd: 25, score: 0.9 }]; },
    async semanticVisuals() { return []; },
    async hasUnindexedVisuals() { return false; },
    async hasMissingEmbeddings() { return false; },
    ...overrides,
  };
}

test('search scopes access to candidate and document identity from graph state', async () => {
  const search = new QuestionDocumentEvidenceSearch(source());
  const result = await search.search({ state: state(), candidateId: 'other-candidate', query: 'gabarito 1', intent: 'answer_key' });
  assert.equal(result.coverage, 'failed');
  assert.match(result.unresolvedReason ?? '', /não pertence/);
});

test('search returns lexical and semantic text, table and visual evidence with partial coverage when embeddings are unavailable', async () => {
  const search = new QuestionDocumentEvidenceSearch(source(), { async createEmbeddings() { return [[0.1, 0.2]]; } });
  const result = await search.search({ state: state(), candidateId: 'candidate-1', query: 'gabarito questão', intent: 'answer_key', limit: 10 });
  assert.equal(result.coverage, 'complete');
  assert.ok(result.hits.some((hit) => hit.kind === 'table'));
  assert.ok(result.hits.some((hit) => hit.kind === 'image' && hit.boundingBox?.x === 1));
  assert.ok(result.hits.some((hit) => hit.evidenceId === 'chunk:chunk-semantic'));
});

test('search reports partial when document contains visual assets that have no searchable description', async () => {
  const search = new QuestionDocumentEvidenceSearch(source({ async hasUnindexedVisuals() { return true; } }), { async createEmbeddings() { return [[0.1]]; } });
  const result = await search.search({ state: state(), candidateId: 'candidate-1', query: 'gabarito questão', intent: 'answer_key' });
  assert.equal(result.coverage, 'partial');
  assert.match(result.unresolvedReason ?? '', /assets visuais sem descrição/);
});

test('search rejects stale document versions and malformed cursors', async () => {
  const stale = new QuestionDocumentEvidenceSearch(source({ async verifyDocument() { return 'mismatch'; } }));
  const stateResult = await stale.search({ state: state(), candidateId: 'candidate-1', query: 'gabarito', intent: 'answer_key' });
  assert.equal(stateResult.coverage, 'failed');
  const badCursor = await new QuestionDocumentEvidenceSearch(source()).search({ state: state(), candidateId: 'candidate-1', query: 'gabarito', intent: 'answer_key', cursor: 'bad' });
  assert.equal(badCursor.coverage, 'failed');
});

test('search paginates lexical candidates without claiming visual completeness', async () => {
  let seen = 0;
  const search = new QuestionDocumentEvidenceSearch(source({
    async lexicalChunks(_id, _query, offset, limit) { seen = Math.max(seen, limit); return Array.from({ length: limit }, (_, i) => ({ id: `c${i}`, content: 'gabarito', pageStart: i + 1, pageEnd: i + 1, chunkIndex: i })); },
    async hasUnindexedVisuals() { return true; },
  }), { async createEmbeddings() { return [[0.1]]; } });
  const first = await search.search({ state: state(), candidateId: 'candidate-1', query: 'gabarito', intent: 'answer_key', limit: 2 });
  assert.equal(first.hits.length, 2);
  assert.ok(first.nextCursor);
  assert.equal(first.coverage, 'partial');
  const second = await search.search({ state: state(), candidateId: 'candidate-1', query: 'gabarito', intent: 'answer_key', cursor: first.nextCursor, limit: 2 });
  assert.equal(second.hits.length, 2);
  assert.ok(seen >= 3);
});

test('segment identity is attached only when explicit evidence refs or unique page bounds prove the association', async () => {
  const stateWithSegment = state();
  stateWithSegment.segments = [{ segmentId: 'seg-1', pageStart: 2, pageEnd: 8, institution: null, examName: null, year: null, modality: null, version: null, evidenceRefs: [] }];
  const segmentData = source({
    async lexicalChunks() { return [{ id: 'in-segment', content: 'gabarito', pageStart: 3, pageEnd: 3, chunkIndex: 1 }, { id: 'outside-segment', content: 'gabarito', pageStart: 20, pageEnd: 20, chunkIndex: 2 }]; },
    async lexicalTables() { return []; }, async lexicalVisuals() { return []; },
    async semanticChunks() { return []; }, async semanticVisuals() { return []; },
  });
  const result = await new QuestionDocumentEvidenceSearch(segmentData, { async createEmbeddings() { return [[0.1]]; } }).search({
    state: stateWithSegment, candidateId: 'candidate-1', query: 'gabarito questão', intent: 'answer_key', segmentId: 'seg-1',
  });
  assert.ok(result.hits.some((hit) => hit.segmentId === 'seg-1' && hit.pageNumber === 3));
  assert.ok(result.hits.some((hit) => hit.segmentId === undefined && hit.pageNumber === 20));
  assert.match(result.unresolvedReason ?? '', /não puderam ser associadas/);
});

test('pagination cursor cannot be reused with a different query, intent, candidate or limit', async () => {
  const many = source({
    async lexicalChunks(_id, query, _offset, limit) { return Array.from({ length: limit }, (_, i) => ({ id: `${query}-${i}`, content: query, pageStart: i + 1, pageEnd: i + 1, chunkIndex: i })); },
  });
  const search = new QuestionDocumentEvidenceSearch(many, { async createEmbeddings() { return [[0.1]]; } });
  const first = await search.search({ state: state(), candidateId: 'candidate-1', query: 'gabarito questão', intent: 'answer_key', limit: 2 });
  assert.ok(first.nextCursor);
  const reused = await search.search({ state: state(), candidateId: 'candidate-1', query: 'outra consulta', intent: 'answer_key', limit: 2, cursor: first.nextCursor });
  assert.equal(reused.coverage, 'failed');
});
