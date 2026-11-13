import assert from 'node:assert/strict';
import test from 'node:test';
import { createErrorHandler } from '../../core/errors/error-handler.js';

const requestId = 'req-review-test';
const monitorId = '00000000-0000-4000-8000-000000000010';
const questionId = '00000000-0000-4000-8000-000000000020';
const questionText = 'TEXTO_PRIVADO_DA_QUESTAO';

function replySpy() {
  return {
    statusCode: 200,
    payload: undefined as unknown,
    code(value: number) { this.statusCode = value; return this; },
    send(value: unknown) { this.payload = value; return this; },
  };
}

test('ContentReviewController.question explica erros esperados e registra falhas inesperadas com segurança', async (t) => {
  if (typeof t.mock.module !== 'function') {
    assert.fail('Este teste requer suporte a t.mock.module do node:test.');
  }

  let reviewQuestionImpl: (...args: unknown[]) => Promise<unknown> = async () => null;
  let reviewQuestionCalls = 0;
  await t.mock.module('../../repositories/content-review.repository.js', {
    namedExports: {
      async createManualFlashcard() { throw new Error('unused'); },
      async createQuestion() { throw new Error('unused'); },
      async listDocumentsForMonitor() { throw new Error('unused'); },
      async listFlashcardsForMonitor() { throw new Error('unused'); },
      async listQuestionsForMonitor() { throw new Error('unused'); },
      async reviewFlashcard() { throw new Error('unused'); },
      async reviewQuestion(...args: unknown[]) {
        reviewQuestionCalls += 1;
        return reviewQuestionImpl(...args);
      },
    },
  });

  const { ContentReviewController } = await import('../content-review.controller.js');
  const controller = new ContentReviewController();
  const requestLogs: unknown[][] = [];
  const httpLogs: unknown[] = [];
  const handleError = createErrorHandler((entry) => httpLogs.push(entry));

  async function invoke(body: unknown) {
    const reply = replySpy();
    const request = {
      id: requestId,
      method: 'PUT',
      url: `/api/v1/monitors/${monitorId}/questions/${questionId}/review`,
      user: { id: 'teacher-user-id' },
      params: { monitorId, questionId },
      body,
      log: { error: (...args: unknown[]) => requestLogs.push(args) },
    };
    try {
      await controller.question(request as never, reply as never);
    } catch (error) {
      handleError(error, request, reply);
    }
    return { reply, request };
  }

  // AC-001: Zod issues identify the field and stop before persistence.
  reviewQuestionCalls = 0;
  const invalidPayload = await invoke({ primaryTopicId: 'invalid-uuid' });
  assert.equal(invalidPayload.reply.statusCode, 422);
  assert.match(JSON.stringify(invalidPayload.reply.payload), /primaryTopicId/);
  assert.equal(reviewQuestionCalls, 0);

  // AC-002: recognized domain failures are actionable client errors.
  const domainErrors = [
    ['QUESTION_REQUIRES_PRIMARY_TOPIC', /tópico/i],
    ['QUESTION_REQUIRES_PROMPT', /enunciado/i],
    ['QUESTION_REQUIRES_ANSWER_KEY', /gabarito|resposta/i],
    ['QUESTION_REQUIRES_FIVE_ALTERNATIVES', /cinco|5 alternativas/i],
    ['QUESTION_TOPIC_NOT_FOUND', /tópico/i],
    ['QUESTION_SUBJECT_NOT_FOUND', /matéria|assunto/i],
  ] as const;
  for (const [code, expectedMessage] of domainErrors) {
    reviewQuestionImpl = async () => { throw new Error(code); };
    const result = await invoke({ status: 'APPROVED', text: questionText });
    assert.equal(result.reply.statusCode, 422, `${code} should be HTTP 422`);
    const payload = JSON.stringify(result.reply.payload);
    assert.match(payload, new RegExp(code));
    assert.match(payload, expectedMessage);
    assert.equal(payload.includes(questionText), false);
  }

  // AC-006: incomplete content returned by the repository maps to clear field errors.
  const incompleteContentErrors = [
    ['QUESTION_REQUIRES_PROMPT', /enunciado/i],
    ['QUESTION_REQUIRES_FIVE_ALTERNATIVES', /alternativas/i],
    ['QUESTION_REQUIRES_ANSWER_KEY', /gabarito/i],
  ] as const;
  for (const [code, expectedMessage] of incompleteContentErrors) {
    reviewQuestionImpl = async () => { throw new Error(code); };
    const result = await invoke({ status: 'PENDING_REVIEW', text: questionText });
    const payload = JSON.stringify(result.reply.payload);
    assert.equal(result.reply.statusCode, 422, `${code} should be HTTP 422`);
    assert.match(payload, new RegExp(code));
    assert.match(payload, expectedMessage);
  }

  // AC-007/AC-008: status-only moderation and edits with an empty optional explanation remain valid.
  const statusOnlyApproved = { id: questionId, status: 'APPROVED' };
  reviewQuestionImpl = async (_userId, _monitorId, _questionId, payload) => {
    assert.deepEqual(payload, { status: 'APPROVED' });
    return statusOnlyApproved;
  };
  const statusOnly = await invoke({ status: 'APPROVED' });
  assert.equal(statusOnly.reply.statusCode, 200);
  assert.deepEqual(statusOnly.reply.payload, { data: statusOnlyApproved });

  const validWithoutExplanation = { id: questionId, status: 'PENDING_REVIEW', text: questionText, explanation: '' };
  reviewQuestionImpl = async (_userId, _monitorId, _questionId, payload) => {
    assert.deepEqual(payload, { status: 'PENDING_REVIEW', text: questionText, explanation: '' });
    return validWithoutExplanation;
  };
  const withoutExplanation = await invoke({ status: 'PENDING_REVIEW', text: questionText, explanation: '' });
  assert.equal(withoutExplanation.reply.statusCode, 200);
  assert.deepEqual(withoutExplanation.reply.payload, { data: validWithoutExplanation });

  // AC-003: unexpected DB failures stay generic publicly but become diagnosable in server logs.
  const privateDatabaseDetail = 'DB_SCHEMA_DETAIL_PRIVATE';
  reviewQuestionImpl = async () => { throw new Error(privateDatabaseDetail); };
  const unexpected = await invoke({ status: 'PENDING_REVIEW', text: questionText });
  const publicError = JSON.stringify(unexpected.reply.payload);
  assert.equal(unexpected.reply.statusCode, 500);
  assert.equal(publicError.includes(privateDatabaseDetail), false);
  assert.equal(publicError.includes(questionText), false);
  assert.equal(requestLogs.length, 1);
  const [logMetadata, logMessage] = requestLogs[0] ?? [];
  assert.match(String(logMessage), /atualizar a questão/i);
  const metadata = logMetadata as Record<string, unknown>;
  assert.equal(metadata.event, 'content_review.question_update_failed');
  assert.equal(metadata.requestId, requestId);
  assert.equal(metadata.monitorId, monitorId);
  assert.equal(metadata.questionId, questionId);
  assert.equal((metadata.err as { message?: string })?.message, privateDatabaseDetail);
  assert.equal(JSON.stringify(requestLogs).includes(questionText), false);

  // Prototype properties on the domain-message map must not turn arbitrary errors into 4xx responses.
  reviewQuestionImpl = async () => { throw new Error('toString'); };
  const inheritedMessage = await invoke({ status: 'PENDING_REVIEW', text: questionText });
  assert.equal(inheritedMessage.reply.statusCode, 500);
  assert.match(JSON.stringify(inheritedMessage.reply.payload), /FAILED_TO_UPDATE_QUESTION/);
  assert.equal(JSON.stringify(inheritedMessage.reply.payload).includes('toString'), false);
  assert.equal(requestLogs.length, 2);
  const inheritedErrorLog = requestLogs.at(-1)?.[0] as Record<string, unknown>;
  assert.equal((inheritedErrorLog.err as { message?: string })?.message, 'toString');
  assert.equal(JSON.stringify(requestLogs).includes(questionText), false);

  // AC-004: preserve 404 and the established success body.
  reviewQuestionImpl = async () => null;
  const missing = await invoke({ status: 'PENDING_REVIEW' });
  assert.equal(missing.reply.statusCode, 404);
  assert.match(JSON.stringify(missing.reply.payload), /QUESTION_NOT_FOUND/);

  const updatedQuestion = { id: questionId, status: 'PENDING_REVIEW', text: 'updated' };
  reviewQuestionImpl = async () => updatedQuestion;
  const success = await invoke({ status: 'PENDING_REVIEW' });
  assert.equal(success.reply.statusCode, 200);
  assert.deepEqual(success.reply.payload, { data: updatedQuestion });
  assert.equal(requestLogs.length, 2);
  assert.ok(httpLogs.length >= 1);
});
