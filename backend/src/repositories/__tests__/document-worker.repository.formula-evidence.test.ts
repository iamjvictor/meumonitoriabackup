import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeFormulaEvidenceIntoProvenance } from '../document-worker.repository.js';

test('persists original and enriched formula evidence beside matching provenance without changing its shape', () => {
  const existing = [{ page: 6, item_ref: '#/texts/62', reading_order: 20, bbox: [217, 677, 420, 652] }];
  const result = mergeFormulaEvidenceIntoProvenance(existing, [{
    pageNumber: 6, itemRef: '#/texts/62', bbox: [217, 677, 420, 652],
    originalText: '2 H2O2 (aq) 2 H2O (l) + O2 (g)',
    enrichedText: '2 H_2O_2 \\to 2 H_2O + O_2',
  }]);

  assert.deepEqual(result, [{
    page: 6, item_ref: '#/texts/62', reading_order: 20, bbox: [217, 677, 420, 652],
    formulaEvidence: {
      originalText: '2 H2O2 (aq) 2 H2O (l) + O2 (g)',
      enrichedText: '2 H_2O_2 \\to 2 H_2O + O_2',
    },
  }]);
});

test('creates a provenance record for formula evidence without an existing item record', () => {
  const result = mergeFormulaEvidenceIntoProvenance([], [{
    pageNumber: 7, itemRef: '#/texts/73', bbox: null, originalText: '1/2 O2', enrichedText: '\\lceil _2 O_2',
  }]);
  assert.deepEqual(result, [{
    page: 7, item_ref: '#/texts/73', bbox: null, formulaEvidence: { originalText: '1/2 O2', enrichedText: '\\lceil _2 O_2' },
  }]);
});

test('persists geometry-backed inline exponent evidence with its raised glyph coordinates', () => {
  const result = mergeFormulaEvidenceIntoProvenance([], undefined, [{
    pageNumber: 6, itemRef: 'pypdfium2:page-6:chars-397-399', bbox: [119.08, 619.74, 132.08, 629.01],
    baseText: '10', raisedText: '7', normalizedText: '10^{7}', sourceText: '107',
    evidenceSource: 'PDF_CHARACTER_GEOMETRY', heightRatio: 0.562, raiseRatio: 0.372,
  }]);

  assert.deepEqual(result, [{
    page: 6, item_ref: 'pypdfium2:page-6:chars-397-399', bbox: [119.08, 619.74, 132.08, 629.01],
    inlineFormulaEvidence: {
      pageNumber: 6, itemRef: 'pypdfium2:page-6:chars-397-399', bbox: [119.08, 619.74, 132.08, 629.01],
      baseText: '10', raisedText: '7', normalizedText: '10^{7}', sourceText: '107',
      evidenceSource: 'PDF_CHARACTER_GEOMETRY', heightRatio: 0.562, raiseRatio: 0.372,
    },
  }]);
});
