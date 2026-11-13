import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../../../core/errors/app-error.js';
import { ClaimSponsoredSeatsUseCase, SponsoredSeatClaimError } from '../application/commands/claim-sponsored-seats.use-case.js';
import { CreateSponsoredSeatBatchUseCase, SponsoredBatchValidationError } from '../application/commands/create-sponsored-seat-batch.use-case.js';
import { SponsoredSeatController } from '../http/sponsored-seat.controller.js';

function setup({ monitorName = 'Aula particular de Matemática', priceCents = 10000, teacherPercentage = 40 } = {}) {
  const record: any = { batches: [], checkoutCommands: [], claims: [] };
  const repository = {
    findTeacherMonitor: async () => ({ teacherId: 'teacher-persona', teacherPercentage, monitor: { id: 'monitor-persona', name: monitorName, status: 'PUBLISHED', priceCents } }),
    findBatchByIdempotency: async () => null,
    createPendingBatch: async (input: any) => { record.batches.push(input); return { id: `batch-${record.batches.length}`, externalReference: `batch-${record.batches.length}` }; },
    saveCheckout: async () => {},
    markCheckoutCreationFailed: async () => {},
  };
  const provider = { createHostedCheckout: async (command: any) => {
    record.checkoutCommands.push(command);
    return { providerCheckoutId: `checkout-${record.checkoutCommands.length}`, checkoutUrl: `https://checkout.test/${record.checkoutCommands.length}`, expiresAt: null };
  } };
  return { record, useCase: new CreateSponsoredSeatBatchUseCase(repository as any, provider as any) };
}

test('persona professor particular compra uma vaga mensal para aluno ainda sem conta', async () => {
  const { record, useCase } = setup();
  const quote = await useCase.quote('teacher-persona', { monitorId: 'monitor-persona', interval: 'MONTHLY', beneficiaryEmails: ['Aluno.Particular@example.test'] });
  assert.equal(quote.seatCount, 1);
  assert.equal(quote.totalAmountCents, 6000);
  const result = await useCase.execute('teacher-persona', {
    monitorId: 'monitor-persona', interval: 'MONTHLY', billingType: 'CREDIT_CARD', beneficiaryEmails: [' Aluno.Particular@example.test '],
    expectedTotalAmountCents: quote.totalAmountCents, idempotencyKey: 'private-student-0001', returnBaseUrl: 'https://app.test',
  });
  assert.equal(result.amountCents, 6000);
  assert.deepEqual(record.batches[0]?.beneficiaryEmails, ['aluno.particular@example.test']);
  assert.equal(record.batches[0]?.teacherId, 'teacher-persona');
  assert.equal(record.checkoutCommands[0]?.chargeType, 'RECURRENT');
  assert.equal(record.checkoutCommands[0]?.cycle, 'MONTHLY');
  assert.equal(record.checkoutCommands[0]?.items[0]?.quantity, 1);
  assert.deepEqual(record.checkoutCommands[0]?.splits, []);
});

test('persona cursinho Exatas ENEM compra lote anual para cinco alunos sem split', async () => {
  const { record, useCase } = setup({ monitorName: 'Exatas ENEM' });
  const beneficiaryEmails = ['aluno1@example.test', 'aluno2@example.test', 'aluno3@example.test', 'aluno4@example.test', 'aluno5@example.test'];
  const quote = await useCase.quote('teacher-persona', { monitorId: 'monitor-persona', interval: 'ANNUAL', beneficiaryEmails });
  assert.equal(quote.monitorName, 'Exatas ENEM');
  assert.equal(quote.serviceMonths, 12);
  assert.equal(quote.grossPriceCents, 96000);
  assert.equal(quote.platformAmountCents, 57600);
  assert.equal(quote.totalAmountCents, 288000);
  await useCase.execute('teacher-persona', {
    monitorId: 'monitor-persona', interval: 'ANNUAL', billingType: 'CREDIT_CARD', beneficiaryEmails,
    expectedTotalAmountCents: quote.totalAmountCents, idempotencyKey: 'exatas-enem-cohort-0001', returnBaseUrl: 'https://app.test',
  });
  assert.equal(record.checkoutCommands[0]?.chargeType, 'DETACHED');
  assert.equal(record.checkoutCommands[0]?.items[0]?.quantity, 5);
  assert.equal(record.checkoutCommands[0]?.amountCents, 288000);
  assert.deepEqual(record.checkoutCommands[0]?.splits, []);
  assert.equal(record.batches[0]?.serviceMonths, 12);
});

test('persona de curso mensal cadastra nova turma em outro lote independente', async () => {
  const { record, useCase } = setup({ monitorName: 'Exatas ENEM' });
  for (const [key, beneficiaryEmails] of [
    ['enem-turma-manha-0001', ['manha1@example.test', 'manha2@example.test']],
    ['enem-turma-noite-0001', ['noite1@example.test', 'noite2@example.test', 'noite3@example.test']],
  ] as const) {
    await useCase.execute('teacher-persona', { monitorId: 'monitor-persona', interval: 'MONTHLY', billingType: 'CREDIT_CARD', beneficiaryEmails: [...beneficiaryEmails], idempotencyKey: key, returnBaseUrl: 'https://app.test' });
  }
  assert.equal(record.batches.length, 2);
  assert.notEqual(record.batches[0]?.idempotencyKey, record.batches[1]?.idempotencyKey);
  assert.equal(record.checkoutCommands[0]?.items[0]?.quantity, 2);
  assert.equal(record.checkoutCommands[1]?.items[0]?.quantity, 3);
  assert.equal(record.checkoutCommands[1]?.amountCents, 18000);
});

