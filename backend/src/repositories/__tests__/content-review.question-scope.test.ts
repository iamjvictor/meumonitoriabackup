import assert from 'node:assert/strict';
import test from 'node:test';

const userId = 'teacher-user-id';
const monitorId = '00000000-0000-4000-8000-000000000010';
const questionId = '00000000-0000-4000-8000-000000000020';
const foreignTopicId = '00000000-0000-4000-8000-000000000030';
const foreignSubjectId = '00000000-0000-4000-8000-000000000040';
const validTopicId = '00000000-0000-4000-8000-000000000050';

test('reviewQuestion rejects topic and subject outside the route monitor before updating', async (t) => {
  if (typeof t.mock.module !== 'function') {
    assert.fail('Este teste requer suporte a t.mock.module do node:test.');
  }

  const calls: Array<{ operation: string; args: Record<string, unknown> }> = [];
  let questionUpdates = 0;
  const question = {
    id: questionId,
    monitorId,
    subjectId: 'subject-in-monitor',
    topicId: null,
    alternatives: [],
    correctAnswer: null,
    explanation: null,
    status: 'PENDING_REVIEW',
  };
  const transaction = {
    question: {
      async update(args: Record<string, unknown>) {
        questionUpdates += 1;
        calls.push({ operation: 'question.update', args });
        return { ...question, ...args.data as object };
      },
    },
    questionTopic: {
      async updateMany(args: Record<string, unknown>) { calls.push({ operation: 'topic.updateMany', args }); return { count: 0 }; },
      async upsert(args: Record<string, unknown>) { calls.push({ operation: 'topic.upsert', args }); return {}; },
    },
  };
  const fakePrisma = {
    question: {
      async findFirst(args: Record<string, unknown>) { calls.push({ operation: 'question.findFirst', args }); return question; },
    },
    monitorTopic: {
      async findFirst(args: Record<string, unknown>) {
        calls.push({ operation: 'topic.findFirst', args });
        const where = args.where as Record<string, unknown>;
        const subjectFilter = where.subject as Record<string, unknown> | undefined;
        // A query scoped to this monitor must not find the fixture topic, which belongs elsewhere.
        if (subjectFilter?.monitorId !== monitorId) return { id: foreignTopicId, subjectId: foreignSubjectId };
        return where.id === validTopicId ? { id: validTopicId, subjectId: 'subject-in-monitor' } : null;
      },
    },
    monitorSubject: {
      async findFirst(args: Record<string, unknown>) {
        calls.push({ operation: 'subject.findFirst', args });
        const where = args.where as Record<string, unknown>;
        // A query scoped to this monitor must not find the fixture subject, which belongs elsewhere.
        return where.monitorId === monitorId ? null : { id: foreignSubjectId };
      },
    },
    teacher: {
      async findUnique() { return { id: userId }; },
    },
    async $transaction<T>(work: (client: typeof transaction) => Promise<T>) { return work(transaction); },
  };

  await t.mock.module('../../lib/prisma.js', { namedExports: { prisma: fakePrisma } });
  await t.mock.module('../../lib/supabase.js', {
    namedExports: { supabaseAdmin: { storage: { from() { throw new Error('unused'); } } } },
  });
  await t.mock.module('../../services/flashcard-front-hash.js', {
    namedExports: { computeFlashcardFrontHash: () => 'unused' },
  });
  const { reviewQuestion } = await import('../content-review.repository.js');

  await assert.rejects(
    reviewQuestion(userId, monitorId, questionId, { primaryTopicId: foreignTopicId }),
    (error: unknown) => {
      assert.equal((error as Error).message, 'QUESTION_TOPIC_NOT_FOUND');
      return true;
    },
    'A topic from another monitor must be rejected as a correctable reference error.',
  );
  assert.equal(questionUpdates, 0);

  await assert.rejects(
    reviewQuestion(userId, monitorId, questionId, { primaryTopicId: validTopicId, subjectId: foreignSubjectId }),
    (error: unknown) => {
      assert.equal((error as Error).message, 'QUESTION_SUBJECT_NOT_FOUND');
      return true;
    },
    'A foreign subject must be validated even when the request also supplies a valid in-monitor topic.',
  );
  assert.equal(questionUpdates, 0);

  await assert.rejects(
    reviewQuestion(userId, monitorId, questionId, { subjectId: foreignSubjectId }),
    (error: unknown) => {
      assert.equal((error as Error).message, 'QUESTION_SUBJECT_NOT_FOUND');
      return true;
    },
    'A subject from another monitor must be rejected as a correctable reference error.',
  );
  assert.equal(questionUpdates, 0);

  const topicQuery = calls.find((call) => call.operation === 'topic.findFirst')?.args.where as Record<string, unknown>;
  assert.deepEqual(topicQuery.subject, { monitorId });
  const subjectQuery = calls.find((call) => call.operation === 'subject.findFirst')?.args.where as Record<string, unknown>;
  assert.deepEqual(subjectQuery, { id: foreignSubjectId, monitorId });
});
