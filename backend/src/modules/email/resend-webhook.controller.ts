import type { FastifyReply, FastifyRequest } from 'fastify';
import { ResendWebhookMessageNotFoundError, ResendWebhookRepository, type ResendDeliveryEventType } from './resend-webhook.repository.js';
import { verifyResendWebhookSignature } from './resend-webhook-signature.js';

const EVENT_TYPES = new Set<ResendDeliveryEventType>(['email.delivered', 'email.delivery_delayed', 'email.bounced', 'email.complained']);

export class ResendWebhookController {
  constructor(private readonly webhookSecret: string, private readonly repository = new ResendWebhookRepository()) {}

  async handle(request: FastifyRequest & { rawBody?: string }, reply: FastifyReply) {
    const rawBody = request.rawBody;
    if (typeof rawBody !== 'string') return reply.code(400).send({ error: 'raw_body_required' });
    try {
      const valid = verifyResendWebhookSignature({ payload: rawBody, webhookSecret: this.webhookSecret, headers: {
        id: header(request, 'svix-id'), timestamp: header(request, 'svix-timestamp'), signature: header(request, 'svix-signature'),
      } });
      if (!valid) return reply.code(401).send({ error: 'invalid_signature' });
    } catch {
      return reply.code(401).send({ error: 'invalid_signature' });
    }

    let body: unknown;
    try { body = JSON.parse(rawBody); } catch { return reply.code(400).send({ error: 'invalid_payload' }); }
    if (!body || typeof body !== 'object') return reply.code(400).send({ error: 'invalid_payload' });
    const payload = body as { type?: unknown; created_at?: unknown; data?: { email_id?: unknown } };
    if (typeof payload.type !== 'string' || !EVENT_TYPES.has(payload.type as ResendDeliveryEventType)) return reply.code(200).send({ data: { ignored: true } });
    const createdAt = typeof payload.created_at === 'string' ? new Date(payload.created_at) : new Date(NaN);
    const providerMessageId = payload.data?.email_id;
    const eventId = header(request, 'svix-id');
    if (!eventId || !Number.isFinite(createdAt.getTime()) || typeof providerMessageId !== 'string' || !providerMessageId) {
      return reply.code(400).send({ error: 'invalid_payload' });
    }
    try {
      const result = await this.repository.applyDeliveryEvent({ id: eventId, type: payload.type as ResendDeliveryEventType, createdAt, providerMessageId });
      return reply.code(200).send({ data: result });
    } catch (error) {
      if (error instanceof ResendWebhookMessageNotFoundError) return reply.code(503).send({ error: 'message_not_correlated' });
      request.log.error({ event: 'email.resend_webhook_processing_failed', error: error instanceof Error ? error.message : 'unknown' });
      return reply.code(503).send({ error: 'webhook_processing_failed' });
    }
  }
}

function header(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
