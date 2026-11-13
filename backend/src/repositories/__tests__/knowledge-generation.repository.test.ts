import assert from 'node:assert/strict';
import test from 'node:test';
import { KnowledgeGenerationRepository } from '../knowledge-generation.repository.js';

function fixture(input: { ready?: boolean; compareAndSwap?: boolean } = {}) {
  const state = { documentUpdate: null as unknown, generationUpdates: 0, runUpdates: 0, query: null as { sql: string; values: unknown[] } | null };
  const tx = {
    knowledgeDocumentGeneration: {
      async findFirst() { return { id: 'generation-new', runId: 'run-1', status: 'STAGING', pageCount: 11, chunkCount: 2, assetCount: 1 }; },
      async updateMany() { state.generationUpdates += 1; return { count: 1 }; },
    },
    knowledgeProcessingRun: {
      async findFirst() { return { id: 'run-1', pageCount: 11 }; },
      async updateMany() { state.runUpdates += 1; return { count: 1 }; },
    },
    monitorDocument: {
      async updateMany(args: unknown) {
        state.documentUpdate = args;
        return { count: input.compareAndSwap === false ? 0 : 1 };
      },
    },
    async $queryRaw(query: { sql: string; values: unknown[] }) {
      state.query = query;
      return [{ ready: input.ready ?? true }];
    },
  };
  const database = { async $transaction<T>(operation: (transaction: typeof tx) => Promise<T>) { return operation(tx); } };
  return { state, repository: new KnowledgeGenerationRepository(database as never) };
}

const scope = {
  documentId: 'document-1', teacherId: 'teacher-1', monitorId: 'monitor-1',
  generationId: 'generation-new', expectedActiveGenerationId: 'generation-old', leaseOwner: 'publisher-1',
  embeddingModel: 'embedding-test',
};

test('does not swap active generation when readiness checks find incomplete vectors', async () => {
  const { state, repository } = fixture({ ready: false });
  await assert.rejects(repository.activateGeneration(scope), /Geração incompleta/u);
  assert.equal(state.documentUpdate, null);
});

test('uses model-consistency predicates and swaps the pointer with compare-and-swap', async () => {
  const { state, repository } = fixture();
  assert.equal(await repository.activateGeneration(scope), true);
  assert.equal(state.query?.sql.includes('dc.embedding_model IS DISTINCT FROM'), true);
  assert.equal(state.query?.sql.includes('dvi.embedding_model IS DISTINCT FROM'), true);
  assert.ok(state.query?.values.includes(scope.embeddingModel));
  assert.deepEqual((state.documentUpdate as { where: { activeGenerationId: string } }).where.activeGenerationId, 'generation-old');
  assert.equal(state.generationUpdates, 2);
  assert.equal(state.runUpdates, 1);
});

test('leaves generations unchanged when another publisher wins the active-pointer CAS', async () => {
  const { state, repository } = fixture({ compareAndSwap: false });
  assert.equal(await repository.activateGeneration(scope), false);
  assert.equal(state.generationUpdates, 0);
  assert.equal(state.runUpdates, 0);
});
