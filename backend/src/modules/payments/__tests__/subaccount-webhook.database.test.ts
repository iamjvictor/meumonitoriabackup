import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { prisma } from '../../../lib/prisma.js';
import { PrismaPaymentWebhookRepository } from '../infrastructure/persistence/prisma-webhook.repository.js';
import { PaymentAccountRepository } from '../infrastructure/persistence/payment-account.repository.js';
import { AsaasAccountProvider } from '../infrastructure/providers/asaas/asaas-account.provider.js';
import { PaymentAccountCreationInProgressError, StartPaymentAccountUseCase } from '../application/commands/start-payment-account.use-case.js';
import { AsaasWebhookIngress } from '../application/commands/accept-webhook.use-case.js';
import { ProcessPaymentWebhookUseCase } from '../application/commands/process-webhook.use-case.js';
import { AsaasWebhookController } from '../http/asaas-webhook.controller.js';
import { asaasWebhookRoutes } from '../http/asaas-webhook.routes.js';
import { SyncPaymentAccountWebhookUseCase } from '../application/commands/sync-payment-account-webhook.use-case.js';
import { LocalPaymentAccountCredentialStore } from '../infrastructure/credentials/payment-account-credential.store.js';
import { createErrorHandler } from '../../../core/errors/error-handler.js';

const isolatedDatabase = process.env.PAYMENTS_TEST_DATABASE_URL;
const canRun = Boolean(isolatedDatabase && process.env.DATABASE_URL === isolatedDatabase && isolatedDatabase.includes('mm_asaas_flow_test'));

after(async () => { await prisma.$disconnect(); });

test('evento recebido antes do vínculo permanece único quando a subconta é criada', { skip: !canRun }, async () => {
  const runId = randomUUID();
  const providerEventId = `evt_${runId}`;
  const providerAccountId = `acc_${runId}`;
  const userId = randomUUID();
  const repository = new PrismaPaymentWebhookRepository('SANDBOX');
  let teacherId: string | undefined;
  try {
    const first = await repository.accept({
      providerEventId,
      providerAccountId,
      eventType: 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED',
      payload: { id: providerEventId, event: 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED', account: { id: providerAccountId } },
    });
    assert.equal(first.duplicate, false);

    const teacher = await prisma.teacher.create({ data: {
      userId,
      fullName: 'Professora de Teste',
      email: `flow-${runId}@example.test`,
      username: `flow-${runId}`,
      area: 'Matemática',
      pageSlug: `flow-${runId}`,
      termsAcceptedAt: new Date(),
    } });
    teacherId = teacher.id;
    await prisma.paymentAccount.create({ data: { teacherId, environment: 'SANDBOX', providerAccountId, walletId: `wal_${runId}`, status: 'PENDING' } });

    const replay = await repository.accept({
      providerEventId,
      providerAccountId,
      eventType: 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED',
      payload: { id: providerEventId, event: 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED', account: { id: providerAccountId } },
    });

    assert.equal(replay.duplicate, true);
    assert.equal(replay.id, first.id);
    assert.equal(await prisma.paymentWebhookEvent.count({ where: { environment: 'SANDBOX', providerEventId } }), 1);
    assert.equal(await prisma.paymentOutboxEvent.count({ where: { eventId: `payment-webhook:SANDBOX:${providerEventId}` } }), 1);
  } finally {
    await prisma.paymentOutboxEvent.deleteMany({ where: { eventId: `payment-webhook:SANDBOX:${providerEventId}` } });
    await prisma.paymentWebhookEvent.deleteMany({ where: { environment: 'SANDBOX', providerEventId } });
    if (teacherId) await prisma.teacher.delete({ where: { id: teacherId } });
  }
});

test('queda da fila depois da inbox ainda devolve HTTP 200 e deixa evento recuperável', { skip: !canRun }, async () => {
  const runId = randomUUID();
  const providerEventId = `evt_queue_down_${runId}`;
  const providerAccountId = `acc_queue_down_${runId}`;
  const repository = new PrismaPaymentWebhookRepository('SANDBOX');
  const ingress = new AsaasWebhookIngress({
    accessToken: 'webhook-token-' + 'x'.repeat(32), inbox: repository,
    enqueue: async () => { throw new Error('Redis unavailable'); },
  });
  const app = Fastify();
  app.setErrorHandler(createErrorHandler(() => {}));
  await app.register(async (instance) => asaasWebhookRoutes(instance, new AsaasWebhookController(ingress)), { prefix: '/api/v1' });
  try {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/payments/webhooks/asaas',
      headers: { 'asaas-access-token': 'webhook-token-' + 'x'.repeat(32) },
      payload: { id: providerEventId, event: 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED', account: { id: providerAccountId } },
    });
    assert.equal(response.statusCode, 200);
    const saved = await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { environment_providerEventId: { environment: 'SANDBOX', providerEventId } } });
    assert.equal(saved.state, 'RECEIVED');
    assert.ok((await repository.findRecoverable()).some((event) => event.id === saved.id));
  } finally {
    await app.close();
    const saved = await prisma.paymentWebhookEvent.findUnique({ where: { environment_providerEventId: { environment: 'SANDBOX', providerEventId } }, select: { id: true } });
    if (saved) await prisma.paymentOutboxEvent.deleteMany({ where: { aggregateId: saved.id } });
    await prisma.paymentWebhookEvent.deleteMany({ where: { environment: 'SANDBOX', providerEventId } });
  }
});

