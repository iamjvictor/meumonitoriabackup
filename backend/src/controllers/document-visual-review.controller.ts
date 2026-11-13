import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../core/errors/app-error.js';
import { PrismaDocumentVisualLinkStore } from '../repositories/document-visual-link.repository.js';
import { DocumentVisualLinkingService } from '../worker/services/document-visual-linking.service.js';

const paramsSchema = z.object({ documentId: z.string().uuid(), questionId: z.string().uuid(), assetId: z.string().uuid() }).strict();
const bodySchema = z.object({ questionSpanId: z.string().uuid() }).strict();

export class DocumentVisualReviewController {
  constructor(private readonly visualLinking = new DocumentVisualLinkingService(
    new PrismaDocumentVisualLinkStore(),
    (event, fields) => console.info(event, fields),
  )) {}

  async confirm(request: FastifyRequest<{ Params: unknown; Body: unknown }>, reply: FastifyReply) {
    if (!request.user) throw new AppError({ code: 'UNAUTHENTICATED', statusCode: 401, publicMessage: 'Sessão de usuário obrigatória.' });
    const params = paramsSchema.safeParse(request.params);
    const body = bodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      throw new AppError({ code: 'VALIDATION_ERROR', statusCode: 422, publicMessage: 'Dados de confirmação visual inválidos.' });
    }
    try {
      const result = await this.visualLinking.confirmQuestionVisualReview({
        documentId: params.data.documentId,
        questionId: params.data.questionId,
        questionSpanId: body.data.questionSpanId,
        assetId: params.data.assetId,
        actorUserId: request.user.id,
      });
      return reply.send({ data: result });
    } catch (cause) {
      if (cause instanceof AppError) throw cause;
      const message = cause instanceof Error ? cause.message : '';
      if (/não pertence ao documento autorizado|não corresponde inequivocamente|corresponde a mais de um span|fora do intervalo de páginas/i.test(message)) {
        throw new AppError({ code: 'VISUAL_REVIEW_NOT_AUTHORIZED', statusCode: 404, publicMessage: 'Não foi possível confirmar esse vínculo visual.' });
      }
      throw new AppError({ code: 'VISUAL_REVIEW_FAILED', statusCode: 500, publicMessage: 'Não foi possível confirmar o vínculo visual.', cause });
    }
  }
}
