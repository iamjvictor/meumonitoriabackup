import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentVisualReviewController } from '../document-visual-review.controller.js';
import { documentVisualReviewRoutes } from '../../routes/document-visual-review.routes.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

test('registra a confirmação visual com middleware de autenticação', async () => {
  let registration: { path: string; options: { onRequest: unknown } } | undefined;
  await documentVisualReviewRoutes({
    post: (path: string, options: { onRequest: unknown }) => { registration = { path, options }; },
  } as never);
  assert.equal(registration?.path, '/documents/:documentId/questions/:questionId/visual-assets/:assetId/review');
  assert.equal(registration?.options.onRequest, authMiddleware);
});

test('requires an authenticated user before confirming a visual link', async () => {
  const controller = new DocumentVisualReviewController({ confirmQuestionVisualReview: async () => { throw new Error('must not call'); } } as never);
  await assert.rejects(controller.confirm({ user: null } as never, { send: () => ({}) } as never), (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'UNAUTHENTICATED');
    assert.equal((error as { statusCode?: number }).statusCode, 401);
    return true;
  });
});

test('passes authenticated actor and exact document/question/span/asset identifiers to confirmation service', async () => {
  let received: unknown;
  const controller = new DocumentVisualReviewController({
    confirmQuestionVisualReview: async (input: unknown) => { received = input; return { assetId: 'asset-1', method: 'REVIEW' }; },
  } as never);
  let response: unknown;
  const request = {
    user: { id: 'user-teacher-1' },
    params: { documentId: '00000000-0000-4000-8000-000000000001', questionId: '00000000-0000-4000-8000-000000000002', assetId: '00000000-0000-4000-8000-000000000003' },
    body: { questionSpanId: '00000000-0000-4000-8000-000000000004' },
  };
  await controller.confirm(request as never, { send: (value: unknown) => { response = value; return value; } } as never);
  assert.deepEqual(received, {
    documentId: request.params.documentId,
    questionId: request.params.questionId,
    assetId: request.params.assetId,
    questionSpanId: request.body.questionSpanId,
    actorUserId: request.user.id,
  });
  assert.deepEqual(response, { data: { assetId: 'asset-1', method: 'REVIEW' } });
});
