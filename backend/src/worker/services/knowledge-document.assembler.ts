import { countTokens } from 'gpt-tokenizer';

const MAX_CHUNK_TOKENS = 450;
const HEADING_TYPES = new Set(['TITLE', 'SECTION_HEADER', 'HEADING', 'SUBTITLE']);
const CONTINUABLE_TYPES = new Set(['TEXT', 'LIST', 'TABLE', 'FORMULA']);

export type KnowledgeLayoutElement = {
  externalIndex: number;
  level: number | null;
  type: string;
  text: string | null;
  bbox: unknown;
};

export type KnowledgeLayoutPage = { pageNumber: number; elements: KnowledgeLayoutElement[] };

export type AssembledKnowledgeChunk = {
  chunkIndex: number;
  content: string;
  charCount: number;
  tokenCount: number;
  pages: number[];
  headings: string[];
  chunkType: string;
  provenance: Array<{ page: number; externalIndex: number; batchKey: string; bbox: number[] | null }>;
};

type Piece = {
  text: string;
  page: number;
  headings: string[];
  type: string;
  externalIndex: number;
  batchKey: string;
  bbox: number[] | null;
};

/** Builds ordered document chunks from absolute-page layouts; batch-local Docling refs are never joined. */
export function assembleKnowledgeChunks(pages: Array<{ page: KnowledgeLayoutPage; batchKey: string }>): AssembledKnowledgeChunk[] {
  assertBatchBoundariesAreProvable(pages);
  const pieces: Piece[] = [];
  const headingStack: string[] = [];
  for (const { page, batchKey } of [...pages].sort((a, b) => a.page.pageNumber - b.page.pageNumber)) {
    for (const element of [...page.elements].sort((a, b) => a.externalIndex - b.externalIndex)) {
      const text = typeof element.text === 'string' ? element.text : '';
      if (!text) continue;
      const type = element.type.toUpperCase();
      if (HEADING_TYPES.has(type) && text.trim()) {
        const depth = Number.isInteger(element.level) && element.level! >= 0 ? Math.min(element.level!, 8) : headingStack.length;
        headingStack.splice(depth);
        headingStack.push(text.trim());
      }
      for (const part of splitAtTokenLimit(text, MAX_CHUNK_TOKENS)) {
        pieces.push({
          text: part,
          page: page.pageNumber,
          headings: headingStack.slice(-8),
          type: type.toLowerCase(),
          externalIndex: element.externalIndex,
          batchKey,
          bbox: numericBbox(element.bbox),
        });
      }
    }
  }

  const chunks: AssembledKnowledgeChunk[] = [];
  let current: Piece[] = [];
  const flush = () => {
    if (!current.length) return;
    const content = current.map((piece) => piece.text).join('\n');
    const labels = [...new Set(current.map((piece) => piece.type))];
    const headings = [...(current.at(-1)?.headings ?? [])];
    chunks.push({
      chunkIndex: chunks.length,
      content,
      charCount: content.length,
      tokenCount: countTokens(content),
      pages: [...new Set(current.map((piece) => piece.page))].sort((a, b) => a - b),
      headings,
      chunkType: labels.length === 1 ? labels[0]! : 'mixed',
      provenance: current.map((piece) => ({ page: piece.page, externalIndex: piece.externalIndex, batchKey: piece.batchKey, bbox: piece.bbox })),
    });
    current = [];
  };

  for (const piece of pieces) {
    const tentative = [...current, piece].map((part) => part.text).join('\n');
    if (current.length && countTokens(tentative) > MAX_CHUNK_TOKENS) flush();
    current.push(piece);
  }
  flush();
  return chunks;
}

/**
 * Batch-local parser IDs cannot establish whether paragraph/table elements on
 * opposite sides of a checkpoint boundary are continuations. Refuse to publish
 * that seam until a parser supplies a stable cross-page structure identity.
 */
export function assertBatchBoundariesAreProvable(pages: Array<{ page: KnowledgeLayoutPage; batchKey: string }>): void {
  const ordered = [...pages].sort((a, b) => a.page.pageNumber - b.page.pageNumber);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (previous.batchKey === current.batchKey || current.page.pageNumber !== previous.page.pageNumber + 1) continue;
    const previousLast = [...previous.page.elements].sort((a, b) => b.externalIndex - a.externalIndex)
      .find((element) => Boolean(element.text?.trim()));
    const currentFirst = [...current.page.elements].sort((a, b) => a.externalIndex - b.externalIndex)
      .find((element) => Boolean(element.text?.trim()));
    if (!previousLast || !currentFirst) continue;
    const leftType = previousLast.type.toUpperCase();
    const rightType = currentFirst.type.toUpperCase();
    const leftText = previousLast.text?.trim() ?? '';
    const rightText = currentFirst.text?.trim() ?? '';
    const adjacentTables = leftType === 'TABLE' && rightType === 'TABLE';
    const adjacentFormulaFragments = leftType === 'FORMULA' && rightType === 'FORMULA';
    const unfinishedTextSeam = CONTINUABLE_TYPES.has(leftType) && CONTINUABLE_TYPES.has(rightType)
      && leftType !== 'TABLE' && rightType !== 'TABLE' && leftType !== 'FORMULA' && rightType !== 'FORMULA'
      && (!/[.!?…:;]["'”’)]?$/u.test(leftText) || /^[\p{Ll},;:)]/u.test(rightText));
    if (adjacentTables || adjacentFormulaFragments || unfinishedTextSeam) {
      throw new Error(`Continuidade estrutural não comprovada na fronteira entre lotes das páginas ${previous.page.pageNumber} e ${current.page.pageNumber} (${leftType} → ${rightType}); publicação bloqueada.`);
    }
  }
}

function splitAtTokenLimit(text: string, maxTokens: number): string[] {
  if (countTokens(text) <= maxTokens) return [text];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let low = start + 1;
    let high = text.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (countTokens(text.slice(start, middle)) <= maxTokens) low = middle;
      else high = middle - 1;
    }
    let end = low;
    const boundary = Math.max(text.lastIndexOf(' ', end - 1), text.lastIndexOf('\n', end - 1));
    if (boundary > start) end = boundary + 1;
    if (end <= start) throw new Error('Não foi possível separar o texto sem perda.');
    const part = text.slice(start, end);
    if (countTokens(part) > maxTokens) throw new Error('Um fragmento ultrapassa o limite de tokens.');
    parts.push(part);
    start = end;
  }
  return parts;
}

function numericBbox(value: unknown): number[] | null {
  return Array.isArray(value) && value.length === 4 && value.every((part) => typeof part === 'number' && Number.isFinite(part))
    ? value as number[]
    : null;
}
