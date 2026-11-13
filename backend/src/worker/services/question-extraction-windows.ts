import { countTokens } from 'gpt-tokenizer';

export type QuestionSourceChunk = {
  id: string;
  chunkIndex: number;
  text: string;
  pages: number[];
};

export type QuestionExtractionWindow = {
  windowIndex: number;
  chunks: QuestionSourceChunk[];
  tokenCount: number;
};

/** Build the single request body from every source chunk. Never partitions input. */
export function buildQuestionExtractionWindows(
  chunks: QuestionSourceChunk[],
  tokenBudget: number,
): QuestionExtractionWindow[] {
  if (!Number.isInteger(tokenBudget) || tokenBudget < 1) throw new Error('O orçamento da janela deve ser positivo.');

  const ordered = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  if (ordered.some((chunk) => !chunk.id || !chunk.text.trim())) throw new Error('Chunk de origem sem ID ou texto.');
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index]!.chunkIndex === ordered[index - 1]!.chunkIndex) throw new Error('Índices de chunk duplicados.');
  }

  const tokenCount = countTokens(ordered.map(formatChunk).join('\n\n--- CHUNK ---\n\n'));
  if (tokenCount > tokenBudget) {
    throw new Error(`QUESTION_EXTRACTION_INPUT_TOO_LARGE: documento completo tem ${tokenCount} tokens e excede o limite configurado (${tokenBudget}); nenhuma chamada foi feita. Aumente o limite/contexto do modelo ou processe um PDF menor.`);
  }
  return [{ windowIndex: 0, chunks: ordered, tokenCount }];
}

export function formatChunk(chunk: QuestionSourceChunk) {
  return `[chunkId=${chunk.id} chunkIndex=${chunk.chunkIndex} pages=${chunk.pages.join(',')} ]\n${chunk.text}`;
}

export function reconcileWindowQuestions<T extends { sourceChunkIds: string[] }>(
  candidates: T[],
): T[] {
  const result: T[] = [];
  for (const candidate of candidates) {
    const candidateText = candidate as T & { text?: string; statement?: string };
    const normalizedText = normalize(candidateText.statement ?? candidateText.text ?? '');
    const sourceIds = new Set(candidate.sourceChunkIds);
    const overlapIndex = result.findIndex((existing) => {
      const existingText = existing as T & { text?: string; statement?: string };
      return normalize(existingText.statement ?? existingText.text ?? '') === normalizedText
        && existing.sourceChunkIds.some((id) => sourceIds.has(id));
    });
    if (overlapIndex >= 0) {
      const existing = result[overlapIndex]!;
      result[overlapIndex] = { ...existing, sourceChunkIds: [...new Set([...existing.sourceChunkIds, ...candidate.sourceChunkIds])] };
      continue;
    }
    result.push(candidate);
  }
  return result;
}

function normalize(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}
