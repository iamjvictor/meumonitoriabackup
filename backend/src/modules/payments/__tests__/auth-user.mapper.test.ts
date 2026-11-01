import assert from 'node:assert/strict';
import test from 'node:test';
import { mapAuthenticatedUser } from '../../../middleware/auth.middleware.js';

test('identidade autenticada expõe apenas confirmação verificada do e-mail do Supabase', () => {
  assert.equal(mapAuthenticatedUser({ id: 'u1', email: 'a@test.com', email_confirmed_at: '2026-10-01T00:00:00.000Z' }).emailVerified, true);
  assert.equal(mapAuthenticatedUser({ id: 'u2', email: 'b@test.com', email_confirmed_at: null }).emailVerified, false);
});
