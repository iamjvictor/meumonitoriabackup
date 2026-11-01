import assert from 'node:assert/strict';
import test from 'node:test';
import { QUESTION_BANK_MATERIALIZATION_JOB_OPTIONS, questionBankMaterializationJobId } from '../question-bank-materialization.queue-options.js';

test('remove jobs concluídos e falhas finais da memória do Redis', () => {
  assert.equal(QUESTION_BANK_MATERIALIZATION_JOB_OPTIONS.removeOnComplete, true);
  assert.equal(QUESTION_BANK_MATERIALIZATION_JOB_OPTIONS.removeOnFail, true);
  assert.equal(QUESTION_BANK_MATERIALIZATION_JOB_OPTIONS.attempts, 3);
  assert.deepEqual(QUESTION_BANK_MATERIALIZATION_JOB_OPTIONS.backoff, { type: 'exponential', delay: 5000 });
});

test('mantém o mesmo ID ao recuperar geração ativa e troca ID em retry manual', () => {
  assert.equal(questionBankMaterializationJobId('run-1', 0), questionBankMaterializationJobId('run-1', 0));
  assert.notEqual(questionBankMaterializationJobId('run-1', 0), questionBankMaterializationJobId('run-1', 1));
});
