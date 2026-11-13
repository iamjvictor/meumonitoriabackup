import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { EmailOutboxCipher } from '../outbox-crypto.js';
import { EmailOutboxRepository } from '../outbox.repository.js';
import { SponsoredSeatEmailIntents } from '../../payments/infrastructure/persistence/sponsored-seat-email-intents.js';

test('cria um convite por vaga com token cifrado, hash na tabela de convite e notificação idempotente ao professor', async () => {
  const cipher = new EmailOutboxCipher(Buffer.alloc(32, 12).toString('base64'));
  const rows = new Map<string, { id: string; idempotencyKey: string; encryptedPayload: string; purpose: string; recipientHash: string }>();
  const outboxTable = {
    async findUnique({ where }: { where: { environment_idempotencyKey: { idempotencyKey: string } } }) { return rows.get(where.environment_idempotencyKey.idempotencyKey) ?? null; },
    async createMany({ data }: { data: Array<{ idempotencyKey: string; encryptedPayload: string; purpose: string; recipientHash: string }> }) {
      let count = 0;
      for (const row of data) if (!rows.has(row.idempotencyKey)) { rows.set(row.idempotencyKey, { ...row, id: `outbox-${rows.size + 1}` }); count += 1; }
      return { count };
    },
  };
  const outbox = new EmailOutboxRepository(cipher, {} as never, 'SANDBOX');
  const seats = [
    { id: 'seat-1', emailNormalized: 'known@example.test' },
    { id: 'seat-2', emailNormalized: 'new@example.test' },
  ];
  const invitationHashes: Record<string, string> = {};
  const tx = {
    async $queryRaw() { return []; },
    emailOutboxMessage: outboxTable,
    sponsoredSeatBatch: { async findUnique({ select }: { select: Record<string, unknown> }) {
      if ('seats' in select) return { environment: 'SANDBOX', billingInterval: 'ANNUAL', monitor: { name: 'Matemática' }, teacher: { fullName: 'Professora Ana', email: 'ana@example.test' }, seats };
      return { environment: 'SANDBOX', billingInterval: 'ANNUAL', seatCount: 2, monitor: { name: 'Matemática' }, teacher: { fullName: 'Professora Ana', email: 'ana@example.test' } };
    } },
    student: { async findFirst({ where }: { where: { email: { equals: string } } }) { return where.email.equals === 'known@example.test' ? { id: 'student-known' } : null; } },
    sponsoredSeatInvitation: { async upsert({ where, create }: { where: { seatId: string }; create: { tokenHash: string } }) { invitationHashes[where.seatId] = create.tokenHash; return {}; } },
  };
  // Use the repository's real encryption and idempotency behavior with an in-memory transaction client.
  const intents = new SponsoredSeatEmailIntents(outbox, { from: 'MeuMonitor <noreply@example.test>', frontBaseUrl: 'https://app.example.test', environment: 'SANDBOX', generateToken: (() => { let index = 0; return () => `private-token-${++index}`; })(), now: () => new Date('2026-11-01T12:00:00.000Z') });
  const periodStart = new Date('2026-11-01T12:00:00.000Z');
  const periodEnd = new Date('2027-11-01T12:00:00.000Z');
  await intents.enqueuePaidSeatInvitations(tx as never, { batchId: 'batch-1', periodStart, periodEnd, occurredAt: periodStart });

  assert.equal(rows.size, 3);
  assert.equal(Object.keys(invitationHashes).length, 2);
  const decoded = [...rows.values()].map((row) => ({ row, payload: cipher.decrypt(row.encryptedPayload) }));
  const inviteMessages = decoded.filter(({ row }) => row.purpose === 'SPONSORED_SEAT_INVITATION');
  assert.equal(inviteMessages.length, 2);
  for (const { row, payload } of inviteMessages) {
    const seat = seats.find((value) => value.emailNormalized === payload.to)!;
    const token = new URL(payload.text!.match(/https:\/\/\S+/)![0]).hash.slice('#token='.length);
    const tokenValue = decodeURIComponent(token);
    assert.equal(invitationHashes[seat.id], createHash('sha256').update(tokenValue).digest('hex'));
    assert.ok(row.encryptedPayload.includes('v1.'));
    assert.equal(row.encryptedPayload.includes(tokenValue), false);
  }
  assert.equal(inviteMessages.find(({ payload }) => payload.to === 'known@example.test')?.payload.text?.includes('já tem uma conta'), true);
  assert.equal(inviteMessages.find(({ payload }) => payload.to === 'new@example.test')?.payload.text?.includes('Crie sua conta'), true);

  await intents.enqueuePaidSeatInvitations(tx as never, { batchId: 'batch-1', periodStart, periodEnd, occurredAt: periodStart });
  assert.equal(rows.size, 3);
  assert.equal(Object.keys(invitationHashes).length, 2);
});

test('enfileira reenvio com o link presente somente no payload cifrado da outbox', async () => {
  const cipher = new EmailOutboxCipher(Buffer.alloc(32, 24).toString('base64'));
  const rows = new Map<string, { id: string; encryptedPayload: string; idempotencyKey: string; purpose: string; recipientHash: string }>();
  const outbox = new EmailOutboxRepository(cipher, {} as never, 'SANDBOX');
  const tx = {
    student: { async findFirst() { return { id: 'student-existing' }; } },
    emailOutboxMessage: {
      async findUnique({ where }: { where: { environment_idempotencyKey: { idempotencyKey: string } } }) { return rows.get(where.environment_idempotencyKey.idempotencyKey) ?? null; },
      async createMany({ data }: { data: Array<{ idempotencyKey: string; encryptedPayload: string; purpose: string; recipientHash: string }> }) {
        for (const row of data) rows.set(row.idempotencyKey, { ...row, id: `outbox-${rows.size + 1}` });
        return { count: data.length };
      },
    },
  };
  const intents = new SponsoredSeatEmailIntents(outbox, { from: 'MeuMonitor <noreply@example.test>', frontBaseUrl: 'https://app.example.test', environment: 'SANDBOX' });
  const token = 'private-reissued-token';
  const input = {
    batchEnvironment: 'SANDBOX', token, idempotencyKey: 'reissue-key', email: 'student@example.test', teacherName: 'Professora Ana',
    monitorName: 'Matemática', interval: 'MONTHLY', startsAt: new Date('2026-11-01T00:00:00Z'), endsAt: new Date('2026-12-01T00:00:00Z'),
  };
  await intents.enqueueInvitationReissue(tx as never, input);
  const row = [...rows.values()][0]!;
  assert.equal(row.purpose, 'SPONSORED_SEAT_INVITATION_REISSUE');
  assert.equal(row.encryptedPayload.includes(token), false);
  const payload = cipher.decrypt(row.encryptedPayload);
  assert.equal(payload.to, 'student@example.test');
  assert.match(payload.text ?? '', new RegExp(encodeURIComponent(token)));
  assert.equal(payload.text?.includes('já tem uma conta'), true);

  await assert.rejects(() => intents.enqueueInvitationReissue(tx as never, { ...input, batchEnvironment: 'PRODUCTION', idempotencyKey: 'cross-environment-key' }), /environment does not match/);
  assert.equal(rows.size, 1);
});
