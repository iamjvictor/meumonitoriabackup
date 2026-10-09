import { expect, test } from 'vitest';
import { inferAuthProfile } from '@/shared/context/SessionAuthInterceptor';

test('classifica o checkout na página pública do professor como fluxo de aluno', () => {
  expect(inferAuthProfile('/p/joaoprofessor', 'https://api.example.com/api/v1/payments/checkout')).toBe('aluno');
});
