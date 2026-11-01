import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../../lib/prisma.js';

test('saveDoclingChunks persists validated provenance with tenant scope from the database', { concurrency: false }, async () => {
  const repo = await import('../document-worker.repository.js');
  assert.equal(typeof repo.saveDoclingChunks, 'function');
  const originalFind = prisma.monitorDocument.findUnique;
  const originalTransaction = prisma.$transaction;
  let rows: Array<Record<string, unknown>> = [];
  let topicRows: Array<Record<string, unknown>> = [];
  let deletes = 0;
  const doc = { id: 'doc-1', teacherId: 'teacher-db', monitorId: 'monitor-db', subjectId: 'subject-db', topicLinks: [{ topicId: 'topic-db' }] };
  try {
    (prisma.monitorDocument as any).findUnique = async () => doc;
    (prisma as any).$transaction = async (handler: (tx: any) => Promise<unknown>) => handler({
      $executeRaw: async () => undefined,
      documentChunk: {
        findMany: async () => [], deleteMany: async () => { deletes++; },
        createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { rows = data; return { count: data.length }; },
      },
      flashcardSource: { findFirst: async () => null },
      questionSource: { findFirst: async () => null },
      questionSpanChunk: { findFirst: async () => null },
      documentChunkTopic: { createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { topicRows = data; return { count: data.length }; } },
    });
    const result = await repo.saveDoclingChunks('doc-1', {
      expectedHash: 'a'.repeat(64), engine: 'docling', tokenizerId: 'qwen-tokenizer', chunkerVersion: 'hybrid-v1', pageCount: 2,
      chunks: [{ index: 0, text: 'Título\ntexto contextual', rawText: 'texto contextual', headings: ['Título'], pages: [2], type: 'text', tokens: 3, provenance: [{ page: 2, bbox: [1, 2, 3, 4] }] }],
    } as any);
    assert.equal(result.savedCount, 1);
    assert.equal(rows[0]?.teacherId, 'teacher-db');
    assert.equal(rows[0]?.monitorId, 'monitor-db');
    assert.equal(rows[0]?.subjectId, 'subject-db');
    assert.equal(rows[0]?.content, 'texto contextual');
    assert.equal(rows[0]?.embeddingContent, 'Título\ntexto contextual');
    assert.equal(rows[0]?.pageStart, 2);
    assert.equal(rows[0]?.pageEnd, 2);
    assert.deepEqual(rows[0]?.pages, [2]);
    assert.deepEqual(rows[0]?.headings, ['Título']);
    assert.deepEqual(rows[0]?.provenance, [{ page: 2, bbox: [1, 2, 3, 4] }]);
    assert.equal(rows[0]?.tokenizerId, 'qwen-tokenizer');
    assert.equal(rows[0]?.docHash, 'a'.repeat(64));
    assert.equal(rows[0]?.status, 'EMBEDDING_PENDING');
    assert.equal(typeof rows[0]?.sourceKey, 'string');
    assert.equal(deletes, 1);
    assert.deepEqual(topicRows, [{ chunkId: rows[0]?.id, topicId: 'topic-db' }]);
  } finally {
    (prisma.monitorDocument as any).findUnique = originalFind;
    (prisma as any).$transaction = originalTransaction;
  }
});

test('rejects non-contiguous Docling indexes before a transaction can replace existing chunks', async () => {
  const repo = await import('../document-worker.repository.js');
  assert.equal(typeof repo.saveDoclingChunks, 'function');
  await assert.rejects(repo.saveDoclingChunks('doc-1', {
    expectedHash: 'a'.repeat(64), engine: 'docling', tokenizerId: 'qwen-tokenizer', chunkerVersion: 'hybrid-v1', pageCount: 2,
    chunks: [{ index: 1, text: 'texto', rawText: 'texto', headings: [], pages: [1], type: 'text', tokens: 1, provenance: [] }],
  } as any), /index|índice/i);
});

test('rejects an empty Docling lot before replacing existing knowledge chunks', async () => {
  const repo = await import('../document-worker.repository.js');
  assert.throws(() => repo.validateDoclingChunkBatch({
    expectedHash: 'a'.repeat(64), engine: 'docling', tokenizerId: 'qwen-tokenizer',
    chunkerVersion: 'hybrid-v1', pageCount: 1, chunks: [],
  }), /chunk|vazio/i);
});

