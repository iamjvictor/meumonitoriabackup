import assert from 'node:assert/strict';

import { getBlockEligibility, splitBlockContent } from '../../../backend/src/worker/services/chunk.service.js';

function makeBlock(type: 'QUESTION' | 'THEORY' | 'SOLUTION' | 'TITLE', normalizedContent: string) {
  return {
    id: `${type.toLowerCase()}-block`,
    blockIndex: 1,
    type,
    title: null,
    normalizedContent,
    isComplete: true,
    incompleteReason: null,
    sectionPath: ['Capitulo 1', 'Exercicios'],
    questionNumber: '1',
    institution: null,
    examYear: null,
    pageStart: 1,
    pageEnd: 1,
    topicLinks: [],
  };
}

const questionText = Array.from({ length: 700 }, () => 'pergunta').join(' ');
const theoryText = Array.from({ length: 430 }, () => 'teoria').join(' ');

assert.equal(splitBlockContent(questionText, 'QUESTION').length, 1, 'questao deve ser atomica no embeddable chunk');
assert.equal(splitBlockContent(theoryText, 'THEORY').length, 1, 'teoria deve respeitar envelope 250-450 tokens');

assert.equal(getBlockEligibility(makeBlock('QUESTION', 'Quanto e 2+2?')).eligible, true, 'questao curta completa deve ser valida');
assert.equal(getBlockEligibility(makeBlock('SOLUTION', 'Resposta: 4.')).eligible, true, 'solucao curta vinculada deve ser valida');
assert.equal(getBlockEligibility(makeBlock('TITLE', 'Capitulo 1 - Razao e Proporcao')).eligible, false, 'titulo isolado nao deve virar chunk');
assert.equal(getBlockEligibility(makeBlock('QUESTION', 'solução desse problema.)')).eligible, false, 'fragmento incompleto deve ser descartado');

console.log('question-context-pack chunking: OK');
