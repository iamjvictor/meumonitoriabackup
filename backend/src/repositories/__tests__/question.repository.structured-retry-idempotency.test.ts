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
process.env.ASAAS_WEBHOOK_URL ??= 'http://localhost:3000/api/webhooks/asaas';

test('same document + extraction ordinal updates lexical variants without merging two questions from one chunk', { concurrency: false }, async () => {
  const { prisma } = await import('../../lib/prisma.js');
  const { saveQuestion } = await import('../question.repository.js');
  const originalTransaction = prisma.$transaction;
  const records = new Map<string, any>();
  const sourcesByQuestion = new Map<string, Array<{ chunkId: string; role: string; documentId: string }>>();
  let nextId = 0;

  (prisma as any).$transaction = async (callback: (tx: any) => Promise<unknown>) => callback({
    $executeRaw: async () => undefined,
    documentChunk: { findMany: async () => [{ documentId: 'doc-questions' }] },
    question: {
      findUnique: async ({ where }: { where: { sourceKey: string } }) => [...records.values()].find((item) => item.sourceKey === where.sourceKey) ?? null,
      findFirst: async ({ where }: { where: any }) => {
        if (where?.metadata?.path?.[0] === 'questionExtractionOrdinal') {
          return [...records.values()].find((item) => item.extractionDocumentId === 'doc-questions'
            && item.metadata?.questionExtractionOrdinal === where.metadata.equals) ?? null;
        }
        if (where?.topicId_textHash) {
          return [...records.values()].find((item) => item.topicId === where.topicId_textHash.topicId
            && item.textHash === where.topicId_textHash.textHash) ?? null;
        }
        return null;
      },
      upsert: async ({ where, create, update }: { where: { sourceKey: string }; create: any; update: any }) => {
        const existing = [...records.values()].find((item) => item.sourceKey === where.sourceKey);
        if (existing) Object.assign(existing, update);
        else {
          const row = { id: `question-${++nextId}`, ...create, extractionDocumentId: 'doc-questions' };
          records.set(row.id, row);
        }
        return [...records.values()].find((item) => item.sourceKey === where.sourceKey);
      },
      update: async ({ where, data }: { where: { id: string }; data: any }) => {
        const existing = records.get(where.id);
        if (!existing) throw new Error('question missing');
        Object.assign(existing, data);
        return existing;
      },
    },
    questionTopic: { createMany: async () => undefined },
    questionSource: {
      findMany: async ({ where }: { where: { questionId: string } }) => sourcesByQuestion.get(where.questionId) ?? [],
      createMany: async ({ data }: { data: Array<{ questionId: string; chunkId: string; role: string; documentId: string }> }) => {
        for (const item of data) {
          const linked = sourcesByQuestion.get(item.questionId) ?? [];
          if (!linked.some((source) => source.chunkId === item.chunkId && source.role === item.role)) linked.push(item);
          sourcesByQuestion.set(item.questionId, linked);
        }
      },
    },
  });

  const persist = (ordinal: number, sourceKey: string, textHash: string, text: string) => saveQuestion({
    teacherId: 'teacher', monitorId: 'monitor', subjectId: 'subject', topicId: 'topic',
    text, alternatives: [], kind: 'OPEN_ENDED', correctAnswer: null, explanation: null,
    textHash, sourceKey, sourceChunkIds: ['chunk-shared'],
    sources: [{ chunkId: 'chunk-shared', documentId: 'doc-questions', role: 'STATEMENT', excerpt: text }],
    metadata: { questionExtractionOrdinal: ordinal },
  });

  try {
    const q01 = await persist(0, 'q01-first-key', 'q01-first-hash', 'Questão 01: texto original do modelo');
    const q02 = await persist(1, 'q02-first-key', 'q02-first-hash', 'Questão 02: outra pergunta do mesmo chunk');

    const q01Retry = await persist(0, 'q01-retry-key', 'q01-retry-hash', 'Questão 01 com formulação lexical diferente');
    const q02Retry = await persist(1, 'q02-retry-key', 'q02-retry-hash', 'Questão 02 reescrita pelo modelo');

    assert.equal(q01Retry.id, q01.id);
    assert.equal(q02Retry.id, q02.id);
    assert.notEqual(q01Retry.id, q02Retry.id, 'ordinais distintos no mesmo chunk continuam sendo questões diferentes');
    assert.equal(records.size, 2, 'a repetição não cria questões extras');
    assert.equal(records.get(q01.id)?.text, 'Questão 01 com formulação lexical diferente');
    assert.equal(records.get(q02.id)?.text, 'Questão 02 reescrita pelo modelo');

    const reviewedAt = new Date('2026-11-06T12:00:00.000Z');
    Object.assign(records.get(q01.id), { status: 'APPROVED', reviewedAt, text: 'Enunciado revisado pelo professor' });
    const reviewedRetry = await persist(0, 'q01-reviewed-retry-key', 'q01-reviewed-retry-hash', 'Nova variação do modelo após revisão');
    assert.equal(reviewedRetry.id, q01.id);
    assert.equal(records.size, 2);
    assert.equal(records.get(q01.id)?.status, 'APPROVED');
    assert.equal(records.get(q01.id)?.text, 'Enunciado revisado pelo professor');
    assert.equal(records.get(q01.id)?.reviewedAt, reviewedAt);

    Object.assign(records.get(q02.id), {
      status: 'PENDING_REVIEW',
      completenessStatus: 'COMPLETE_WITH_AI',
      alternatives: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `opção ${label}` })),
      correctAnswer: 'C',
      explanation: 'completude preservada',
    });
    const completeRetry = await persist(1, 'q02-complete-retry-key', 'q02-complete-retry-hash', 'Nova variante depois da completude');
    assert.equal(completeRetry.id, q02.id);
    assert.equal(records.size, 2);
    assert.equal(records.get(q02.id)?.text, 'Questão 02 reescrita pelo modelo');
    assert.equal(records.get(q02.id)?.correctAnswer, 'C');
    assert.equal(records.get(q02.id)?.explanation, 'completude preservada');
  } finally {
    (prisma as any).$transaction = originalTransaction;
  }
});
