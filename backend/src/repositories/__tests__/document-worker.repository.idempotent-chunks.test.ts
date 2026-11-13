import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import { assertChunkReplacementSafe } from '../document-worker.repository.js';

test('protege vínculos de questões, spans e assets antes de substituir chunks', () => {
  assert.throws(() => assertChunkReplacementSafe(false, true), /QuestionSource.*preservados/i);
  assert.throws(() => assertChunkReplacementSafe(false, false, true), /spans.*preservados/i);
  assert.throws(() => assertChunkReplacementSafe(false, false, false, true), /visuais.*preservados/i);
});

test('permite repetição idêntica mesmo com QuestionSource vinculado', { concurrency: false }, async () => {
  process.env.NODE_ENV = 'test';
  process.env.SUPABASE_URL ??= 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY ??= 'test-publishable-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
  process.env.DATABASE_URL ??= 'postgresql://postgres:password@localhost:5432/test';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  process.env.OPENROUTER_EMBEDDING_MODEL ??= 'openrouter/test-embedding';
  process.env.OPENROUTER_QUESTION_MODEL ??= 'openrouter/test-chat';
  const { prisma } = await import('../../lib/prisma.js');
  const { saveExtractedChunks } = await import('../document-worker.repository.js');
  const oldDocumentFindUnique = prisma.monitorDocument.findUnique;
  const oldBlockFindMany = prisma.documentBlock.findMany;
  const oldTransaction = prisma.$transaction;
  const content = 'stable question content';
  const hash = createHash('sha256').update(content).digest('hex');
  let deleteCalls = 0;
  (prisma.monitorDocument as any).findUnique = async () => ({
    id: 'doc-id', teacherId: 'teacher', monitorId: 'monitor', subjectId: 'subject', topicLinks: [],
  });
  (prisma.documentBlock as any).findMany = async () => [{ id: 'block-id', topicLinks: [] }];
  (prisma as any).$transaction = async (callback: (tx: any) => Promise<unknown>) => callback({
    $executeRaw: async () => undefined,
    flashcardSource: { findFirst: async () => null },
    questionSource: { findFirst: async () => ({ id: 'source-id' }) },
    questionSpanChunk: { findFirst: async () => null },
    documentChunkVisualAsset: { findFirst: async () => null },
    documentChunk: {
      findMany: async () => [{
        id: 'chunk-id', blockId: 'block-id', chunkIndex: 0, chunkIndexInBlock: 0,
        content, embeddingContent: null, contentHash: hash, charStart: 0, charEnd: content.length,
        pageStart: 1, pageEnd: 1,
      }],
      deleteMany: async () => { deleteCalls += 1; },
    },
  });
  try {
    const result = await saveExtractedChunks('doc-id', [{
      blockId: 'block-id', chunkIndexInBlock: 0, content, embeddingContent: null, tokenCount: 4,
      charStart: 0, charEnd: content.length, pageStart: 1, pageEnd: 1, status: 'EMBEDDING_PENDING',
    }]);
    assert.equal(result.chunkCount, 1);
    assert.equal(deleteCalls, 0);
  } finally {
    (prisma.monitorDocument as any).findUnique = oldDocumentFindUnique;
    (prisma.documentBlock as any).findMany = oldBlockFindMany;
    (prisma as any).$transaction = oldTransaction;
  }
});
