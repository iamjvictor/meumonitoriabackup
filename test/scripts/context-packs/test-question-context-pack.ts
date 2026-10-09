import assert from 'node:assert/strict';

import { buildQuestionAgentContext, buildQuestionContextPack } from '../../../backend/src/worker/services/question-context-pack.service.js';

void (async () => {
  const basePack = await buildQuestionContextPack({
    documentId: 'doc-1',
    questionSpanId: 'span-1',
    questionSource: {
      statement: 'Uma questao de exemplo com enunciado estabilizado.',
      alternatives: [
        { label: 'A', text: 'Uma' },
        { label: 'B', text: 'Duas' },
      ],
      sourceElementIds: ['el-1', 'el-2'],
      sourceChunkIds: ['chunk-question-1'],
    },
    answerKeySource: {
      answer: 'B',
      confidence: 0.96,
      sourceElementIds: ['el-answer-1'],
      sourceChunkIds: ['chunk-answer-1'],
    },
    solutionSource: {
      content: 'Solucao explicita e curta.',
      confidence: 0.88,
      sourceElementIds: ['el-solution-1'],
      sourceChunkIds: ['chunk-solution-1'],
    },
    conceptSupport: [
      {
        content: 'Teoria de apoio sobre proporcao.',
        sourceChunkId: 'chunk-theory-1',
        sourceBlockId: 'block-theory-1',
        relevanceScore: 0.81,
      },
    ],
    visuals: [
      {
        assetId: 'asset-1',
        type: 'FIGURE',
        pageNumber: 3,
        bbox: { x: 1, y: 2, w: 3, h: 4 },
      },
    ],
    quality: {
      structuralStatus: 'VALID',
      mathLayoutStatus: 'VALID',
      warnings: ['none'],
    },
  });

  assert.equal(basePack.version, 'question-context-pack-v1');
  assert.equal(basePack.documentId, 'doc-1');
  assert.equal(basePack.questionSpanId, 'span-1');
  assert.deepStrictEqual(basePack.questionSource.sourceChunkIds, ['chunk-question-1']);
  assert.deepStrictEqual(basePack.answerKeySource?.sourceChunkIds, ['chunk-answer-1']);
  assert.deepStrictEqual(basePack.solutionSource?.sourceChunkIds, ['chunk-solution-1']);
  assert.equal(basePack.conceptSupport[0]?.sourceChunkId, 'chunk-theory-1');

  const alternativesContext = buildQuestionAgentContext(basePack, 'ALTERNATIVES');
  assert.match(alternativesContext, /QUESTION SOURCE/);
  assert.match(alternativesContext, /CONCEPT SUPPORT/);
  assert.doesNotMatch(alternativesContext, /ANSWER KEY SOURCE/);

  const answerContext = buildQuestionAgentContext(basePack, 'CORRECT_ANSWER');
  assert.match(answerContext, /ANSWER KEY SOURCE/);
  assert.match(answerContext, /SOLUTION SOURCE/);

  const explanationContext = buildQuestionAgentContext(basePack, 'EXPLANATION');
  assert.match(explanationContext, /SOLUTION SOURCE/);
  assert.match(explanationContext, /CONCEPT SUPPORT/);

  const auditContext = buildQuestionAgentContext(basePack, 'AUDIT');
  assert.match(auditContext, /QUESTION SOURCE/);
  assert.match(auditContext, /ANSWER KEY SOURCE/);
  assert.match(auditContext, /SOLUTION SOURCE/);
  assert.match(auditContext, /VISUALS/);

  console.log('question-context-pack: OK');
})().catch((error) => {
  throw error;
});
