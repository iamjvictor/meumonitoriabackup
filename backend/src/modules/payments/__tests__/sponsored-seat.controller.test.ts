import assert from 'node:assert/strict';
import test from 'node:test';
import { SponsoredSeatController } from '../http/sponsored-seat.controller.js';

const response = () => ({ codeValue: 200, payload: undefined as unknown, code(value: number) { this.codeValue = value; return this; }, send(value: unknown) { this.payload = value; return value; } });

test('endpoint de compra exige role teacher e repassa chave de idempotência', async () => {
  let input: any;
  const controller = new SponsoredSeatController({ execute: async (userId: string, value: unknown) => { input = { userId, value }; return { batchId: 'batch', amountCents: 5000, checkoutUrl: 'https://checkout', expiresAt: null }; } } as any, {} as any, {} as any, 'https://app');
  const reply = response();
  await controller.create({ user: { id: 'teacher-user', role: 'teacher' }, body: { monitorId: '10000000-0000-4000-8000-000000000000', interval: 'MONTHLY', billingType: 'PIX', beneficiaryEmails: ['a@test.com'] }, headers: { 'idempotency-key': 'key-12345678' } } as any, reply as any);
  assert.equal(reply.codeValue, 201);
  assert.equal(input.userId, 'teacher-user');
  assert.equal(input.value.idempotencyKey, 'key-12345678');
});

test('endpoint de compra rejeita estudantes e chave ausente', async () => {
  const controller = new SponsoredSeatController({ execute: async () => { throw new Error('must not execute'); } } as any, {} as any, {} as any, 'https://app');
  await assert.rejects(() => controller.create({ user: { id: 'student', role: 'student' }, body: {} } as any, response() as any), (error: any) => error.statusCode === 403);
  await assert.rejects(() => controller.create({ user: { id: 'teacher', role: 'teacher' }, body: { monitorId: '10000000-0000-4000-8000-000000000000', interval: 'MONTHLY', beneficiaryEmails: ['a@test.com'] }, headers: { 'idempotency-key': 'key-12345678' } } as any, response() as any), (error: any) => error.statusCode === 422);
  await assert.rejects(() => controller.create({ user: { id: 'teacher', role: 'teacher' }, body: { monitorId: '10000000-0000-4000-8000-000000000000', interval: 'MONTHLY', billingType: 'PIX', beneficiaryEmails: ['a@test.com'] }, headers: {} } as any, response() as any), (error: any) => error.statusCode === 422);
});

test('cotação de vaga não exige método de pagamento e retorna preço calculado pelo caso de uso', async () => {
  let quotedFor: string | undefined;
  let quotedInput: unknown;
  const controller = new SponsoredSeatController({ quote: async (userId: string, input: unknown) => { quotedFor = userId; quotedInput = input; return { totalAmountCents: 1234 }; } } as any, {} as any, {} as any, 'https://app');
  const reply = response();
  const body = { monitorId: '10000000-0000-4000-8000-000000000000', interval: 'MONTHLY', beneficiaryEmails: ['a@test.com'] };
  await controller.quote({ user: { id: 'teacher-user', role: 'teacher' }, body } as any, reply as any);
  assert.equal(quotedFor, 'teacher-user');
  assert.deepEqual(quotedInput, body);
  assert.deepEqual(reply.payload, { data: { totalAmountCents: 1234 } });
  await assert.rejects(() => controller.quote({ user: { id: 'student', role: 'student' }, body: {} } as any, response() as any), (error: any) => error.statusCode === 403);
});

test('edição de lote exige professor e entrega e-mails/total esperado ao caso de uso', async () => {
  let updated: any;
  const controller = new SponsoredSeatController({ updatePending: async (userId: string, batchId: string, input: unknown) => { updated = { userId, batchId, input }; return { batchId, amountCents: 6000, checkoutUrl: 'https://checkout/new', expiresAt: null }; } } as any, {} as any, {} as any, 'https://app.test');
  const reply = response();
  await controller.update({ user: { id: 'teacher-user', role: 'teacher' }, params: { batchId: '20000000-0000-4000-8000-000000000001' }, body: { beneficiaryEmails: ['new@test.com'], expectedTotalAmountCents: 6000 } } as any, reply as any);
  assert.deepEqual(updated, { userId: 'teacher-user', batchId: '20000000-0000-4000-8000-000000000001', input: { beneficiaryEmails: ['new@test.com'], expectedTotalAmountCents: 6000, returnBaseUrl: 'https://app.test' } });
  assert.equal((reply.payload as any).data.checkoutUrl, 'https://checkout/new');
  await assert.rejects(() => controller.update({ user: { id: 'student', role: 'student' }, params: { batchId: '20000000-0000-4000-8000-000000000001' }, body: {} } as any, response() as any), (error: any) => error.statusCode === 403);
});

test('cancelamento anual é recusado e lote mensal próprio é cancelado no Asaas', async () => {
  const annualId = '20000000-0000-4000-8000-000000000001';
  const monthlyId = '20000000-0000-4000-8000-000000000002';
  let cancelled: string | undefined;
  let marked = false;
  const repository = {
    findBatchForTeacher: async (_userId: string, batchId: string) => ({ id: batchId, interval: batchId === annualId ? 'ANNUAL' : 'MONTHLY', status: 'ACTIVE', providerSubscriptionId: 'sub-1' }),
    listForTeacher: async () => [],
    markCancelAtPeriodEnd: async () => { marked = true; },
  };
  const provider = { cancelSubscription: async ({ subscriptionId }: { subscriptionId: string }) => { cancelled = subscriptionId; } };
  const controller = new SponsoredSeatController({} as any, repository as any, provider as any, 'https://app');
  await assert.rejects(() => controller.cancel({ user: { id: 'teacher', role: 'teacher' }, params: { batchId: annualId } } as any, response() as any), (error: any) => error.statusCode === 409);
  const reply = response();
  await controller.cancel({ user: { id: 'teacher', role: 'teacher' }, params: { batchId: monthlyId } } as any, reply as any);
  assert.equal(cancelled, 'sub-1');
  assert.equal(marked, true);
  assert.equal(reply.codeValue, 200);
});

test('professor não consegue cancelar lote de outro professor', async () => {
  let providerCalled = false;
  const controller = new SponsoredSeatController({} as any, {
    findBatchForTeacher: async (userId: string) => userId === 'owner' ? { id: 'batch', interval: 'MONTHLY', status: 'ACTIVE', providerSubscriptionId: 'sub', currentPeriodEnd: null } : null,
    listForTeacher: async () => [], markCancelAtPeriodEnd: async () => {},
  } as any, { cancelSubscription: async () => { providerCalled = true; } } as any, 'https://app');
  await assert.rejects(() => controller.cancel({ user: { id: 'other', role: 'teacher' }, params: { batchId: '20000000-0000-4000-8000-000000000003' } } as any, response() as any), (error: any) => error.statusCode === 404);
  assert.equal(providerCalled, false);
});
