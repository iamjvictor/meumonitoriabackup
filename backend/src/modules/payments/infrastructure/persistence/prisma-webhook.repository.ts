import type { Prisma } from '@prisma/client';
import { prisma } from '../../../../lib/prisma.js';
import type { PaymentWebhookInbox, PaymentWebhookInboxInput } from '../../application/commands/accept-webhook.use-case.js';
import { PrismaPaymentOutboxRepository } from './prisma-outbox.repository.js';

export const MAX_PAYMENT_WEBHOOK_ATTEMPTS = 10;

export function getWebhookRetryState(attempts: number) {
  return attempts >= MAX_PAYMENT_WEBHOOK_ATTEMPTS ? 'DEAD_LETTER' : 'WAITING_CORRELATION';
}

export function isRecoverableWebhookState(
  state: string,
  schedule: { nextAttemptAt?: Date | null; leaseUntil?: Date | null } = {},
  now = new Date(),
) {
  if (state === 'RECEIVED') return true;
  if (state === 'FAILED' || state === 'WAITING_CORRELATION') return Boolean(schedule.nextAttemptAt && schedule.nextAttemptAt <= now);
  if (state === 'PROCESSING') return Boolean(schedule.leaseUntil && schedule.leaseUntil < now);
  return false;
}

export class PrismaPaymentWebhookRepository implements PaymentWebhookInbox {
  constructor(
    private readonly environment: string,
    private readonly outbox = new PrismaPaymentOutboxRepository(),
  ) {}

  async accept(input: PaymentWebhookInboxInput) {
    console.log('Persistindo evento de webhook Asaas', { event: 'payments.webhook_inbox_write_started', tableName: 'payment_webhook_events', providerEventId: input.providerEventId, eventType: input.eventType, providerAccountId: input.providerAccountId });
    try {
      const linkedProviderAccountId = await this.resolveLinkedProviderAccountId(input.providerAccountId);
      const event = await prisma.$transaction(async (transaction) => {
        const created = await transaction.paymentWebhookEvent.create({
          data: {
            environment: this.environment,
            providerAccountId: linkedProviderAccountId,
            sourceProviderAccountId: input.providerAccountId,
            providerEventId: input.providerEventId,
            eventType: input.eventType,
            payload: input.payload as Prisma.InputJsonValue,
            state: 'RECEIVED',
          },
        });
        await this.outbox.createInTransaction(transaction, {
          eventId: `payment-webhook:${this.environment}:${input.providerEventId}`,
          aggregateId: created.id,
          eventType: 'PAYMENT_WEBHOOK_RECEIVED',
          payload: { eventId: created.id, eventType: input.eventType },
        });
        return created;
      });
      console.log('Evento de webhook Asaas persistido', { event: 'payments.webhook_inbox_write_completed', tableName: 'payment_webhook_events', eventId: event.id, providerEventId: input.providerEventId, state: event.state, providerAccountLinked: Boolean(linkedProviderAccountId) });
      return { id: event.id, duplicate: false, state: event.state };
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const linkedProviderAccountId = await this.resolveLinkedProviderAccountId(input.providerAccountId);
      const existing = await prisma.paymentWebhookEvent.findFirst({
        where: { environment: this.environment, providerEventId: input.providerEventId },
        select: { id: true, state: true },
      });
      if (!existing) throw error;
      if (linkedProviderAccountId) {
        await prisma.paymentWebhookEvent.updateMany({
          where: { id: existing.id, providerAccountId: null },
          data: { providerAccountId: linkedProviderAccountId },
        });
      }
      console.log('Webhook Asaas duplicado identificado', { event: 'payments.webhook_duplicate', tableName: 'payment_webhook_events', eventId: existing.id, providerEventId: input.providerEventId, state: existing.state });
      return { id: existing.id, duplicate: true, state: existing.state };
    }
  }

  private async resolveLinkedProviderAccountId(providerAccountId: string | undefined) {
    if (!providerAccountId) return undefined;
    const account = await prisma.paymentAccount.findUnique({
      where: { providerAccountId },
      select: { providerAccountId: true },
    });
    if (account?.providerAccountId) return account.providerAccountId;

    console.log('Webhook recebido de conta Asaas sem vínculo local', {
      event: 'payments.webhook_provider_account_unlinked',
      providerAccountId,
      reason: 'PRIMARY_ACCOUNT_OR_EXTERNAL_SUBACCOUNT',
    });
    return undefined;
  }

