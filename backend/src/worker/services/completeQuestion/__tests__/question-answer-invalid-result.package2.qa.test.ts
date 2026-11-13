import assert from 'node:assert/strict';
import test from 'node:test';

function setBackendEnv() {
  process.env.NODE_ENV = 'test'; process.env.HOST = '127.0.0.1'; process.env.PORT = '3000';
  process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_PUBLISHABLE_KEY = 'key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'key'; process.env.DATABASE_URL = 'https://database.example.com';
  process.env.REDIS_URL = 'https://redis.example.com'; process.env.OPENROUTER_API_KEY = 'key';
  process.env.OPENROUTER_EMBEDDING_MODEL = 'embedding'; process.env.OPENROUTER_QUESTION_MODEL = 'chat';
  process.env.ASAAS_WEBHOOK_URL = 'http://localhost:3000/api/webhooks/asaas';
}

test('an answer outside the generated alternatives remains null and explicitly invalid', async () => {
  setBackendEnv();
  const { QuestionAnswerAgentService } = await import('../question-answer-agent.service.js');
  const requestService = { request: async () => ({ data: { correctAnswer: 'F' }, model: 'qa-model', attempts: 1 }) };
  const client = { createEmbeddings: async () => [] };
  const service = new QuestionAnswerAgentService(requestService as never, client as never);
  const result = await service.complete({
    documentId: 'doc-qa', sourceBlockId: 'block-qa', questionNumber: '1', statement: 'Calcule 2 + 2.',
    alternatives: [], correctAnswer: null, explanation: null, sourceContext: '', skipDocumentRag: true,
  }, ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `opção ${label}` })));

  assert.equal(result.correctAnswer, null);
  assert.equal(result.generated, false);
  assert.equal(result.decisionSource, null);
  assert.equal(result.failure?.code, 'INVALID_ANSWER');
});
