import type { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';

export type ResendDeliveryEventType = 'email.delivered' | 'email.delivery_delayed' | 'email.bounced' | 'email.complained';
export type ResendDeliveryEvent = { id: string; type: ResendDeliveryEventType; createdAt: Date; providerMessageId: string };

export class ResendWebhookMessageNotFoundError extends Error {
  constructor() { super('Email sent by Resend is not yet correlated to an outbox row'); }
}

export class ResendWebhookRepository {
  private readonly environment: 'SANDBOX' | 'PRODUCTION';

  constructor(private readonly database: PrismaClient = prisma, environment: string = env.ASAAS_ENV.toUpperCase()) {
    if (environment !== 'SANDBOX' && environment !== 'PRODUCTION') throw new Error('Resend webhook environment must be SANDBOX or PRODUCTION');
    this.environment = environment;
  }

  async applyDeliveryEvent(event: ResendDeliveryEvent) {
    return this.database.$transaction(async (tx) => {
      await lockProviderMessage(tx, this.environment, event.providerMessageId);
      const duplicate = await tx.emailWebhookEvent.findUnique({ where: { environment_eventId: { environment: this.environment, eventId: event.id } }, select: { eventId: true } });
      if (duplicate) return { duplicate: true, updated: false };

      const message = await tx.emailOutboxMessage.findFirst({
        where: { environment: this.environment, providerMessageId: event.providerMessageId },
        select: { id: true, status: true },
      });
      if (!message) throw new ResendWebhookMessageNotFoundError();

      const previous = await tx.emailWebhookEvent.findFirst({
        where: { environment: this.environment, providerMessageId: event.providerMessageId },
        orderBy: [{ providerCreatedAt: 'desc' }, { receivedAt: 'desc' }],
        select: { eventType: true, providerCreatedAt: true },
      });
      await tx.emailWebhookEvent.create({ data: {
        environment: this.environment,
        eventId: event.id,
        eventType: event.type,
        providerMessageId: event.providerMessageId,
        providerCreatedAt: event.createdAt,
      } });

      if (previous && shouldKeepPrevious(previous, event)) return { duplicate: false, updated: false };
      const nextStatus = statusForEvent(event.type);
      if (message.status === nextStatus) return { duplicate: false, updated: false };
      const updated = await tx.emailOutboxMessage.updateMany({
        where: { id: message.id, environment: this.environment, providerMessageId: event.providerMessageId },
        data: { status: nextStatus, leaseUntil: null, nextAttemptAt: null },
      });
      return { duplicate: false, updated: updated.count === 1 };
    });
  }
}

function shouldKeepPrevious(previous: { eventType: string; providerCreatedAt: Date }, incoming: ResendDeliveryEvent) {
  const previousTime = previous.providerCreatedAt.getTime();
  const incomingTime = incoming.createdAt.getTime();
  if (previousTime > incomingTime) return true;
  return previousTime === incomingTime && eventPriority(previous.eventType) >= eventPriority(incoming.type);
}

function eventPriority(eventType: string) {
  switch (eventType) {
    case 'email.delivery_delayed': return 0;
    case 'email.delivered': return 1;
    case 'email.bounced': return 2;
    case 'email.complained': return 3;
    default: return -1;
  }
}

function statusForEvent(eventType: ResendDeliveryEventType) {
  switch (eventType) {
    case 'email.delivered': return 'DELIVERED';
    case 'email.delivery_delayed': return 'DELIVERY_DELAYED';
    case 'email.bounced': return 'BOUNCED';
    case 'email.complained': return 'COMPLAINED';
  }
}

async function lockProviderMessage(tx: Prisma.TransactionClient, environment: string, providerMessageId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`resend-webhook:${environment}:${providerMessageId}`}, 0)) IS NULL`;
}
