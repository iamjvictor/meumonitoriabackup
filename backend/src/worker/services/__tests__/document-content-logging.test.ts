import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.HOST = '127.0.0.1';
process.env.PORT = '3000';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.OPENROUTER_EMBEDDING_MODEL = 'openrouter/test-embedding';
process.env.OPENROUTER_QUESTION_MODEL = 'openrouter/test-chat';
process.env.ASAAS_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32).toString('base64');
process.env.ASAAS_WEBHOOK_URL = 'https://example.com/webhook';

test('logDocumentChunkContent omite texto por padrão e inclui trecho limitado quando habilitado', async () => {
  const { logDocumentChunkContent } = await import('../embedding.service.js');
  const logged: unknown[][] = [];
  const logger = (...args: unknown[]) => logged.push(args);
  const chunk = {
    documentId: 'doc-1',
    chunkId: 'chunk-1',
    chunkIndex: 2,
    pages: [3, 4],
    text: 'Texto OCR que deve ser auditado',
    embeddingText: 'Texto de embedding contextualizado',
  };

  logDocumentChunkContent({ logger, enabled: false, maxChars: 5, stage: 'embedding_input', chunks: [chunk] });
  assert.equal(logged.length, 0);

  logDocumentChunkContent({ logger, enabled: true, maxChars: 10, stage: 'embedding_input', chunks: [chunk] });
  assert.equal(logged.length, 1);
  assert.equal(logged[0]?.[0], 'Conteúdo de chunk para auditoria');
  const payload = logged[0]?.[1] as Record<string, unknown>;
  assert.equal(payload.event, 'monitor.document_chunk_content_audit');
  assert.equal(payload.documentId, 'doc-1');
  assert.equal(payload.chunkId, 'chunk-1');
  assert.equal(payload.chunkIndex, 2);
  assert.deepEqual(payload.pages, [3, 4]);
  assert.equal(payload.stage, 'embedding_input');
  assert.equal(payload.textChars, chunk.text.length);
  assert.equal(payload.textTruncated, true);
  assert.equal(payload.text, chunk.text.slice(0, 10));
  assert.equal(payload.embeddingText, chunk.embeddingText.slice(0, 10));
});
