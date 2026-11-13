import type { FastifyInstance } from 'fastify';
import { DocumentVisualReviewController } from '../controllers/document-visual-review.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

export async function documentVisualReviewRoutes(app: FastifyInstance) {
  const controller = new DocumentVisualReviewController();
  app.post<{ Params: { documentId: string; questionId: string; assetId: string }; Body: { questionSpanId: string } }>(
    '/documents/:documentId/questions/:questionId/visual-assets/:assetId/review',
    { onRequest: authMiddleware },
    controller.confirm.bind(controller),
  );
}
