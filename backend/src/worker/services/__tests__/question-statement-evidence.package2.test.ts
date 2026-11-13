import assert from 'node:assert/strict';
import test from 'node:test';
import { validateQuestionStatementEvidence } from '../question-statement-evidence.service.js';

test('does not require a figure for a generic reference to locating an element in the periodic table', () => {
  const statement = 'Indique o grupo e o período da tabela de classificação periódica em que o bromo está localizado.';
  const result = validateQuestionStatementEvidence(statement, [{ content: statement }]);

  assert.equal(result.sourceMatch, 'EXACT');
  assert.equal(result.valid, true);
  assert.equal(result.reasons.includes('MISSING_VISUAL_EVIDENCE'), false);
});

test('keeps a data-table reference pending when its values are absent from the source', () => {
  const statement = 'Calcule a entalpia usando os valores apresentados na tabela a seguir.';
  const result = validateQuestionStatementEvidence(statement, [{ content: statement }]);

  assert.equal(result.valid, false);
  assert.equal(result.reasons.includes('MISSING_VISUAL_EVIDENCE'), true);
});
