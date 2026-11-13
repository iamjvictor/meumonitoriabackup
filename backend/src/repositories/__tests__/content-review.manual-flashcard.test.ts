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

test('manual flashcard is persisted with authenticated teacher, monitor structure, teacher origin and approved status', { concurrency: false }, async () => {
  const { prisma } = await import('../../lib/prisma.js');
  const { createManualFlashcard } = await import('../content-review.repository.js');
  const originals = {
    teacher: prisma.teacher.findUnique,
    monitor: prisma.monitor.findFirst,
    topic: prisma.monitorTopic.findFirst,
    create: prisma.flashcard.create,
  };
  let persisted: any;
  (prisma.teacher as any).findUnique = async () => ({ id: 'teacher-1' });
  (prisma.monitor as any).findFirst = async () => ({ id: '11111111-1111-4111-8111-111111111111', subjects: [{ id: 'subject-1' }] });
  (prisma.monitorTopic as any).findFirst = async () => ({ id: '33333333-3333-4333-8333-333333333333', subjectId: 'subject-1' });
  (prisma.flashcard as any).create = async ({ data, include }: any) => { persisted = { ...data, id: 'flashcard-1', subject: { id: 'subject-1', name: 'Química' }, topic: { id: 'topic-1', name: 'Estequiometria' } }; assert.ok(include); return persisted; };
  try {
    const created = await createManualFlashcard('user-1', '11111111-1111-4111-8111-111111111111', { topicId: '33333333-3333-4333-8333-333333333333', front: 'O que é mol?', back: 'Unidade de quantidade de matéria.', difficulty: 'MEDIUM' });
    assert.equal(created.id, 'flashcard-1');
    assert.equal(persisted.teacherId, 'teacher-1');
    assert.equal(persisted.monitorId, '11111111-1111-4111-8111-111111111111');
    assert.equal(persisted.subjectId, 'subject-1');
    assert.equal(persisted.topicId, '33333333-3333-4333-8333-333333333333');
    assert.equal(persisted.generationOrigin, 'TEACHER');
    assert.equal(persisted.status, 'APPROVED');
  } finally {
    (prisma.teacher as any).findUnique = originals.teacher;
    (prisma.monitor as any).findFirst = originals.monitor;
    (prisma.monitorTopic as any).findFirst = originals.topic;
    (prisma.flashcard as any).create = originals.create;
  }
});

test('manual flashcard rejects a monitor not owned by the authenticated teacher', { concurrency: false }, async () => {
  const { prisma } = await import('../../lib/prisma.js');
  const { createManualFlashcard } = await import('../content-review.repository.js');
  const originalTeacher = prisma.teacher.findUnique;
  const originalMonitor = prisma.monitor.findFirst;
  const originalCreate = prisma.flashcard.create;
  (prisma.teacher as any).findUnique = async () => ({ id: 'teacher-1' });
  (prisma.monitor as any).findFirst = async () => null;
  (prisma.flashcard as any).create = async () => { throw new Error('must not create'); };
  try {
    await assert.rejects(() => createManualFlashcard('user-1', '44444444-4444-4444-8444-444444444444', { topicId: '33333333-3333-4333-8333-333333333333', front: 'Pergunta', back: 'Resposta', difficulty: 'MEDIUM' }), /MONITOR_NOT_FOUND/);
  } finally {
    (prisma.teacher as any).findUnique = originalTeacher;
    (prisma.monitor as any).findFirst = originalMonitor;
    (prisma.flashcard as any).create = originalCreate;
  }
});
