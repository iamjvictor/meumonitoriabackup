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

test('dbtemp rollback real da confirmação restaura candidatos se a escrita final falhar', { concurrency: false }, async () => {
  const { prisma } = await import('../../lib/prisma.js');
  const { PrismaDocumentVisualLinkStore } = await import('../document-visual-link.repository.js');
  const fixture = await createFixture(prisma);
  const originalTransaction = prisma.$transaction.bind(prisma);
  const prismaMutable = prisma as unknown as { $transaction: typeof prisma.$transaction };
  let interceptedFinalWrite = false;

  prismaMutable.$transaction = ((callback: (transaction: any) => Promise<unknown>, options?: unknown) => originalTransaction((transaction: any) => {
    const wrapped = new Proxy(transaction, {
      get(target, property, receiver) {
        const delegate = Reflect.get(target, property, receiver);
        if (property !== 'questionSpan') return delegate;
        return new Proxy(delegate, {
          get(spanDelegate, operation, spanReceiver) {
            const method = Reflect.get(spanDelegate, operation, spanReceiver);
            if (operation !== 'update') return method;
            return (args: any) => {
              interceptedFinalWrite = true;
              return method.call(spanDelegate, { ...args, data: { ...args.data, visualStatus: 'NOT_A_REAL_STATUS' } });
            };
          },
        });
      },
    });
    return callback(wrapped);
  }, options as never)) as typeof prisma.$transaction;

  try {
    await assert.rejects(new PrismaDocumentVisualLinkStore().confirmQuestionVisualReview(
      fixture.documentId,
      {
        assetId: fixture.selectedAssetId,
        assetKey: 'selected-asset',
        method: 'REVIEW',
        confidence: 1,
        role: 'STATEMENT',
        questionSpanId: fixture.spanId,
        questionId: fixture.questionId,
      },
      fixture.userId,
    ));
    assert.equal(interceptedFinalWrite, true, 'falha provocada depois dos writes de links dentro da transação');

    const [links, questionLinks, span, audit] = await Promise.all([
      prisma.questionSpanVisualAsset.findMany({ where: { questionSpanId: fixture.spanId }, orderBy: { visualAssetId: 'asc' }, select: { visualAssetId: true, associationMethod: true, role: true } }),
      prisma.questionVisualAsset.findMany({ where: { questionId: fixture.questionId }, select: { visualAssetId: true } }),
      prisma.questionSpan.findUniqueOrThrow({ where: { id: fixture.spanId }, select: { visualStatus: true } }),
      prisma.question.findUniqueOrThrow({ where: { id: fixture.questionId }, select: { reviewedAt: true, reviewedBy: true } }),
    ]);
    assert.deepEqual(links, [
      fixture.selectedAssetId,
      fixture.otherAssetId,
    ].sort().map((visualAssetId) => ({ visualAssetId, associationMethod: 'PAGE_CANDIDATE', role: 'REVIEW_CANDIDATE' })));
    assert.deepEqual(questionLinks, []);
    assert.equal(span.visualStatus, 'PENDING_EXTRACTION');
    assert.deepEqual(audit, { reviewedAt: null, reviewedBy: null });
  } finally {
    prismaMutable.$transaction = originalTransaction as typeof prisma.$transaction;
    await prisma.teacher.delete({ where: { id: fixture.teacherId } });
    await prisma.$disconnect();
  }
});

