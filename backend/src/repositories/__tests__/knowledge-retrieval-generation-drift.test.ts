import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';

test('active chunk retrieval requires the configured embedding model while legacy chunks retain compatibility', { concurrency: false }, async () => {
  const repository = await import('../knowledge-retrieval.repository.js');
  const queryClient = prisma as unknown as { $queryRaw(query: Prisma.Sql): Promise<unknown> };
  const originalQueryRaw = queryClient.$queryRaw;
  let sql = '';
  let values: unknown[] = [];
  try {
    queryClient.$queryRaw = async (input) => { sql = input.sql; values = input.values; return []; };
    await repository.searchReadyKnowledgeChunks({
      teacherId: 'teacher-1', monitorId: 'monitor-1', subjectId: 'subject-1', queryEmbedding: [0.1],
    });
    assert.match(sql, /d\.active_generation_id IS NULL AND dc\.generation_id IS NULL/u);
    assert.match(sql, /dc\.embedding_model =/u);
    assert.ok(values.includes(env.OPENROUTER_EMBEDDING_MODEL));
  } finally {
    queryClient.$queryRaw = originalQueryRaw;
  }
});

test('active visual retrieval enforces the configured embedding model and legacy index compatibility', { concurrency: false }, async () => {
  const repository = await import('../knowledge-retrieval.repository.js');
  const queryClient = prisma as unknown as { $queryRaw(query: Prisma.Sql): Promise<unknown> };
  const originalQueryRaw = queryClient.$queryRaw;
  let sql = '';
  let values: unknown[] = [];
  try {
    queryClient.$queryRaw = async (input) => { sql = input.sql; values = input.values; return []; };
    await repository.searchReadyVisualAssetIndexes({
      teacherId: 'teacher-1', monitorId: 'monitor-1', subjectId: 'subject-1', queryEmbedding: [0.1],
    });
    assert.match(sql, /d\.active_generation_id IS NULL AND dva\.generation_id IS NULL/u);
    assert.match(sql, /dvi\.embedding_model =/u);
    assert.ok(values.includes(env.OPENROUTER_EMBEDDING_MODEL));
  } finally {
    queryClient.$queryRaw = originalQueryRaw;
  }
});
