import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuestionGraphInput, createQuestionReviewerGraph } from '../reviewer.js';

const generatedAlternatives = ['A', 'B', 'C', 'D', 'E'].map((label) => ({
  label, text: `Opção ${label}`, origin: 'AI_GENERATED', evidenceQuote: null,
}));

test('unavailable visual asset from either completion node prevents ready and reaches backend review output', async () => {
  const graph = createQuestionReviewerGraph({
    contextProvider: {
      async load() {
        return {
          text: 'Pendências de contexto visual: [QUESTION_GRAPH_CONTEXT_ISSUE] VISUAL_ASSET_DOWNLOAD_FAILED:asset-1',
          images: [],
          unresolvedIssues: ['VISUAL_ASSET_DOWNLOAD_FAILED:asset-1'],
        };
      },
    },
    client: {
      async createStructuredChatCompletion<T>(request: any) {
        if (request.schemaName === 'question_alternatives_completion') {
          return { alternatives: generatedAlternatives, corrections: [], pendingIssue: null } as T;
        }
        return { answerLabel: 'A', foundInSource: false, evidence: 'Resolução gerada.', confidence: 0.9, unresolvedReason: null } as T;
      },
    },
  });
  const initial = createQuestionGraphInput({
    executionId: 'visual-pending', documentId: 'doc-visual', documentVersion: 'v1', model: 'test-model', promptVersion: 'p1',
    contextRefs: { chunkIds: ['chunk-1'], pageNumbers: [1], formulaEvidenceRefs: [], imageAssetIds: ['asset-1'] },
    candidates: [{ candidateId: 'q-visual', id: 'q-visual', number: '1', statement: 'Enunciado com figura.', alternatives: [], correctAnswer: null, sourceChunkIds: ['chunk-1'], visualAssetIds: ['asset-1'] }],
  });

  const result = await graph.invoke(initial);

  assert.notEqual(result.stage, 'ready');
  assert.ok(result.backendOutput[0]?.pendingIssues.includes('VISUAL_CONTEXT_VISUAL_ASSET_DOWNLOAD_FAILED:asset-1'));
});
