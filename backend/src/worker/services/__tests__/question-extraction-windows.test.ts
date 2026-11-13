import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQuestionExtractionWindows, reconcileWindowQuestions } from '../question-extraction-windows.js';

test('monta uma única solicitação cobrindo todos os chunks em ordem', () => {
  const chunks = Array.from({ length: 7 }, (_, index) => ({
    id: `chunk-${index}`, chunkIndex: index, text: `Chunk ${index} com texto de questão e alternativas.`, pages: [index + 1],
  }));
  const [request] = buildQuestionExtractionWindows(chunks, 10_000);
  assert.equal(buildQuestionExtractionWindows(chunks, 10_000).length, 1);
  assert.deepEqual(request!.chunks.map((chunk) => chunk.id), chunks.map((chunk) => chunk.id));
  assert.ok(request!.tokenCount > 0);
});

test('rejeita documento completo acima do orçamento em vez de dividi-lo', () => {
  assert.throws(() => buildQuestionExtractionWindows([
    { id: 'c1', chunkIndex: 0, text: 'palavra '.repeat(1000), pages: [1] },
    { id: 'c2', chunkIndex: 1, text: 'outra '.repeat(1000), pages: [2] },
  ], 20), /QUESTION_EXTRACTION_INPUT_TOO_LARGE/);
});

test('reconcilia duplicata textual por sobreposição sem fundir enunciados diferentes', () => {
  const candidates = [
    { text: 'Questão 1: quanto é 1+1?', sourceChunkIds: ['c1'] },
    { text: ' QUESTÃO 1: QUANTO É 1+1? ', sourceChunkIds: ['c1', 'c2'] },
    { text: 'Questão 1: quanto é 2+2?', sourceChunkIds: ['c2'] },
  ];
  const result = reconcileWindowQuestions(candidates);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0]!.sourceChunkIds, ['c1', 'c2']);
  assert.equal(result[1]!.text, candidates[2]!.text);
});
