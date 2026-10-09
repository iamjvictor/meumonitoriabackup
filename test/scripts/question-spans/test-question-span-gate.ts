import assert from 'node:assert/strict';

import { document, element, asset, box } from './helpers.js';
import { assembleQuestionSpan } from '../../../backend/src/worker/services/pedagogical-assembler.service.js';
import { canPromoteQuestion } from '../../../backend/src/worker/services/question-span-gate.service.js';

const promotable = assembleQuestionSpan(document({
  documentId: 'doc-gate-ready',
  pages: [
    {
      pageNumber: 1,
      elements: [
        element({
          id: 'g-q',
          pageNumber: 1,
          readingOrder: 1,
          category: 'TEXT',
          rawText: '1. Quanto e 2 + 2?',
          normalizedText: '1. Quanto e 2 + 2?',
          bbox: box(0, 100, 900, 160),
          assetIds: [],
        }),
        element({
          id: 'g-a',
          pageNumber: 1,
          readingOrder: 2,
          category: 'TEXT',
          rawText: 'A) 1',
          normalizedText: 'A) 1',
          bbox: box(0, 180, 400, 210),
          assetIds: [],
        }),
        element({
          id: 'g-b',
          pageNumber: 1,
          readingOrder: 3,
          category: 'TEXT',
          rawText: 'B) 2',
          normalizedText: 'B) 2',
          bbox: box(0, 220, 400, 250),
          assetIds: [],
        }),
        element({
          id: 'g-c',
          pageNumber: 1,
          readingOrder: 4,
          category: 'TEXT',
          rawText: 'C) 4',
          normalizedText: 'C) 4',
          bbox: box(0, 260, 400, 290),
          assetIds: [],
        }),
        element({
          id: 'g-d',
          pageNumber: 1,
          readingOrder: 5,
          category: 'TEXT',
          rawText: 'D) 5',
          normalizedText: 'D) 5',
          bbox: box(0, 300, 400, 330),
          assetIds: [],
        }),
        element({
          id: 'g-e',
          pageNumber: 1,
          readingOrder: 6,
          category: 'TEXT',
          rawText: 'E) 6',
          normalizedText: 'E) 6',
          bbox: box(0, 340, 400, 370),
          assetIds: [],
        }),
      ],
    },
  ],
}))[0];

const readyDecision = canPromoteQuestion(promotable as any);
assert.equal(readyDecision.status, 'READY_FOR_COMPLETION');
assert.equal(readyDecision.mathLayoutStatus, 'NOT_APPLICABLE');

const contaminated = assembleQuestionSpan(document({
  documentId: 'doc-gate-blocked',
  pages: [
    {
      pageNumber: 1,
      elements: [
        element({
          id: 'c-q',
          pageNumber: 1,
          readingOrder: 1,
          category: 'TEXT',
          rawText: '2. Resolva o exercicio e',
          normalizedText: '2. Resolva o exercicio e',
          bbox: box(0, 100, 900, 160),
          assetIds: [],
        }),
        element({
          id: 'c-a',
          pageNumber: 1,
          readingOrder: 2,
          category: 'TEXT',
          rawText: 'A) 1',
          normalizedText: 'A) 1',
          bbox: box(0, 180, 400, 210),
          assetIds: [],
        }),
        element({
          id: 'c-b',
          pageNumber: 1,
          readingOrder: 3,
          category: 'TEXT',
          rawText: 'B) 2',
          normalizedText: 'B) 2',
          bbox: box(0, 220, 400, 250),
          assetIds: [],
        }),
        element({
          id: 'c-c',
          pageNumber: 1,
          readingOrder: 4,
          category: 'TEXT',
          rawText: 'C) 4',
          normalizedText: 'C) 4',
          bbox: box(0, 260, 400, 290),
          assetIds: [],
        }),
        element({
          id: 'c-d',
          pageNumber: 1,
          readingOrder: 5,
          category: 'TEXT',
          rawText: 'D) 5',
          normalizedText: 'D) 5',
          bbox: box(0, 300, 400, 330),
          assetIds: [],
        }),
      ],
    },
  ],
}))[0];

const blockedDecision = canPromoteQuestion(contaminated as any);
assert.equal(blockedDecision.status, 'BLOCKED');
assert.match(blockedDecision.reasons.join(' '), /INCOMPLETE|ALTERNATIVES|CONTAMINATED/i);

