import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { SponsoredSeatInvitationUseCase, SponsoredSeatInvitationError } from '../application/commands/sponsored-seat-invitation.use-case.js';

const NOW = new Date('2026-11-01T12:00:00.000Z');
const seatContext = {
  invitationId: 'inv-1', seatId: 'seat-1', email: 'aluno@example.test', teacherName: 'Professora Ana',
  monitorName: 'Matemática', interval: 'MONTHLY', startsAt: NOW, endsAt: new Date('2026-12-01T12:00:00.000Z'),
};
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

function setup(overrides: Record<string, unknown> = {}, provisionerOverrides: Record<string, unknown> = {}) {
  let storedHash: string | null = null;
  let expiresAt: Date | null = null;
  let context: typeof seatContext | null = seatContext;
  let savedEmail = '';
  const issuedKeys = new Set<string>();
  const repository = {
    async issue(input: { teacherUserId: string; batchId: string; seatId: string; tokenHash: string; expiresAt: Date; idempotencyKey?: string }) {
      if (input.teacherUserId !== 'teacher-owner') throw new SponsoredSeatInvitationError('FORBIDDEN');
      if (input.batchId !== 'batch-1' || input.seatId !== 'seat-1') throw new SponsoredSeatInvitationError('SEAT_NOT_ELIGIBLE');
      const key = input.idempotencyKey ?? 'legacy';
      if (issuedKeys.has(key)) return { duplicate: true, expiresAt: expiresAt! };
      issuedKeys.add(key);
      storedHash = input.tokenHash; expiresAt = input.expiresAt;
      return { duplicate: false, expiresAt: input.expiresAt };
    },
    async resolve(tokenHash: string, now: Date) {
      if (!storedHash || tokenHash !== storedHash) throw new SponsoredSeatInvitationError('INVALID_INVITATION');
      if (!expiresAt || expiresAt <= now) throw new SponsoredSeatInvitationError('INVALID_INVITATION');
      if (!context) throw new SponsoredSeatInvitationError('SEAT_NOT_ELIGIBLE');
      return context;
    },
    async isEmailRegistered(email: string) { return email.toLowerCase() === 'existing@example.test'; },
    async redeem(input: { tokenHash: string; studentUserId: string; email: string }) {
      savedEmail = input.email;
      return { claimedCount: 1 };
    },
    ...overrides,
  };
  const accountProvisioner = {
    async createStudent(input: { email: string; name: string; password: string }) {
      savedEmail = input.email;
      return { userId: 'student-user', email: input.email, role: 'student' as const, session: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600 } };
    },
    ...provisionerOverrides,
  };
  let tokenSequence = 0;
  const useCase = new SponsoredSeatInvitationUseCase(repository as never, accountProvisioner, {
    frontBaseUrl: 'https://app.example.test', emailEnabled: true, now: () => NOW,
    generateToken: () => `token-${++tokenSequence}`,
  });
  return { useCase, get storedHash() { return storedHash; }, get expiresAt() { return expiresAt; }, set context(value: typeof seatContext | null) { context = value; }, get savedEmail() { return savedEmail; } };
}

test('enfileira convite de reenvio com token não exposto e persiste somente hash por 30 dias', async () => {
  const f = setup();
  const result = await f.useCase.issue({ teacherUserId: 'teacher-owner', batchId: 'batch-1', seatId: 'seat-1', idempotencyKey: 'request-1' });
  assert.deepEqual(result, { queued: true, duplicate: false, expiresAt: new Date('2026-12-01T12:00:00.000Z') });
  assert.equal(result.expiresAt.toISOString(), '2026-12-01T12:00:00.000Z');
  assert.equal(f.storedHash, digest('token-1'));
  assert.notEqual(f.storedHash, 'token-1');
  assert.equal('url' in result, false);
});

