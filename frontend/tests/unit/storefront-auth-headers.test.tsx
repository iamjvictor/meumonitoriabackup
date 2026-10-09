import { expect, test } from 'vitest';
import { buildStudentAuthHeaders } from '@/shared/auth/session-headers';

test('inclui o token do aluno nas chamadas da vitrine', () => {
  const headers = buildStudentAuthHeaders('token-do-aluno', { 'Content-Type': 'application/json' });
  expect(headers.Authorization).toBe('Bearer token-do-aluno');
  expect(headers['Content-Type']).toBe('application/json');
});

test('preserva um Authorization já informado', () => {
  const headers = buildStudentAuthHeaders('token-salvo', { Authorization: 'Bearer token-explicito' });
  expect(headers.Authorization).toBe('Bearer token-explicito');
});