  async claim(eventId: string) {
    console.log('Tentando reivindicar webhook Asaas para processamento', { event: 'payments.webhook_claim_started', tableName: 'payment_webhook_events', eventId });
    const leaseUntil = new Date(Date.now() + 5 * 60_000);
    const claimed = await prisma.paymentWebhookEvent.updateMany({
      where: {
        id: eventId,
        OR: [
          { state: 'RECEIVED' },
          { state: 'FAILED', nextAttemptAt: { lte: new Date() } },
          { state: 'WAITING_CORRELATION', nextAttemptAt: { lte: new Date() } },
          { state: 'PROCESSING', leaseUntil: { lt: new Date() } },
        ],
      },
      data: { state: 'PROCESSING', attempts: { increment: 1 }, leaseUntil },
    });
    if (claimed.count !== 1) {
      console.log('Webhook Asaas não foi reivindicado', { event: 'payments.webhook_claim_skipped', tableName: 'payment_webhook_events', eventId });
      return null;
    }
    const event = await prisma.paymentWebhookEvent.findUnique({ where: { id: eventId } });
    console.log('Webhook Asaas reivindicado', { event: 'payments.webhook_claim_completed', tableName: 'payment_webhook_events', eventId, eventType: event?.eventType, attempts: event?.attempts });
    return event;
  }

  findRecoverable(limit = 100) {
    return prisma.paymentWebhookEvent.findMany({
      where: {
        attempts: { lt: 10 },
        OR: [
          { state: 'RECEIVED' },
          { state: 'FAILED', nextAttemptAt: { lte: new Date() } },
          { state: 'WAITING_CORRELATION', nextAttemptAt: { lte: new Date() } },
          { state: 'PROCESSING', leaseUntil: { lt: new Date() } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });
  }

  async markExhaustedForAttention(limit = 100) {
    const now = new Date();
    const exhausted = await prisma.paymentWebhookEvent.findMany({
      where: {
        attempts: { gte: MAX_PAYMENT_WEBHOOK_ATTEMPTS },
        OR: [
          { state: 'RECEIVED' },
          { state: 'FAILED' },
          { state: 'WAITING_CORRELATION' },
          { state: 'PROCESSING', leaseUntil: { lt: now } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    if (exhausted.length === 0) return 0;
    const result = await prisma.paymentWebhookEvent.updateMany({
      where: { id: { in: exhausted.map(({ id }) => id) }, attempts: { gte: MAX_PAYMENT_WEBHOOK_ATTEMPTS } },
      data: { state: 'DEAD_LETTER', leaseUntil: null, processedAt: null, nextAttemptAt: null, failureMessage: 'WEBHOOK_RETRY_LIMIT_REACHED' },
    });
    if (result.count > 0) console.error('Webhooks esgotados enviados para revisão operacional', { event: 'payments.webhook_dead_letter_batch', count: result.count });
    return result.count;
  }

  markWaitingCorrelation(eventId: string, attempts = 0) {
    const state = getWebhookRetryState(attempts);
    if (state === 'DEAD_LETTER') console.error('Webhook atingiu o limite de tentativas aguardando correlação', { event: 'payments.webhook_dead_letter', eventId, attempts, reason: 'CORRELATION_RETRY_LIMIT_REACHED' });
    return prisma.paymentWebhookEvent.update({
      where: { id: eventId },
      data: {
        state,
        leaseUntil: null,
        processedAt: null,
        failureMessage: state === 'DEAD_LETTER' ? 'WEBHOOK_CORRELATION_RETRY_LIMIT_REACHED' : null,
        nextAttemptAt: state === 'DEAD_LETTER' ? null : new Date(Date.now() + 60_000),
      },
    });
  }

  markProcessed(eventId: string, state = 'PROCESSED') {
    return prisma.paymentWebhookEvent.update({
      where: { id: eventId },
      data: { state, leaseUntil: null, processedAt: new Date(), nextAttemptAt: null },
    });
  }

  markIgnored(eventId: string) {
    return prisma.paymentWebhookEvent.update({ where: { id: eventId }, data: { state: 'IGNORED', leaseUntil: null, processedAt: new Date() } });
  }

  markFailed(eventId: string, message: string, attempts = 0) {
    const state = attempts >= MAX_PAYMENT_WEBHOOK_ATTEMPTS ? 'DEAD_LETTER' : 'FAILED';
    if (state === 'DEAD_LETTER') console.error('Webhook atingiu o limite de tentativas de processamento', { event: 'payments.webhook_dead_letter', eventId, attempts, reason: 'PROCESSING_RETRY_LIMIT_REACHED' });
    return prisma.paymentWebhookEvent.update({ where: { id: eventId }, data: { state, leaseUntil: null, failureMessage: state === 'DEAD_LETTER' ? 'WEBHOOK_PROCESSING_RETRY_LIMIT_REACHED' : message, nextAttemptAt: state === 'DEAD_LETTER' ? null : new Date(Date.now() + 60_000), processedAt: null } });
  }
}
