import assert from 'node:assert/strict';
import test from 'node:test';
import { SponsoredSeatInvitationController } from '../http/sponsored-seat-invitation.controller.js';
import { AuthRepositoryError } from '../../../repositories/auth.repository.js';

const reply = () => ({ payload: undefined as unknown, send(value: unknown) { this.payload = value; return value; } });

test('resgate autenticado repassa id e e-mail verificado do usuário, nunca valores do corpo', async () => {
  let input: unknown;
  let token: string | undefined;
  const controller = new SponsoredSeatInvitationController({
    redeemExistingAccount: async (receivedToken: string, value: unknown) => { token = receivedToken; input = value; return { userId: 'student-1', email: 'aluno@example.test', role: 'student', claimedCount: 1, monitorIds: ['monitor-1'] }; },
  } as any);
  const result = reply();
  await controller.redeemExisting({ user: { id: 'student-1', role: 'student', email: 'aluno@example.test', emailVerified: true }, headers: { 'x-sponsored-invitation-token': 'secret-token' }, body: { email: 'attacker@example.test', userId: 'attacker' } } as any, result as any);
  assert.equal(token, 'secret-token');
  assert.deepEqual(input, { studentUserId: 'student-1', email: 'aluno@example.test', emailVerified: true });
  assert.equal((result.payload as any).data.claimedCount, 1);
});

test('rejeita resgate sem sessão ou por usuário que não seja aluno', async () => {
  const controller = new SponsoredSeatInvitationController({ redeemExistingAccount: async () => { throw new Error('must not execute'); } } as any);
  await assert.rejects(() => controller.redeemExisting({ user: null } as any, reply() as any), (error: any) => error.statusCode === 401);
  await assert.rejects(() => controller.redeemExisting({ user: { id: 'teacher', role: 'teacher' } } as any, reply() as any), (error: any) => error.statusCode === 403);
});

test('reenvio autenticado exige e encaminha Idempotency-Key sem retornar token', async () => {
  let received: unknown;
  const controller = new SponsoredSeatInvitationController({
    issue: async (input: unknown) => { received = input; return { queued: true, duplicate: false, expiresAt: new Date('2026-12-01T00:00:00Z') }; },
  } as any);
  const result = { status: 0, payload: undefined as unknown, code(value: number) { this.status = value; return this; }, send(value: unknown) { this.payload = value; return value; } };
  await assert.rejects(() => controller.issue({ user: { id: 'teacher-1', role: 'teacher' }, params: { batchId: '11111111-1111-4111-8111-111111111111', seatId: '22222222-2222-4222-8222-222222222222' }, headers: {} } as any, result as any), (error: any) => error.statusCode === 422);
  await controller.issue({ user: { id: 'teacher-1', role: 'teacher' }, params: { batchId: '11111111-1111-4111-8111-111111111111', seatId: '22222222-2222-4222-8222-222222222222' }, headers: { 'idempotency-key': 'resend-1' } } as any, result as any);
  assert.deepEqual(received, { teacherUserId: 'teacher-1', batchId: '11111111-1111-4111-8111-111111111111', seatId: '22222222-2222-4222-8222-222222222222', idempotencyKey: 'resend-1' });
  assert.equal(result.status, 202);
  assert.equal(JSON.stringify(result.payload).includes('token'), false);
});

test('logs da ativação incluem etapa e erro sanitizado sem dados pessoais ou credenciais', async () => {
  const logs: Array<{ level: string; fields: unknown }> = [];
  const sensitiveMessage = 'provider failed for aluno@example.test token invite-secret password SuperSenha123';
  const controller = new SponsoredSeatInvitationController({
    activate: async (_token: string, _body: unknown, observe: (entry: any) => void) => {
      observe({ stage: 'account_provision', outcome: 'started' });
      observe({ stage: 'account_provision', outcome: 'failed', errorType: 'AuthRepositoryError', errorCode: 'AUTH_REPOSITORY_ERROR' });
      throw new AuthRepositoryError(sensitiveMessage);
    },
  } as any);
  const request = {
    body: { name: 'Aluna', password: 'SuperSenha123' },
    headers: { 'x-sponsored-invitation-token': 'invite-secret' },
    log: {
      info(fields: unknown) { logs.push({ level: 'info', fields }); },
      warn(fields: unknown) { logs.push({ level: 'warn', fields }); },
    },
  };
  await assert.rejects(() => controller.activate(request as any, { setCookie() {} } as any), (error: any) => error.statusCode === 503 && error.code === 'SIGNUP_UNAVAILABLE');
  assert.deepEqual(logs.map(({ level, fields }: any) => [level, fields.stage, fields.outcome]), [
    ['info', 'account_provision', 'started'], ['warn', 'account_provision', 'failed'],
  ]);
  const serializedLogs = JSON.stringify(logs);
  for (const secret of ['aluno@example.test', 'invite-secret', 'SuperSenha123', sensitiveMessage]) assert.equal(serializedLogs.includes(secret), false);
  assert.equal((logs[1]!.fields as any).errorType, 'AuthRepositoryError');
  assert.equal((logs[1]!.fields as any).errorCode, 'AUTH_REPOSITORY_ERROR');
});
