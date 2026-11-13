import assert from 'node:assert/strict';
import test from 'node:test';

const input = {
  documentId: 'doc-qa', sourceBlockId: 'block-qa', questionNumber: '1', statement: 'Calcule 2 + 2.',
  alternatives: [], correctAnswer: null, explanation: null, sourceContext: '', skipDocumentRag: true,
};
const generatedOptions = ['4', '3', '5', '6', '7'].map((text, index) => ({ label: String.fromCharCode(65 + index), text }));

async function runAgent(response: unknown) {
  process.env.NODE_ENV = 'test';
  process.env.HOST = '127.0.0.1'; process.env.PORT = '3000';
  process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_PUBLISHABLE_KEY = 'key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'key'; process.env.DATABASE_URL = 'https://database.example.com';
  process.env.REDIS_URL = 'https://redis.example.com'; process.env.OPENROUTER_API_KEY = 'key';
  process.env.OPENROUTER_EMBEDDING_MODEL = 'embedding'; process.env.OPENROUTER_QUESTION_MODEL = 'chat';
  process.env.ASAAS_WEBHOOK_URL = 'http://localhost:3000/api/webhooks/asaas';
  process.env.QUESTION_ALTERNATIVES_MODEL = 'chat';
  const { QuestionAlternativesAgentService } = await import('../question-alternatives-agent.service.js');
  const requestService = { request: async () => ({ data: response, model: 'qa-model', attempts: 1 }) };
  return new QuestionAlternativesAgentService(requestService as never).complete(input);
}

test('rejects five generated options when duplicate option texts collapse the unique count', async () => {
  const result = await runAgent({ alternatives: [
    { label: 'A', text: '4' }, { label: 'B', text: '3' }, { label: 'C', text: '4' },
    { label: 'D', text: '6' }, { label: 'E', text: '7' },
  ] });

  assert.equal(result.generated, false);
  assert.equal(result.failure?.code, 'INVALID_ALTERNATIVES');
  assert.deepEqual(result.alternatives, []);
});

test('keeps source alternatives and their normalized labels when generation omits one', async () => {
  const { QuestionAlternativesAgentService } = await import('../question-alternatives-agent.service.js');
  const requestService = { request: async () => ({ data: { alternatives: [
    { label: 'A', text: 'Resposta 1' }, { label: 'B', text: 'Resposta 2' },
    { label: 'C', text: 'Resposta nova' }, { label: 'D', text: 'Resposta 4' }, { label: 'E', text: 'Resposta 5' },
  ] }, model: 'qa-model', attempts: 1 }) };
  const result = await new QuestionAlternativesAgentService(requestService as never).complete({
    ...input, alternatives: [{ label: 'A', text: 'Resposta 1' }, { label: 'B', text: 'Resposta 2' }],
  });

  assert.equal(result.generated, true);
  assert.deepEqual(result.alternatives.slice(0, 2), [
    { label: 'A', text: 'Resposta 1' }, { label: 'B', text: 'Resposta 2' },
  ]);
});
