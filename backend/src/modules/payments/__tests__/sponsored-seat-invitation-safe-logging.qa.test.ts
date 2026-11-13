import assert from 'node:assert/strict';
import test from 'node:test';
import { SponsoredSeatInvitationUseCase } from '../application/commands/sponsored-seat-invitation.use-case.js';

const invitation = {
  invitationId: 'invite-id-private',
  seatId: 'seat-id-private',
  email: 'qa-student@example.test',
  teacherName: 'Private Teacher Name',
  monitorName: 'Private Monitor Name',
  interval: 'ANNUAL',
  startsAt: new Date('2026-11-01T00:00:00Z'),
  endsAt: new Date('2027-10-31T23:59:59Z'),
};
const rawToken = 'qa-token-private';
const rawPassword = 'PrivatePassword123';
const authAccessToken = 'private-access-token';
const authRefreshToken = 'private-refresh-token';

function makeUseCase(overrides: { provision?: () => Promise<never>; observe?: (entry: unknown) => void } = {}) {
  const calls: string[] = [];
  const repository = {
    async issue() { return { duplicate: false, expiresAt: new Date() }; },
    async resolve() { calls.push('lookup'); return invitation; },
    async isEmailRegistered() { calls.push('account-check'); return false; },
    async redeem() { calls.push('redeem'); return { claimedCount: 1, monitorIds: ['monitor-private'] }; },
  };
  const provisioner = {
    async createStudent(input: { password: string }) {
      calls.push('provision');
      if (overrides.provision) return overrides.provision();
      assert.equal(input.password, rawPassword);
      return {
        userId: 'student-private', email: invitation.email, role: 'student' as const,
        session: { accessToken: authAccessToken, refreshToken: authRefreshToken, expiresIn: 3600 },
      };
    },
  };
  return {
    calls,
    useCase: new SponsoredSeatInvitationUseCase(repository, provisioner, { frontBaseUrl: 'https://example.test' }),
  };
}

test('QA independente: activation observer recebe somente metadados mínimos e não muda o fluxo', async () => {
  const f = makeUseCase();
  const events: unknown[] = [];
  const result = await f.useCase.activate(rawToken, { name: 'Private Student Name', password: rawPassword }, (event) => events.push(event));

  assert.deepEqual(f.calls, ['lookup', 'account-check', 'provision', 'redeem']);
  assert.equal(result.claimedCount, 1);
  assert.deepEqual(events.map((entry: any) => [entry.stage, entry.outcome]), [
    ['invitation_lookup', 'started'], ['invitation_lookup', 'completed'],
    ['account_check', 'started'], ['account_check', 'completed'],
    ['account_provision', 'started'], ['account_provision', 'completed'],
    ['seat_redemption', 'started'], ['seat_redemption', 'completed'],
  ]);
  const serialized = JSON.stringify(events);
  for (const privateValue of [rawToken, rawPassword, authAccessToken, authRefreshToken, invitation.email, invitation.teacherName, invitation.monitorName]) {
    assert.equal(serialized.includes(privateValue), false, `observer vazou valor privado: ${privateValue}`);
  }
});

test('QA independente: observer que lança não substitui resultado nem erro da operação', async () => {
  const success = makeUseCase();
  const result = await success.useCase.activate(rawToken, { name: 'Student', password: rawPassword }, () => { throw new Error('observer failure'); });
  assert.equal(result.userId, 'student-private');
  assert.deepEqual(success.calls, ['lookup', 'account-check', 'provision', 'redeem']);

  const provisionError = new Error('provider error containing password and token');
  const failure = makeUseCase({ provision: async () => { throw provisionError; } });
  await assert.rejects(
    failure.useCase.activate(rawToken, { name: 'Student', password: rawPassword }, () => { throw new Error('observer failure'); }),
    (error: unknown) => error === provisionError,
  );
  assert.deepEqual(failure.calls, ['lookup', 'account-check', 'provision']);
});
