import assert from 'node:assert/strict';

import { document, element, asset, box } from './helpers.js';
import { normalizeLayoutContent } from '../../../backend/src/worker/services/layout-content-normalizer.service.js';

const normalized = normalizeLayoutContent(document({
  documentId: 'doc-normalizer',
  pages: [
    {
      pageNumber: 1,
      elements: [
        element({
          id: 'header-1',
          pageNumber: 1,
          readingOrder: 1,
          category: 'HEADER',
          rawText: 'Lista de Exercicios 2026',
          normalizedText: 'Lista de Exercicios 2026',
          bbox: box(0, 0, 1000, 60),
          assetIds: [],
        }),
        element({
          id: 'question-1',
          pageNumber: 1,
          readingOrder: 2,
          category: 'TEXT',
          rawText: '1. Quanto e 2 + 2?',
          normalizedText: '1. Quanto e 2 + 2?',
          bbox: box(0, 80, 900, 180),
          assetIds: [],
        }),
        element({
          id: 'formula-1',
          pageNumber: 1,
          readingOrder: 3,
          category: 'FORMULA',
          rawText: 'x = \\frac{1}{2',
          normalizedText: 'x = \\frac{1}{2',
          latex: '\\frac{1}{2',
          bbox: box(0, 200, 300, 260),
          assetIds: ['asset-formula-1'],
        }),
        element({
          id: 'footer-1',
          pageNumber: 1,
          readingOrder: 4,
          category: 'FOOTER',
          rawText: 'Pagina 1 de 2',
          normalizedText: 'Pagina 1 de 2',
          bbox: box(0, 940, 1000, 1000),
          assetIds: [],
        }),
      ],
    },
  ],
  assets: [
    asset({
      id: 'asset-formula-1',
      type: 'FORMULA',
      pageNumber: 1,
      bbox: box(0, 200, 300, 260),
      metadata: { role: 'equation' },
    }),
  ],
}));

assert.equal(normalized.documentId, 'doc-normalizer');
assert.equal(normalized.elements.length, 4);
assert.equal(normalized.semanticElements.some((item: any) => item.category === 'HEADER'), false);
assert.equal(normalized.semanticElements.some((item: any) => item.category === 'FOOTER'), false);
assert.equal(normalized.semanticElements.find((item: any) => item.id === 'question-1')?.rawText, '1. Quanto e 2 + 2?');
assert.equal(normalized.semanticElements.find((item: any) => item.id === 'formula-1')?.normalizedText, 'x = \\frac{1}{2');
assert.equal(normalized.semanticElements.find((item: any) => item.id === 'formula-1')?.latex, '\\frac{1}{2');
assert.equal(normalized.assets.length, 1);
assert.equal(normalized.assets[0]?.id, 'asset-formula-1');

console.log('question-span normalizer: OK');
