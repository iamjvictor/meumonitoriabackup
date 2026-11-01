import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';

test('retrieves Docling chunks with a null block id, page citations and tenant scope filters', { concurrency: false }, async () => {
  const repository = await import('../knowledge-retrieval.repository.js');
  const originalQueryRaw = prisma.$queryRaw;
  let sql = '';
  const expected = [{ chunkId: 'chunk-docling', documentId: 'doc-1', blockId: null, parentBlockId: null, chunkIndex: 0,
    blockType: 'KNOWLEDGE', similarity: 0.9, lexicalScore: 0.2, fusedScore: 0.62, content: 'Texto original',
    pageStart: 3, pageEnd: 4, pages: [3, 4], headings: ['Capítulo'], engine: 'docling', sectionPath: ['Capítulo'],
    isComplete: true, incompleteReason: null, reason: null }];
  try {
    (prisma as any).$queryRaw = async (query: { sql: string }) => { sql = query.sql; return expected; };
    const results = await repository.searchReadyKnowledgeChunks({ teacherId: 'teacher-1', monitorId: 'monitor-1', subjectId: 'subject-1', queryEmbedding: [0.1, 0.2], queryText: 'capítulo' });
    assert.equal(results[0]?.blockId, null);
    assert.deepEqual(results[0]?.pages, [3, 4]);
    assert.deepEqual(results[0]?.headings, ['Capítulo']);
    assert.equal(results[0]?.engine, 'docling');
    assert.match(sql, /LEFT JOIN document_blocks/);
    assert.match(sql, /dc\.pages/);
    assert.match(sql, /COALESCE\(db\.type, dc\.chunk_type/);
    assert.match(sql, /dc\.teacher_id/);
    assert.match(sql, /dc\.monitor_id/);
    assert.match(sql, /dc\.subject_id/);
  } finally {
    (prisma as any).$queryRaw = originalQueryRaw;
  }
});

test('applies section filters to Docling headings when no block section path exists', { concurrency: false }, async () => {
  const repository = await import('../knowledge-retrieval.repository.js');
  const originalQueryRaw = prisma.$queryRaw;
  let sql = '';
  try {
    (prisma as any).$queryRaw = async (query: { sql: string }) => { sql = query.sql; return []; };
    await repository.searchReadyKnowledgeChunks({ teacherId: 'teacher-1', monitorId: 'monitor-1', subjectId: 'subject-1', queryEmbedding: [], sectionPath: ['Capítulo'] });
    assert.match(sql, /COALESCE\(db\.section_path, dc\.headings\) @>/);
  } finally {
    (prisma as any).$queryRaw = originalQueryRaw;
  }
});

test('não consulta relações visuais quando a extração visual está desligada', { concurrency: false }, async () => {
  if (env.DOCUMENT_VISUAL_ASSETS_ENABLED) return;
  const repository = await import('../knowledge-retrieval.repository.js');
  const originalQueryRaw = prisma.$queryRaw;
  let sql = '';
  try {
    (prisma as any).$queryRaw = async (query: { sql: string }) => { sql = query.sql; return []; };
    await repository.searchReadyKnowledgeChunks({ teacherId: 'teacher-1', monitorId: 'monitor-1', subjectId: 'subject-1', queryEmbedding: [] });
    assert.match(sql, /ARRAY\[\]::text\[\]/);
    assert.doesNotMatch(sql, /document_chunk_visual_assets/);
  } finally {
    (prisma as any).$queryRaw = originalQueryRaw;
  }
});

test('busca descrições de figuras apenas no escopo do tenant e sem consultar bytes do Storage', { concurrency: false }, async () => {
  const repository = await import('../knowledge-retrieval.repository.js');
  const originalQueryRaw = prisma.$queryRaw;
  let sql = '';
  try {
    (prisma as any).$queryRaw = async (query: { sql: string }) => { sql = query.sql; return []; };
    await repository.searchReadyVisualAssetIndexes({
      teacherId: 'teacher-1', monitorId: 'monitor-1', subjectId: 'subject-1',
      queryEmbedding: [0.1], queryText: 'gráfico da temperatura',
    });
    assert.match(sql, /document_visual_asset_indexes/);
    assert.match(sql, /d\.teacher_id/);
    assert.match(sql, /d\.monitor_id/);
    assert.match(sql, /d\.subject_id/);
    assert.match(sql, /dvi\.embedding/);
    assert.doesNotMatch(sql, /storage_path|base64/i);
  } finally {
    (prisma as any).$queryRaw = originalQueryRaw;
  }
});
