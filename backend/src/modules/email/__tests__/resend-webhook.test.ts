import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import test from 'node:test';
import Fastify from 'fastify';
import { ResendWebhookController } from '../resend-webhook.controller.js';
import { resendWebhookRoutes } from '../resend-webhook.routes.js';
import { verifyResendWebhookSignature } from '../resend-webhook-signature.js';
import { ResendWebhookRepository } from '../resend-webhook.repository.js';

const secretBytes = randomBytes(32);
const secret = `whsec_${secretBytes.toString('base64')}`;
const timestamp = String(Math.floor(Date.now() / 1000));
function signedHeaders(payload: string, id = 'evt_123') {
  const signature = createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${payload}`).digest('base64');
  return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` };
}

test('verifies Svix signature over exact raw payload and rejects tampering or stale timestamp', () => {
  const body = '{ "type":"email.delivered" }';
  const headers = signedHeaders(body);
  assert.equal(verifyResendWebhookSignature({ payload: body, headers: { id: headers['svix-id'], timestamp: headers['svix-timestamp'], signature: headers['svix-signature'] }, webhookSecret: secret }), true);
  assert.equal(verifyResendWebhookSignature({ payload: `${body} `, headers: { id: headers['svix-id'], timestamp: headers['svix-timestamp'], signature: headers['svix-signature'] }, webhookSecret: secret }), false);
  assert.throws(() => verifyResendWebhookSignature({ payload: body, headers: { ...{ id: headers['svix-id'], timestamp: '1', signature: headers['svix-signature'] } }, webhookSecret: secret }));
});

test('webhook route verifies raw body before processing and delegates a valid delivery event', async () => {
  const received: unknown[] = [];
  const repository = { applyDeliveryEvent: async (event: unknown) => { received.push(event); return { duplicate: false, updated: true }; } };
  const app = Fastify();
  await app.register(async (scope) => resendWebhookRoutes(scope, new ResendWebhookController(secret, repository as never)));
  const raw = '{ "type": "email.delivered", "created_at": "2026-11-01T12:00:00.000Z", "data": { "email_id": "em_123" } }';
  const response = await app.inject({ method: 'POST', url: '/webhooks/resend', headers: { ...signedHeaders(raw), 'content-type': 'application/json' }, payload: raw });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(received, [{ id: 'evt_123', type: 'email.delivered', createdAt: new Date('2026-11-01T12:00:00.000Z'), providerMessageId: 'em_123' }]);

  const invalid = await app.inject({ method: 'POST', url: '/webhooks/resend', headers: { ...signedHeaders(raw), 'svix-signature': 'v1,invalid', 'content-type': 'application/json' }, payload: raw });
  assert.equal(invalid.statusCode, 401);
  assert.equal(received.length, 1);
  await app.close();
});

test('repository deduplicates event IDs and prevents older delivery events from regressing status', async () => {
  const events: Array<{ environment: string; eventId: string; eventType: string; providerMessageId: string; providerCreatedAt: Date; receivedAt: Date }> = [];
  const message = { id: 'outbox-1', status: 'ACCEPTED' };
  const tx = {
    $queryRaw: async () => [],
    emailWebhookEvent: {
      findUnique: async ({ where }: { where: { environment_eventId: { environment: string; eventId: string } } }) => events.find((event) => event.eventId === where.environment_eventId.eventId && event.environment === where.environment_eventId.environment) ?? null,
      findFirst: async ({ where }: { where: { environment: string } }) => [...events].filter((event) => event.environment === where.environment).sort((a, b) => b.providerCreatedAt.getTime() - a.providerCreatedAt.getTime() || b.receivedAt.getTime() - a.receivedAt.getTime())[0] ?? null,
      create: async ({ data }: { data: Omit<typeof events[number], 'receivedAt'> }) => { const inserted = { ...data, receivedAt: new Date() }; events.push(inserted); return inserted; },
    },
    emailOutboxMessage: {
      findFirst: async ({ where }: { where: { environment: string } }) => where.environment === 'SANDBOX' ? message : null,
      updateMany: async ({ data }: { data: { status: string } }) => { message.status = data.status; return { count: 1 }; },
    },
  };
  const db = { $transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) };
  const repository = new ResendWebhookRepository(db as never, 'SANDBOX');
  const delivered = { id: 'evt-new', type: 'email.delivered' as const, createdAt: new Date('2026-11-01T12:00:00Z'), providerMessageId: 'em_123' };
  assert.deepEqual(await repository.applyDeliveryEvent(delivered), { duplicate: false, updated: true });
  assert.equal(message.status, 'DELIVERED');
  assert.deepEqual(await repository.applyDeliveryEvent(delivered), { duplicate: true, updated: false });
  assert.deepEqual(await repository.applyDeliveryEvent({ id: 'evt-old', type: 'email.delivery_delayed', createdAt: new Date('2026-11-01T11:59:00Z'), providerMessageId: 'em_123' }), { duplicate: false, updated: false });
  assert.equal(message.status, 'DELIVERED');
  assert.equal(events.length, 2);
});

test('delivery webhook scopes message lookup and dedupe to its configured environment', async () => {
  let messageWhere: any;
  let eventWhere: any;
  const tx = {
    $queryRaw: async () => [],
    emailWebhookEvent: { findUnique: async ({ where }: any) => { eventWhere = where; return null; } },
    emailOutboxMessage: { findFirst: async ({ where }: any) => { messageWhere = where; return null; } },
  };
  const repository = new ResendWebhookRepository({ $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) } as never, 'PRODUCTION');
  await assert.rejects(() => repository.applyDeliveryEvent({ id: 'evt-cross-env', type: 'email.delivered', createdAt: new Date(), providerMessageId: 'em_missing' }));
  assert.deepEqual(eventWhere.environment_eventId, { environment: 'PRODUCTION', eventId: 'evt-cross-env' });
  assert.equal(messageWhere.environment, 'PRODUCTION');
});
