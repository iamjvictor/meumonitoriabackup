import assert from 'node:assert/strict';

import { document, element, asset, box } from './helpers.js';
import { assembleQuestionSpan } from '../../../backend/src/worker/services/pedagogical-assembler.service.js';

const shortQuestion = assembleQuestionSpan(document({
  documentId: 'doc-short',
  pages: [
    {
      pageNumber: 1,
      elements: [
        element({
          id: 'title-1',
          pageNumber: 1,
          readingOrder: 1,
          category: 'TITLE',
          rawText: 'Capitulo 1',
          normalizedText: 'Capitulo 1',
          bbox: box(0, 0, 1000, 50),
          assetIds: [],
        }),
        element({
          id: 'q-1',
          pageNumber: 1,
          readingOrder: 2,
          category: 'TEXT',
          rawText: '1. Quanto e 2 + 2?',
          normalizedText: '1. Quanto e 2 + 2?',
          bbox: box(0, 80, 900, 150),
          assetIds: [],
        }),
        element({
          id: 'a-1',
          pageNumber: 1,
          readingOrder: 3,
          category: 'TEXT',
          rawText: 'A) 3',
          normalizedText: 'A) 3',
          bbox: box(0, 160, 400, 200),
          assetIds: [],
        }),
        element({
          id: 'b-1',
          pageNumber: 1,
          readingOrder: 4,
          category: 'TEXT',
          rawText: 'B) 4',
          normalizedText: 'B) 4',
          bbox: box(0, 210, 400, 250),
          assetIds: [],
        }),
        element({
          id: 'c-1',
          pageNumber: 1,
          readingOrder: 5,
          category: 'TEXT',
          rawText: 'C) 5',
          normalizedText: 'C) 5',
          bbox: box(0, 260, 400, 300),
          assetIds: [],
        }),
        element({
          id: 'd-1',
          pageNumber: 1,
          readingOrder: 6,
          category: 'TEXT',
          rawText: 'D) 6',
          normalizedText: 'D) 6',
          bbox: box(0, 310, 400, 350),
          assetIds: [],
        }),
        element({
          id: 'e-1',
          pageNumber: 1,
          readingOrder: 7,
          category: 'TEXT',
          rawText: 'E) 7',
          normalizedText: 'E) 7',
          bbox: box(0, 360, 400, 400),
          assetIds: [],
        }),
      ],
    },
  ],
}));

assert.equal(shortQuestion.length, 1);
assert.equal(shortQuestion[0]?.questionSource.statement.includes('Quanto e 2 + 2?'), true);
assert.deepEqual(shortQuestion[0]?.questionSource.alternatives.map((item: any) => item.label), ['A', 'B', 'C', 'D', 'E']);
assert.equal(shortQuestion[0]?.quality.structuralStatus, 'VALID');

const twoColumns = assembleQuestionSpan(document({
  documentId: 'doc-two-columns',
  pages: [
    {
      pageNumber: 1,
      elements: [
        element({
          id: 'left-q',
          pageNumber: 1,
          readingOrder: 1,
          category: 'TEXT',
          columnIndex: 0,
          rawText: '1. Qual e o resultado?',
          normalizedText: '1. Qual e o resultado?',
          bbox: box(0, 80, 450, 150),
          assetIds: [],
        }),
        element({
          id: 'left-a',
          pageNumber: 1,
          readingOrder: 2,
          category: 'TEXT',
          columnIndex: 0,
          rawText: 'A) 1',
          normalizedText: 'A) 1',
          bbox: box(0, 160, 450, 190),
          assetIds: [],
        }),
        element({
          id: 'right-q',
          pageNumber: 1,
          readingOrder: 3,
          category: 'TEXT',
          columnIndex: 1,
          rawText: '2. Qual e o valor?',
          normalizedText: '2. Qual e o valor?',
          bbox: box(500, 80, 950, 150),
          assetIds: [],
        }),
        element({
          id: 'right-a',
          pageNumber: 1,
          readingOrder: 4,
          category: 'TEXT',
          columnIndex: 1,
          rawText: 'A) 8',
          normalizedText: 'A) 8',
          bbox: box(500, 160, 950, 190),
          assetIds: [],
        }),
      ],
    },
  ],
}));

assert.equal(twoColumns.length, 2);
assert.equal(twoColumns[0]?.questionSource.statement.includes('resultado'), true);
assert.equal(twoColumns[1]?.questionSource.statement.includes('valor'), true);