test('rejeita token desconhecido e vencido', async () => {
  const f = setup();
  await assert.rejects(() => f.useCase.resolve('unknown'), (error: unknown) => error instanceof SponsoredSeatInvitationError && error.code === 'INVALID_INVITATION');
  await f.useCase.issue({ teacherUserId: 'teacher-owner', batchId: 'batch-1', seatId: 'seat-1', idempotencyKey: 'issue-1' });
  const expired = setup({ async resolve() { throw new SponsoredSeatInvitationError('INVALID_INVITATION'); } });
  await assert.rejects(() => expired.useCase.resolve('token-1'), (error: unknown) => error instanceof SponsoredSeatInvitationError && error.code === 'INVALID_INVITATION');
});

test('emissão exige professor proprietário e vaga elegível', async () => {
  const f = setup();
  await assert.rejects(() => f.useCase.issue({ teacherUserId: 'other-teacher', batchId: 'batch-1', seatId: 'seat-1', idempotencyKey: 'wrong-1' }), (error: unknown) => error instanceof SponsoredSeatInvitationError && error.code === 'FORBIDDEN');
  await assert.rejects(() => f.useCase.issue({ teacherUserId: 'teacher-owner', batchId: 'batch-1', seatId: 'seat-2', idempotencyKey: 'wrong-2' }), (error: unknown) => error instanceof SponsoredSeatInvitationError && error.code === 'SEAT_NOT_ELIGIBLE');
});

test('repetir a chave não invalida o convite; nova chave emite novo link e invalida o anterior', async () => {
  const f = setup();
  await f.useCase.issue({ teacherUserId: 'teacher-owner', batchId: 'batch-1', seatId: 'seat-1', idempotencyKey: 'same-key' });
  const duplicate = await f.useCase.issue({ teacherUserId: 'teacher-owner', batchId: 'batch-1', seatId: 'seat-1', idempotencyKey: 'same-key' });
  assert.equal(duplicate.duplicate, true);
  await assert.doesNotReject(() => f.useCase.resolve('token-1'));
  await f.useCase.issue({ teacherUserId: 'teacher-owner', batchId: 'batch-1', seatId: 'seat-1', idempotencyKey: 'new-key' });
  await assert.rejects(() => f.useCase.resolve('token-1'), (error: unknown) => error instanceof SponsoredSeatInvitationError && error.code === 'INVALID_INVITATION');
});

test('reenvio exige chave de idempotência e falha fechado quando email está desabilitado', async () => {
  const f = setup();
  await assert.rejects(() => f.useCase.issue({ teacherUserId: 'teacher-owner', batchId: 'batch-1', seatId: 'seat-1' }), (error: unknown) => error instanceof SponsoredSeatInvitationError && error.code === 'IDEMPOTENCY_KEY_REQUIRED');
  let mutated = false;
  const useCase = new SponsoredSeatInvitationUseCase({ issue: async () => { mutated = true; throw new Error('must not mutate'); } } as never, {} as never, { frontBaseUrl: 'https://app.example.test', emailEnabled: false });
  await assert.rejects(() => useCase.issue({ teacherUserId: 'teacher-owner', batchId: 'batch-1', seatId: 'seat-1', idempotencyKey: 'key' }), (error: unknown) => error instanceof SponsoredSeatInvitationError && error.code === 'EMAIL_UNAVAILABLE');
  assert.equal(mutated, false);
});

test('ativação deriva o e-mail da vaga e retorna a sessão e quantidade vinculada', async () => {
  const f = setup();
  await f.useCase.issue({ teacherUserId: 'teacher-owner', batchId: 'batch-1', seatId: 'seat-1', idempotencyKey: 'issue-1' });
  const result = await f.useCase.activate('token-1', { name: 'Aluno', password: 'strong-password' });
  assert.equal(f.savedEmail, 'aluno@example.test');
  assert.equal(result.email, 'aluno@example.test');
  assert.equal(result.claimedCount, 1);
  assert.equal(result.accessToken, 'access');
});

