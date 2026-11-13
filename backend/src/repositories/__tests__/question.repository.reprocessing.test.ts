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

test('reusa a questão existente por conteúdo sem sobrescrever revisão e anexa a nova origem', { concurrency: false }, async () => {
  const { prisma } = await import('../../lib/prisma.js');
  const { saveQuestion } = await import('../question.repository.js');
  const originalTransaction = prisma.$transaction;
  const linkedSources: Array<Record<string, unknown>> = [];
  const advisoryKeys: string[] = [];
  let upsertCalls = 0;
  const existing = { id: 'approved-question', status: 'APPROVED', reviewedAt: new Date('2026-01-01T00:00:00Z') };

  (prisma as { $transaction: typeof prisma.$transaction }).$transaction = (async (callback: (tx: any) => Promise<unknown>) => callback({
    $executeRaw: async (strings: TemplateStringsArray, ...values: string[]) => {
      advisoryKeys.push(values[0]!);
      return undefined;
    },
    documentChunk: { findMany: async () => [] },
    question: {
      findUnique: async () => null,
      findFirst: async () => existing,
      upsert: async () => { upsertCalls += 1; throw new Error('upsert não deveria ocorrer'); },
    },
    questionTopic: { createMany: async () => undefined },
    questionSource: { createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { linkedSources.push(...data); } },
  })) as typeof prisma.$transaction;

  try {
    const saved = await saveQuestion({
      teacherId: 'teacher', monitorId: 'monitor', subjectId: 'subject', topicId: 'topic',
      text: 'Mesmo enunciado', alternatives: [], kind: 'MULTIPLE_CHOICE', correctAnswer: null,
      explanation: null, textHash: 'same-content-hash', sourceKey: 'new-document-source',
      sourceChunkIds: [], sources: [{ chunkId: 'new-chunk', documentId: 'new-document', documentBlockId: 'stable-block', role: 'STATEMENT' }],
    });

    assert.equal(saved, existing);
    assert.equal(upsertCalls, 0);
    assert.deepEqual(advisoryKeys, [
      'new-document',
      'question-content:topic:same-content-hash',
      'question-source:new-document-source',
    ]);
    assert.deepEqual(linkedSources.map(({ questionId, documentId, documentBlockId }) => ({ questionId, documentId, documentBlockId })), [
      { questionId: 'approved-question', documentId: 'new-document', documentBlockId: 'stable-block' },
    ]);
  } finally {
    (prisma as { $transaction: typeof prisma.$transaction }).$transaction = originalTransaction;
  }
});

test('localiza a questão da mesma origem estável quando o sourceKey legado é diferente', { concurrency: false }, async () => {
  const { prisma } = await import('../../lib/prisma.js');
  const { findPendingQuestionForCompletion } = await import('../question.repository.js');
  const originalFindFirst = prisma.question.findFirst;
  let capturedWhere: unknown;
  const existing = {
    id: 'existing-question', status: 'PENDING_REVIEW', reviewedAt: null,
    alternatives: [], correctAnswer: null, explanation: null,
  };
  (prisma.question as { findFirst: typeof prisma.question.findFirst }).findFirst = (async (args: { where: unknown }) => {
    capturedWhere = args.where;
    return existing;
  }) as unknown as typeof prisma.question.findFirst;

  try {
    assert.equal(await findPendingQuestionForCompletion('new-source-key', {
      documentId: 'doc-1', documentBlockId: 'stable-block-1',
    }), existing);
    assert.deepEqual(capturedWhere, {
      OR: [
        { sourceKey: 'new-source-key' },
        { sources: { some: { documentId: 'doc-1', documentBlockId: 'stable-block-1' } } },
      ],
    });
  } finally {
    (prisma.question as { findFirst: typeof prisma.question.findFirst }).findFirst = originalFindFirst;
  }
});

test('retry completo preserva a questão, mantém papéis legítimos e deduplica o mesmo chunk+papel', { concurrency: false }, async () => {
  const { prisma } = await import('../../lib/prisma.js');
  const { saveQuestion, isQuestionCompletionReusable } = await import('../question.repository.js');
  const originalTransaction = prisma.$transaction;
  const stored = {
    id: 'stable-question', status: 'PENDING_REVIEW', reviewedAt: null,
    completenessStatus: 'COMPLETE_WITH_AI',
    alternatives: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `opção ${label}` })),
    correctAnswer: 'A', explanation: 'explicação guardada',
  };
  let upsertCalls = 0;
  const linkedSources: Array<{ chunkId: string; role: string }> = [{ chunkId: 'chunk', role: 'STATEMENT' }];
  let sourceCreateCalls = 0;
  (prisma as any).$transaction = async (callback: (tx: any) => Promise<unknown>) => callback({
    $executeRaw: async () => undefined,
    documentChunk: { findMany: async () => [{ documentId: 'doc' }] },
    question: {
      findUnique: async () => stored,
      findFirst: async () => stored,
      upsert: async () => { upsertCalls += 1; return stored; },
    },
    questionTopic: { createMany: async () => undefined },
    questionSource: {
      findMany: async () => linkedSources,
      createMany: async ({ data }: { data: Array<{ chunkId: string; role: string }> }) => {
        sourceCreateCalls += 1;
        linkedSources.push(...data);
      },
    },
  });
  try {
    assert.equal(isQuestionCompletionReusable(stored), true);
    const input: Parameters<typeof saveQuestion>[0] = {
      teacherId: 'teacher', monitorId: 'monitor', subjectId: 'subject', topicId: 'topic',
      text: 'reprocessamento alterou o texto', alternatives: [{ label: 'A', text: 'nova' }],
      kind: 'MULTIPLE_CHOICE', correctAnswer: 'A', explanation: 'nova explicação',
      textHash: 'changed-hash', sourceKey: 'same-stable-source', sourceChunkIds: ['chunk'],
      sources: [{ chunkId: 'chunk', documentId: 'doc', role: 'ALTERNATIVE' }],
    };
    const saved = await saveQuestion(input);
    assert.equal(saved, stored);
    assert.equal(upsertCalls, 0);
    assert.equal(sourceCreateCalls, 1);
    assert.deepEqual(linkedSources.map(({ chunkId, role }) => ({ chunkId, role })), [
      { chunkId: 'chunk', role: 'STATEMENT' },
      { chunkId: 'chunk', role: 'ALTERNATIVE' },
    ]);
    await saveQuestion(input);
    assert.equal(sourceCreateCalls, 1);
  } finally {
    (prisma as any).$transaction = originalTransaction;
  }
});
