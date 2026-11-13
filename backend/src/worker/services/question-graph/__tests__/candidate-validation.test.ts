import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyEvidenceBackedStatementPatch,
  findConservativeDuplicates,
  validateQuestionCandidate,
  type CandidateForValidation,
} from '../candidate-validation.js';

function candidate(overrides: Partial<CandidateForValidation> = {}): CandidateForValidation {
  return {
    candidateId: 'q-1',
    segmentId: 'exam-blue',
    questionNumber: '1',
    statement: 'Leia o texto e marque a alternativa correta.',
    alternatives: [{ label: 'A', text: 'Opção A' }],
    sourceRefs: [{ id: 'page-4', page: 4, quote: 'Leia o texto e marque a alternativa correta.' }],
    ...overrides,
  };
}

test('classifies standalone URL and caption as fragments', () => {
  assert.equal(validateQuestionCandidate(candidate({ statement: 'https://example.org/figure.png' })).validity, 'fragment');
  assert.deepEqual(validateQuestionCandidate(candidate({ statement: 'Fonte: Adaptado de exemplo' })).reasons, ['STATEMENT_CAPTION_FRAGMENT']);
});

test('does not reject a short but valid question or assertion-based question', () => {
  assert.equal(validateQuestionCandidate(candidate({ statement: 'Calcule 2 + 2.', alternatives: [] })).validity, 'valid');
  assert.equal(validateQuestionCandidate(candidate({ statement: 'Analise as afirmações I, II e III.', alternatives: [] })).validity, 'valid');
});

test('deduplicates only same-segment questions with shared evidence and matching identity', () => {
  const a = candidate();
  const b = candidate({ candidateId: 'q-1-copy' });
  const c = candidate({ candidateId: 'q-1-other-exam', segmentId: 'exam-green', sourceRefs: [{ id: 'page-9' }] });
  const result = findConservativeDuplicates([a, b, c]);
  assert.deepEqual(result.duplicateGroups, [{ canonicalCandidateId: 'q-1', duplicateCandidateIds: ['q-1-copy'], evidenceRefIds: ['page-4'] }]);
  assert.deepEqual(result.ambiguousCandidateIds, ['q-1', 'q-1-other-exam']);
});

test('does not merge on question number alone when statements or evidence differ', () => {
  const result = findConservativeDuplicates([
    candidate(),
    candidate({ candidateId: 'q-different', statement: 'Outra questão correta?', sourceRefs: [{ id: 'page-5' }] }),
  ]);
  assert.deepEqual(result.duplicateGroups, []);
});

test('applies statement patch only when quote supports the proposed statement and preserves original', () => {
  const patch = applyEvidenceBackedStatementPatch({
    candidateId: 'q-1',
    currentStatement: 'Analise a questão.',
    proposedStatement: 'Analise as afirmações I, II e III e marque a alternativa correta.',
    evidenceRefId: 'page-4',
    evidenceQuote: 'Analise as afirmações I, II e III e marque a alternativa correta.',
    sourceText: 'Cabeçalho. Analise as afirmações I, II e III e marque a alternativa correta. A) ...',
    sourceRefs: [{ id: 'page-4', quote: 'Analise as afirmações I, II e III e marque a alternativa correta.' }],
  });
  assert.equal(patch?.originalStatement, 'Analise a questão.');
  assert.equal(patch?.origin, 'SOURCE_DOCUMENT');
  assert.equal(applyEvidenceBackedStatementPatch({
    candidateId: 'q-1', currentStatement: 'x', proposedStatement: 'Questão inventada',
    evidenceRefId: 'page-4', evidenceQuote: 'citação real do enunciado', sourceText: 'citação real do enunciado', sourceRefs: [{ id: 'page-4', quote: 'citação real do enunciado' }],
  }), null);
});
