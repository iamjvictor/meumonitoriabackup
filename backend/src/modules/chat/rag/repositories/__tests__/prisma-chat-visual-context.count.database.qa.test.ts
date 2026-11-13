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

test('dbtemp conta todos os assets da questão antes de limitar a quatro e mantém tenant/status no filtro', { concurrency: false }, async () => {
  const { prisma } = await import('../../../../../lib/prisma.js');
  const { PrismaChatVisualContextRepository } = await import('../prisma-chat-visual-context.repository.js');
  const fixture = await createFixture(prisma);
  try {
    const repository = new PrismaChatVisualContextRepository();
    const results = await repository.questionAssets(fixture.questionId, {
      studentId: randomUUID(), teacherId: fixture.teacherId, monitorId: fixture.monitorId, subjectId: fixture.subjectId,
    });
    assert.equal(results.length, 4);
    assert.ok(results.every((asset) => asset.totalCount === 5), 'COUNT OVER deve incluir também o quinto asset fora do limite');
    assert.equal(new Set(results.map((asset) => asset.assetId)).size, 4);

    const foreignScope = await repository.questionAssets(fixture.questionId, {
      studentId: randomUUID(), teacherId: randomUUID(), monitorId: fixture.monitorId, subjectId: fixture.subjectId,
    });
    assert.deepEqual(foreignScope, [], 'outro teacher não pode obter ids nem contagem dos assets');

    await prisma.question.update({ where: { id: fixture.questionId }, data: { status: 'PENDING_REVIEW' } });
    const pendingQuestion = await repository.questionAssets(fixture.questionId, {
      studentId: randomUUID(), teacherId: fixture.teacherId, monitorId: fixture.monitorId, subjectId: fixture.subjectId,
    });
    assert.deepEqual(pendingQuestion, [], 'questão não aprovada não pode expor assets visuais');
  } finally {
    await prisma.teacher.delete({ where: { id: fixture.teacherId } });
    await prisma.$disconnect();
  }
});

async function createFixture(prisma: any) {
  const prefix = `chat-visual-count-qa-${randomUUID()}`;
  const teacher = await prisma.teacher.create({ data: {
    userId: randomUUID(), fullName: 'QA visual asset count', email: `${prefix}@local.test`, username: prefix,
    area: 'Química', pageSlug: prefix, status: 'active', termsAcceptedAt: new Date(),
  }, select: { id: true } });
  try {
    const monitor = await prisma.monitor.create({ data: { teacherId: teacher.id, name: `${prefix} monitor`, status: 'DRAFT' }, select: { id: true } });
    const subject = await prisma.monitorSubject.create({ data: { monitorId: monitor.id, name: `${prefix} subject`, position: 0 }, select: { id: true } });
    const topic = await prisma.monitorTopic.create({ data: { subjectId: subject.id, name: `${prefix} topic`, position: 0 }, select: { id: true } });
    const document = await prisma.monitorDocument.create({ data: {
      teacherId: teacher.id, monitorId: monitor.id, subjectId: subject.id, topicId: topic.id,
      tag: 'QUESTIONS', originalName: `${prefix}.pdf`, storagePath: `${prefix}/source.pdf`, mimeType: 'application/pdf', sizeBytes: 1, status: 'READY',
    }, select: { id: true } });
    const parseRun = await prisma.documentParseRun.create({ data: {
      documentId: document.id, parserName: 'qa', configurationHash: prefix,
      contentHash: createHash('sha256').update(prefix).digest('hex'), layoutSchemaVersion: 'qa-v1', idempotencyKey: prefix, status: 'SUCCEEDED',
    }, select: { id: true } });
    const question = await prisma.question.create({ data: {
      teacherId: teacher.id, monitorId: monitor.id, subjectId: subject.id, topicId: topic.id,
      text: 'Questão com cinco figuras candidatas', alternatives: [], textHash: createHash('sha256').update(`${prefix}:question`).digest('hex'),
      sourceKey: `${prefix}:question`, kind: 'OPEN_ENDED', status: 'APPROVED',
    }, select: { id: true } });
    const assets = await Promise.all(Array.from({ length: 5 }, (_, index) => prisma.documentVisualAsset.create({ data: {
      documentId: document.id, parseRunId: parseRun.id, sourceKey: `${prefix}:asset:${index}`, pageNumber: index + 1,
      assetType: 'figure', storagePath: `${prefix}/figure-${index}.png`, mimeType: 'image/png',
      checksum: createHash('sha256').update(`${prefix}:${index}`).digest('hex'),
    }, select: { id: true } })));
    await prisma.questionVisualAsset.createMany({ data: assets.map(({ id }: { id: string }, index: number) => ({
      questionId: question.id, visualAssetId: id, associationMethod: 'REVIEW', role: 'STATEMENT', confidence: 1 - index * 0.01,
    })) });
    return { teacherId: teacher.id, monitorId: monitor.id, subjectId: subject.id, questionId: question.id };
  } catch (error) {
    await prisma.teacher.delete({ where: { id: teacher.id } }).catch(() => undefined);
    throw error;
  }
}
