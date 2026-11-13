import assert from 'node:assert/strict';
import test from 'node:test';
import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { QuestionGraphCheckpointSaver, createQuestionGraphCheckpointConfig } from '../checkpoint.js';
import { createQuestionGraphInput, createQuestionReviewerGraph } from '../reviewer.js';

test('checkpoint guard rejects an unlabelled sessionToken JWT before storage', async () => {
  const backend = new MemorySaver();
  const saver = new QuestionGraphCheckpointSaver(backend);
  const config = createQuestionGraphCheckpointConfig({ executionId: 'qa-exec', documentId: 'qa-doc', documentVersion: 'v1' });
  const jwt = `eyJ${'a'.repeat(70)}.${'b'.repeat(70)}.${'c'.repeat(70)}`;
  const graph = new StateGraph(Annotation.Root({ payload: Annotation<unknown>() }))
    .addNode('persist', (state) => ({ payload: { sessionToken: jwt } }))
    .addEdge(START, 'persist').addEdge('persist', END).compile({ checkpointer: saver });

  await assert.rejects(graph.invoke({ payload: null }, config as never), /token|sensível|credencial/i);
  const stored = await backend.getTuple(config as never);
  assert.ok(!JSON.stringify(stored).includes(jwt));
});

test('question reviewer graph actually uses the supplied durable checkpoint adapter', async () => {
  const backend = new MemorySaver();
  const saver = new QuestionGraphCheckpointSaver(backend);
  const input = createQuestionGraphInput({
    executionId: 'qa-checkpoint-exec', documentId: 'qa-doc', documentVersion: 'v1', model: 'test', promptVersion: 'p1',
    contextRefs: { chunkIds: ['chunk-1'], pageNumbers: [1], formulaEvidenceRefs: [], imageAssetIds: [] },
    candidates: [{ candidateId: 'q1', number: '1', statement: 'Questão de teste.', alternatives: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: label })), correctAnswer: null, sourceChunkIds: ['chunk-1'] }],
  });
  const config = createQuestionGraphCheckpointConfig({ executionId: input.executionId, documentId: input.documentId, documentVersion: input.documentVersion });
  const graph = createQuestionReviewerGraph({ checkpointer: saver } as never);
  await graph.invoke(input, config as never);

  assert.ok(await saver.getTuple(config as never), 'compiled question graph must persist state through the provided saver');
});

test('checkpoint guard rejects an opaque credential stored under a generic token key', async () => {
  const backend = new MemorySaver();
  const saver = new QuestionGraphCheckpointSaver(backend);
  const config = createQuestionGraphCheckpointConfig({ executionId: 'qa-opaque-token', documentId: 'qa-doc', documentVersion: 'v1' });
  const opaqueToken = 'opaque-credential-' + 'x'.repeat(48);
  const graph = new StateGraph(Annotation.Root({ payload: Annotation<unknown>() }))
    .addNode('persist', () => ({ payload: { token: opaqueToken } }))
    .addEdge(START, 'persist').addEdge('persist', END).compile({ checkpointer: saver });

  await assert.rejects(graph.invoke({ payload: null }, config as never), /token|sensível|credencial/i);
  const stored = await backend.getTuple(config as never);
  assert.ok(!JSON.stringify(stored).includes(opaqueToken));
});
