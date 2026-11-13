import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL ??= 'https://example.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY ??= 'test-publishable-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.DATABASE_URL ??= 'postgresql://postgres:password@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.OPENROUTER_EMBEDDING_MODEL ??= 'openrouter/test-embedding';
process.env.OPENROUTER_QUESTION_MODEL ??= 'openrouter/test-chat';
process.env.ASAAS_CREDENTIAL_ENCRYPTION_KEY ??= 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
process.env.ASAAS_WEBHOOK_URL = 'http://localhost:3000/api/webhooks/asaas';

test('não exclui chunks com QuestionSource vinculada durante substituição', { concurrency: false }, async () => {
  const { prisma } = await import('../../lib/prisma.js');
  const { saveExtractedChunks } = await import('../document-worker.repository.js');
  const originalDocumentFindUnique = prisma.monitorDocument.findUnique;
  const originalBlockFindMany = prisma.documentBlock.findMany;
  const originalTransaction = prisma.$transaction;
  let deleteManyCalls = 0;

  (prisma.monitorDocument as unknown as { findUnique: typeof prisma.monitorDocument.findUnique }).findUnique = (async () => ({
    id: 'document-qa',
    teacherId: 'teacher-qa',
    monitorId: 'monitor-qa',
    subjectId: 'subject-qa',
    topicLinks: [],
  })) as unknown as typeof prisma.monitorDocument.findUnique;
  (prisma.documentBlock as unknown as { findMany: typeof prisma.documentBlock.findMany }).findMany = (async () => ([
    { id: 'block-qa', topicLinks: [] },
  ])) as unknown as typeof prisma.documentBlock.findMany;
  (prisma as { $transaction: typeof prisma.$transaction }).$transaction = (async (callback: (transaction: any) => Promise<unknown>) => callback({
    $executeRaw: async () => undefined,
    flashcardSource: { findFirst: async () => null },
    questionSource: { findFirst: async () => ({ chunkId: 'chunk-with-question-source' }) },
    questionSpanChunk: { findFirst: async () => null },
    documentChunkVisualAsset: { findFirst: async () => null },
    documentChunk: {
      findMany: async () => [],
      deleteMany: async () => { deleteManyCalls += 1; },
      createMany: async () => undefined,
    },
    documentChunkTopic: { createMany: async () => undefined },
  })) as typeof prisma.$transaction;

  try {
    await assert.rejects(
      saveExtractedChunks('document-qa', [{
        blockId: 'block-qa',
        chunkIndexInBlock: 0,
        content: 'Questão de teste',
        embeddingContent: null,
        tokenCount: 4,
        charStart: 0,
        charEnd: 16,
        pageStart: 1,
        pageEnd: 1,
        status: 'EMBEDDING_PENDING',
      }]),
      /questões vinculadas|QuestionSource|fontes.*preservados/i,
    );
    assert.equal(deleteManyCalls, 0, 'chunks com fonte de questão precisam permanecer intactos');
  } finally {
    (prisma.monitorDocument as { findUnique: typeof prisma.monitorDocument.findUnique }).findUnique = originalDocumentFindUnique;
    (prisma.documentBlock as { findMany: typeof prisma.documentBlock.findMany }).findMany = originalBlockFindMany;
    (prisma as { $transaction: typeof prisma.$transaction }).$transaction = originalTransaction;
  }
});

test('reutiliza os mesmos chunks em reexecução idêntica mesmo com QuestionSource vinculada', { concurrency: false }, async () => {
  const { prisma } = await import('../../lib/prisma.js');
  const { saveExtractedChunks } = await import('../document-worker.repository.js');
  const originalDocumentFindUnique = prisma.monitorDocument.findUnique;
  const originalBlockFindMany = prisma.documentBlock.findMany;
  const originalTransaction = prisma.$transaction;
  let deleteManyCalls = 0;

  (prisma.monitorDocument as unknown as { findUnique: typeof prisma.monitorDocument.findUnique }).findUnique = (async () => ({
    id: 'document-qa',
    teacherId: 'teacher-qa',
    monitorId: 'monitor-qa',
    subjectId: 'subject-qa',
    topicLinks: [],
  })) as unknown as typeof prisma.monitorDocument.findUnique;
  (prisma.documentBlock as unknown as { findMany: typeof prisma.documentBlock.findMany }).findMany = (async () => ([
    { id: 'block-qa', topicLinks: [] },
  ])) as unknown as typeof prisma.documentBlock.findMany;
  (prisma as { $transaction: typeof prisma.$transaction }).$transaction = (async (callback: (transaction: any) => Promise<unknown>) => callback({
    $executeRaw: async () => undefined,
    flashcardSource: { findFirst: async () => null },
    questionSource: { findFirst: async () => ({ id: 'source-qa' }) },
    questionSpanChunk: { findFirst: async () => null },
    documentChunkVisualAsset: { findFirst: async () => null },
    documentChunk: {
      findMany: async () => [{
        id: 'chunk-qa', blockId: 'block-qa', chunkIndex: 0, chunkIndexInBlock: 0,
        content: 'Questão de teste', embeddingContent: null,
        contentHash: '7bec5e1eae34a99d9632dcdb15cf76fee5879b4728c540d0f81c14efa5d0606d',
        charStart: 0, charEnd: 16, pageStart: 1, pageEnd: 1,
      }],
      deleteMany: async () => { deleteManyCalls += 1; },
      createMany: async () => undefined,
    },
    documentChunkTopic: { createMany: async () => undefined },
  })) as typeof prisma.$transaction;

  try {
    await saveExtractedChunks('document-qa', [{
      blockId: 'block-qa',
      chunkIndexInBlock: 0,
      content: 'Questão de teste',
      embeddingContent: null,
      tokenCount: 4,
      charStart: 0,
      charEnd: 16,
      pageStart: 1,
      pageEnd: 1,
      status: 'EMBEDDING_PENDING',
    }]);
    assert.equal(deleteManyCalls, 0, 'reexecução idêntica deve reutilizar os chunks e preservar fontes');
  } finally {
    (prisma.monitorDocument as unknown as { findUnique: typeof prisma.monitorDocument.findUnique }).findUnique = originalDocumentFindUnique;
    (prisma.documentBlock as unknown as { findMany: typeof prisma.documentBlock.findMany }).findMany = originalBlockFindMany;
    (prisma as { $transaction: typeof prisma.$transaction }).$transaction = originalTransaction;
  }
});
