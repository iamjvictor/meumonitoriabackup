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

test('Postgres dbtemp repete a origem sem duplicar e preserva novo papel no mesmo chunk', { concurrency: false }, async () => {
  const { prisma } = await import('../../lib/prisma.js');
  const { saveQuestion } = await import('../question.repository.js');
  const fixture = await createFixture(prisma);

  try {
    const document = await prisma.monitorDocument.create({
      data: {
        teacherId: fixture.teacherId,
        monitorId: fixture.monitorId,
        subjectId: fixture.subjectId,
        topicId: fixture.topicId,
        tag: 'QUESTIONS',
        originalName: `${fixture.prefix}.pdf`,
        storagePath: `${fixture.prefix}/${fixture.prefix}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1,
        status: 'READY',
      },
      select: { id: true },
    });
    const text = 'QA questão repetida com origem estável';
    const hash = createHash('sha256').update(text).digest('hex');
    const documentText = await prisma.documentText.create({
      data: {
        documentId: document.id,
        extractionVersion: 'qa-v1',
        rawContent: text,
        normalizedContent: text,
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
        rawContent: text,
        normalizedContent: text,
        sectionPath: [],
        questionNumber: 'QA-01',
        pageStart: 1,
        pageEnd: 1,
        charStart: 0,
        charEnd: text.length,
        contentHash: hash,
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
        content: text,
        embeddingContent: null,
        contentHash: hash,
        charCount: text.length,
        tokenCount: 8,
        charStart: 0,
        charEnd: text.length,
        pageStart: 1,
        pageEnd: 1,
        status: 'EMBEDDING_PENDING',
      },
      select: { id: true },
    });

    const persist = (
      roles: Array<'STATEMENT' | 'ALTERNATIVE' | 'ANSWER_KEY' | 'EXPLANATION'>,
      overrides: Record<string, unknown> = {},
    ) => saveQuestion({
      teacherId: fixture.teacherId,
      monitorId: fixture.monitorId,
      subjectId: fixture.subjectId,
      topicId: fixture.topicId,
      text,
      alternatives: [],
      kind: 'OPEN_ENDED',
      correctAnswer: null,
      explanation: null,
      textHash: hash,
      sourceKey: `${fixture.prefix}:question-qa-01`,
      sourceChunkIds: [chunk.id],
      sources: roles.map((role) => ({
        chunkId: chunk.id,
        documentId: document.id,
        documentBlockId: block.id,
        role,
        pageStart: 1,
        pageEnd: 1,
        charStartInChunk: 0,
        charEndInChunk: text.length,
        excerpt: text,
      })),
      ...overrides,
    });

    const first = await persist(['STATEMENT']);
    const firstSnapshot = await readSnapshot(prisma, first.id);
    const second = await persist(['STATEMENT']);
    const secondSnapshot = await readSnapshot(prisma, second.id);
    const completedText = 'QA questão completa após retry';
    const completeOverrides = {
      text: completedText,
      textHash: createHash('sha256').update(completedText).digest('hex'),
      alternatives: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `opção ${label}` })),
      kind: 'MULTIPLE_CHOICE',
      correctAnswer: 'A',
      correctAnswerOrigin: 'AI_GENERATED',
      explanation: 'explicação gerada',
      explanationOrigin: 'AI_GENERATED',
      alternativesOrigin: 'AI_GENERATED',
      completenessStatus: 'COMPLETE_WITH_AI',
    };
    const third = await persist(['STATEMENT', 'ALTERNATIVE', 'ANSWER_KEY'], completeOverrides);
    const thirdSnapshot = await readSnapshot(prisma, third.id);

    const reviewedText = 'QA enunciado aprovado por pessoa';
    const reviewedHash = createHash('sha256').update(reviewedText).digest('hex');
    const reviewedAt = new Date('2026-10-31T15:00:00.000Z');
    await prisma.question.update({
      where: { id: third.id },
      data: {
        text: reviewedText,
        textHash: reviewedHash,
        alternatives: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `revisada ${label}` })),
        correctAnswer: 'C',
        explanation: 'explicação revisada pelo professor',
        status: 'APPROVED',
        reviewedAt,
        reviewedBy: fixture.teacherId,
      },
    });
    const beforeApprovedRetry = await readSnapshot(prisma, third.id);
    const fourth = await persist(['STATEMENT', 'ALTERNATIVE', 'ANSWER_KEY', 'EXPLANATION'], {
      ...completeOverrides,
      text: 'texto gerado diferente após aprovação',
      textHash: createHash('sha256').update('texto gerado diferente após aprovação').digest('hex'),
      correctAnswer: 'A',
      explanation: 'explicação gerada diferente',
    });
    const afterApprovedRetry = await readSnapshot(prisma, fourth.id);

    const violations: string[] = [];
    if (second.id !== first.id) violations.push('same-source retry changed question ID');
    if (JSON.stringify(secondSnapshot) !== JSON.stringify(firstSnapshot)) violations.push('same-role retry changed source/hash snapshot');
    if (third.id !== first.id) violations.push('partial completion created another question');
    if (thirdSnapshot.text !== completedText || thirdSnapshot.correctAnswer !== 'A' || thirdSnapshot.completenessStatus !== 'COMPLETE_WITH_AI') {
      violations.push('partial question did not update with valid completion fields');
    }
    if (JSON.stringify(thirdSnapshot.sources.map((source: { role: string }) => source.role).sort()) !== JSON.stringify(['ALTERNATIVE', 'ANSWER_KEY', 'STATEMENT'])) {
      violations.push('partial retry suppressed legitimate source roles on the existing chunk');
    }
    if (fourth.id !== first.id) violations.push('approved retry created another question');
    if (afterApprovedRetry.status !== 'APPROVED'
      || afterApprovedRetry.text !== beforeApprovedRetry.text
      || afterApprovedRetry.textHash !== beforeApprovedRetry.textHash
      || afterApprovedRetry.correctAnswer !== beforeApprovedRetry.correctAnswer
      || afterApprovedRetry.explanation !== beforeApprovedRetry.explanation
      || afterApprovedRetry.reviewedAt?.toISOString() !== reviewedAt.toISOString()
      || afterApprovedRetry.reviewedBy !== fixture.teacherId) {
      violations.push('approved/reviewed question fields were overwritten');
    }
    if (!afterApprovedRetry.sources.some((source: { role: string }) => source.role === 'EXPLANATION')) {
      violations.push('approved retry suppressed a new source role on an existing chunk');
    }

    assert.deepEqual(violations, [], violations.join('; '));
  } finally {
    await prisma.teacher.delete({ where: { id: fixture.teacherId } });
    await prisma.$disconnect();
  }
});

async function readSnapshot(prisma: any, questionId: string) {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, textHash: true, text: true, status: true, reviewedAt: true, reviewedBy: true,
      alternatives: true, correctAnswer: true, explanation: true, completenessStatus: true },
  });
  const sources = await prisma.questionSource.findMany({
    where: { questionId },
    select: {
      chunkId: true,
      documentId: true,
      documentBlockId: true,
      role: true,
      pageStart: true,
      pageEnd: true,
      charStartInChunk: true,
      charEndInChunk: true,
      excerpt: true,
    },
    orderBy: [{ chunkId: 'asc' }, { role: 'asc' }],
  });
  return { ...question, sources };
}

async function createFixture(prisma: any) {
  const prefix = `question-source-repeat-qa-${randomUUID()}`;
  const teacher = await prisma.teacher.create({
    data: {
      userId: randomUUID(),
      fullName: 'QA origem idempotente',
      email: `${prefix}@local.test`,
      username: prefix,
      area: 'Química',
      pageSlug: prefix,
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
    return { prefix, teacherId: teacher.id, monitorId: monitor.id, subjectId: subject.id, topicId: topic.id };
  } catch (error) {
    await prisma.teacher.delete({ where: { id: teacher.id } }).catch(() => undefined);
    throw error;
  }
}
