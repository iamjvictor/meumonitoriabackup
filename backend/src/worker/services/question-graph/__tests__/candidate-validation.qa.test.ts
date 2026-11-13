import assert from 'node:assert/strict';
import test from 'node:test';
import { applyEvidenceBackedStatementPatch, findConservativeDuplicates, validateQuestionCandidate, type CandidateForValidation } from '../candidate-validation.js';

const candidate = (overrides: Partial<CandidateForValidation> = {}): CandidateForValidation => ({
  candidateId: 'candidate-1', segmentId: 'exam-1', questionNumber: '1',
  statement: 'Calcule a área do retângulo.', alternatives: [],
  sourceRefs: [{ id: 'page-1', page: 1, quote: 'Calcule a área do retângulo.' }], ...overrides,
});

test('QA AC-006: recognizes caption fragments across common OCR punctuation and line wrapping', () => {
  for (const statement of ['Figura 2 – fonte: acervo do autor', 'Disponível em: https://example.org/mapa.png', 'Adaptado de Silva (2020)']) {
    assert.equal(validateQuestionCandidate(candidate({ statement })).validity, 'fragment', statement);
  }
});

test('QA AC-006: does not merge same number and statement across distinct exam segments', () => {
  const result = findConservativeDuplicates([
    candidate({ candidateId: 'blue-q1', segmentId: 'blue', sourceRefs: [{ id: 'shared-layout-page' }] }),
    candidate({ candidateId: 'green-q1', segmentId: 'green', sourceRefs: [{ id: 'shared-layout-page' }] }),
  ]);
  assert.deepEqual(result.duplicateGroups, []);
  assert.deepEqual(new Set(result.ambiguousCandidateIds), new Set(['blue-q1', 'green-q1']));
});

test('QA AC-006: duplicate grouping has a canonical result independent of input ordering', () => {
  const a = candidate({ candidateId: 'candidate-a' });
  const b = candidate({ candidateId: 'candidate-b' });
  const forward = findConservativeDuplicates([a, b]);
  const reverse = findConservativeDuplicates([b, a]);
  assert.deepEqual(reverse, forward);
});

test('QA AC-007: rejects a patch whose quote is only a small substring and whose remaining statement is unsupported', () => {
  const patch = applyEvidenceBackedStatementPatch({
    candidateId: 'candidate-1', currentStatement: 'Questão truncada.',
    proposedStatement: 'Leia 2 + 2 = 5 e marque a alternativa correta.',
    evidenceRefId: 'page-999', evidenceQuote: 'Leia',
    sourceText: 'page-1: Leia a tabela abaixo e responda.',
  });
  assert.equal(patch, null, 'a small quote cannot validate unsupported added words or a mismatched evidence reference');
});

test('QA AC-007: citation and statement matching tolerate equivalent Unicode normalization', () => {
  const patch = applyEvidenceBackedStatementPatch({
    candidateId: 'candidate-1', currentStatement: 'Questão truncada.',
    proposedStatement: 'Qual é a concentração de H₂O?', evidenceRefId: 'page-2',
    evidenceQuote: 'Qual é a concentração de H₂O?', sourceText: 'Qual é a concentração de H₂O?',
  });
  assert.equal(patch?.origin, 'SOURCE_DOCUMENT');
});
