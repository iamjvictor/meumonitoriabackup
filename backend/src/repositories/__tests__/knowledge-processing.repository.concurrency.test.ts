/* eslint-disable @typescript-eslint/no-explicit-any -- minimal Prisma transaction fake for lock contention tests */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { KnowledgeProcessingRepository, type CreateKnowledgeRunInput } from '../knowledge-processing.repository.js';

const baseInput: CreateKnowledgeRunInput = {
  documentId: 'b66c921e-20c9-4fc1-81da-a24b7f5e98fa',
  teacherId: '1c5bf912-8b08-44df-92b5-a791f15f4d51',
  monitorId: 'cf16a4ef-9f82-4701-8890-8bc39c8077ee',
  contentHash: 'a'.repeat(64), configurationHash: 'b'.repeat(64), parserVersion: 'docling-test',
  profile: {}, pageCount: 21, pageBudgetSeconds: 100, batchSize: 10,
};

test('concurrent planning for the same identity creates one run and one set of deterministic batches', async () => {
  const db = createTransactionalFake();
  const repository = new KnowledgeProcessingRepository(db as unknown as PrismaClient);
  const [first, second] = await Promise.all([
    repository.createOrResumeRun(baseInput),
    repository.createOrResumeRun(baseInput),
  ]);

  assert.equal(first.id, second.id);
  assert.equal(db.state.runCreates, 1);
  assert.equal(db.state.batches.size, 3);
  assert.deepEqual([...db.state.batches.values()].map((batch) => [batch.pageStart, batch.pageEnd]), [[1, 10], [11, 20], [21, 21]]);
});

test('same content hash cannot create another run with a conflicting page count or steal a global batch key', async () => {
  const db = createTransactionalFake();
  const repository = new KnowledgeProcessingRepository(db as unknown as PrismaClient);
  await repository.createOrResumeRun(baseInput);

  await assert.rejects(repository.createOrResumeRun({ ...baseInput, pageCount: 22 }), /contagem de páginas diverge/);
  assert.equal(db.state.runCreates, 1);
  assert.equal(db.state.batches.size, 3);
  for (const batch of db.state.batches.values()) assert.equal(batch.runId, db.state.runs[0]?.id);
});

test('an explicit restart key creates a fresh run once, keeps prior run, and gives each run its own deterministic batches', async () => {
  const db = createTransactionalFake();
  const repository = new KnowledgeProcessingRepository(db as unknown as PrismaClient);
  const original = await repository.createOrResumeRun(baseInput);
  db.state.runs[0]!.status = 'FAILED';

  const restarted = await repository.createOrResumeRun({ ...baseInput, pageBudgetSeconds: 500, explicitRestartKey: 'reprocess-job-1' });
  const retry = await repository.createOrResumeRun({ ...baseInput, pageBudgetSeconds: 500, explicitRestartKey: 'reprocess-job-1' });

  assert.notEqual(restarted.id, original.id);
  assert.equal(retry.id, restarted.id);
  assert.equal(restarted.pageBudgetSeconds, 500);
  assert.equal(db.state.runCreates, 2);
  assert.equal(db.state.batches.size, 6);
  assert.equal(db.state.runs[0]?.status, 'FAILED');
});

test('schema version is part of run identity, so it cannot add a second set of batches to the old run', async () => {
  const db = createTransactionalFake();
  const repository = new KnowledgeProcessingRepository(db as unknown as PrismaClient);
  const first = await repository.createOrResumeRun(baseInput);
  const second = await repository.createOrResumeRun({ ...baseInput, schemaVersion: 'knowledge-batch/v2', explicitRestartKey: 'reprocess-schema-v2' });
  assert.notEqual(first.id, second.id);
  assert.equal(second.schemaVersion, 'knowledge-batch/v2');
  assert.equal(db.state.batches.size, 6);
});

function createTransactionalFake() {
  const state: {
    runs: Array<Record<string, any>>;
    batches: Map<string, Record<string, any>>;
    runCreates: number;
    advisoryLocks: number;
    lockTails: Map<string, Promise<void>>;
  } = { runs: [], batches: new Map(), runCreates: 0, advisoryLocks: 0, lockTails: new Map() };
  let nextId = 0;
  const db = {
    async $transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
      const releases: Array<() => void> = [];
      const tx = {
        async $queryRaw(query: { values: unknown[] }) {
          const key = String(query.values[0]);
          state.advisoryLocks += 1;
          const prior = state.lockTails.get(key) ?? Promise.resolve();
          let release!: () => void;
          const gate = new Promise<void>((resolve) => { release = resolve; });
          const tail = prior.then(() => gate);
          state.lockTails.set(key, tail);
          await prior;
          releases.push(() => {
            release();
            if (state.lockTails.get(key) === tail) state.lockTails.delete(key);
          });
          return [];
        },
        knowledgeProcessingRun: {
          async findFirst(args: any) {
            const where = args.where;
            return state.runs.filter((run) => (!where.explicitRestartKey || run.explicitRestartKey === where.explicitRestartKey)
              && run.documentId === where.documentId
              && run.teacherId === where.teacherId && run.monitorId === where.monitorId
              && (where.contentHash === undefined || run.contentHash === where.contentHash)
              && (where.configurationHash === undefined || run.configurationHash === where.configurationHash)
              && (where.parserVersion === undefined || run.parserVersion === where.parserVersion)
              && (where.schemaVersion === undefined || run.schemaVersion === where.schemaVersion)
              && (!where.status?.in || where.status.in.includes(run.status)))
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
          },
          async create(args: any) {
            state.runCreates += 1;
            const run = { schemaVersion: 'knowledge-batch-v1', ...args.data, id: `run-${++nextId}`, status: 'QUEUED', createdAt: new Date(), batches: [] };
            state.runs.push(run);
            return run;
          },
          async updateMany() { return { count: 0 }; },
          async findUniqueOrThrow(args: any) {
            const run = state.runs.find((candidate) => candidate.id === args.where.id);
            if (!run) throw new Error('not found');
            return { ...run, batches: [...state.batches.values()].filter((batch) => batch.runId === run.id).sort((a, b) => a.pageStart - b.pageStart) };
          },
        },
        knowledgeProcessingBatch: {
          async upsert(args: any) {
            const compound = args.where.runId_batchKey;
            const key = `${compound.runId}:${compound.batchKey}`;
            const existing = state.batches.get(key);
            if (existing) return existing;
            const batch = { ...args.create, id: `batch-${++nextId}`, status: 'PENDING', attempts: 0 };
            state.batches.set(key, batch);
            return batch;
          },
        },
      };
      try { return await callback(tx); }
      finally { for (const release of releases.reverse()) release(); }
    },
  };
  return { ...db, state };
}
