import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ResendWebhookController } from './resend-webhook.controller.js';

declare module 'fastify' {
  interface FastifyRequest { rawBody?: string }
}

export async function resendWebhookRoutes(app: FastifyInstance, controller: ResendWebhookController) {
  app.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 1_000_000 }, (request, body, done) => {
    const rawBody = Buffer.isBuffer(body) ? body.toString('utf8') : body;
    request.rawBody = rawBody;
    try { done(null, JSON.parse(rawBody)); } catch (error) { done(error as Error); }
  });
  app.post('/webhooks/resend', controller.handle.bind(controller));
}
