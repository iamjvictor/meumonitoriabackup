import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { extractPdfPagesWithLayout } from '../pdf-layout-extraction.service.js';
import { buildFullDocumentTextChunks } from '../full-document-text-chunker.js';
import { TextNormalizationService } from '../text-normalization.service.js';

const pdfPath = resolve(process.cwd(), '../tests/document-parser/documentos-professor/Simulado Pedro Lucas.pdf');

test('Pedro Lucas PDF.js extraction covers all pages and preserves ten full A-E question blocks', async () => {
  const pdfBytes = new Uint8Array(await readFile(pdfPath));
  const pages = await extractPdfPagesWithLayout(pdfBytes);
  const normalization = new TextNormalizationService();
  const normalizedPages = pages.map((page) => ({
    num: page.num,
    text: normalization.normalize(page.text).normalizedContent,
  }));
  const chunking = buildFullDocumentTextChunks(normalizedPages);
  const fullText = normalizedPages.map(({ text }) => text).join('\n');
  const questionStarts = [...fullText.matchAll(/Questão\s+(\d{2})\s*-/giu)];

  assert.equal(pages.length, 5);
  assert.deepEqual(chunking.uncoveredPages, []);
  assert.deepEqual(chunking.coveredCharsByPage, Object.fromEntries(normalizedPages.map(({ num, text }) => [num, text.length])));
  assert.deepEqual(questionStarts.map((match) => match[1]), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);

  for (const [index, start] of questionStarts.entries()) {
    const end = questionStarts[index + 1]?.index ?? fullText.length;
    const question = fullText.slice(start.index, end);
    for (const label of ['A', 'B', 'C', 'D', 'E']) {
      assert.match(question, new RegExp(`(?:^|\\n)${label}\\s*\\)`, 'u'), `Questão ${start[1]} sem alternativa ${label}`);
    }
    assert.ok(question.length > 100, `Questão ${start[1]} parece truncada`);
  }

  const question08 = fullText.slice(questionStarts[7]!.index, questionStarts[8]!.index);
  assert.match(question08, /volume de CO\s*2 gerado pela combustão de 33g/u);
  assert.match(question08, /E\s*\)\s*2688\s*L/u);
});