const pageCrossing = assembleQuestionSpan(document({
  documentId: 'doc-page-crossing',
  pages: [
    {
      pageNumber: 1,
      elements: [
        element({
          id: 'cross-q-1',
          pageNumber: 1,
          readingOrder: 1,
          category: 'TEXT',
          rawText: '3. Resolva o problema da figura abaixo e complete a tabela.',
          normalizedText: '3. Resolva o problema da figura abaixo e complete a tabela.',
          bbox: box(0, 100, 950, 170),
          assetIds: ['fig-1'],
        }),
        element({
          id: 'cross-figure',
          pageNumber: 1,
          readingOrder: 2,
          category: 'FIGURE',
          rawText: '',
          normalizedText: '',
          bbox: box(100, 200, 700, 800),
          assetIds: ['fig-1'],
        }),
      ],
    },
    {
      pageNumber: 2,
      elements: [
        element({
          id: 'cross-q-2',
          pageNumber: 2,
          readingOrder: 1,
          category: 'TEXT',
          rawText: 'A) 10',
          normalizedText: 'A) 10',
          bbox: box(0, 50, 400, 100),
          assetIds: [],
        }),
        element({
          id: 'cross-q-3',
          pageNumber: 2,
          readingOrder: 2,
          category: 'TEXT',
          rawText: 'B) 20',
          normalizedText: 'B) 20',
          bbox: box(0, 110, 400, 160),
          assetIds: [],
        }),
        element({
          id: 'cross-sol',
          pageNumber: 2,
          readingOrder: 3,
          category: 'TEXT',
          rawText: 'Solução: a resposta e 10.',
          normalizedText: 'Solução: a resposta e 10.',
          bbox: box(0, 170, 900, 240),
          assetIds: [],
        }),
      ],
    },
  ],
  assets: [
    asset({
      id: 'fig-1',
      type: 'FIGURE',
      pageNumber: 1,
      bbox: box(100, 200, 700, 800),
    }),
  ],
}));

assert.equal(pageCrossing.length, 1);
assert.equal(pageCrossing[0]?.pageStart, 1);
assert.equal(pageCrossing[0]?.pageEnd, 2);
assert.equal(pageCrossing[0]?.visuals[0]?.type, 'FIGURE');

const repeatedBySection = assembleQuestionSpan(document({
  documentId: 'doc-repeated-number',
  pages: [
    {
      pageNumber: 1,
      elements: [
        element({
          id: 'section-1',
          pageNumber: 1,
          readingOrder: 1,
          category: 'TITLE',
          rawText: 'Secao 1 - Razao e Proporcao',
          normalizedText: 'Secao 1 - Razao e Proporcao',
          bbox: box(0, 0, 1000, 60),
          assetIds: [],
        }),
        element({
          id: 'r1-q',
          pageNumber: 1,
          readingOrder: 2,
          category: 'TEXT',
          rawText: '1. Quanto e 1 + 1?',
          normalizedText: '1. Quanto e 1 + 1?',
          bbox: box(0, 100, 900, 150),
          assetIds: [],
        }),
      ],
    },
    {
      pageNumber: 2,
      elements: [
        element({
          id: 'section-2',
          pageNumber: 2,
          readingOrder: 1,
          category: 'TITLE',
          rawText: 'Secao 2 - Porcentagem',
          normalizedText: 'Secao 2 - Porcentagem',
          bbox: box(0, 0, 1000, 60),
          assetIds: [],
        }),
        element({
          id: 'r2-q',
          pageNumber: 2,
          readingOrder: 2,
          category: 'TEXT',
          rawText: '1. Quanto e 10% de 50?',
          normalizedText: '1. Quanto e 10% de 50?',
          bbox: box(0, 100, 900, 150),
          assetIds: [],
        }),
      ],
    },
  ],
}));

assert.equal(repeatedBySection.length, 2);
assert.notDeepEqual(repeatedBySection[0]?.sectionPath, repeatedBySection[1]?.sectionPath);

