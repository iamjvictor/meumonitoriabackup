import assert from 'node:assert/strict';
import test from 'node:test';
import { AsaasApiError } from '../infrastructure/providers/asaas/asaas-http.client.js';
import { PaymentAccountCreationInProgressError, PaymentAccountReconciliationRequiredError } from '../application/commands/start-payment-account.use-case.js';
import { PaymentAccountController } from '../http/payment-account.controller.js';

test('criação de conta traduz invalid_object do Asaas em mensagem acionável sem detalhes sensíveis', async () => {
  const controller = new PaymentAccountController(
    {} as never,
    { execute: async () => { throw new AsaasApiError(400, 'Asaas request failed (400)', { code: 'invalid_object', descriptions: ['CEP rejeitado'] }); } } as never,
  );

  await assert.rejects(
    () => controller.start({ id: 'req-1', user: { id: 'teacher-1', role: 'teacher' }, body: {
      name: 'João Victor', email: 'teste2@gmail.com', cpfCnpj: '09648277940', birthDate: '2002-02-25', mobilePhone: '65478852855', incomeValue: 10000,
      postalCode: '24912710', address: 'Rua Jacinto', addressNumber: '123', province: 'Caxito',
    } } as never, {} as never),
    (error: any) => error.code === 'ASAAS_ACCOUNT_VALIDATION_ERROR'
      && error.statusCode === 422
      && error.publicMessage.includes('CEP')
      && !error.publicMessage.includes('CEP rejeitado'),
  );
});

test('indisponibilidade ou limite do Asaas vira erro temporário acionável sem expor resposta do provider', async () => {
  const controller = new PaymentAccountController(
    {} as never,
    { execute: async () => { throw new AsaasApiError(429, 'Asaas request failed (429)', { code: 'rate_limit', descriptions: ['dados privados'] }); } } as never,
  );
  await assert.rejects(
    () => controller.start({ id: 'req-2', user: { id: 'teacher-1', role: 'teacher' }, body: {
      name: 'João Victor', email: 'teste2@gmail.com', cpfCnpj: '09648277940', birthDate: '2002-02-25', mobilePhone: '65478852855', incomeValue: 10000,
      postalCode: '24912710', address: 'Rua Jacinto', addressNumber: '123', province: 'Caxito',
    } } as never, {} as never),
    (error: any) => error.code === 'ASAAS_ACCOUNT_PROVIDER_UNAVAILABLE'
      && error.statusCode === 503
      && !error.publicMessage.includes('dados privados'),
  );
});

test('concorrência e reconciliação ficam explícitas para o cliente sem sugerir nova criação', async () => {
  for (const [cause, code, statusCode] of [
    [new PaymentAccountCreationInProgressError(), 'PAYMENT_ACCOUNT_CREATION_IN_PROGRESS', 409],
    [new PaymentAccountReconciliationRequiredError(), 'PAYMENT_ACCOUNT_RECONCILIATION_REQUIRED', 503],
  ] as const) {
    const controller = new PaymentAccountController({} as never, { execute: async () => { throw cause; } } as never);
    await assert.rejects(
      () => controller.start({ id: 'req-3', user: { id: 'teacher-1', role: 'teacher' }, body: {
        name: 'João Victor', email: 'teste2@gmail.com', cpfCnpj: '09648277940', birthDate: '2002-02-25', mobilePhone: '65478852855', incomeValue: 10000,
        postalCode: '24912710', address: 'Rua Jacinto', addressNumber: '123', province: 'Caxito',
      } } as never, {} as never),
      (error: any) => error.code === code && error.statusCode === statusCode && /Asaas/.test(error.publicMessage),
    );
  }
});
