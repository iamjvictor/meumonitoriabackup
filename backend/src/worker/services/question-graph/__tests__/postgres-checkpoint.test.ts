import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool, PoolClient, QueryResult } from 'pg';
import type { CheckpointMetadata } from '@langchain/langgraph-checkpoint';
import { createQuestionGraphCheckpointConfig } from '../checkpoint.js';
import { PostgresQuestionGraphCheckpointBackend } from '../postgres-checkpoint.js';

type RecordedQuery = { text: string; values?: unknown[] };

function mockPool(options: { ready?: boolean } = {}) {
  const queries: RecordedQuery[] = [];
  const clientQueries: RecordedQuery[] = [];
  const pool = {
    async query(query: string | { text: string; values?: unknown[] }, values?: unknown[]) {
      const text = typeof query === 'string' ? query : query.text;
      const parameters = typeof query === 'string' ? values : query.values;
      queries.push({ text, values: parameters });
      const row = options.ready
        ? { table_0: 'question_graph_checkpoints.checkpoints', table_1: 'question_graph_checkpoints.checkpoint_blobs', table_2: 'question_graph_checkpoints.checkpoint_migrations', table_3: 'question_graph_checkpoints.checkpoint_writes' }
        : { table_0: null, table_1: null, table_2: null, table_3: null };
      return { rows: text.includes('to_regclass') ? [row] : [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] } as QueryResult;
    },
    async connect() {
      return {
        async query(query: string | { text: string; values?: unknown[] }, values?: unknown[]) {
          const text = typeof query === 'string' ? query : query.text;
          const parameters = typeof query === 'string' ? values : query.values;
          clientQueries.push({ text, values: parameters });
          return { rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] } as QueryResult;
        },
        release() {},
      } as PoolClient;
    },
  } as unknown as Pool;
  return { pool, queries, clientQueries };
}

const config = (executionId = 'execution-1') => createQuestionGraphCheckpointConfig({
  executionId,
  documentId: 'document-1',
  documentVersion: 'sha256:version-1',
});

test('constructor is lazy and assertSchemaReady only checks dedicated tables', async () => {
  const { pool, queries } = mockPool({ ready: true });
  const saver = new PostgresQuestionGraphCheckpointBackend(pool);

  assert.equal(queries.length, 0, 'constructor must not perform DDL or database access');
  await saver.assertSchemaReady();
  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /to_regclass/);
  assert.deepEqual(queries[0]!.values, [
    'question_graph_checkpoints.checkpoints',
    'question_graph_checkpoints.checkpoint_blobs',
    'question_graph_checkpoints.checkpoint_migrations',
    'question_graph_checkpoints.checkpoint_writes',
  ]);
});

test('readiness failure is clear and does not attempt schema creation', async () => {
  const { pool, queries } = mockPool();
  const saver = new PostgresQuestionGraphCheckpointBackend(pool, { schema: 'isolated_test' });

  await assert.rejects(saver.assertSchemaReady(), /Schema de checkpoints LangGraph indisponível ou incompleto: isolated_test/);
  assert.equal(queries.length, 1);
  assert.doesNotMatch(queries[0]!.text, /CREATE|ALTER|DROP/i);
});

test('validates question-graph thread and root namespace before reading or writing', async () => {
  const { pool, queries, clientQueries } = mockPool();
  const saver = new PostgresQuestionGraphCheckpointBackend(pool);
  const foreignConfig = { configurable: { thread_id: 'another-workflow', checkpoint_ns: '' } };

  await assert.rejects(saver.getTuple(foreignConfig), /fora do namespace autorizado/);
  await assert.rejects(saver.putWrites(foreignConfig, [], 'task-1'), /fora do namespace autorizado/);
  await assert.rejects(saver.list(config(), { before: foreignConfig })[Symbol.asyncIterator]().next(), /fora do namespace autorizado/);
  await assert.rejects(saver.list(config('execution-a'), { before: config('execution-b') })[Symbol.asyncIterator]().next(), /Cursor de listagem pertence a outra execução/);
  assert.equal(queries.length, 0);
  assert.equal(clientQueries.length, 0);
});

test('get/list are bound to hashed execution ids and delete rejects unrelated threads', async () => {
  const { pool, queries } = mockPool();
  const saver = new PostgresQuestionGraphCheckpointBackend(pool);
  const first = config('execution-a');
  const second = config('execution-b');

  assert.equal(await saver.getTuple(first), undefined);
  const listed = [];
  for await (const row of saver.list(second)) listed.push(row);
  assert.deepEqual(listed, []);
  await assert.rejects(saver.deleteThread('another-workflow'), /Recusa excluir thread/);
  assert.equal(queries.length, 2);
  assert.deepEqual(queries[0]!.values, [first.configurable.thread_id, '']);
  assert.deepEqual(queries[1]!.values, [second.configurable.thread_id, '']);
});

test('put is transactional and official SQL uses conflict-safe upsert for repeat writes', async () => {
  const { pool, clientQueries } = mockPool();
  const saver = new PostgresQuestionGraphCheckpointBackend(pool);
  const checkpoint = {
    v: 4,
    id: 'checkpoint-1',
    ts: new Date(0).toISOString(),
    channel_values: {},
    channel_versions: {},
    versions_seen: {},
    pending_sends: [],
  };

  const metadata: CheckpointMetadata = { source: 'input', step: 0, parents: {} };
  const saved = await saver.put(config(), checkpoint, metadata, {});

  assert.equal(saved.configurable?.checkpoint_id, checkpoint.id);
  assert.equal(clientQueries[0]!.text, 'BEGIN');
  assert.equal(clientQueries.at(-1)?.text, 'COMMIT');
  assert.equal(clientQueries.length, 3);
  assert.match(clientQueries[1]!.text, /ON CONFLICT \(thread_id, checkpoint_ns, checkpoint_id\)/);
});

test('putWrites is transactional and repeat writes are idempotent by official conflict key', async () => {
  const { pool, clientQueries } = mockPool();
  const saver = new PostgresQuestionGraphCheckpointBackend(pool);
  const checkpointConfig = { ...config(), configurable: { ...config().configurable, checkpoint_id: 'checkpoint-1' } };

  await saver.putWrites(checkpointConfig, [['answer', 'A']], 'task-1', 'reviewer');

  assert.equal(clientQueries[0]!.text, 'BEGIN');
  assert.equal(clientQueries.at(-1)?.text, 'COMMIT');
  assert.equal(clientQueries.length, 3);
  assert.match(clientQueries[1]!.text, /ON CONFLICT \(thread_id, checkpoint_ns, checkpoint_id, task_id, idx\)/);
});

test('deleteThread removes only a hashed question graph thread transactionally', async () => {
  const { pool, clientQueries } = mockPool();
  const saver = new PostgresQuestionGraphCheckpointBackend(pool);
  const targetThreadId = config().configurable.thread_id!;

  await saver.deleteThread(targetThreadId);

  assert.deepEqual(clientQueries.map(({ text }) => text.startsWith('DELETE') ? 'DELETE' : text), [
    'BEGIN', 'DELETE', 'DELETE', 'DELETE', 'COMMIT',
  ]);
  assert.ok(clientQueries.slice(1, 4).every(({ values }) => values?.[0] === targetThreadId));
});
