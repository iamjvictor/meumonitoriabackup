import assert from 'node:assert/strict';
import test from 'node:test';
import { aiModels } from '../../../config/ai-models.config.js';
import { StructuredQuestionExtractionService } from '../structured-question-extraction.service.js';

test('document_questions não aplica teto local de tokens nem timeout', async () => {
  let request: Record<string, unknown> | undefined;
  const service = new StructuredQuestionExtractionService(
    { createStructuredChatCompletion: async (input: Record<string, unknown>) => {
      request = input;
      return { questions: [] };
    } } as never,
    { load: async () => ({ id: 'doc', teacherId: 'teacher', monitorId: 'monitor', subjectId: 'subject', topicId: null,
      chunks: [{ id: 'c1', chunkIndex: 0, text: 'Uma questão de teste.', pages: [1] }], images: [] }),
    save: async () => 'unused' } as never,
    1000,
  );

  await service.extractCandidates('doc');

  assert.equal(request?.schemaName, 'document_questions');
  assert.equal(request?.maxTokens, null);
  assert.equal(request?.timeoutMs, null);
  assert.equal(request?.reasoningEffort, aiModels.questionExtractionReasoningEffort);
});
