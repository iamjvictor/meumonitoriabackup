import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://127.0.0.1:56321';
process.env.SUPABASE_PUBLISHABLE_KEY = 'local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'local';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:56322/postgres';
process.env.REDIS_URL = 'redis://127.0.0.1:6379';
process.env.OPENROUTER_EMBEDDING_MODEL = 'test-embedding';
process.env.OPENROUTER_QUESTION_MODEL = 'test-chat';
process.env.ASAAS_CREDENTIAL_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
process.env.ASAAS_WEBHOOK_URL = 'http://localhost:3000/api/webhooks/asaas';

test('Postgres dbtemp serializa duas fontes para o mesmo conteúdo e mantém uma questão', { concurrency: false }, async () => {
  const { prisma } = await import('../../lib/prisma.js');
  const { saveQuestion } = await import('../question.repository.js');
  const { saveExtractedChunks } = await import('../document-worker.repository.js');
  const fixture = await createIsolatedTenant(prisma);

  try {
    const first = await createQuestionDocument(prisma, fixture, 'first');
    const second = await createQuestionDocument(prisma, fixture, 'second');
    const sharedTextHash = createHash('sha256').update('mesma questão').digest('hex');
    const persist = (source: { documentId: string; blockId: string; chunkId: string; sourceKey: string }) => saveQuestion({
      teacherId: fixture.teacherId,
      monitorId: fixture.monitorId,
      subjectId: fixture.subjectId,
      topicId: fixture.topicId,
      text: 'Questão concorrente de fixture QA',
      alternatives: [],
      kind: 'OPEN_ENDED',
      correctAnswer: null,
      explanation: null,
      textHash: sharedTextHash,
      sourceKey: source.sourceKey,
      sourceChunkIds: [source.chunkId],
      sources: [{
        chunkId: source.chunkId,
        documentId: source.documentId,
        documentBlockId: source.blockId,
        role: 'STATEMENT',
        pageStart: 1,
        pageEnd: 1,
      }],
    });

    const persisted = await Promise.all([
      persist({ ...first, sourceKey: `${fixture.prefix}:source:first` }),
      persist({ ...second, sourceKey: `${fixture.prefix}:source:second` }),
    ]);
    assert.equal(persisted[0]?.id, persisted[1]?.id, 'as transações concorrentes devem convergir para uma questão');

    const questions = await prisma.question.findMany({
      where: { topicId: fixture.topicId, textHash: sharedTextHash },
      select: { id: true, status: true, reviewedAt: true },
    });
    assert.equal(questions.length, 1);
    const sources = await prisma.questionSource.findMany({
      where: { questionId: persisted[0]!.id, documentId: { in: [first.documentId, second.documentId] } },
      select: { documentId: true, chunkId: true },
    });
    assert.equal(sources.length, 2);
    assert.deepEqual(new Set(sources.map((source) => source.documentId)), new Set([first.documentId, second.documentId]));

    await assert.rejects(saveExtractedChunks(first.documentId, [{
      blockId: first.blockId,
      chunkIndexInBlock: 0,
      content: 'conteúdo alterado após origem vinculada',
      embeddingContent: null,
      tokenCount: 7,
      charStart: 0,
      charEnd: 39,
      pageStart: 1,
      pageEnd: 1,
      status: 'EMBEDDING_PENDING',
    }]), /substituicao de chunks abortada/i);
    const preserved = await prisma.documentChunk.findMany({
      where: { documentId: first.documentId },
      select: { id: true, contentHash: true },
    });
    assert.deepEqual(preserved, [{
      id: first.chunkId,
      contentHash: createHash('sha256').update('Questão de teste').digest('hex'),
    }]);
    assert.equal(await prisma.questionSource.count({ where: { questionId: persisted[0]!.id } }), 2);
  } finally {
    await prisma.teacher.delete({ where: { id: fixture.teacherId } });
    await prisma.$disconnect();
  }
});

