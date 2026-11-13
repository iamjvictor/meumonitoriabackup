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
process.env.DOCUMENT_EXTRACTION_CONTENT_LOG_ENABLED = 'true';
process.env.DOCUMENT_EXTRACTION_CONTENT_LOG_MAX_CHARS = '100';

test('EmbeddingService registra o conteúdo efetivamente enviado ao cliente', async (t) => {
  const embeddingContent = 'Conteúdo transformado realmente usado no embedding';
  const sentToClient: string[][] = [];
  const contentLogs: Array<Record<string, unknown>> = [];

  await t.mock.module('../../../repositories/document-worker.repository.js', {
    namedExports: {
      async findPendingChunksForEmbedding() {
        return [{ id: 'chunk-1', chunkIndex: 3, content: 'texto base', embeddingContent, blockId: 'block-1' }];
      },
      async markChunksEmbeddingProcessing() {},
      async saveChunkEmbeddings() {},
      async markChunksEmbeddingPending() {},
    },
  });
  await t.mock.module('../../client/openrouter.client.js', {
    namedExports: {
      OpenRouterClient: class {
        async createEmbeddings(texts: string[]) {
          sentToClient.push(texts);
          return [[0.1, 0.2]];
        }
      },
    },
  });
  await t.mock.module('../chunk.service.js', {
    namedExports: { DOCUMENT_EMBEDDING_VERSION: 'test-version' },
  });
  const originalLog = console.log;
  console.log = (...values: unknown[]) => {
    if (values[1] && typeof values[1] === 'object' && (values[1] as Record<string, unknown>).event === 'monitor.document_chunk_content_audit') {
      contentLogs.push(values[1] as Record<string, unknown>);
    }
  };
  t.after(() => { console.log = originalLog; });

  const { EmbeddingService } = await import('../embedding.service.js');
  await new EmbeddingService().processDocument('doc-1');

  assert.deepEqual(sentToClient, [[embeddingContent]]);
  assert.equal(contentLogs.length, 1);
  assert.equal(contentLogs[0]?.text, 'texto base');
  assert.equal(contentLogs[0]?.embeddingText, sentToClient[0]?.[0]);
  assert.equal(contentLogs[0]?.stage, 'embedding_input');
  assert.equal(contentLogs[0]?.chunkId, 'chunk-1');
  assert.equal(contentLogs[0]?.chunkIndex, 3);
});
