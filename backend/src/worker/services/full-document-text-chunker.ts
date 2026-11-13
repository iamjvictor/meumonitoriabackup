import { countTokens } from 'gpt-tokenizer';
import type { DoclingChunkInput } from '../../repositories/document-worker.repository.js';

const MAX_CHUNK_TOKENS = 450;

export function buildFullDocumentTextChunks(pages: Array<{ num: number; text: string }>): {
  chunks: DoclingChunkInput[];
  uncoveredPages: number[];
  coveredCharsByPage: Record<number, number>;
} {
  const chunks: DoclingChunkInput[] = [];
  const uncoveredPages: number[] = [];
  const coveredCharsByPage: Record<number, number> = {};
  for (const page of [...pages].sort((a, b) => a.num - b.num)) {
    if (!page.text.length) { uncoveredPages.push(page.num); coveredCharsByPage[page.num] = 0; continue; }
    let start = 0;
    while (start < page.text.length) {
      let end = page.text.length;
      if (countTokens(page.text.slice(start, end)) > MAX_CHUNK_TOKENS) {
        let low = start + 1; let high = page.text.length;
        while (low < high) {
          const mid = Math.ceil((low + high) / 2);
          if (countTokens(page.text.slice(start, mid)) <= MAX_CHUNK_TOKENS) low = mid;
          else high = mid - 1;
        }
        end = low;
        const boundary = Math.max(page.text.lastIndexOf(' ', end - 1), page.text.lastIndexOf('\n', end - 1));
        if (boundary > start) end = boundary + 1;
      }
      if (end <= start) throw new Error(`Não foi possível dividir o texto da página ${page.num} sem perda.`);
      const rawText = page.text.slice(start, end);
      const tokens = countTokens(rawText);
      if (tokens > MAX_CHUNK_TOKENS) throw new Error(`O chunk da página ${page.num} excede o limite de tokens.`);
      chunks.push({ index: chunks.length, text: rawText, rawText, headings: [], pages: [page.num], type: 'text', tokens,
        provenance: [{ page: page.num, char_start: start, char_end: end, source: 'pdfjs-normalized-page' }] });
      coveredCharsByPage[page.num] = (coveredCharsByPage[page.num] ?? 0) + rawText.length;
      start = end;
    }
  }
  for (const page of pages) {
    if (coveredCharsByPage[page.num] !== page.text.length) throw new Error(`Cobertura incompleta do texto normalizado na página ${page.num}.`);
  }
  return { chunks, uncoveredPages, coveredCharsByPage };
}