const corruptedFormula = assembleQuestionSpan(document({
  documentId: 'doc-gate-formula',
  pages: [
    {
      pageNumber: 1,
      elements: [
        element({
          id: 'f-q',
          pageNumber: 1,
          readingOrder: 1,
          category: 'TEXT',
          rawText: '3. Observe a formula abaixo e responda.',
          normalizedText: '3. Observe a formula abaixo e responda.',
          bbox: box(0, 100, 900, 160),
          assetIds: ['formula-asset'],
        }),
        element({
          id: 'f-formula',
          pageNumber: 1,
          readingOrder: 2,
          category: 'FORMULA',
          rawText: '\\frac{1}{2',
          normalizedText: '\\frac{1}{2',
          latex: '\\frac{1}{2',
          bbox: box(0, 180, 400, 250),
          assetIds: ['formula-asset'],
        }),
        element({
          id: 'f-a',
          pageNumber: 1,
          readingOrder: 3,
          category: 'TEXT',
          rawText: 'A) 1/2',
          normalizedText: 'A) 1/2',
          bbox: box(0, 260, 400, 290),
          assetIds: [],
        }),
        element({
          id: 'f-b',
          pageNumber: 1,
          readingOrder: 4,
          category: 'TEXT',
          rawText: 'B) 2/3',
          normalizedText: 'B) 2/3',
          bbox: box(0, 300, 400, 330),
          assetIds: [],
        }),
        element({
          id: 'f-c',
          pageNumber: 1,
          readingOrder: 5,
          category: 'TEXT',
          rawText: 'C) 3/4',
          normalizedText: 'C) 3/4',
          bbox: box(0, 340, 400, 370),
          assetIds: [],
        }),
        element({
          id: 'f-d',
          pageNumber: 1,
          readingOrder: 6,
          category: 'TEXT',
          rawText: 'D) 4/5',
          normalizedText: 'D) 4/5',
          bbox: box(0, 380, 400, 410),
          assetIds: [],
        }),
        element({
          id: 'f-e',
          pageNumber: 1,
          readingOrder: 7,
          category: 'TEXT',
          rawText: 'E) 5/6',
          normalizedText: 'E) 5/6',
          bbox: box(0, 420, 400, 450),
          assetIds: [],
        }),
      ],
    },
  ],
  assets: [
    asset({
      id: 'formula-asset',
      type: 'FORMULA',
      pageNumber: 1,
      bbox: box(0, 180, 400, 250),
    }),
  ],
}))[0];

const formulaDecision = canPromoteQuestion(corruptedFormula as any);
assert.equal(formulaDecision.status, 'BLOCKED');
assert.equal(formulaDecision.mathLayoutStatus, 'CORRUPTED');

const missingVisual = assembleQuestionSpan(document({
  documentId: 'doc-gate-visual',
  pages: [
    {
      pageNumber: 1,
      elements: [
        element({
          id: 'v-q',
          pageNumber: 1,
          readingOrder: 1,
          category: 'TEXT',
          rawText: '4. Observe a figura e assinale a alternativa correta.',
          normalizedText: '4. Observe a figura e assinale a alternativa correta.',
          bbox: box(0, 100, 900, 160),
          assetIds: [],
        }),
        element({
          id: 'v-a',
          pageNumber: 1,
          readingOrder: 2,
          category: 'TEXT',
          rawText: 'A) 1',
          normalizedText: 'A) 1',
          bbox: box(0, 180, 400, 210),
          assetIds: [],
        }),
        element({
          id: 'v-b',
          pageNumber: 1,
          readingOrder: 3,
          category: 'TEXT',
          rawText: 'B) 2',
          normalizedText: 'B) 2',
          bbox: box(0, 220, 400, 250),
          assetIds: [],
        }),
        element({
          id: 'v-c',
          pageNumber: 1,
          readingOrder: 4,
          category: 'TEXT',
          rawText: 'C) 3',
          normalizedText: 'C) 3',
          bbox: box(0, 260, 400, 290),
          assetIds: [],
        }),
        element({
          id: 'v-d',
          pageNumber: 1,
          readingOrder: 5,
          category: 'TEXT',
          rawText: 'D) 4',
          normalizedText: 'D) 4',
          bbox: box(0, 300, 400, 330),
          assetIds: [],
        }),
        element({
          id: 'v-e',
          pageNumber: 1,
          readingOrder: 6,
          category: 'TEXT',
          rawText: 'E) 5',
          normalizedText: 'E) 5',
          bbox: box(0, 340, 400, 370),
          assetIds: [],
        }),
      ],
    },
  ],
}))[0];

const missingVisualDecision = canPromoteQuestion(missingVisual as any);
assert.equal(missingVisualDecision.status, 'BLOCKED');
assert.match(missingVisualDecision.reasons.join(' '), /VISUAL|FIGURE/i);

console.log('question-span gate: OK');