test('persona professor pode cotar e comprar plano mensal ou anual para aluno com acesso vigente', async () => {
  const { record, useCase } = setup();
  const beneficiaryEmails = ['ativo@example.test'];
  for (const interval of ['MONTHLY', 'ANNUAL'] as const) {
    const quote = await useCase.quote('teacher-persona', { monitorId: 'monitor-persona', interval, beneficiaryEmails });
    assert.equal(quote.seatCount, 1);
    assert.equal(quote.serviceMonths, interval === 'MONTHLY' ? 1 : 12);
    assert.equal(quote.grossPriceCents, interval === 'MONTHLY' ? 10000 : 96000);
    assert.equal(quote.platformAmountCents, interval === 'MONTHLY' ? 6000 : 57600);
    assert.equal(quote.totalAmountCents, interval === 'MONTHLY' ? 6000 : 57600);
    const purchase = await useCase.execute('teacher-persona', { monitorId: 'monitor-persona', interval, billingType: 'CREDIT_CARD', beneficiaryEmails, expectedTotalAmountCents: quote.totalAmountCents, idempotencyKey: `active-student-${interval.toLowerCase()}`, returnBaseUrl: 'https://app.test' });
    assert.equal(purchase.amountCents, quote.totalAmountCents);
  }
  assert.equal(record.checkoutCommands.length, 2);
  assert.equal(record.checkoutCommands[0]?.cycle, 'MONTHLY');
  assert.equal(record.checkoutCommands[1]?.chargeType, 'DETACHED');
});

test('persona professor mantém validações de email, duplicatas e cotação desatualizada', async () => {
  const { record, useCase } = setup();
  await assert.rejects(() => useCase.quote('teacher-persona', { monitorId: 'monitor-persona', interval: 'MONTHLY', beneficiaryEmails: ['inválido'] }), (error: any) => error instanceof SponsoredBatchValidationError && error.code === 'INVALID_BENEFICIARY_EMAIL');
  await assert.rejects(() => useCase.quote('teacher-persona', { monitorId: 'monitor-persona', interval: 'MONTHLY', beneficiaryEmails: ['dup@example.test', 'DUP@example.test'] }), (error: any) => error.code === 'DUPLICATE_BENEFICIARY_EMAIL');
  const activeAccessQuote = await useCase.quote('teacher-persona', { monitorId: 'monitor-persona', interval: 'MONTHLY', beneficiaryEmails: ['ativo@example.test'] });
  await assert.rejects(() => useCase.execute('teacher-persona', { monitorId: 'monitor-persona', interval: 'MONTHLY', billingType: 'CREDIT_CARD', beneficiaryEmails: ['novo@example.test'], expectedTotalAmountCents: 5999, idempotencyKey: 'stale-quote-0001', returnBaseUrl: 'https://app.test' }), (error: any) => error.code === 'PRICE_CHANGED');
  assert.equal(record.checkoutCommands.length, 0);
  assert.equal(activeAccessQuote.totalAmountCents, 6000);
});

test('controller não expõe o bloqueio legado de acesso vigente', async () => {
  const useCase = { quote: async () => { throw new SponsoredBatchValidationError('BENEFICIARY_ALREADY_HAS_ACCESS'); } } as any;
  const controller = new SponsoredSeatController(useCase, {} as any, {} as any, 'https://app.test');
  const request = {
    user: { id: 'teacher-persona', role: 'teacher' },
    body: { monitorId: '00000000-0000-4000-8000-000000000001', interval: 'MONTHLY', beneficiaryEmails: ['ativo@example.test'] },
  } as any;
  await assert.rejects(() => controller.quote(request, { send: (data: unknown) => data } as any), (error: any) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'BENEFICIARY_ALREADY_HAS_ACCESS');
    assert.equal(error.statusCode, 422);
    assert.notEqual(error.publicMessage, 'Um ou mais alunos já têm acesso vigente a este monitor.');
    return true;
  });
});

test('aluno da turma só vincula vaga depois de confirmar o próprio email', async () => {
  const record: any = { claimed: null, invalidated: null };
  const claimUseCase = new ClaimSponsoredSeatsUseCase({ claimPaidSeats: async (input) => { record.claimed = input; return { claimedCount: 1, monitorIds: ['monitor-persona'] }; } }, async (userId) => { record.invalidated = userId; });
  await assert.rejects(() => claimUseCase.execute('student-user', 'student@example.test', false), (error: any) => error instanceof SponsoredSeatClaimError && error.code === 'EMAIL_NOT_VERIFIED');
  assert.equal(record.claimed, null);
  const result = await claimUseCase.execute('student-user', ' Student@Example.test ', true);
  assert.deepEqual(record.claimed, { studentUserId: 'student-user', emailNormalized: 'student@example.test' });
  assert.deepEqual(result, { claimedCount: 1, monitorIds: ['monitor-persona'] });
  assert.equal(record.invalidated, 'student-user');
});
