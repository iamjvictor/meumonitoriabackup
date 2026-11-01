import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../../../core/errors/app-error.js';
import { CheckoutTeacherPayoutUnavailableError } from '../application/commands/create-checkout.use-case.js';
import { PaymentsController } from '../http/payments.controller.js';

test('informa ao aluno quando o checkout não pode garantir o repasse ao professor', async () => {
  const controller = new PaymentsController({
    async execute() { throw new CheckoutTeacherPayoutUnavailableError(); },
  } as never, 'https://app.example.test');
  const request = {
    id: 'req-test', user: { id: 'student-user', role: 'student' },
    body: { monitorId: '11111111-1111-4111-8111-111111111111', interval: 'ANNUAL' },
    headers: { 'idempotency-key': 'checkout-test-key' },
  } as never;

  await assert.rejects(() => controller.create(request, {} as never), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 409);
    assert.equal(error.code, 'TEACHER_PAYOUT_UNAVAILABLE');
    assert.match(error.publicMessage, /conta de recebimento do professor/i);
    return true;
  });
});