async function createFixture(prisma: any) {
  const prefix = `visual-review-rollback-qa-${randomUUID()}`;
  const teacher = await prisma.teacher.create({ data: {
    userId: randomUUID(), fullName: 'QA visual review rollback', email: `${prefix}@local.test`, username: prefix,
    area: 'Química', pageSlug: prefix, status: 'active', termsAcceptedAt: new Date(),
  }, select: { id: true, userId: true } });
  try {
    const monitor = await prisma.monitor.create({ data: { teacherId: teacher.id, name: `${prefix} monitor`, status: 'DRAFT' }, select: { id: true } });
    const subject = await prisma.monitorSubject.create({ data: { monitorId: monitor.id, name: `${prefix} subject`, position: 0 }, select: { id: true } });
    const topic = await prisma.monitorTopic.create({ data: { subjectId: subject.id, name: `${prefix} topic`, position: 0 }, select: { id: true } });
    const document = await prisma.monitorDocument.create({ data: {
      teacherId: teacher.id, monitorId: monitor.id, subjectId: subject.id, topicId: topic.id, tag: 'QUESTIONS',
      originalName: `${prefix}.pdf`, storagePath: `${prefix}/source.pdf`, mimeType: 'application/pdf', sizeBytes: 1, status: 'READY',
    }, select: { id: true } });
    const text = await prisma.documentText.create({ data: {
      documentId: document.id, extractionVersion: 'qa-rollback-v1', rawContent: 'Questão visual 01', normalizedContent: 'Questão visual 01', pageCount: 1,
    }, select: { id: true } });
    const block = await prisma.documentBlock.create({ data: {
      documentId: document.id, documentTextId: text.id, blockIndex: 0, type: 'QUESTION', rawContent: 'Questão visual 01',
      normalizedContent: 'Questão visual 01', sectionPath: [], questionNumber: '01', pageStart: 3, pageEnd: 3,
      charStart: 0, charEnd: 17, contentHash: createHash('sha256').update(prefix).digest('hex'), detectionMethod: 'MANUAL', status: 'READY',
    }, select: { id: true } });
    const chunk = await prisma.documentChunk.create({ data: {
      documentId: document.id, teacherId: teacher.id, monitorId: monitor.id, subjectId: subject.id, blockId: block.id,
      chunkIndex: 0, chunkIndexInBlock: 0, content: 'Questão visual 01', contentHash: createHash('sha256').update(`${prefix}:chunk`).digest('hex'),
      charCount: 17, tokenCount: 4, charStart: 0, charEnd: 17, pageStart: 3, pageEnd: 3, status: 'EMBEDDING_PENDING',
    }, select: { id: true } });
    const parseRun = await prisma.documentParseRun.create({ data: {
      documentId: document.id, parserName: 'qa', configurationHash: prefix, contentHash: createHash('sha256').update(prefix).digest('hex'),
      layoutSchemaVersion: 'qa-v1', idempotencyKey: prefix, status: 'SUCCEEDED',
    }, select: { id: true } });
    const assets = await Promise.all(['selected', 'other'].map((name) => prisma.documentVisualAsset.create({ data: {
      documentId: document.id, parseRunId: parseRun.id, sourceKey: `${prefix}:${name}`, pageNumber: 3, assetType: 'figure',
      storagePath: `${prefix}/${name}.png`, mimeType: 'image/png', checksum: createHash('sha256').update(name).digest('hex'),
    }, select: { id: true } })));
    const statement = 'Questão visual 01';
    const question = await prisma.question.create({ data: {
      teacherId: teacher.id, monitorId: monitor.id, subjectId: subject.id, topicId: topic.id,
      text: statement, alternatives: [], textHash: createHash('sha256').update(`${prefix}:question`).digest('hex'), sourceKey: `${prefix}:span`,
      kind: 'OPEN_ENDED', status: 'PENDING_REVIEW',
      sources: { create: [{ chunkId: chunk.id, documentId: document.id, documentBlockId: block.id, role: 'STATEMENT', pageStart: 3, pageEnd: 3 }] },
    }, select: { id: true } });
    const span = await prisma.questionSpan.create({ data: {
      documentId: document.id, documentBlockId: block.id, sourceKey: `${prefix}:span`, questionNumber: '01', pageStart: 3, pageEnd: 3,
      status: 'VISUAL_PENDING', visualStatus: 'PENDING_EXTRACTION', evidence: {},
      chunks: { create: [{ chunkId: chunk.id, role: 'PRIMARY', position: 0 }] },
      candidate: { create: {
        statement, alternatives: [], correctAnswer: null, explanation: null, originType: 'DETERMINISTIC', status: 'PROMOTED',
        promotionReasons: [], structuralState: 'STRUCTURALLY_VALID',
      } },
    }, select: { id: true } });
    await prisma.questionSpanVisualAsset.createMany({ data: assets.map(({ id }) => ({
      questionSpanId: span.id, visualAssetId: id, associationMethod: 'PAGE_CANDIDATE', role: 'REVIEW_CANDIDATE', confidence: 0.2,
    })) });
    return {
      prefix, userId: teacher.userId, teacherId: teacher.id, documentId: document.id, questionId: question.id, spanId: span.id,
      selectedAssetId: assets[0]!.id, otherAssetId: assets[1]!.id,
    };
  } catch (error) {
    await prisma.teacher.delete({ where: { id: teacher.id } }).catch(() => undefined);
    throw error;
  }
}