test('fluxo integrado cria a subconta, recebe HTTP 200 e atualiza a conta pelo worker', { skip: !canRun }, async () => {
  const runId = randomUUID();
  const userId = randomUUID();
  const providerAccountId = `acc_${runId}`;
  const providerEventId = `evt_${runId}`;
  const authToken = 'test-webhook-token-' + 'x'.repeat(32);
  const teacher = await prisma.teacher.create({ data: {
    userId,
    fullName: 'Professora de Teste',
    email: `flow-${runId}@example.test`,
    username: `flow-${runId}`,
    area: 'Matemática',
    pageSlug: `flow-${runId}`,
    termsAcceptedAt: new Date(),
  } });
  const requests: Array<{ path: string; method: string; credential?: string; body?: unknown }> = [];
  const provider = new AsaasAccountProvider({
    async request<T>(path: string, options: { method: string; credential?: string; body?: unknown }) {
      requests.push({ path, ...options });
      if (path === '/accounts') return { id: providerAccountId, walletId: `wal_${runId}`, apiKey: `secret-${runId}`, status: 'PENDING' } as T;
      if (path === '/webhooks?limit=100') return { data: [] } as T;
      if (path === '/webhooks') return { id: `wh_${runId}` } as T;
      throw new Error(`Unexpected Asaas request: ${path}`);
    },
  }, { webhookUrl: 'https://sandbox-api.example.test/api/v1/payments/webhooks/asaas', webhookEmail: 'alerts@example.test', webhookAuthToken: authToken });
  const accountRepository = new PaymentAccountRepository();
  const inbox = new PrismaPaymentWebhookRepository('SANDBOX');
  const queuedEventIds: string[] = [];
  const ingress = new AsaasWebhookIngress({ accessToken: authToken, inbox, enqueue: async (eventId) => { queuedEventIds.push(eventId); } });
  const app = Fastify();
  app.setErrorHandler(createErrorHandler(() => {}));
  await app.register(async (instance) => asaasWebhookRoutes(instance, new AsaasWebhookController(ingress)), { prefix: '/api/v1' });

  try {
    const created = await new StartPaymentAccountUseCase(accountRepository, provider).execute(userId, {
      name: 'Professora de Teste', email: `flow-${runId}@example.test`, cpfCnpj: '52998224725', birthDate: '1990-01-01',
      mobilePhone: '11999998888', incomeValue: 5000, address: 'Rua A', addressNumber: '10', province: 'Centro', postalCode: '01001000',
    });
    assert.equal(created.providerAccountId, providerAccountId);
    assert.equal(created.providerWebhookId, `wh_${runId}`);
    assert.equal(JSON.stringify(created).includes(`secret-${runId}`), false);
    assert.deepEqual(requests.map(({ path, method }) => ({ path, method })), [
      { path: '/accounts', method: 'POST' },
      { path: '/webhooks?limit=100', method: 'GET' },
      { path: '/webhooks', method: 'POST' },
    ]);

    const webhookPayload = {
      id: providerEventId,
      event: 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED',
      dateCreated: new Date().toISOString(),
      account: { object: 'account', id: providerAccountId, status: 'APPROVED' },
      accountStatus: { general: 'APPROVED', commercialInfo: 'APPROVED', bankAccountInfo: 'PENDING', documentation: 'APPROVED' },
    };
    const firstDelivery = await app.inject({
      method: 'POST', url: '/api/v1/payments/webhooks/asaas',
      headers: { 'asaas-access-token': authToken, 'x-asaas-account-id': providerAccountId },
      payload: webhookPayload,
    });
    assert.equal(firstDelivery.statusCode, 200);
    assert.equal(JSON.parse(firstDelivery.body).accepted, true);
    assert.equal(queuedEventIds.length, 1);

    const unauthorized = await app.inject({
      method: 'POST', url: '/api/v1/payments/webhooks/asaas',
      headers: { 'asaas-access-token': 'wrong-token' }, payload: webhookPayload,
    });
    assert.equal(unauthorized.statusCode, 401);
    const invalidPayload = await app.inject({
      method: 'POST', url: '/api/v1/payments/webhooks/asaas',
      headers: { 'asaas-access-token': authToken }, payload: { event: 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED', account: { id: providerAccountId } },
    });
    assert.equal(invalidPayload.statusCode, 422);

    const duplicateDelivery = await app.inject({
      method: 'POST', url: '/api/v1/payments/webhooks/asaas',
      headers: { 'asaas-access-token': authToken, 'x-asaas-account-id': providerAccountId },
      payload: webhookPayload,
    });
    assert.equal(duplicateDelivery.statusCode, 200);
    assert.equal(JSON.parse(duplicateDelivery.body).duplicate, true);
    assert.equal(queuedEventIds.length, 1);

    const worker = new ProcessPaymentWebhookUseCase(inbox, accountRepository);
    const processed = await worker.execute(queuedEventIds[0]!);
    const finalAccount = await prisma.paymentAccount.findUniqueOrThrow({ where: { providerAccountId } });
    assert.deepEqual(processed, { skipped: false, state: 'ACCOUNT_STATUS_APPLIED' });
    assert.equal(finalAccount.status, 'APPROVED');
    assert.equal(finalAccount.generalStatus, 'APPROVED');
    assert.equal(finalAccount.commercialInfoStatus, 'APPROVED');
    assert.equal(finalAccount.bankAccountStatus, 'PENDING');
    assert.equal(finalAccount.documentationStatus, 'APPROVED');
    assert.equal(finalAccount.providerWebhookId, `wh_${runId}`);
    assert.equal(finalAccount.webhookSyncState, 'ACTIVE');
    assert.equal(await prisma.paymentWebhookEvent.count({ where: { environment: 'SANDBOX', providerEventId } }), 1);
  } finally {
    await app.close();
    const event = await prisma.paymentWebhookEvent.findFirst({ where: { environment: 'SANDBOX', providerEventId }, select: { id: true } });
    if (event) await prisma.paymentOutboxEvent.deleteMany({ where: { aggregateId: event.id } });
    await prisma.paymentWebhookEvent.deleteMany({ where: { environment: 'SANDBOX', providerEventId } });
    await prisma.teacher.delete({ where: { id: teacher.id } });
  }
});

test('falha inicial ao sincronizar webhook é retomada com credencial cifrada sem criar outra subconta', { skip: !canRun }, async () => {
  const runId = randomUUID();
  const userId = randomUUID();
  const providerAccountId = `acc_sync_${runId}`;
  const teacher = await prisma.teacher.create({ data: {
    userId, fullName: 'Professora de Teste', email: `sync-${runId}@example.test`, username: `sync-${runId}`,
    area: 'Matemática', pageSlug: `sync-${runId}`, termsAcceptedAt: new Date(),
  } });
  let createCalls = 0;
  let syncCalls = 0;
  const provider = {
    async createSubaccount() { createCalls += 1; return { providerAccountId, walletId: `wal_${runId}`, status: 'PENDING', onboardingUrl: null, webhookId: null, apiKey: `secret-${runId}` }; },
    async ensureAccountStatusWebhook(credential: string) {
      syncCalls += 1;
      assert.equal(credential, `secret-${runId}`);
      if (syncCalls === 1) throw Object.assign(new Error('private provider error'), { code: 'ASAAS_TEMPORARY_ERROR' });
      return { webhookId: `wh_sync_${runId}` };
    },
  } as never;
  const accountRepository = new PaymentAccountRepository();

  try {
    const created = await new StartPaymentAccountUseCase(accountRepository, provider).execute(userId, {
      name: 'Professora de Teste', email: `sync-${runId}@example.test`, cpfCnpj: '52998224725', birthDate: '1990-01-01',
      mobilePhone: '11999998888', incomeValue: 5000, address: 'Rua A', addressNumber: '10', province: 'Centro', postalCode: '01001000',
    });
    assert.equal(created.webhookSyncState, 'PENDING');
    assert.equal(createCalls, 1);
    const saved = await prisma.paymentAccount.findUniqueOrThrow({ where: { providerAccountId } });
    assert.equal(saved.webhookSyncAttempts, 1);
    assert.equal(saved.webhookSyncState, 'PENDING');
    await prisma.paymentAccount.update({ where: { id: saved.id }, data: { webhookSyncNextAttemptAt: new Date(Date.now() - 1000) } });

    const sync = new SyncPaymentAccountWebhookUseCase(accountRepository, new LocalPaymentAccountCredentialStore(), provider);
    assert.equal(await sync.recoverPending('SANDBOX'), 1);
    const recovered = await prisma.paymentAccount.findUniqueOrThrow({ where: { id: saved.id } });
    assert.equal(recovered.webhookSyncState, 'ACTIVE');
    assert.equal(recovered.providerWebhookId, `wh_sync_${runId}`);
    assert.equal(createCalls, 1);
    assert.equal(syncCalls, 2);
  } finally {
    await prisma.teacher.delete({ where: { id: teacher.id } });
  }
});

test('criação concorrente no PostgreSQL produz uma subconta remota e uma conta local', { skip: !canRun }, async () => {
  const runId = randomUUID();
  const userId = randomUUID();
  const providerAccountId = `acc_concurrent_${runId}`;
  const teacher = await prisma.teacher.create({ data: {
    userId, fullName: 'Professora de Teste', email: `concurrent-${runId}@example.test`, username: `concurrent-${runId}`,
    area: 'Matemática', pageSlug: `concurrent-${runId}`, termsAcceptedAt: new Date(),
  } });
  let createCalls = 0;
  const provider = {
    async createSubaccount() {
      createCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return { providerAccountId, walletId: `wal_${runId}`, status: 'PENDING', onboardingUrl: null, webhookId: null, apiKey: `secret-${runId}` };
    },
    async ensureAccountStatusWebhook() { return { webhookId: `wh_${runId}` }; },
  } as never;
  const useCase = new StartPaymentAccountUseCase(new PaymentAccountRepository(), provider);
  const input = {
    name: 'Professora de Teste', email: `concurrent-${runId}@example.test`, cpfCnpj: '52998224725', birthDate: '1990-01-01',
    mobilePhone: '11999998888', incomeValue: 5000, address: 'Rua A', addressNumber: '10', province: 'Centro', postalCode: '01001000',
  };

  try {
    const results = await Promise.allSettled([useCase.execute(userId, input), useCase.execute(userId, input)]);
    assert.equal(createCalls, 1);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    assert.ok(rejected.reason instanceof PaymentAccountCreationInProgressError);
    assert.equal(await prisma.paymentAccount.count({ where: { teacherId: teacher.id, environment: 'SANDBOX' } }), 1);
    assert.equal((await prisma.paymentAccountCreationOperation.findUniqueOrThrow({ where: { teacherId_environment: { teacherId: teacher.id, environment: 'SANDBOX' } } })).status, 'COMPLETED');
  } finally {
    await prisma.teacher.delete({ where: { id: teacher.id } });
  }
});

test('operação de criação interrompida fica sinalizada para reconciliação e bloqueia duplicata', { skip: !canRun }, async () => {
  const runId = randomUUID();
  const userId = randomUUID();
  const teacher = await prisma.teacher.create({ data: {
    userId, fullName: 'Professor Teste', email: `stale-${runId}@example.test`, username: `stale-${runId}`,
    area: 'Matemática', pageSlug: `stale-${runId}`, termsAcceptedAt: new Date(),
  } });
  try {
    const operation = await prisma.paymentAccountCreationOperation.create({ data: {
      teacherId: teacher.id, environment: 'SANDBOX', status: 'REMOTE_CREATED', providerAccountId: `acc_stale_${runId}`,
      updatedAt: new Date(Date.now() - 10 * 60_000),
    } });
    const repository = new PaymentAccountRepository();
    assert.equal(await repository.markStaleSubaccountCreations(5 * 60_000), 1);
    const saved = await prisma.paymentAccountCreationOperation.findUniqueOrThrow({ where: { id: operation.id } });
    assert.equal(saved.status, 'RECONCILIATION_REQUIRED');
    const reservation = await repository.reserveSubaccountCreation(userId, 'SANDBOX');
    assert.equal(reservation.acquired, false);
    assert.equal(reservation.status, 'RECONCILIATION_REQUIRED');
  } finally {
    await prisma.teacher.delete({ where: { id: teacher.id } });
  }
});

test('evento de aprovação antigo não regride a situação atual da subconta', { skip: !canRun }, async () => {
  const runId = randomUUID();
  const providerAccountId = `acc_order_${runId}`;
  const teacher = await prisma.teacher.create({ data: {
    userId: randomUUID(), fullName: 'Professor Teste', email: `order-${runId}@example.test`,
    username: `order-${runId}`, area: 'Matemática', pageSlug: `order-${runId}`, termsAcceptedAt: new Date(),
  } });
  const repository = new PaymentAccountRepository();
  try {
    const approvedAt = new Date('2026-10-25T12:00:00Z');
    await prisma.paymentAccount.create({ data: { teacherId: teacher.id, environment: 'SANDBOX', providerAccountId, walletId: `wal_${runId}`, status: 'APPROVED', generalStatus: 'APPROVED', verifiedAt: approvedAt, lastEventAt: approvedAt, generalStatusEventAt: approvedAt } });

    await repository.applyAccountStatusEvent(providerAccountId, 'ACCOUNT_STATUS_GENERAL_APPROVAL_AWAITING_APPROVAL', new Date('2026-10-25T11:00:00Z'));

    const finalAccount = await prisma.paymentAccount.findUniqueOrThrow({ where: { providerAccountId } });
    assert.equal(finalAccount.status, 'APPROVED');
    assert.equal(finalAccount.generalStatus, 'APPROVED');
  } finally {
    await prisma.teacher.delete({ where: { id: teacher.id } });
  }
});

test('snapshot accountStatus atualiza dimensões independentes sem aprovar a conta por evento documental', { skip: !canRun }, async () => {
  const runId = randomUUID();
  const providerAccountId = `acc_snapshot_${runId}`;
  const teacher = await prisma.teacher.create({ data: {
    userId: randomUUID(), fullName: 'Professor Teste', email: `snapshot-${runId}@example.test`, username: `snapshot-${runId}`,
    area: 'Matemática', pageSlug: `snapshot-${runId}`, termsAcceptedAt: new Date(),
  } });
  const repository = new PaymentAccountRepository();
  try {
    await prisma.paymentAccount.create({ data: { teacherId: teacher.id, environment: 'SANDBOX', providerAccountId, walletId: `wal_${runId}`, status: 'PENDING', generalStatus: 'PENDING' } });
    const occurredAt = new Date('2026-10-25T10:00:00Z');
    await repository.applyAccountStatusEvent(providerAccountId, 'ACCOUNT_STATUS_DOCUMENT_APPROVED', occurredAt, {
      general: 'APPROVED', commercialInfo: 'APPROVED', bankAccountInfo: 'PENDING', documentation: 'APPROVED',
    });
    const account = await prisma.paymentAccount.findUniqueOrThrow({ where: { providerAccountId } });
    assert.equal(account.generalStatus, 'APPROVED');
    assert.equal(account.commercialInfoStatus, 'APPROVED');
    assert.equal(account.bankAccountStatus, 'PENDING');
    assert.equal(account.documentationStatus, 'APPROVED');
    assert.equal(account.status, 'PENDING');
    assert.equal(account.verifiedAt, null);
    assert.equal(account.generalStatusEventAt?.toISOString(), occurredAt.toISOString());
    assert.equal(account.documentationStatusEventAt?.toISOString(), occurredAt.toISOString());
  } finally {
    await prisma.teacher.delete({ where: { id: teacher.id } });
  }
});

test('expiração anual comercial mantém a aprovação geral ativa', { skip: !canRun }, async () => {
  const runId = randomUUID();
  const providerAccountId = `acc_commercial_expiry_${runId}`;
  const teacher = await prisma.teacher.create({ data: {
    userId: randomUUID(), fullName: 'Professor Teste', email: `expiry-${runId}@example.test`, username: `expiry-${runId}`,
    area: 'Matemática', pageSlug: `expiry-${runId}`, termsAcceptedAt: new Date(),
  } });
  const repository = new PaymentAccountRepository();
  try {
    await prisma.paymentAccount.create({ data: {
      teacherId: teacher.id, environment: 'SANDBOX', providerAccountId, walletId: `wal_${runId}`,
      status: 'APPROVED', generalStatus: 'APPROVED', commercialInfoStatus: 'APPROVED',
    } });
    await repository.applyAccountStatusEvent(providerAccountId, 'ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRED', new Date('2026-10-25T10:00:00Z'));
    const account = await prisma.paymentAccount.findUniqueOrThrow({ where: { providerAccountId } });
    assert.equal(account.commercialInfoStatus, 'EXPIRED');
    assert.equal(account.generalStatus, 'APPROVED');
    assert.equal(account.status, 'APPROVED');
  } finally {
    await prisma.teacher.delete({ where: { id: teacher.id } });
  }
});

test('processamento interrompido na última tentativa vira dead-letter para revisão', { skip: !canRun }, async () => {
  const eventId = `evt_exhausted_${randomUUID()}`;
  const event = await prisma.paymentWebhookEvent.create({ data: {
    environment: 'SANDBOX', providerEventId: eventId, eventType: 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED',
    payload: { id: eventId, event: 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED' }, state: 'PROCESSING', attempts: 10,
    leaseUntil: new Date(Date.now() - 1000),
  } });
  try {
    const repository = new PrismaPaymentWebhookRepository('SANDBOX');
    assert.equal(await repository.markExhaustedForAttention(), 1);
    const saved = await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { id: event.id } });
    assert.equal(saved.state, 'DEAD_LETTER');
    assert.equal(saved.nextAttemptAt, null);
  } finally {
    await prisma.paymentWebhookEvent.delete({ where: { id: event.id } });
  }
});
