import assert from 'node:assert/strict';
import test from 'node:test';
import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import type { QuestionGraphState } from '../state.js';
import {
  QuestionGraphCheckpointSaver,
  createQuestionGraphCheckpointConfig,
  invokeQuestionGraphIdempotently,
} from '../checkpoint.js';

const scope = { executionId: 'exec-1', documentId: 'doc-1', documentVersion: 'sha256:v1' };

test('creates a stable checkpoint thread scoped to execution, document, and version', () => {
  const config = createQuestionGraphCheckpointConfig(scope);
  const sameConfig = createQuestionGraphCheckpointConfig(scope);
  const newDocumentVersion = createQuestionGraphCheckpointConfig({ ...scope, documentVersion: 'sha256:v2' });
  assert.equal(config.configurable?.thread_id, sameConfig.configurable?.thread_id);
  assert.notEqual(config.configurable?.thread_id, newDocumentVersion.configurable?.thread_id);
  assert.equal(config.configurable?.question_execution_id, scope.executionId);
  assert.equal(config.configurable?.question_document_id, scope.documentId);
  assert.equal(config.configurable?.question_document_version, scope.documentVersion);
});

test('isolates checkpoint lookup by execution, document, and version', async () => {
  const backend = new MemorySaver();
  const saver = new QuestionGraphCheckpointSaver(backend);
  const config = createQuestionGraphCheckpointConfig(scope);
  const tampered = { configurable: { ...config.configurable, question_document_id: 'other-doc' } };
  await assert.rejects(saver.getTuple(tampered as never), /scope|escopo/i);
  const otherScope = createQuestionGraphCheckpointConfig({ ...scope, documentId: 'other-doc' });
  assert.notEqual(config.configurable?.thread_id, otherScope.configurable?.thread_id);
  assert.equal(await saver.getTuple(otherScope as never), undefined);
});

test('rejects secret and base64 payloads before they reach checkpoint storage', async () => {
  const backend = new MemorySaver();
  const saver = new QuestionGraphCheckpointSaver(backend);
  const config = createQuestionGraphCheckpointConfig(scope);
  const graph = new StateGraph(Annotation.Root({ payload: Annotation<unknown>() }))
    .addNode('persist', () => ({ payload: { imageDataUrl: 'data:image/png;base64,aGVsbG8=' } }))
    .addEdge(START, 'persist').addEdge('persist', END).compile({ checkpointer: saver });

  await assert.rejects(graph.invoke({ payload: null }, config as never), /base64|segredo|sensível/i);
  const tuple = await backend.getTuple(config);
  assert.ok(tuple, 'LangGraph may have stored its pre-node checkpoint before the sensitive write was rejected');
  assert.doesNotMatch(JSON.stringify(tuple), /data:image\/png;base64|aGVsbG8=/i, 'no bytes or data URL reached storage');
});

test('works with LangGraph and reuses a completed execution after saver recreation', async () => {
  const backend = new MemorySaver(); // test fixture only; production requires an approved durable saver.
  const firstSaver = new QuestionGraphCheckpointSaver(backend);
  const secondSaver = new QuestionGraphCheckpointSaver(backend);
  let sideEffects = 0;
  const graphFor = (checkpointer: QuestionGraphCheckpointSaver) => new StateGraph(Annotation.Root({
    count: Annotation<number>({ reducer: (left, right) => left + right, default: () => 0 }),
    executionId: Annotation<string>(), documentId: Annotation<string>(), documentVersion: Annotation<string>(),
    backendOutput: Annotation<unknown[]>({ reducer: (_left, right) => right, default: () => [] }), stage: Annotation<string | null>(),
    nextNode: Annotation<string>(),
  })).addNode('finish', (state) => {
    sideEffects += 1;
    return { count: state.count + 1, backendOutput: [{ ok: true }], stage: 'ready', nextNode: 'end' };
  }).addEdge(START, 'finish').addEdge('finish', END).compile({ checkpointer });
  const input = { ...scope, count: 0, backendOutput: [], stage: null } as unknown as QuestionGraphState;
  const first = await invokeQuestionGraphIdempotently(graphFor(firstSaver), input);
  const replay = await invokeQuestionGraphIdempotently(graphFor(secondSaver), input);
  assert.equal(sideEffects, 1);
  assert.deepEqual((first as { backendOutput: unknown[] }).backendOutput, [{ ok: true }]);
  assert.deepEqual((replay as { backendOutput: unknown[] }).backendOutput, [{ ok: true }]);
});

test('resumes from a saved in-progress checkpoint after a node failure', async () => {
  const backend = new MemorySaver();
  const saver = new QuestionGraphCheckpointSaver(backend);
  let attempts = 0;
  const graph = new StateGraph(Annotation.Root({
    executionId: Annotation<string>(), documentId: Annotation<string>(), documentVersion: Annotation<string>(),
    value: Annotation<number>({ reducer: (_left, right) => right, default: () => 0 }),
    backendOutput: Annotation<unknown[]>({ reducer: (_left, right) => right, default: () => [] }), stage: Annotation<string | null>(), nextNode: Annotation<string>(),
  })).addNode('finish', (state) => {
    attempts += 1;
    if (attempts === 1) throw new Error('transient node failure');
    return { value: state.value + 1, backendOutput: [{ recovered: true }], stage: 'ready', nextNode: 'end' };
  }).addEdge(START, 'finish').addEdge('finish', END).compile({ checkpointer: saver });
  const input = { ...scope, value: 0, backendOutput: [], stage: null } as unknown as QuestionGraphState;
  await assert.rejects(invokeQuestionGraphIdempotently(graph, input), /transient node failure/);
  const recovered = await invokeQuestionGraphIdempotently(graph, input);
  assert.equal(attempts, 2);
  assert.equal((recovered as unknown as { value: number }).value, 1);
});

test('uses document version to isolate checkpoints for a reprocessed document', async () => {
  const backend = new MemorySaver();
  const v1 = new QuestionGraphCheckpointSaver(backend);
  const v2 = new QuestionGraphCheckpointSaver(backend);
  const schema = Annotation.Root({ value: Annotation<number>({ reducer: (_left, right) => right, default: () => 0 }) });
  const graph = (checkpointer: QuestionGraphCheckpointSaver) => new StateGraph(schema)
    .addNode('set', ({ value }) => ({ value: value + 1 })).addEdge(START, 'set').addEdge('set', END).compile({ checkpointer });
  await graph(v1).invoke({ value: 0 }, createQuestionGraphCheckpointConfig(scope) as never);
  await graph(v2).invoke({ value: 0 }, createQuestionGraphCheckpointConfig({ ...scope, documentVersion: 'sha256:v2' }) as never);
  assert.equal(await backend.getTuple(createQuestionGraphCheckpointConfig(scope) as never) !== undefined, true);
  assert.equal(await backend.getTuple(createQuestionGraphCheckpointConfig({ ...scope, documentVersion: 'sha256:v2' }) as never) !== undefined, true);
  assert.notEqual(createQuestionGraphCheckpointConfig(scope).configurable?.thread_id,
    createQuestionGraphCheckpointConfig({ ...scope, documentVersion: 'sha256:v2' }).configurable?.thread_id);
});
