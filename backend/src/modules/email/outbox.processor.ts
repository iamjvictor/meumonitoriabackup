import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ResendEmailProvider } from './resend-email.provider.js';
import { EmailOutboxCipher } from './outbox-crypto.js';

export type EmailOutboxStore = {
  claim(id: string, now: Date): Promise<{ id: string; encryptedPayload: string; idempotencyKey: string; createdAt: Date; attempts: number } | null>;
  markAccepted(id: string, providerMessageId: string, sentAt: Date): Promise<void>;
  markFailure(id: string, message: string, retryAt: Date | null, uncertain: boolean): Promise<void>;
};

export class PrismaEmailOutboxStore implements EmailOutboxStore {
  constructor(private readonly environment: 'SANDBOX' | 'PRODUCTION', private readonly database: PrismaClient = prisma) {
    if (environment !== 'SANDBOX' && environment !== 'PRODUCTION') throw new Error('Email outbox environment must be SANDBOX or PRODUCTION');
  }
  async claim(id: string, now: Date) {
    const result = await this.database.emailOutboxMessage.updateMany({
      where: { id, environment: this.environment, OR: [
        { status: 'PENDING', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { status: 'RETRY', nextAttemptAt: { lte: now } },
        { status: 'PROCESSING', leaseUntil: { lt: now } },
      ] },
      data: { status: 'PROCESSING', attempts: { increment: 1 }, leaseUntil: new Date(now.getTime() + 10 * 60_000) },
    });
    if (result.count !== 1) return null;
    return this.database.emailOutboxMessage.findFirst({ where: { id, environment: this.environment }, select: { id: true, encryptedPayload: true, idempotencyKey: true, createdAt: true, attempts: true } });
  }
  async markAccepted(id: string, providerMessageId: string, sentAt: Date) {
    await this.database.emailOutboxMessage.updateMany({ where: { id, environment: this.environment, status: 'PROCESSING' }, data: { status: 'ACCEPTED', providerMessageId, sentAt, encryptedPayload: '', lastError: null, nextAttemptAt: null, leaseUntil: null } });
  }
  async markFailure(id: string, message: string, retryAt: Date | null, uncertain: boolean) {
    await this.database.emailOutboxMessage.updateMany({ where: { id, environment: this.environment, status: 'PROCESSING' }, data: { status: uncertain ? 'UNCERTAIN' : retryAt ? 'RETRY' : 'FAILED', lastError: message.slice(0, 1000), nextAttemptAt: retryAt, leaseUntil: null } });
  }
}

export class EmailOutboxProcessor {
  constructor(private readonly store: EmailOutboxStore, private readonly cipher: EmailOutboxCipher, private readonly provider: ResendEmailProvider, private readonly options: { sandboxAllowedRecipients?: string[] } = {}) {}
  async process(id: string) {
    const message = await this.store.claim(id, new Date());
    if (!message) return { claimed: false as const };
    const idempotencyDeadline = message.createdAt.getTime() + 24 * 60 * 60_000;
    if (Date.now() >= idempotencyDeadline) {
      await this.store.markFailure(message.id, 'Resend idempotency window expired; manual reconciliation required', null, true);
      return { claimed: true as const, status: 'UNCERTAIN' as const };
    }
    try {
      const payload = this.cipher.decrypt(message.encryptedPayload);
      if (this.options.sandboxAllowedRecipients) {
        const allowed = new Set(this.options.sandboxAllowedRecipients.map((email) => email.trim().toLowerCase()));
        const recipients = (Array.isArray(payload.to) ? payload.to : [payload.to]).map((email) => email.trim().toLowerCase());
        if (recipients.some((email) => !allowed.has(email))) {
          await this.store.markFailure(message.id, 'Sandbox recipient blocked by allowlist', null, false);
          return { claimed: true as const, status: 'BLOCKED' as const };
        }
      }
      const sent = await this.provider.send({ ...payload, idempotencyKey: message.idempotencyKey });
      await this.store.markAccepted(message.id, sent.id, new Date());
      return { claimed: true as const, status: 'ACCEPTED' as const, providerMessageId: sent.id };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Email processing failed';
      const elapsed = Date.now() - message.createdAt.getTime();
      const insideIdempotencyWindow = elapsed < 24 * 60 * 60_000;
      const retryable = error instanceof Error && error.name === 'ResendEmailError' && (('status' in error && (error as { status?: number }).status === undefined) || (('status' in error) && ((error as { status?: number }).status ?? 0) >= 500 || (error as { status?: number }).status === 429));
      const proposedRetryAt = Date.now() + Math.min(60_000 * 2 ** (message.attempts - 1), 60 * 60_000);
      const retryAt = retryable && insideIdempotencyWindow && proposedRetryAt < idempotencyDeadline && message.attempts < 5 ? new Date(proposedRetryAt) : null;
      const uncertain = retryable && (!insideIdempotencyWindow || message.attempts >= 5 || proposedRetryAt >= idempotencyDeadline);
      await this.store.markFailure(message.id, errorMessage, retryAt, uncertain);
      return { claimed: true as const, status: uncertain ? 'UNCERTAIN' as const : retryAt ? 'RETRY' as const : 'FAILED' as const };
    }
  }
}