const answerAndSolution = assembleQuestionSpan(document({
  documentId: 'doc-answer-solution',
  pages: [
    {
      pageNumber: 1,
      elements: [
        element({
          id: 'as-q',
          pageNumber: 1,
          readingOrder: 1,
          category: 'TEXT',
          rawText: '4. Qual e a resposta correta para a soma?',
          normalizedText: '4. Qual e a resposta correta para a soma?',
          bbox: box(0, 100, 900, 150),
          assetIds: [],
        }),
        element({
          id: 'as-a',
          pageNumber: 1,
          readingOrder: 2,
          category: 'TEXT',
          rawText: 'A) 2',
          normalizedText: 'A) 2',
          bbox: box(0, 160, 400, 190),
          assetIds: [],
        }),
        element({
          id: 'as-b',
          pageNumber: 1,
          readingOrder: 3,
          category: 'TEXT',
          rawText: 'B) 4',
          normalizedText: 'B) 4',
          bbox: box(0, 200, 400, 230),
          assetIds: [],
        }),
        element({
          id: 'as-c',
          pageNumber: 1,
          readingOrder: 4,
          category: 'TEXT',
          rawText: 'C) 6',
          normalizedText: 'C) 6',
          bbox: box(0, 240, 400, 270),
          assetIds: [],
        }),
        element({
          id: 'as-d',
          pageNumber: 1,
          readingOrder: 5,
          category: 'TEXT',
          rawText: 'D) 8',
          normalizedText: 'D) 8',
          bbox: box(0, 280, 400, 310),
          assetIds: [],
        }),
        element({
          id: 'as-e',
          pageNumber: 1,
          readingOrder: 6,
          category: 'TEXT',
          rawText: 'E) 10',
          normalizedText: 'E) 10',
          bbox: box(0, 320, 400, 350),
          assetIds: [],
        }),
        element({
          id: 'as-answer',
          pageNumber: 1,
          readingOrder: 7,
          category: 'TEXT',
          rawText: 'Gabarito: C',
          normalizedText: 'Gabarito: C',
          bbox: box(0, 360, 600, 400),
          assetIds: [],
        }),
        element({
          id: 'as-solution',
          pageNumber: 1,
          readingOrder: 8,
          category: 'TEXT',
          rawText: 'Solucao: 2 + 4 = 6, portanto a alternativa correta e C.',
          normalizedText: 'Solucao: 2 + 4 = 6, portanto a alternativa correta e C.',
          bbox: box(0, 410, 950, 470),
          assetIds: [],
        }),
      ],
    },
  ],
}));

assert.equal(answerAndSolution[0]?.answerKeySource?.answer, 'C');
assert.equal(answerAndSolution[0]?.solutionSource?.content.includes('alternativa correta e C'), true);

const figureEssential = assembleQuestionSpan(document({
  documentId: 'doc-figure-essential',
  pages: [
    {
      pageNumber: 1,
      elements: [
        element({
          id: 'fig-q',
          pageNumber: 1,
          readingOrder: 1,
          category: 'TEXT',
          rawText: '5. Observe a figura e assinale a alternativa correta.',
          normalizedText: '5. Observe a figura e assinale a alternativa correta.',
          bbox: box(0, 100, 900, 160),
          assetIds: ['fig-essential'],
        }),
        element({
          id: 'fig-asset',
          pageNumber: 1,
          readingOrder: 2,
          category: 'FIGURE',
          rawText: '',
          normalizedText: '',
          bbox: box(100, 200, 700, 700),
          assetIds: ['fig-essential'],
        }),
        element({
          id: 'fig-a',
          pageNumber: 1,
          readingOrder: 3,
          category: 'TEXT',
          rawText: 'A) 1',
          normalizedText: 'A) 1',
          bbox: box(0, 720, 400, 760),
          assetIds: [],
        }),
        element({
          id: 'fig-b',
          pageNumber: 1,
          readingOrder: 4,
          category: 'TEXT',
          rawText: 'B) 2',
          normalizedText: 'B) 2',
          bbox: box(0, 770, 400, 810),
          assetIds: [],
        }),
        element({
          id: 'fig-c',
          pageNumber: 1,
          readingOrder: 5,
          category: 'TEXT',
          rawText: 'C) 3',
          normalizedText: 'C) 3',
          bbox: box(0, 820, 400, 860),
          assetIds: [],
        }),
        element({
          id: 'fig-d',
          pageNumber: 1,
          readingOrder: 6,
          category: 'TEXT',
          rawText: 'D) 4',
          normalizedText: 'D) 4',
          bbox: box(0, 870, 400, 910),
          assetIds: [],
        }),
        element({
          id: 'fig-e',
          pageNumber: 1,
          readingOrder: 7,
          category: 'TEXT',
          rawText: 'E) 5',
          normalizedText: 'E) 5',
          bbox: box(0, 920, 400, 960),
          assetIds: [],
        }),
      ],
    },
  ],
  assets: [
    asset({
      id: 'fig-essential',
      type: 'FIGURE',
      pageNumber: 1,
      bbox: box(100, 200, 700, 700),
    }),
  ],
}));

assert.equal(figureEssential[0]?.visuals.length, 1);
assert.equal(figureEssential[0]?.visuals[0]?.assetId, 'fig-essential');

console.log('pedagogical assembler: OK');
