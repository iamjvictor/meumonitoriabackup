import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { Pool } from 'pg';
import { pathToFileURL } from 'node:url';
import {
  createQuestionGraphCheckpointConfig,
  invokeQuestionGraphIdempotently,
  QuestionGraphCheckpointSaver,
} from '../checkpoint.js';
import { PostgresQuestionGraphCheckpointBackend } from '../postgres-checkpoint.js';

const databaseUrl = process.env.QUESTION_GRAPH_QA_DATABASE_URL;
const enabled = process.env.RUN_QUESTION_GRAPH_POSTGRES_QA === '1';

function assertLoopbackPostgresUrl(value: string): void {
  const url = new URL(value);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname), 'QA database must be local loopback');
  assert.equal(url.protocol, 'postgresql:');
}

function graphSourcePaths(): { checkpoint: string; postgresCheckpoint: string } {
  const checkpoint = resolve('src/worker/services/question-graph/checkpoint.ts');
  const postgresCheckpoint = resolve('src/worker/services/question-graph/postgres-checkpoint.ts');
  assert.ok(existsSync(checkpoint) && existsSync(postgresCheckpoint), 'run this test from backend/');
  return { checkpoint, postgresCheckpoint };
}

test('local PostgreSQL checkpoint survives a worker process restart, resumes idempotently, and isolates source scope', {
  skip: !enabled ? 'set RUN_QUESTION_GRAPH_POSTGRES_QA=1 to run against disposable local dbtemp' : false,
}, async () => {
  assert.ok(databaseUrl, 'set QUESTION_GRAPH_QA_DATABASE_URL to the local dbtemp PostgreSQL URL');
  assertLoopbackPostgresUrl(databaseUrl);

  const schema = `qgraph_qa_${process.pid}_${randomBytes(5).toString('hex')}`;
  const firstPool = new Pool({ connectionString: databaseUrl });
  let secondPool: Pool | undefined;
  try {
    const firstBackend = new PostgresQuestionGraphCheckpointBackend(firstPool, { schema });
    await firstBackend.setup(); // Creates only this test's random, non-public schema using official LangGraph migrations.
    await firstBackend.assertSchemaReady();
    const firstSaver = new QuestionGraphCheckpointSaver(firstBackend);
    assert.equal(firstSaver.hasDurableBackend(), true);

    const scope = { executionId: `qa-${randomUUID()}`, documentId: 'qa-document', documentVersion: 'sha256:qa-v1' };
    const config = createQuestionGraphCheckpointConfig(scope);
    const stateSchema = Annotation.Root({
      executionId: Annotation<string>(),
      documentId: Annotation<string>(),
      documentVersion: Annotation<string>(),
      marker: Annotation<string>(),
      stage: Annotation<string | null>(),
      nextNode: Annotation<string>(),
      backendOutput: Annotation<unknown[]>({ reducer: (_left, right) => right, default: () => [] }),
    });
    const makeGraph = (checkpointer: QuestionGraphCheckpointSaver, interrupt: boolean) => new StateGraph(stateSchema)
      .addNode('extract', () => ({ marker: randomUUID() }))
      .addNode('review', () => {
        if (interrupt) throw new Error('simulated worker interruption after extraction checkpoint');
        return { stage: 'ready', nextNode: 'end', backendOutput: [{ questionId: 'qa-question', status: 'PENDING_REVIEW' }] };
      })
      .addEdge(START, 'extract')
      .addEdge('extract', 'review')
      .addEdge('review', END)
      .compile({ checkpointer });
    const firstGraph = makeGraph(firstSaver, true);
    const input = { ...scope, marker: '', stage: null, nextNode: 'review', backendOutput: [] };

    await assert.rejects(firstGraph.invoke(input, config as never), /simulated worker interruption/);
    const interruptedSnapshot = await firstGraph.getState(config as never);
    const savedMarker = (interruptedSnapshot.values as { marker?: string } | undefined)?.marker;
    assert.ok(savedMarker, 'the completed extraction node must be checkpointed before interruption');

    // A second Pool and a real child Node process model a worker restart.
    secondPool = new Pool({ connectionString: databaseUrl });
    const secondBackend = new PostgresQuestionGraphCheckpointBackend(secondPool, { schema });
    await secondBackend.assertSchemaReady();
    const secondSaver = new QuestionGraphCheckpointSaver(secondBackend);
    const otherScope = createQuestionGraphCheckpointConfig({ ...scope, documentId: 'another-document' });
    assert.equal(await secondSaver.getTuple(otherScope as never), undefined, 'checkpoint lookup must not cross document scope');

    const { checkpoint, postgresCheckpoint } = graphSourcePaths();
    const childSource = `
      import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
      import { Pool } from 'pg';
      import { randomUUID } from 'node:crypto';
      import { QuestionGraphCheckpointSaver, createQuestionGraphCheckpointConfig, invokeQuestionGraphIdempotently } from ${JSON.stringify(pathToFileURL(checkpoint).href)};
      import { PostgresQuestionGraphCheckpointBackend } from ${JSON.stringify(pathToFileURL(postgresCheckpoint).href)};
      const pool = new Pool({ connectionString: process.env.QUESTION_GRAPH_QA_DATABASE_URL });
      try {
        const backend = new PostgresQuestionGraphCheckpointBackend(pool, { schema: process.env.QUESTION_GRAPH_QA_SCHEMA });
        await backend.assertSchemaReady();
        const saver = new QuestionGraphCheckpointSaver(backend);
        const schema = Annotation.Root({
          executionId: Annotation(), documentId: Annotation(), documentVersion: Annotation(),
          marker: Annotation(), stage: Annotation(), nextNode: Annotation(),
          backendOutput: Annotation({ reducer: (_left, right) => right, default: () => [] }),
        });
        let extractionNodeRuns = 0;
        let reviewNodeRuns = 0;
        const graph = new StateGraph(schema)
          .addNode('extract', () => { extractionNodeRuns += 1; return { marker: randomUUID() }; })
          .addNode('review', () => { reviewNodeRuns += 1; return { stage: 'ready', nextNode: 'end', backendOutput: [{ questionId: 'qa-question', status: 'PENDING_REVIEW' }] }; })
          .addEdge(START, 'extract').addEdge('extract', 'review').addEdge('review', END).compile({ checkpointer: saver });
        const scope = { executionId: process.env.QUESTION_GRAPH_QA_EXECUTION_ID, documentId: 'qa-document', documentVersion: 'sha256:qa-v1' };
        const config = createQuestionGraphCheckpointConfig(scope);
        const result = await invokeQuestionGraphIdempotently(graph, { ...scope, marker: '', stage: null, nextNode: 'review', backendOutput: [] });
        const replay = await invokeQuestionGraphIdempotently(graph, { ...scope, marker: '', stage: null, nextNode: 'review', backendOutput: [] });
        process.stdout.write(JSON.stringify({ result, replay, extractionNodeRuns, reviewNodeRuns }));
      } finally { await pool.end(); }
    `;
    const childOutput = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', childSource], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        QUESTION_GRAPH_QA_DATABASE_URL: databaseUrl,
        QUESTION_GRAPH_QA_SCHEMA: schema,
        QUESTION_GRAPH_QA_EXECUTION_ID: scope.executionId,
      },
      timeout: 30_000,
    });
    const childResult = JSON.parse(childOutput) as {
      result: { marker: string; backendOutput: Array<{ status: string }> };
      replay: { marker: string };
      extractionNodeRuns: number;
      reviewNodeRuns: number;
    };
    assert.equal(childResult.result.marker, savedMarker, 'new worker process must resume from persisted extraction state');
    assert.equal(childResult.extractionNodeRuns, 0, 'resume must not repeat completed extraction');
    assert.equal(childResult.reviewNodeRuns, 1, 'failed review step should be resumed exactly once');
    assert.equal(childResult.replay.marker, savedMarker, 'completed checkpoint should be returned on replay');
    assert.equal(childResult.result.backendOutput[0]?.status, 'PENDING_REVIEW');

    const thirdSaver = new QuestionGraphCheckpointSaver(new PostgresQuestionGraphCheckpointBackend(secondPool, { schema }));
    const tampered = { configurable: { ...config.configurable, question_document_id: 'attacker-document' } };
    await assert.rejects(thirdSaver.getTuple(tampered as never), /scope|escopo/i);
  } finally {
    await secondPool?.end();
    await firstPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await firstPool.end();
  }
});
