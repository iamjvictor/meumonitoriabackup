import assert from 'node:assert/strict';
import test from 'node:test';

test('visual extraction includes QUESTIONS independently of DOCUMENT_TEXT_SOURCE', async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '3000',
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key', DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379', OPENROUTER_EMBEDDING_MODEL: 'openrouter/test-embedding',
    OPENROUTER_QUESTION_MODEL: 'openrouter/test-chat', DOCUMENT_TEXT_SOURCE: 'pdfjs',
  });
  const { shouldParseVisualAssets } = await import('../document-worker.service.js');
  assert.equal(shouldParseVisualAssets('QUESTIONS', true), true);
  assert.equal(shouldParseVisualAssets('QUESTIONS', false), false);
  assert.equal(shouldParseVisualAssets('KNOWLEDGE_BASE', true), true);
  assert.equal(shouldParseVisualAssets('FLASHCARDS', true), false);
});
