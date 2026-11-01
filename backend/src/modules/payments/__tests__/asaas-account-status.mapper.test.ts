import assert from 'node:assert/strict';
import test from 'node:test';
import { mapAsaasAccountStatusEvent, mapAsaasAccountStatusSnapshot } from '../infrastructure/providers/asaas/asaas-account-status.mapper.js';

test('aprovação de documento espelha somente a dimensão documental e não aprova a conta', () => {
  assert.deepEqual(mapAsaasAccountStatusEvent('ACCOUNT_STATUS_DOCUMENT_APPROVED'), {
    documentationStatus: 'APPROVED',
  });
});

test('aprovação geral libera a conta e registra o espelho geral', () => {
  assert.deepEqual(mapAsaasAccountStatusEvent('ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED'), {
    status: 'APPROVED',
    generalStatus: 'APPROVED',
    verified: true,
  });
});

test('rejeição geral bloqueia a conta', () => {
  assert.deepEqual(mapAsaasAccountStatusEvent('ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED'), {
    status: 'REJECTED',
    generalStatus: 'REJECTED',
    verified: false,
  });
});

test('expiração anual comercial não altera o estado geral da conta', () => {
  assert.deepEqual(mapAsaasAccountStatusEvent('ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRING_SOON'), {
    commercialInfoStatus: 'EXPIRING_SOON',
  });
  assert.deepEqual(mapAsaasAccountStatusEvent('ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRED'), {
    commercialInfoStatus: 'EXPIRED',
  });
});

test('usa snapshot accountStatus recebido e mantém o evento como fallback da dimensão alterada', () => {
  assert.deepEqual(mapAsaasAccountStatusSnapshot('ACCOUNT_STATUS_DOCUMENT_APPROVED', {
    general: 'AWAITING_APPROVAL', commercialInfo: 'APPROVED', bankAccountInfo: 'PENDING', documentation: 'APPROVED',
  }), {
    generalStatus: 'AWAITING_APPROVAL',
    commercialInfoStatus: 'APPROVED',
    bankAccountStatus: 'PENDING',
    documentationStatus: 'APPROVED',
  });
  assert.deepEqual(mapAsaasAccountStatusSnapshot('ACCOUNT_STATUS_DOCUMENT_APPROVED', undefined), {
    documentationStatus: 'APPROVED',
  });
});