test('reuses the complete stored Docling lot after an embedding retry', { concurrency: false }, async () => {
  const repo = await import('../document-worker.repository.js');
  assert.equal(typeof repo.findReusableDoclingChunks, 'function');
  const originalFindMany = prisma.documentChunk.findMany;
  try {
    (prisma.documentChunk as any).findMany = async () => [
      { chunkIndex: 0, sourceKey: 'stable-0', status: 'EMBEDDING_PENDING' },
      { chunkIndex: 1, sourceKey: 'stable-1', status: 'EMBEDDING_PENDING' },
    ];
    const reusable = await repo.findReusableDoclingChunks('doc-1', 'a'.repeat(64), 'hybrid-v1');
    assert.equal(reusable.reusable, true);
    assert.equal(reusable.chunkCount, 2);
    assert.equal(reusable.chunks.length, 2);
  } finally {
    (prisma.documentChunk as any).findMany = originalFindMany;
  }
});

test('same source key reuses persisted chunks without deleting or duplicating rows', { concurrency: false }, async () => {
  const repo = await import('../document-worker.repository.js');
  const originalFind = prisma.monitorDocument.findUnique;
  const originalTransaction = prisma.$transaction;
  let deleted = false;
  let created = false;
  const hash = 'b'.repeat(64);
  try {
    (prisma.monitorDocument as any).findUnique = async () => ({ id: 'doc-1', teacherId: 't', monitorId: 'm', subjectId: 's', topicLinks: [] });
    (prisma as any).$transaction = async (handler: (tx: any) => Promise<unknown>) => handler({
      $executeRaw: async () => undefined,
      documentChunk: {
        findMany: async () => [{ id: 'chunk-1', sourceKey: `doc-1:${hash}:docling:hybrid-v1:0`, flashcardSources: [], questionSources: [], questionSpanLinks: [] }],
        deleteMany: async () => { deleted = true; }, createMany: async () => { created = true; return { count: 1 }; },
      }, flashcardSource: { findFirst: async () => null },
      questionSource: { findFirst: async () => null }, questionSpanChunk: { findFirst: async () => null },
      documentChunkTopic: { createMany: async () => ({ count: 0 }) },
    });
    const result = await repo.saveDoclingChunks('doc-1', { expectedHash: hash, engine: 'docling', tokenizerId: 'qwen', chunkerVersion: 'hybrid-v1', pageCount: 1,
      chunks: [{ index: 0, text: 'context', rawText: 'raw', headings: [], pages: [1], type: 'text', tokens: 1, provenance: [] }] });
    assert.deepEqual(result, { savedCount: 1, reused: true, chunkIds: ['chunk-1'] });
    assert.equal(deleted, false);
    assert.equal(created, false);
  } finally {
    (prisma.monitorDocument as any).findUnique = originalFind;
    (prisma as any).$transaction = originalTransaction;
  }
});

test('protected references prevent replacing a different Docling source batch', { concurrency: false }, async () => {
  const repo = await import('../document-worker.repository.js');
  const originalFind = prisma.monitorDocument.findUnique;
  const originalTransaction = prisma.$transaction;
  let deleted = false;
  try {
    (prisma.monitorDocument as any).findUnique = async () => ({ id: 'doc-1', teacherId: 't', monitorId: 'm', subjectId: 's', topicLinks: [] });
    (prisma as any).$transaction = async (handler: (tx: any) => Promise<unknown>) => handler({
      $executeRaw: async () => undefined,
      documentChunk: {
        findMany: async () => [{ id: 'chunk-1', sourceKey: 'old-source', flashcardSources: [{ flashcardId: 'card-1' }], questionSources: [], questionSpanLinks: [] }],
        deleteMany: async () => { deleted = true; }, createMany: async () => ({ count: 1 }),
      }, documentChunkTopic: { createMany: async () => ({ count: 0 }) },
    });
    await assert.rejects(repo.saveDoclingChunks('doc-1', { expectedHash: 'c'.repeat(64), engine: 'docling', tokenizerId: 'qwen', chunkerVersion: 'hybrid-v1', pageCount: 1,
      chunks: [{ index: 0, text: 'new context', rawText: 'new raw', headings: [], pages: [1], type: 'text', tokens: 2, provenance: [] }] }), /fontes.*vinculadas/i);
    assert.equal(deleted, false);
  } finally {
    (prisma.monitorDocument as any).findUnique = originalFind;
    (prisma as any).$transaction = originalTransaction;
  }
});
