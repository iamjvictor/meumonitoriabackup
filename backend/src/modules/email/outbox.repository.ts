import type { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { EmailOutboxCipher, hashEmailRecipient, type EmailPayload } from './outbox-crypto.js';

export type EmailOutboxTransaction = Prisma.TransactionClient;
export type EnqueueEmailInput = { idempotencyKey: string; purpose: string; recipient: string; payload: EmailPayload };

export class EmailOutboxRepository {
  constructor(
    private readonly cipher: EmailOutboxCipher,
    private readonly database: PrismaClient = prisma,
    private readonly environment: 'SANDBOX' | 'PRODUCTION' = env.ASAAS_ENV.toUpperCase() as 'SANDBOX' | 'PRODUCTION',
  ) {
    if (environment !== 'SANDBOX' && environment !== 'PRODUCTION') throw new Error('Email outbox environment must be SANDBOX or PRODUCTION');
  }

  async enqueue(tx: EmailOutboxTransaction, input: EnqueueEmailInput) {
    const where = { environment_idempotencyKey: { environment: this.environment, idempotencyKey: input.idempotencyKey } };
    const existing = await tx.emailOutboxMessage.findUnique({ where });
    if (existing) return { id: existing.id, duplicate: true };
    const inserted = await tx.emailOutboxMessage.createMany({ data: [{
        environment: this.environment,
        idempotencyKey: input.idempotencyKey,
        purpose: input.purpose,
        recipientHash: hashEmailRecipient(input.recipient),
        encryptedPayload: this.cipher.encrypt(input.payload),
    }], skipDuplicates: true });
    const result = await tx.emailOutboxMessage.findUnique({ where, select: { id: true } });
    if (!result) throw new Error('Email outbox insert could not be resolved');
    return { id: result.id, duplicate: inserted.count === 0 };
  }

  async enqueueTransaction(input: EnqueueEmailInput) {
    return this.database.$transaction((tx) => this.enqueue(tx, input));
  }

  async listPending(limit = 20) {
    return this.database.emailOutboxMessage.findMany({
      where: { environment: this.environment, OR: [
        { status: 'PENDING', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
        { status: 'RETRY', nextAttemptAt: { lte: new Date() } },
        { status: 'PROCESSING', leaseUntil: { lt: new Date() } },
      ] },
      orderBy: { createdAt: 'asc' }, take: limit, select: { id: true },
    });
  }

  decryptPayload(encryptedPayload: string) { return this.cipher.decrypt(encryptedPayload); }
}
