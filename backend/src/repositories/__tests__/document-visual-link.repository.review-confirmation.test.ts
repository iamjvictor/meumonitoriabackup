import assert from 'node:assert/strict';
import test from 'node:test';

function makeTransaction(overrides: Record<string, unknown> = {}) {
  const staged: Array<{ operation: string; args?: unknown }> = [];
  const committed: Array<{ operation: string; args?: unknown }> = [];
  const transaction = {
    monitorDocument: { findFirst: async () => ({ id: 'doc-1', teacherId: 'teacher-1' }) },
    documentVisualAsset: { findFirst: async () => ({ id: 'asset-1', pageNumber: 5 }) },
    questionSpan: {
      findFirst: async () => ({ id: 'span-1', sourceKey: 'origin-q1', pageStart: 5, pageEnd: 5, chunks: [{ chunkId: 'chunk-1' }] }),
      findMany: async () => [{ id: 'span-1', sourceKey: 'origin-q1', chunks: [{ chunkId: 'chunk-1' }] }],
      update: async (args: unknown) => { staged.push({ operation: 'updateSpan', args }); },
    },
    question: {
      findFirst: async () => ({
        sourceKey: 'origin-q1',
        text: 'Enunciado final reconstruído pela IA, diferente do texto candidato original.',
        sources: [{ chunkId: 'chunk-1', pageStart: 5, pageEnd: 5 }],
      }),
    },
    questionSpanVisualAsset: {
      deleteMany: async (args: unknown) => { staged.push({ operation: 'deleteCandidates', args }); },
      upsert: async (args: unknown) => { staged.push({ operation: 'upsertSpanAsset', args }); },
    },
    questionVisualAsset: { upsert: async (args: unknown) => { staged.push({ operation: 'upsertQuestionAsset', args }); } },
    ...overrides,
  };
  return { transaction, staged, committed };
}

function confirmInput() {
  return {
    assetId: 'asset-1', assetKey: 'a'.repeat(32), method: 'REVIEW' as const, confidence: 1,
    role: 'STATEMENT', questionSpanId: 'span-1', questionId: 'question-1',
  };
}

async function withTransaction<T>(fixture: ReturnType<typeof makeTransaction>, action: (store: InstanceType<typeof import('../document-visual-link.repository.js').PrismaDocumentVisualLinkStore>) => Promise<T>) {
  const { prisma } = await import('../../lib/prisma.js');
  const { PrismaDocumentVisualLinkStore } = await import('../document-visual-link.repository.js');
  const originalTransaction = prisma.$transaction;
  const prismaWithMockTransaction = prisma as unknown as { $transaction: (callback: (tx: typeof fixture.transaction) => Promise<unknown>) => Promise<unknown> };
  prismaWithMockTransaction.$transaction = async (callback) => {
    try {
      const result = await callback(fixture.transaction);
      fixture.committed.push(...fixture.staged);
      return result;
    } finally {
      prismaWithMockTransaction.$transaction = originalTransaction as unknown as typeof prismaWithMockTransaction.$transaction;
    }
  };
  try {
    return { result: await action(new PrismaDocumentVisualLinkStore()), committed: fixture.committed };
  } finally {
    prismaWithMockTransaction.$transaction = originalTransaction as unknown as typeof prismaWithMockTransaction.$transaction;
  }
}

test('confirma texto final reconstruído quando a chave de origem persistida liga questão e span', async () => {
  const fixture = makeTransaction();
  const { result, committed } = await withTransaction(fixture, (store) => store.confirmQuestionVisualReview('doc-1', confirmInput(), 'user-1'));
  assert.deepEqual(result, { teacherId: 'teacher-1' });
  assert.deepEqual(committed.map(({ operation }) => operation), ['deleteCandidates', 'upsertSpanAsset', 'upsertQuestionAsset', 'updateSpan']);
  assert.deepEqual((committed[1]!.args as { create: unknown }).create, {
    questionSpanId: 'span-1', visualAssetId: 'asset-1', associationMethod: 'REVIEW', role: 'STATEMENT', confidence: 1,
  });
});

test('recusa confirmação de usuário que não é professor proprietário do documento', async () => {
  const fixture = makeTransaction({ monitorDocument: { findFirst: async () => null } });
  await assert.rejects(withTransaction(fixture, (store) => store.confirmQuestionVisualReview('doc-1', confirmInput(), 'foreign-user')), /não pertence ao documento autorizado/);
  assert.deepEqual(fixture.committed, []);
});

test('recusa span trocado mesmo quando a questão pertence ao mesmo documento e bloco', async () => {
  const fixture = makeTransaction({
    questionSpan: {
      findFirst: async () => ({ id: 'span-1', sourceKey: 'origin-q2', pageStart: 5, pageEnd: 5, chunks: [{ chunkId: 'chunk-1' }] }),
      findMany: async () => [{ id: 'span-1', sourceKey: 'origin-q2', chunks: [{ chunkId: 'chunk-1' }] }],
      update: async (args: unknown) => { fixture.staged.push({ operation: 'updateSpan', args }); },
    },
  });
  await assert.rejects(withTransaction(fixture, (store) => store.confirmQuestionVisualReview('doc-1', confirmInput(), 'user-1')), /identidade de origem verificável/);
  assert.deepEqual(fixture.committed, []);
});

test('recusa identidade de origem ambígua mesmo com a chave e chunks correspondentes', async () => {
  const fixture = makeTransaction({
    questionSpan: {
      findFirst: async () => ({ id: 'span-1', sourceKey: 'origin-q1', pageStart: 5, pageEnd: 5, chunks: [{ chunkId: 'chunk-1' }] }),
      findMany: async () => [
        { id: 'span-1', sourceKey: 'origin-q1', chunks: [{ chunkId: 'chunk-1' }] },
        { id: 'duplicate-span', sourceKey: 'origin-q1', chunks: [{ chunkId: 'chunk-1' }] },
      ],
      update: async (args: unknown) => { fixture.staged.push({ operation: 'updateSpan', args }); },
    },
  });
  await assert.rejects(withTransaction(fixture, (store) => store.confirmQuestionVisualReview('doc-1', confirmInput(), 'user-1')), /mais de um span ou a um span diferente/);
  assert.deepEqual(fixture.committed, []);
});

test('propaga falha da transação e não considera staged writes confirmadas', async () => {
  const fixture = makeTransaction({
    questionVisualAsset: { upsert: async () => { throw new Error('simulated write failure'); } },
  });
  await assert.rejects(withTransaction(fixture, (store) => store.confirmQuestionVisualReview('doc-1', confirmInput(), 'user-1')), /simulated write failure/);
  assert.deepEqual(fixture.committed, []);
});