test('não ativa convite para vaga inelegível ou e-mail já cadastrado', async () => {
  const ineligible = setup({ async resolve() { throw new SponsoredSeatInvitationError('SEAT_NOT_ELIGIBLE'); } });
  await assert.rejects(() => ineligible.useCase.resolve('token'), (error: unknown) => error instanceof SponsoredSeatInvitationError && error.code === 'SEAT_NOT_ELIGIBLE');
  const existing = setup();
  await existing.useCase.issue({ teacherUserId: 'teacher-owner', batchId: 'batch-1', seatId: 'seat-1', idempotencyKey: 'issue-1' });
  existing.context = { ...seatContext, email: 'existing@example.test' };
  await assert.rejects(() => existing.useCase.activate('token-1', { name: 'Aluno', password: 'strong-password' }), (error: unknown) => error instanceof SponsoredSeatInvitationError && error.code === 'ACCOUNT_EXISTS');
});

test('resgata convite para conta existente usando identidade e e-mail autenticados', async () => {
  const f = setup();
  await f.useCase.issue({ teacherUserId: 'teacher-owner', batchId: 'batch-1', seatId: 'seat-1', idempotencyKey: 'issue-1' });
  const result = await f.useCase.redeemExistingAccount('token-1', { studentUserId: 'existing-student', email: ' ALUNO@example.test ', emailVerified: true });
  assert.equal(result.userId, 'existing-student');
  assert.equal(result.email, 'aluno@example.test');
  assert.equal(result.claimedCount, 1);
  assert.equal(f.savedEmail, 'aluno@example.test');
});

test('registra etapas seguras e diferencia falha de provisionamento de falha no resgate', async () => {
  const sensitiveDetails = 'token-1 aluno@example.test SenhaSuperSecreta';
  const provisionFailure = setup({}, { async createStudent() { throw new Error(sensitiveDetails); } });
  await provisionFailure.useCase.issue({ teacherUserId: 'teacher-owner', batchId: 'batch-1', seatId: 'seat-1', idempotencyKey: 'logs-provision' });
  const provisionEvents: unknown[] = [];
  await assert.rejects(() => provisionFailure.useCase.activate('token-1', { name: 'Aluno', password: 'SenhaSuperSecreta' }, (entry) => provisionEvents.push(entry)));
  assert.deepEqual(provisionEvents.map((entry: any) => [entry.stage, entry.outcome]), [
    ['invitation_lookup', 'started'], ['invitation_lookup', 'completed'],
    ['account_check', 'started'], ['account_check', 'completed'],
    ['account_provision', 'started'], ['account_provision', 'failed'],
  ]);

  const redemptionFailure = setup({ async redeem() { throw new Error(sensitiveDetails); } });
  await redemptionFailure.useCase.issue({ teacherUserId: 'teacher-owner', batchId: 'batch-1', seatId: 'seat-1', idempotencyKey: 'logs-redemption' });
  const redemptionEvents: any[] = [];
  await assert.rejects(() => redemptionFailure.useCase.activate('token-1', { name: 'Aluno', password: 'SenhaSuperSecreta' }, (entry) => redemptionEvents.push(entry)));
  assert.deepEqual(redemptionEvents.slice(-2).map(({ stage, outcome }) => [stage, outcome]), [['seat_redemption', 'started'], ['seat_redemption', 'failed']]);
  const serializedEvents = JSON.stringify([...provisionEvents, ...redemptionEvents]);
  assert.equal(serializedEvents.includes('token-1'), false);
  assert.equal(serializedEvents.includes('aluno@example.test'), false);
  assert.equal(serializedEvents.includes('SenhaSuperSecreta'), false);
  assert.deepEqual(redemptionEvents.at(-1), { stage: 'seat_redemption', outcome: 'failed', errorType: 'Error', errorCode: 'UNCLASSIFIED' });
});

test('exige e-mail verificado e não aceita ausência de e-mail ao resgatar conta existente', async () => {
  const f = setup();
  await assert.rejects(() => f.useCase.redeemExistingAccount('token-1', { studentUserId: 'student', email: 'aluno@example.test', emailVerified: false }), (error: unknown) => error instanceof SponsoredSeatInvitationError && error.code === 'EMAIL_NOT_VERIFIED');
  await assert.rejects(() => f.useCase.redeemExistingAccount('token-1', { studentUserId: 'student', email: undefined, emailVerified: true }), (error: unknown) => error instanceof SponsoredSeatInvitationError && error.code === 'EMAIL_REQUIRED');
});