test('Postgres dbtemp rollback restaura chunks se criação substituta falhar', { concurrency: false }, async () => {
  const { prisma } = await import('../../lib/prisma.js');
  const { saveExtractedChunks } = await import('../document-worker.repository.js');
  const fixture = await createIsolatedTenant(prisma);

  try {
    const source = await createQuestionDocument(prisma, fixture, 'rollback');
    const original = await prisma.documentChunk.findUnique({
      where: { id: source.chunkId },
      select: { id: true, contentHash: true },
    });
    assert.ok(original);

    await assert.rejects(saveExtractedChunks(source.documentId, [
      {
        blockId: source.blockId, chunkIndexInBlock: 0, content: 'substituto um', embeddingContent: null,
        tokenCount: 3, charStart: 0, charEnd: 13, pageStart: 1, pageEnd: 1, status: 'EMBEDDING_PENDING',
      },
      {
        blockId: source.blockId, chunkIndexInBlock: 0, content: 'substituto dois', embeddingContent: null,
        tokenCount: 3, charStart: 14, charEnd: 29, pageStart: 1, pageEnd: 1, status: 'EMBEDDING_PENDING',
      },
    ]));

    const afterFailure = await prisma.documentChunk.findMany({
      where: { documentId: source.documentId },
      select: { id: true, contentHash: true },
    });
    assert.deepEqual(afterFailure, [original], 'falha após delete dentro da transação deve restaurar o chunk anterior');
  } finally {
    await prisma.teacher.delete({ where: { id: fixture.teacherId } });
    await prisma.$disconnect();
  }
});

async function createIsolatedTenant(prisma: any) {
  const prefix = `questions-reprocessing-qa-${randomUUID()}`;
  const teacher = await prisma.teacher.create({
    data: {
      userId: randomUUID(),
      fullName: 'QA reprocessamento descartável',
      email: `${prefix}@local.test`,
      username: `${prefix}`,
      area: 'Química',
      pageSlug: `${prefix}`,
      status: 'active',
      termsAcceptedAt: new Date(),
    },
    select: { id: true },
  });
  try {
    const monitor = await prisma.monitor.create({
      data: { teacherId: teacher.id, name: `${prefix} monitor`, status: 'DRAFT' },
      select: { id: true },
    });
    const subject = await prisma.monitorSubject.create({
      data: { monitorId: monitor.id, name: `${prefix} subject`, position: 0 },
      select: { id: true },
    });
    const topic = await prisma.monitorTopic.create({
      data: { subjectId: subject.id, name: `${prefix} topic`, position: 0 },
      select: { id: true },
    });
    return {
      prefix,
      teacherId: teacher.id,
      monitorId: monitor.id,
      subjectId: subject.id,
      topicId: topic.id,
    };
  } catch (error) {
    await prisma.teacher.delete({ where: { id: teacher.id } }).catch(() => undefined);
    throw error;
  }
}

async function createQuestionDocument(prisma: any, fixture: Awaited<ReturnType<typeof createIsolatedTenant>>, suffix: string) {
  const document = await prisma.monitorDocument.create({
    data: {
      teacherId: fixture.teacherId,
      monitorId: fixture.monitorId,
      subjectId: fixture.subjectId,
      topicId: fixture.topicId,
      tag: 'QUESTIONS',
      originalName: `${fixture.prefix}-${suffix}.pdf`,
      storagePath: `${fixture.prefix}/${suffix}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 1,
      status: 'READY',
    },
    select: { id: true },
  });
  const documentText = await prisma.documentText.create({
    data: {
      documentId: document.id,
      extractionVersion: 'qa-v1',
      rawContent: 'Questão de teste',
      normalizedContent: 'Questão de teste',
      pageCount: 1,
      qualityDetails: {},
    },
    select: { id: true },
  });
  const block = await prisma.documentBlock.create({
    data: {
      documentId: document.id,
      documentTextId: documentText.id,
      blockIndex: 0,
      type: 'QUESTION',
      rawContent: 'Questão de teste',
      normalizedContent: 'Questão de teste',
      sectionPath: [],
      questionNumber: '01',
      pageStart: 1,
      pageEnd: 1,
      charStart: 0,
      charEnd: 16,
      contentHash: createHash('sha256').update('Questão de teste').digest('hex'),
      detectionMethod: 'MANUAL',
      status: 'READY',
    },
    select: { id: true },
  });
  const chunk = await prisma.documentChunk.create({
    data: {
      documentId: document.id,
      teacherId: fixture.teacherId,
      monitorId: fixture.monitorId,
      subjectId: fixture.subjectId,
      blockId: block.id,
      chunkIndex: 0,
      chunkIndexInBlock: 0,
      content: 'Questão de teste',
      embeddingContent: null,
      contentHash: createHash('sha256').update('Questão de teste').digest('hex'),
      charCount: 16,
      tokenCount: 4,
      charStart: 0,
      charEnd: 16,
      pageStart: 1,
      pageEnd: 1,
      status: 'EMBEDDING_PENDING',
    },
    select: { id: true },
  });
  return { documentId: document.id, blockId: block.id, chunkId: chunk.id };
}
