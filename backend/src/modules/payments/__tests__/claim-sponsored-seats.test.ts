import assert from 'node:assert/strict';
import test from 'node:test';
import { ClaimSponsoredSeatsUseCase, SponsoredSeatClaimError } from '../application/commands/claim-sponsored-seats.use-case.js';

test('recusa reivindicação quando Supabase não confirmou o e-mail', async () => {
  let called = false;
  const useCase = new ClaimSponsoredSeatsUseCase({ claimPaidSeats: async () => { called = true; return { claimedCount: 0, monitorIds: [] }; } });
  await assert.rejects(() => useCase.execute('student-user', 'a@test.com', false), (error: any) => error instanceof SponsoredSeatClaimError && error.code === 'EMAIL_NOT_VERIFIED');
  assert.equal(called, false);
});

test('normaliza o e-mail confirmado e vincula as vagas pagas encontradas', async () => {
  let input: any;
  let invalidatedUserId: string | undefined;
  const useCase = new ClaimSponsoredSeatsUseCase({ claimPaidSeats: async (value: any) => { input = value; return { claimedCount: 2, monitorIds: ['monitor-1'] }; } }, async (userId) => { invalidatedUserId = userId; });
  const result = await useCase.execute('student-user', ' Student@Example.com ', true);
  assert.deepEqual(input, { studentUserId: 'student-user', emailNormalized: 'student@example.com' });
  assert.deepEqual(result, { claimedCount: 2, monitorIds: ['monitor-1'] });
  assert.equal(invalidatedUserId, 'student-user');
});

test('e-mail ausente não pode reivindicar vagas', async () => {
  const useCase = new ClaimSponsoredSeatsUseCase({ claimPaidSeats: async () => ({ claimedCount: 0, monitorIds: [] }) });
  await assert.rejects(() => useCase.execute('student-user', undefined, true), (error: any) => error.code === 'EMAIL_REQUIRED');
});
