import assert from 'node:assert/strict';
import test from 'node:test';

const userId = 'teacher-user-id';
const monitorId = '00000000-0000-4000-8000-000000000010';
const questionId = '00000000-0000-4000-8000-000000000020';
const validAlternatives = ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Texto ${label}` }));

test('reviewQuestion validates effective required content and leaves explanation optional', async (t) => {
  if (typeof t.mock.module !== 'function') {
    assert.fail('Este teste requer suporte a t.mock.module do node:test.');
  }

  let storedQuestion: Record<string, unknown> = {};
  const calls: Array<{ operation: string; args: Record<string, unknown> }> = [];
  let updateCount = 0;
  const transaction = {
    question: {
      async update(args: Record<string, unknown>) {
        updateCount += 1;
        calls.push({ operation: 'question.update', args });
        const data = Object.fromEntries(Object.entries(args.data as Record<string, unknown>).filter(([, value]) => value !== undefined));
        storedQuestion = { ...storedQuestion, ...data };
        return storedQuestion;
      },
    },
    questionTopic: {
      async updateMany(args: Record<string, unknown>) { calls.push({ operation: 'topic.updateMany', args }); return { count: 0 }; },
      async upsert(args: Record<string, unknown>) { calls.push({ operation: 'topic.upsert', args }); return {}; },
    },
  };
  const fakePrisma = {
    question: {
      async findFirst(args: Record<string, unknown>) {
        calls.push({ operation: 'question.findFirst', args });
        return { ...storedQuestion };
      },
    },
    monitorTopic: {
      async findFirst(args: Record<string, unknown>) { calls.push({ operation: 'topic.findFirst', args }); return { id: 'topic-1', subjectId: 'subject-1' }; },
    },
    monitorSubject: {
      async findFirst(args: Record<string, unknown>) { calls.push({ operation: 'subject.findFirst', args }); return { id: 'subject-1' }; },
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

  const resetQuestion = (overrides: Record<string, unknown> = {}) => {
    storedQuestion = {
      id: questionId,
      monitorId,
      subjectId: 'subject-1',
      topicId: 'topic-1',
      text: 'Enunciado válido',
      alternatives: validAlternatives,
      correctAnswer: 'A',
      explanation: 'Explicação existente',
      status: 'PENDING_REVIEW',
      ...overrides,
    };
  };
  const expectDomainError = async (input: Record<string, unknown>, expectedCode: string) => {
    const beforeUpdates = updateCount;
    await assert.rejects(
      reviewQuestion(userId, monitorId, questionId, input as never),
      (error: unknown) => {
        assert.equal((error as Error).message, expectedCode);
        return true;
      },
    );
    assert.equal(updateCount, beforeUpdates, `${expectedCode} must be rejected before persistence`);
  };

  // AC-006: edits cannot leave the effective statement, A–E alternatives, or answer key incomplete.
  resetQuestion();
  await expectDomainError({ text: '   ' }, 'QUESTION_REQUIRES_PROMPT');

  resetQuestion();
  await expectDomainError({ alternatives: validAlternatives.slice(0, 4) }, 'QUESTION_REQUIRES_FIVE_ALTERNATIVES');

  resetQuestion();
  await expectDomainError({ alternatives: validAlternatives.map((option) => option.label === 'C' ? { ...option, text: '  ' } : option) }, 'QUESTION_REQUIRES_FIVE_ALTERNATIVES');

  resetQuestion();
  await expectDomainError({ correctAnswer: null }, 'QUESTION_REQUIRES_ANSWER_KEY');

  resetQuestion();
  await expectDomainError({ correctAnswer: 'Z' }, 'QUESTION_REQUIRES_ANSWER_KEY');

  resetQuestion();
  await expectDomainError({ correctAnswer: 'B', alternatives: validAlternatives.map((option) => option.label === 'B' ? { ...option, text: '' } : option) }, 'QUESTION_REQUIRES_FIVE_ALTERNATIVES');

  // AC-007: blank/missing explanation never blocks valid content or approval.
  for (const explanation of [undefined, null, '']) {
    resetQuestion({ explanation: 'Explicação existente' });
    const input = {
      status: 'APPROVED',
      text: 'Enunciado atualizado',
      alternatives: validAlternatives,
      correctAnswer: 'A',
      ...(explanation === undefined ? {} : { explanation }),
    };
    const result = await reviewQuestion(userId, monitorId, questionId, input as never);
    assert.equal((result as Record<string, unknown>).status, 'APPROVED');
  }

  // AC-008: reject-only status actions skip content completeness checks; approval-only checks stored state.
  resetQuestion({ text: '', alternatives: [], correctAnswer: null, explanation: null });
  const beforeRejectUpdates = updateCount;
  const rejected = await reviewQuestion(userId, monitorId, questionId, { status: 'REJECTED' });
  assert.equal((rejected as Record<string, unknown>).status, 'REJECTED');
  assert.equal(updateCount, beforeRejectUpdates + 1);

  resetQuestion({ text: '', alternatives: [], correctAnswer: null, explanation: null });
  await expectDomainError({ status: 'APPROVED' }, 'QUESTION_REQUIRES_PROMPT');

  resetQuestion({ explanation: null });
  const beforeApproveUpdates = updateCount;
  const approved = await reviewQuestion(userId, monitorId, questionId, { status: 'APPROVED' });
  assert.equal((approved as Record<string, unknown>).status, 'APPROVED');
  assert.equal(updateCount, beforeApproveUpdates + 1);
  assert.equal(storedQuestion.explanation, null);

  // A content update with an empty explanation also remains valid and persists its editable fields.
  resetQuestion();
  const beforeEditUpdates = updateCount;
  const edited = await reviewQuestion(userId, monitorId, questionId, {
    text: 'Enunciado atualizado', alternatives: validAlternatives, correctAnswer: 'B', explanation: '',
  });
  assert.equal(updateCount, beforeEditUpdates + 1);
  assert.equal((edited as Record<string, unknown>).text, 'Enunciado atualizado');
  assert.equal(storedQuestion.explanation, '');
});
