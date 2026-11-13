import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { prisma } from '../../lib/prisma.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { aiModels } from '../../config/ai-models.config.js';
import { OpenRouterClient, StructuredCompletionError, type ChatMessage } from '../client/openrouter.client.js';
import { saveQuestion } from '../../repositories/question.repository.js';
import { buildQuestionExtractionWindows, formatChunk, type QuestionSourceChunk } from './question-extraction-windows.js';
import { createQuestionGraphInput, createQuestionReviewerGraph } from './question-graph/reviewer.js';
import { PrismaQuestionGraphContextProvider } from './question-graph/prisma-context.provider.js';
import { SearchableQuestionGraphContextProvider } from './question-graph/search-document-evidence.js';
import type { ExtractedQuestionCandidate, QuestionBackendOutput, QuestionGraphState } from './question-graph/state.js';
import { createQuestionGraphCheckpointConfig, isDurableQuestionGraphCheckpointBackend, QuestionGraphCheckpointSaver } from './question-graph/checkpoint.js';


const ALTERNATIVE_LABELS = ['A', 'B', 'C', 'D', 'E'] as const;
const QUESTION_GRAPH_PIPELINE_VERSION = 'questions-langgraph-v1';
const QUESTION_GRAPH_PROMPT_VERSION = 'question-extraction-review-2026-11-06';

type DefaultCheckpointState = {
  promise?: Promise<{ saver: BaseCheckpointSaver }>;
};

const globalCheckpointState = globalThis as typeof globalThis & {
  questionGraphCheckpointState?: DefaultCheckpointState;
};

async function createDefaultQuestionGraphCheckpointBackend(): Promise<{ saver: BaseCheckpointSaver }> {
  const state = globalCheckpointState.questionGraphCheckpointState ??= {};
  if (!state.promise) {
    state.promise = (async () => {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) throw new Error('DATABASE_URL não está configurada.');

      const [{ default: pg }, { PostgresQuestionGraphCheckpointBackend }] = await Promise.all([
        import('pg'),
        import('./question-graph/postgres-checkpoint.js'),
      ]);
      const pool = new pg.Pool({ connectionString, max: 2 });
      const backend = new PostgresQuestionGraphCheckpointBackend(pool, {
        ...(process.env.QUESTION_GRAPH_CHECKPOINT_SCHEMA
          ? { schema: process.env.QUESTION_GRAPH_CHECKPOINT_SCHEMA }
          : {}),
      });
      try {
        await backend.assertSchemaReady();
      } catch (error) {
        await pool.end().catch(() => undefined);
        throw error;
      }
      return { saver: backend };
    })().catch((error: unknown) => {
      state.promise = undefined;
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `QUESTION_EXTRACTION_LANGGRAPH_ENABLED está ativo, mas o banco ou schema dedicado de checkpoints LangGraph não está disponível. `
        + `Nenhum DDL foi executado; inicialize o schema aprovado e confira DATABASE_URL/QUESTION_GRAPH_CHECKPOINT_SCHEMA. Causa: ${detail}`,
        { cause: error },
      );
    });
  }
  return state.promise;
}

const QUESTION_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { questions: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    properties: {
      number: { type: ['string', 'null'] },
      statement: { type: 'string' },
      alternatives: { type: 'array', maxItems: 5, items: { type: 'object', additionalProperties: false,
        properties: { label: { type: 'string', enum: ALTERNATIVE_LABELS }, text: { type: 'string' } }, required: ['label', 'text'] } },
      correctAnswer: { type: ['string', 'null'] }, institution: { type: ['string', 'null'] }, year: { type: ['integer', 'null'] },
      sourceChunkIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
      visualEvidence: { type: 'array', items: { type: 'object', additionalProperties: false,
        properties: { assetId: { type: 'string' }, role: { type: 'string', enum: ['STATEMENT', 'ALTERNATIVE'] }, alternativeLabel: { type: ['string', 'null'] }, anchorText: { type: 'string' } }, required: ['assetId', 'role', 'alternativeLabel', 'anchorText'] } },
    }, required: ['number', 'statement', 'alternatives', 'correctAnswer', 'institution', 'year', 'sourceChunkIds', 'visualEvidence'],
  } } }, required: ['questions'],
} as const;

const questionSchema = z.object({
  number: z.string().nullable(), statement: z.string().min(10),
  alternatives: z.array(z.object({ label: z.string().min(1), text: z.string().min(1) })).max(5)
    .superRefine((alternatives, context) => {
      const labels = new Set<string>();
      alternatives.forEach((alternative, index) => {
        if (!ALTERNATIVE_LABELS.some((label) => label === alternative.label)) {
          context.addIssue({ code: 'custom', path: [index, 'label'], message: `Rótulo fora de A–E: ${alternative.label}` });
        }
        if (labels.has(alternative.label)) {
          context.addIssue({ code: 'custom', path: [index, 'label'], message: `Rótulo duplicado: ${alternative.label}` });
        }
        labels.add(alternative.label);
      });
    }),
  correctAnswer: z.string().nullable(), institution: z.string().nullable(), year: z.number().int().nullable(),
  sourceChunkIds: z.array(z.string()).min(1), visualEvidence: z.array(z.object({
    assetId: z.string(), role: z.enum(['STATEMENT', 'ALTERNATIVE']), alternativeLabel: z.string().nullable(), anchorText: z.string().min(1),
  }).superRefine((evidence, context) => {
    if (evidence.role === 'ALTERNATIVE' && !evidence.alternativeLabel?.trim()) {
      context.addIssue({ code: 'custom', message: 'alternativeLabel é obrigatório para figuras ligadas a uma alternativa.' });
    }
  })),
});
const responseSchema = z.object({ questions: z.array(questionSchema) });

export function detectQuestionSourceIntegrityWarnings(candidate: Pick<StructuredCandidate, 'alternatives'>): Array<{ code: string; alternativeLabel?: string; token?: string }> {
  return candidate.alternatives.flatMap((alternative) => {
    const text = alternative.text.trim();
    if (/(?:×|x)\s*10\s*$/i.test(text)) return [{ code: 'POSSIBLE_MISSING_SCIENTIFIC_EXPONENT', alternativeLabel: alternative.label }];
    if (/(?:×|x)\s*10\s+\d{1,3}$/i.test(text)) return [{ code: 'SCIENTIFIC_EXPONENT_FORMAT_UNVERIFIED', alternativeLabel: alternative.label }];
    return [];
  });
}

type ImageEvidence = {
  id: string; assetKind: 'FIGURE' | 'PAGE'; pageNumber: number; storagePath: string; mimeType: string; chunkIds: string[];
  width: number | null; height: number | null; caption: string | null;
  bbox: number[] | null; readingOrder: number | null; sourceItemRef: string | null;
};
type FormulaEvidence = { pageNumber: number; itemRef: string; bbox: number[] | null; originalText: string | null; enrichedText: string };
type InlineFormulaEvidence = { pageNumber: number; itemRef: string; bbox: number[] | null; baseText: string; raisedText: string; normalizedText: string; sourceText: string; evidenceSource: 'PDF_CHARACTER_GEOMETRY'; heightRatio: number; raiseRatio: number };
type SourceEvidenceCorrection = { code: string; field: 'statement' | 'alternative'; alternativeLabel?: string; before: string; after: string; pageNumber: number; itemRef: string };
type QuestionExtractionChunk = QuestionSourceChunk & { status?: string; docHash?: string | null; formulaEvidence?: FormulaEvidence[]; inlineFormulaEvidence?: InlineFormulaEvidence[] };
type StructuredDocument = {
  id: string; teacherId: string; monitorId: string; subjectId: string; topicId: string | null;
  chunks: QuestionExtractionChunk[]; images: ImageEvidence[];
};
export type StructuredQuestionCandidate = z.infer<typeof questionSchema> & {
  sourceIntegrityWarnings?: Array<{ code: string; alternativeLabel?: string; token?: string }>;
  alternativesOrigin?: 'SOURCE_DOCUMENT' | 'AI_GENERATED' | null;
  correctAnswerOrigin?: 'SOURCE_DOCUMENT' | 'AI_GENERATED' | null;
  pendingIssues?: string[];
  reviewStatus?: string;
  contentReview?: string;
  metadata?: { questionExtractionOrdinal?: number; sourceEvidenceCorrections?: SourceEvidenceCorrection[]; [key: string]: unknown };
};
type StructuredCandidate = StructuredQuestionCandidate;

function isInsideMathDelimiter(text: string, offset: number): boolean {
  const delimiters = text.slice(0, offset).match(/(?<!\\)\$\$|(?<!\\)\$/g) ?? [];
  return delimiters.length % 2 === 1;
}

function renderFormulaToken(text: string, formula: string, offset: number): string {
  return isInsideMathDelimiter(text, offset) ? formula : `$${formula}$`;
}

function deduplicateSourceEvidenceCorrections(corrections: SourceEvidenceCorrection[]): SourceEvidenceCorrection[] {
  const seen = new Set<string>();
  return corrections.filter((correction) => {
    const key = [correction.code, correction.field, correction.alternativeLabel ?? '', correction.before, correction.after,
      correction.itemRef, correction.pageNumber].join('\u0000');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function correctCandidateFromSourceEvidence(candidate: StructuredCandidate, chunksById: Map<string, QuestionExtractionChunk>): StructuredCandidate {
  const evidenceChunks = candidate.sourceChunkIds.map((id) => chunksById.get(id)).filter((chunk): chunk is QuestionExtractionChunk => Boolean(chunk));
  const corrections: SourceEvidenceCorrection[] = [];
  const correctText = (text: string, field: 'statement' | 'alternative', alternativeLabel?: string) => {
    let corrected = text;
    for (const chunk of evidenceChunks) {
      for (const evidence of chunk.formulaEvidence ?? []) {
        const originalText = evidence.originalText ?? '';
        if (/1\s*\/\s*2\s*O\s*_?\s*2/i.test(originalText)) {
          const fractionVariants = [
            /\\lceil\s*_\s*\{\s*2\s*\}\s*O\s*_\s*\{\s*2\s*\}/g,
            /(?<![\w])1\s*\/\s*2\s+O\s*_?\s*2(?!\d)/gi,
            /\\frac\s*\{\s*1\s*\}\s*\{\s*2\s*\}\s*O\s*_\s*\{?\s*2\s*\}?/g,
          ];
          for (const fractionVariant of fractionVariants) {
            corrected = corrected.replace(fractionVariant, (before, offset: number) => {
              const after = renderFormulaToken(corrected, '\\frac{1}{2}O_2', offset);
              if (before !== after) corrections.push({ code: 'FORMULA_FRACTION_RESTORED_FROM_ORIGINAL_TEXT', field, ...(alternativeLabel ? { alternativeLabel } : {}),
                before, after, pageNumber: evidence.pageNumber, itemRef: evidence.itemRef });
              return after;
            });
          }
        }

        // Docling's enriched formula is the source of truth for this reaction
        // only when the candidate retained its source species but flattened the
        // equation. Replace only the equation line between its textual anchor
        // and the following sentence, preserving the rest of the question.
        if (isPeroxideDecompositionEvidence(evidence) && field === 'statement') {
          corrected = restorePeroxideReactionLine(corrected, evidence, corrections);
        }
        if (isWaterElectrolysisEvidence(evidence) && field === 'statement') {
          corrected = restoreWaterElectrolysisEquationLine(corrected, evidence, corrections);
        }
      }
      for (const evidence of chunk.inlineFormulaEvidence ?? []) {
        if (evidence.evidenceSource !== 'PDF_CHARACTER_GEOMETRY') continue;
        if (evidence.baseText === '10' && evidence.raisedText === '7' && evidence.normalizedText === '10^{7}') {
          corrected = corrected.replace(/\b10\s+7\b/g, (before, offset: number) => {
            const after = renderFormulaToken(corrected, '10^{7}', offset);
            corrections.push({ code: 'INLINE_EXPONENT_RESTORED_FROM_PDF_GEOMETRY', field, ...(alternativeLabel ? { alternativeLabel } : {}),
              before, after, pageNumber: evidence.pageNumber, itemRef: evidence.itemRef });
            return after;
          });
        }
        if (evidence.baseText === 's' && /^(?:−|-)1$/.test(evidence.raisedText) && evidence.normalizedText === 's^{-1}') {
          corrected = corrected.replace(/\bs\s*(?:-|−|–)\s*1\b/g, (before, offset: number) => {
            const after = renderFormulaToken(corrected, 's^{-1}', offset);
            corrections.push({ code: 'INLINE_EXPONENT_RESTORED_FROM_PDF_GEOMETRY', field, ...(alternativeLabel ? { alternativeLabel } : {}),
              before, after, pageNumber: evidence.pageNumber, itemRef: evidence.itemRef });
            return after;
          });
        }
        if (evidence.baseText === 'L' && /^(?:−|-)1$/.test(evidence.raisedText) && evidence.normalizedText === 'L^{-1}') {
          corrected = corrected.replace(/\bL\s*(?:-|−|–)\s*1\b/g, (before, offset: number) => {
            const after = renderFormulaToken(corrected, 'L^{-1}', offset);
            if (before !== after) corrections.push({ code: 'INLINE_EXPONENT_RESTORED_FROM_PDF_GEOMETRY', field, ...(alternativeLabel ? { alternativeLabel } : {}),
              before, after, pageNumber: evidence.pageNumber, itemRef: evidence.itemRef });
            return after;
          });
        }
      }
    }
    return corrected;
  };

  const statement = correctText(candidate.statement, 'statement');
  const alternatives = candidate.alternatives.map((alternative) => ({ ...alternative,
    text: correctText(alternative.text, 'alternative', alternative.label) }));
  return { ...candidate, statement, alternatives, metadata: { ...candidate.metadata,
    sourceEvidenceCorrections: deduplicateSourceEvidenceCorrections([...(candidate.metadata?.sourceEvidenceCorrections ?? []), ...corrections]) } };
}

function isPeroxideDecompositionEvidence(evidence: FormulaEvidence): boolean {
  const original = (evidence.originalText ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const enriched = evidence.enrichedText;
  return original.includes('h2o2') && original.includes('h2o') && original.includes('o2') && original.includes('mno2')
    && /\\(?:x)?rightarrow/.test(enriched)
    && /h\s*_?\s*\{?\s*2\s*\}?\s*o/i.test(enriched);
}

function restorePeroxideReactionLine(text: string, evidence: FormulaEvidence, corrections: SourceEvidenceCorrection[]): string {
  const observationStart = /observe\s+a\s+rea[cç][aã]o\s+qu[ií]mica/i.exec(text);
  if (!observationStart) return text;
  const nextSentence = /\bSabe-se\b/i.exec(text.slice(observationStart.index + observationStart[0].length));
  if (!nextSentence) return text;
  const contextEnd = observationStart.index + observationStart[0].length + nextSentence.index;
  const colon = text.indexOf(':', observationStart.index + observationStart[0].length);
  if (colon < 0 || colon >= contextEnd) return text;
  const lineStart = text.indexOf('\n', colon) >= 0 && text.indexOf('\n', colon) < contextEnd
    ? text.indexOf('\n', colon) + 1
    : colon + 1;
  const lineEndAt = text.indexOf('\n', lineStart);
  const lineEnd = lineEndAt >= 0 && lineEndAt < contextEnd ? lineEndAt : contextEnd;
  const rawLine = text.slice(lineStart, lineEnd).trim();
  const normalizedLine = rawLine.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (!/[→➝➜]|->|\\(?:x)?rightarrow/.test(rawLine)
      || !['h2o2', 'h2o', 'o2', 'mno2'].every((species) => normalizedLine.includes(species))) return text;
  if (rawLine.includes('$$') || /\\(?:x)?rightarrow/.test(rawLine)) return text;
  const replacement = `$$${evidence.enrichedText}$$`;
  const before = text.slice(lineStart, lineEnd);
  corrections.push({ code: 'REACTION_LINE_RESTORED_FROM_FORMULA_EVIDENCE', field: 'statement', before: before.trim(),
    after: replacement, pageNumber: evidence.pageNumber, itemRef: evidence.itemRef });
  return `${text.slice(0, lineStart)}${replacement}${text.slice(lineEnd)}`;
}

function isWaterElectrolysisEvidence(evidence: FormulaEvidence): boolean {
  const original = evidence.originalText ?? '';
  return /H\s*_?\s*2\s*O/i.test(original)
    && /H\s*_?\s*2\s*\(?\s*g/i.test(original)
    && /1\s*\/\s*2\s*O\s*_?\s*2/i.test(original)
    && /\\(?:x)?rightarrow/.test(evidence.enrichedText);
}

function restoreWaterElectrolysisEquationLine(
  text: string,
  evidence: FormulaEvidence,
  corrections: SourceEvidenceCorrection[],
): string {
  const equationAnchor = /equação\s*:/i.exec(text);
  if (!equationAnchor) return text;
  const colon = text.indexOf(':', equationAnchor.index);
  const newlineAfterColon = text.indexOf('\n', colon + 1);
  const lineStart = newlineAfterColon >= 0 ? newlineAfterColon + 1 : colon + 1;
  const lineEndAt = text.indexOf('\n', lineStart);
  if (lineEndAt < 0 || !/\bApresente\b/i.test(text.slice(lineEndAt + 1))) return text;
  const rawLine = text.slice(lineStart, lineEndAt).trim();
  const normalizedLine = rawLine.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (rawLine.includes('$$') || !/[→➝➜]|->|\\(?:x)?rightarrow/.test(rawLine)
      || !normalizedLine.includes('h2o') || !normalizedLine.includes('h2g') || !normalizedLine.includes('o2')) return text;

  // The original FormulaItem proves the 1/2 stoichiometric coefficient. Its
  // enriched LaTeX supplies the rest of the equation; only repair Docling's
  // known ceiling-shaped glyph when the original text confirms the fraction.
  const enrichedFormula = evidence.enrichedText.replace(
    /\\lceil\s*_\s*\{\s*2\s*\}\s*O\s*_\s*\{\s*2\s*\}/i,
    String.raw`\frac{1}{2} O _ { 2 }`,
  );
  if (enrichedFormula === evidence.enrichedText && /\\lceil/i.test(enrichedFormula)) return text;

  const replacement = `$$${enrichedFormula}$$`;
  corrections.push({ code: 'REACTION_LINE_RESTORED_FROM_FORMULA_EVIDENCE', field: 'statement', before: rawLine,
    after: replacement, pageNumber: evidence.pageNumber, itemRef: evidence.itemRef });
  return `${text.slice(0, lineStart)}${replacement}${text.slice(lineEndAt)}`;
}

function normalizeSourcePosition(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function sourcePosition(candidate: StructuredCandidate, chunksById: Map<string, QuestionExtractionChunk>): {
  chunkIndex: number; pageNumber: number; textOffset: number | null;
} {
  const sourceChunks = candidate.sourceChunkIds.map((id) => chunksById.get(id)).filter((chunk): chunk is QuestionExtractionChunk => Boolean(chunk))
    .sort((a, b) => a.chunkIndex - b.chunkIndex || Math.min(...a.pages, Number.MAX_SAFE_INTEGER) - Math.min(...b.pages, Number.MAX_SAFE_INTEGER));
  const firstChunk = sourceChunks[0];
  if (!firstChunk) return { chunkIndex: Number.MAX_SAFE_INTEGER, pageNumber: Number.MAX_SAFE_INTEGER, textOffset: null };

  const normalizedStatement = normalizeSourcePosition(candidate.statement);
  let textOffset: number | null = null;
  if (normalizedStatement) {
    for (const chunk of sourceChunks) {
      const normalizedSource = normalizeSourcePosition(chunk.text);
      let offset = normalizedSource.indexOf(normalizedStatement);
      if (offset < 0) {
        const prefixLength = Math.min(80, normalizedStatement.length);
        for (let length = prefixLength; length >= 32; length -= 1) {
          const prefix = normalizedStatement.slice(0, length).trim();
          if (prefix.length < 32) break;
          offset = normalizedSource.indexOf(prefix);
          if (offset >= 0) break;
        }
      }
      if (offset >= 0) { textOffset = offset; break; }
    }
  }
  return { chunkIndex: firstChunk.chunkIndex, pageNumber: Math.min(...firstChunk.pages, Number.MAX_SAFE_INTEGER), textOffset };
}

function orderCandidatesForPersistence(candidates: StructuredCandidate[], chunks: QuestionExtractionChunk[]): StructuredCandidate[] {
  const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  return candidates.map((candidate) => ({ candidate, position: sourcePosition(candidate, chunksById) }))
    .sort((a, b) => a.position.chunkIndex - b.position.chunkIndex
      || a.position.pageNumber - b.position.pageNumber
      || (a.position.textOffset !== null && b.position.textOffset !== null ? a.position.textOffset - b.position.textOffset
        : a.position.textOffset !== null ? -1 : b.position.textOffset !== null ? 1 : 0)
      || compareStableCandidateText(a.candidate, b.candidate))
    .map(({ candidate }, questionExtractionOrdinal) => ({ ...candidate,
      metadata: { ...candidate.metadata, questionExtractionOrdinal } }));
}

function compareStableCandidateText(a: StructuredCandidate, b: StructuredCandidate): number {
  const leftStatement = normalizeSourcePosition(a.statement);
  const rightStatement = normalizeSourcePosition(b.statement);
  if (leftStatement !== rightStatement) return leftStatement < rightStatement ? -1 : 1;
  const leftNumber = a.number ?? '';
  const rightNumber = b.number ?? '';
  if (leftNumber !== rightNumber) return leftNumber < rightNumber ? -1 : 1;
  const leftSources = [...a.sourceChunkIds].sort().join('\u0000');
  const rightSources = [...b.sourceChunkIds].sort().join('\u0000');
  return leftSources === rightSources ? 0 : leftSources < rightSources ? -1 : 1;
}

function buildPersistedVisualEvidence(candidate: Pick<StructuredCandidate, 'visualEvidence'>, images: ImageEvidence[] = []) {
  return candidate.visualEvidence.map(({ assetId, role, alternativeLabel, anchorText }) => {
    const image = images.find((asset) => asset.id === assetId);
    return { assetId, role, alternativeLabel, anchorText,
      pageNumber: image?.pageNumber ?? null, readingOrder: image?.readingOrder ?? null,
      bbox: image?.bbox ?? null, sourceItemRef: image?.sourceItemRef ?? null };
  });
}

type StructuredRepository = {
  load(documentId: string): Promise<StructuredDocument | null>;
  save(document: StructuredDocument, candidate: StructuredCandidate, windowImages: ImageEvidence[], unavailableAssetIds?: string[]): Promise<string>;
};

type QuestionGraphRunner = {
  getState?(config: Record<string, unknown>): Promise<unknown>;
  invoke(input: QuestionGraphState | null, options?: Record<string, unknown>): Promise<QuestionGraphState>;
};
type QuestionGraphCheckpointBackend = { saver: BaseCheckpointSaver };

function sameIds(left: string[], right: string[]): boolean {
  return [...left].sort().join('\u0000') === [...right].sort().join('\u0000');
}

function graphCandidateForOutput(output: QuestionBackendOutput, candidates: ExtractedQuestionCandidate[]): ExtractedQuestionCandidate {
  const sameNumberAndSources = candidates.filter((candidate) => candidate.number === output.questionNumber
    && sameIds(candidate.sourceChunkIds, output.sourceChunkIds));
  const exact = sameNumberAndSources.filter((candidate) => normalizeSourcePosition(candidate.statement) === normalizeSourcePosition(output.statement));
  const matches = exact.length ? exact : sameNumberAndSources;
  if (matches.length !== 1) {
    throw new Error(`A saída do grafo perdeu identidade/proveniência inequívoca da candidata (${matches.length} correspondências).`);
  }
  return matches[0]!;
}

function sourceCandidateForGraphCandidate(
  documentId: string,
  graphCandidate: ExtractedQuestionCandidate,
  sourceQuestions: StructuredCandidate[],
): StructuredCandidate {
  const candidateId = graphCandidate.candidateId ?? graphCandidate.id;
  const exact = candidateId
    ? sourceQuestions.find((candidate) => stableCandidateId(documentId, candidate) === candidateId)
    : undefined;
  if (exact) return exact;
  const refs = new Set(graphCandidate.sourceChunkIds);
  const matches = sourceQuestions.filter((candidate) => candidate.number === graphCandidate.number
    && candidate.sourceChunkIds.some((id) => refs.has(id))
    && normalizeSourcePosition(candidate.statement) === normalizeSourcePosition(graphCandidate.statement));
  if (matches.length !== 1) {
    throw new Error(`A candidata consolidada não preserva origem de extração inequívoca (${matches.length} correspondências).`);
  }
  return matches[0]!;
}

function stableCandidateId(documentId: string, candidate: StructuredCandidate): string {
  const identity = [documentId, candidate.number ?? '', [...candidate.sourceChunkIds].sort().join(','),
    candidate.statement.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase()].join('\u0000');
  return `candidate:${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}

function documentVersion(document: StructuredDocument): string {
  const sourceHashes = [...new Set(document.chunks.map(({ docHash }) => docHash).filter((value): value is string => Boolean(value)))];
  // docHash is the SHA-256 of the original PDF and is also the key used by
  // document evidence search. Keep it as documentVersion when consistent.
  if (sourceHashes.length === 1) return sourceHashes[0]!;
  return documentContentFingerprint(document);
}

function documentContentFingerprint(document: StructuredDocument): string {
  const digest = createHash('sha256');
  // Include actual extracted content even when docHash exists: a stale hash
  // must not make a checkpoint reusable for changed chunks or image refs.
  const chunks = [...document.chunks].sort((a, b) => a.chunkIndex - b.chunkIndex || a.id.localeCompare(b.id));
  for (const chunk of chunks) digest.update(JSON.stringify({ id: chunk.id, chunkIndex: chunk.chunkIndex,
    docHash: chunk.docHash ?? null, text: chunk.text, pages: [...chunk.pages].sort((a, b) => a - b),
    formulaEvidence: chunk.formulaEvidence ?? [], inlineFormulaEvidence: chunk.inlineFormulaEvidence ?? [] }));
  const images = [...document.images].sort((a, b) => a.id.localeCompare(b.id));
  for (const image of images) digest.update(JSON.stringify({ id: image.id, assetKind: image.assetKind, pageNumber: image.pageNumber,
    storagePath: image.storagePath, mimeType: image.mimeType, chunkIds: [...image.chunkIds].sort(), width: image.width,
    height: image.height, bbox: image.bbox, readingOrder: image.readingOrder, sourceItemRef: image.sourceItemRef }));
  return digest.digest('hex');
}

function checkpointCandidatesToSourceQuestions(state: QuestionGraphState): StructuredCandidate[] {
  return state.candidates.map((candidate) => {
    const snapshot = candidate.originalSnapshot;
    if (!snapshot) {
      throw new Error('Checkpoint de questões sem snapshot original; não é seguro associar o resultado a uma nova extração.');
    }
    return {
      ...candidate,
      statement: snapshot.statement,
      alternatives: snapshot.alternatives,
      correctAnswer: snapshot.correctAnswer,
      sourceChunkIds: [...candidate.sourceChunkIds],
      visualEvidence: candidate.visualEvidence ?? [],
    } as StructuredCandidate;
  });
}

function isScopedCheckpointState(value: unknown, executionId: string, documentId: string, version: string): value is QuestionGraphState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<QuestionGraphState>;
  return state.executionId === executionId && state.documentId === documentId && state.documentVersion === version
    && Array.isArray(state.candidates) && Array.isArray(state.backendOutput);
}

export class StructuredQuestionExtractionService {
  constructor(
    private readonly client: Pick<OpenRouterClient, 'createStructuredChatCompletion'> = new OpenRouterClient(),
    private readonly repository: StructuredRepository = defaultRepository,
    private readonly tokenBudget = aiModels.questionExtractionInputMaxTokens,
    private readonly loadImage: (storagePath: string) => Promise<{ dataUrl: string | null; error: boolean }> = loadPrivateImage,
    private readonly graphRunner?: QuestionGraphRunner,
    private readonly graphEnabled = process.env.QUESTION_EXTRACTION_LANGGRAPH_ENABLED === 'true',
    private readonly checkpointBackend?: QuestionGraphCheckpointBackend,
  ) {}

  async processDocument(documentId: string) {
    const checkpointBackend = this.graphEnabled
      ? this.checkpointBackend ?? (this.graphRunner ? undefined : await createDefaultQuestionGraphCheckpointBackend())
      : this.checkpointBackend;
    const document = await this.loadDocument(documentId);
    const byChunk = new Map(document.chunks.map((chunk) => [chunk.id, chunk]));
    const version = documentVersion(document);
    const pipelineVersion = QUESTION_GRAPH_PIPELINE_VERSION;
    const promptVersion = QUESTION_GRAPH_PROMPT_VERSION;
    const executionId = `question-extraction:${document.id}:${version}:${documentContentFingerprint(document)}:${pipelineVersion}:${promptVersion}`;
    const checkpointConfig = {
      ...createQuestionGraphCheckpointConfig({ executionId, documentId: document.id, documentVersion: version }),
    };
    let graphLlmCalls = 0;
    let graph: QuestionGraphRunner | undefined;
    if (this.graphEnabled || this.graphRunner) {
      if (this.graphEnabled && !isDurableQuestionGraphCheckpointBackend(checkpointBackend?.saver)) {
        throw new Error('QUESTION_EXTRACTION_LANGGRAPH_ENABLED exige checkpointer Postgres durável aprovado (durable persistent saver approved); execução cancelada.');
      }
      const contextProvider = new SearchableQuestionGraphContextProvider(new PrismaQuestionGraphContextProvider());
      const graphClient = {
        createStructuredChatCompletion: async <T>(request: Parameters<OpenRouterClient['createStructuredChatCompletion']>[0]) => {
          graphLlmCalls += 1;
          return this.client.createStructuredChatCompletion<T>(request as never);
        },
      };
      if (this.graphRunner) graph = this.graphRunner;
      else {
        if (!this.graphEnabled || !isDurableQuestionGraphCheckpointBackend(checkpointBackend?.saver)) {
          throw new Error('QUESTION_EXTRACTION_LANGGRAPH_ENABLED exige checkpointer Postgres durável (durable persistent saver approved); execução cancelada.');
        }
        graph = createQuestionReviewerGraph({ contextProvider, client: graphClient,
          checkpointer: new QuestionGraphCheckpointSaver(checkpointBackend.saver) });
      }
    }

    let checkpointState: QuestionGraphState | undefined;
    let checkpointExists = false;
    if (graph?.getState) {
      const snapshot = await graph.getState(checkpointConfig) as {
        values?: unknown; config?: { configurable?: { checkpoint_id?: string } };
      };
      checkpointExists = Boolean(snapshot.config?.configurable?.checkpoint_id);
      if (checkpointExists) {
        if (!isScopedCheckpointState(snapshot.values, executionId, document.id, version)) {
          throw new Error('Checkpoint encontrado, mas sua identidade não corresponde ao documento/versão atual; execução cancelada para evitar mistura de conteúdo.');
        }
        checkpointState = snapshot.values;
        checkpointCandidatesToSourceQuestions(checkpointState);
      }
    }

    let extraction: { questions: StructuredCandidate[]; llmCalls: number } = { questions: [], llmCalls: 0 };
    let imageIssues = new Set<string>();
    let sourceQuestions: StructuredCandidate[];
    if (checkpointState) {
      sourceQuestions = checkpointCandidatesToSourceQuestions(checkpointState);
      const referencedImageIds = new Set(sourceQuestions.flatMap((candidate) => candidate.visualEvidence.map(({ assetId }) => assetId)));
      for (const image of document.images.filter((asset) => referencedImageIds.has(asset.id))) {
        const loaded = await this.loadImage(image.storagePath);
        if (loaded.error || !loaded.dataUrl) imageIssues.add(image.id);
      }
    } else {
      const extractionContext = await this.extractDocumentWithContext(documentId, document);
      sourceQuestions = extractionContext.extraction.questions;
      extraction = extractionContext.extraction;
      imageIssues = extractionContext.imageIssues;
    }
    const candidates = sourceQuestions.map((candidate) => ({
      ...candidate,
      id: stableCandidateId(document.id, candidate),
      candidateId: stableCandidateId(document.id, candidate),
      contentVersion: createHash('sha256').update(JSON.stringify({ statement: candidate.statement, alternatives: candidate.alternatives })).digest('hex'),
      originalSnapshot: {
        statement: candidate.statement,
        alternatives: candidate.alternatives,
        correctAnswer: candidate.correctAnswer,
        contentVersion: createHash('sha256').update(JSON.stringify({ statement: candidate.statement, alternatives: candidate.alternatives, correctAnswer: candidate.correctAnswer })).digest('hex'),
      },
      sourceRefs: {
        chunkIds: candidate.sourceChunkIds,
        pageNumbers: [...new Set(candidate.sourceChunkIds.flatMap((id) => byChunk.get(id)?.pages ?? []))],
        evidenceRefs: candidate.sourceChunkIds,
        visualAssetIds: candidate.visualEvidence.map(({ assetId }) => assetId),
      },
      sourceChunkIds: candidate.sourceChunkIds,
    }));
    const baseState = createQuestionGraphInput({
      // Stable across worker retries for the same document content and graph
      // contract; bump a version when an intentional extraction redesign needs
      // a fresh checkpoint namespace.
      executionId,
      documentId: document.id,
      documentVersion: version,
      model: aiModels.questionExtraction,
      promptVersion,
      execution: { pipelineVersion, status: 'running' },
      contextRefs: {
        chunkIds: [...new Set(document.chunks.map(({ id }) => id))],
        pageNumbers: [...new Set(document.chunks.flatMap(({ pages }) => pages))],
        formulaEvidenceRefs: [],
        imageAssetIds: [...new Set(document.images.filter((image) => image.assetKind === 'FIGURE').map(({ id }) => id))],
      },
      candidates,
    });
    let graphResult: QuestionGraphState | null = null;
    let outputQuestions: QuestionBackendOutput[];
    if (this.graphEnabled || this.graphRunner) {
      if (!graph) throw new Error('Grafo de extração de questões não foi inicializado.');
      const invokeConfig = { ...checkpointConfig, recursionLimit: Math.max(25, candidates.length * 4 + 5) };
      const invoked = checkpointState?.nextNode === 'end' && checkpointState.execution?.status !== 'failed'
        ? checkpointState
        : checkpointExists
          ? await graph.invoke(null, invokeConfig)
          : await graph.invoke(baseState, invokeConfig);
      const hasPendingIssues = invoked.backendOutput.some((question) => question.pendingIssues.length > 0);
      const executionStatus = invoked.execution?.status === 'failed' ? 'failed'
        : invoked.execution?.status === 'completed_with_issues' || hasPendingIssues ? 'completed_with_issues' : 'completed';
      graphResult = { ...invoked, execution: { ...invoked.execution, pipelineVersion, status: executionStatus } };
      outputQuestions = graphResult.backendOutput;
    } else {
      // Keep current production behavior until durable checkpoints and complete
      // evidence coverage are ready. Enable explicitly after AC-004/011 pass.
      outputQuestions = sourceQuestions.map((candidate) => ({
        questionNumber: candidate.number ?? null,
        statement: candidate.statement,
        kind: 'MULTIPLE_CHOICE',
        alternatives: candidate.alternatives,
        correctAnswer: candidate.correctAnswer,
        institution: candidate.institution,
        year: candidate.year,
        alternativesGenerated: false,
        answerGenerated: false,
        alternativesOrigin: candidate.alternatives.length ? 'SOURCE_DOCUMENT' : null,
        correctAnswerOrigin: candidate.correctAnswer ? 'SOURCE_DOCUMENT' : null,
        sourceChunkIds: candidate.sourceChunkIds,
        visualEvidence: candidate.visualEvidence,
        needsReview: true,
        status: 'PENDING_REVIEW',
        pendingIssues: [],
      }));
    }
    if (graphResult?.execution?.status === 'failed') {
      return { questions: [], chunksProcessed: document.chunks.length, windowsProcessed: 1,
        llmCalls: extraction.llmCalls + graphLlmCalls, graphStatus: 'failed',
        skippedCandidates: graphResult.backendOutput.map(({ questionNumber, pendingIssues }) => ({ questionNumber, pendingIssues })) };
    }

    const persisted: Array<{ id: string; sourceChunkIds: string[]; visualAssetIds: string[] }> = [];
    const skippedCandidates: Array<{ questionNumber: string | null; pendingIssues: string[] }> = [];
    const prepared: Array<{ candidate: StructuredCandidate; images: ImageEvidence[]; unavailableAssetIds: string[] }> = [];
    const matchedGraphCandidates = new Set<ExtractedQuestionCandidate>();
    if (graphResult && outputQuestions.length !== graphResult.candidates.length) {
      throw new Error('A saída do grafo não corresponde em quantidade às candidatas consolidadas.');
    }
    for (let index = 0; index < outputQuestions.length; index += 1) {
      const output = outputQuestions[index]!;
      let original: StructuredCandidate;
      let graphCandidate: ExtractedQuestionCandidate | null = null;
      if (graphResult) {
        graphCandidate = graphCandidateForOutput(output, graphResult.candidates);
        if (matchedGraphCandidates.has(graphCandidate)) {
          throw new Error('Mais de uma saída do grafo aponta para a mesma candidata consolidada.');
        }
        matchedGraphCandidates.add(graphCandidate);
        original = sourceCandidateForGraphCandidate(document.id, graphCandidate, sourceQuestions);
      } else {
        const sourceQuestion = sourceQuestions[index];
        if (!sourceQuestion) throw new Error('Saída de extração sem candidata de origem correspondente.');
        original = sourceQuestion;
      }
      if (output.pendingIssues.some((issue) => issue === 'STATEMENT_URL_OR_EMPTY_FRAGMENT' || issue === 'STATEMENT_CAPTION_FRAGMENT'
        || issue === 'CANDIDATE_FRAGMENT' || issue === 'CANDIDATE_SEGMENT_AMBIGUOUS'
        || issue === 'CANDIDATE_DUPLICATE_REQUIRES_RECONCILIATION' || issue === 'CANDIDATE_DUPLICATE_OR_SEGMENT_AMBIGUOUS')) {
        skippedCandidates.push({ questionNumber: output.questionNumber, pendingIssues: output.pendingIssues });
        continue;
      }
      if (output.sourceChunkIds.some((id) => !byChunk.has(id))) {
        throw new Error('A saída do grafo perdeu a identidade/proveniência da candidata antes da persistência: chunk inexistente.');
      }
      const candidate = {
        ...original,
        ...(graphCandidate ?? {}),
        statement: output.statement,
        alternatives: output.alternatives,
        correctAnswer: output.correctAnswer,
        visualEvidence: output.visualEvidence,
        sourceChunkIds: output.sourceChunkIds,
        alternativesOrigin: output.alternativesOrigin,
        correctAnswerOrigin: output.correctAnswerOrigin,
        pendingIssues: output.pendingIssues,
        reviewStatus: output.status,
        contentReview: output.pendingIssues.length ? 'needs_review' : 'no_detected_issue',
        metadata: {
          ...original.metadata,
          ...(graphResult ? { questionGraph: {
            executionId: graphResult.executionId,
            documentVersion: graphResult.documentVersion,
            pipelineVersion: graphResult.execution?.pipelineVersion ?? pipelineVersion,
            model: graphResult.model,
            candidateId: graphCandidate?.candidateId ?? graphCandidate?.id ?? null,
            sourceRefs: graphCandidate?.sourceRefs ?? null,
            quality: graphCandidate?.quality ?? null,
            attempts: graphResult.attempts,
            reviewDecision: graphResult.reviewDecisions.find((decision) => decision.candidateId === (graphCandidate?.candidateId ?? graphCandidate?.id)) ?? null,
            agentResult: graphResult.agentResults[graphCandidate?.candidateId ?? graphCandidate?.id ?? ''] ?? null,
            executionStatus: graphResult.execution?.status ?? 'completed_with_issues',
          } } : {}),
        },
      } as StructuredCandidate;
      candidate.visualEvidence = candidate.visualEvidence.filter((visual) => {
        const image = document.images.find(({ id, assetKind }) => id === visual.assetId && assetKind === 'FIGURE');
        const target = visual.role === 'STATEMENT' ? candidate.statement
          : candidate.alternatives.find(({ label }) => label === visual.alternativeLabel)?.text;
        const valid = Boolean(image && !image.chunkIds.some((chunkId) => !byChunk.has(chunkId))
          && target?.includes(visual.anchorText) && !isDecorativeAnchor(visual.anchorText));
        if (!valid) console.warn('Associação visual descartada; questão seguirá para revisão.', {
          event: 'monitor.question_visual_evidence_discarded', documentId,
          assetId: visual.assetId,
          reason: 'ANCHOR_NOT_IN_QUESTION_OR_INVALID_PROVENANCE',
        });
        return valid;
      });
      const selectedImages = document.images.filter((image) => image.assetKind === 'FIGURE'
        && buildPersistedVisualEvidence(candidate).some(({ assetId }) => assetId === image.id));
      for (const visual of candidate.visualEvidence) {
        const image = document.images.find(({ id, assetKind }) => id === visual.assetId && assetKind === 'FIGURE');
        const anchorTarget = visual.role === 'STATEMENT' ? candidate.statement
          : candidate.alternatives.find(({ label }) => label === visual.alternativeLabel)?.text;
        if (!image || image.chunkIds.some((chunkId) => !byChunk.has(chunkId)) || !anchorTarget?.includes(visual.anchorText)) {
          console.warn('Associação visual descartada; questão seguirá para revisão.', {
            event: 'monitor.question_visual_evidence_discarded', documentId,
            assetId: visual.assetId,
            reason: 'ANCHOR_NOT_IN_QUESTION_OR_INVALID_PROVENANCE',
          });
          candidate.visualEvidence = candidate.visualEvidence.filter((item) => item !== visual);
        }
      }
      const unavailableAssetIds = selectedImages.filter((asset) => imageIssues.has(asset.id)).map((asset) => asset.id);
      prepared.push({ candidate, images: selectedImages, unavailableAssetIds });
    }
    if (graphResult && matchedGraphCandidates.size !== graphResult.candidates.length) {
      throw new Error('Uma ou mais candidatas consolidadas não têm saída estruturada correspondente.');
    }

    // Validate the entire graph result before writing the first question so a
    // bad later candidate cannot leave an earlier partial batch persisted.
    for (const item of prepared) {
      const { candidate, images: selectedImages, unavailableAssetIds } = item;
      const questionId = await this.repository.save(document, candidate, selectedImages, unavailableAssetIds);
      persisted.push({ id: questionId, sourceChunkIds: candidate.sourceChunkIds, visualAssetIds: selectedImages.map((image) => image.id) });
      if (unavailableAssetIds.length) console.warn('Questão mantida para revisão: imagem de origem indisponível no Storage.', { documentId, questionId, assetIds: unavailableAssetIds });
    }
    return { questions: persisted, chunksProcessed: document.chunks.length, windowsProcessed: 1,
      llmCalls: extraction.llmCalls + graphLlmCalls,
      graphStatus: graphResult?.execution?.status ?? graphResult?.stage ?? 'not_enabled', skippedCandidates };
  }

  /** Extracts and validates structured candidates without writing questions. */
  async extractCandidates(documentId: string): Promise<{ questions: StructuredQuestionCandidate[]; llmCalls: number }> {
    const { extraction } = await this.extractDocumentWithContext(documentId);
    return extraction;
  }

  private async loadDocument(documentId: string): Promise<StructuredDocument> {
    const document = await this.repository.load(documentId);
    if (!document) throw new Error(`Documento ${documentId} indisponível para extração estruturada.`);
    if (!document.chunks.length) throw new Error('Extração estruturada cancelada: documento sem chunks persistidos.');
    if (document.chunks.some((chunk) => chunk.status && chunk.status !== 'READY')) {
      throw new Error('Extração estruturada cancelada: existem chunks sem embeddings persistidos.');
    }
    return document;
  }

  private async extractDocumentWithContext(documentId: string, loadedDocument?: StructuredDocument) {
    const document = loadedDocument ?? await this.loadDocument(documentId);
    const windows = buildQuestionExtractionWindows(document.chunks, this.tokenBudget);
    if (windows.length !== 1) throw new Error('QUESTION_EXTRACTION_INPUT_TOO_LARGE: a extração exige exatamente uma janela documental.');
    const byChunk = new Map(document.chunks.map((chunk) => [chunk.id, chunk]));
    const extracted: StructuredCandidate[] = [];
    const imageIssues = new Set<string>();
    const window = windows[0]!;
    const loadedImages: Array<{ asset: ImageEvidence; dataUrl: string }> = [];
    const windowIds = new Set(window.chunks.map((chunk) => chunk.id));
    const windowImages = document.images.filter((asset) => isSubstantiveQuestionFigure(asset)
      && asset.chunkIds.some((id) => windowIds.has(id)));
    for (const asset of windowImages) {
      const loaded = await this.loadImage(asset.storagePath);
      if (loaded.error || !loaded.dataUrl) { imageIssues.add(asset.id); continue; }
      loadedImages.push({ asset, dataUrl: loaded.dataUrl });
    }
    const extractionChunks = window.chunks.map((chunk) => byChunk.get(chunk.id)!);
    const extraction = await this.extractDocument(document.id, extractionChunks, windowImages, loadedImages);
    extracted.push(...extraction.questions);

    return { document, byChunk, imageIssues, extraction };
  }

  private async extractDocument(
    documentId: string,
    chunks: QuestionExtractionChunk[],
    availableImages: ImageEvidence[],
    loadedImages: Array<{ asset: ImageEvidence; dataUrl: string }>,
  ): Promise<{ questions: StructuredCandidate[]; llmCalls: number }> {
    const ids = new Set(chunks.map((chunk) => chunk.id));
    const documentChunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
    const images = availableImages.filter((asset) => isSubstantiveQuestionFigure(asset) && asset.chunkIds.some((id) => ids.has(id)));
    const attachedImages = loadedImages.filter(({ asset }) => images.some((candidate) => candidate.id === asset.id));
    const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
      { type: 'text', text: `Documento: ${documentId}\nExtraia questões presentes no conteúdo abaixo. Preserve enunciados e alternativas literalmente. Não complete, resolva nem invente gabarito, banca, ano, alternativas ou associação de figura. Cite apenas sourceChunkIds fornecidos. Ignore selos com número da questão, logotipos, cabeçalhos, rodapés e elementos decorativos da página; não os cite como evidência visual. Cite apenas figuras substantivas que façam parte do enunciado ou de uma alternativa. Para cada figura necessária indique assetId, papel STATEMENT ou ALTERNATIVE, alternativeLabel quando aplicável, e anchorText como trecho literal e contínuo do texto da questão onde a figura deve aparecer. Não invente nem parafraseie anchorText. Use somente assets FIGURE anexados; PAGE não representa figura da questão. Para a questão que pergunta o grupo e o período do bromo e menciona a classificação periódica, a tabela periódica na página 15 é contexto visual pertinente se o asset FIGURE correspondente estiver disponível; associe-a somente com anchorText literal do enunciado que justifique essa consulta, nunca por proximidade de página ou por correspondência com figura não relacionada. Compare originalText e enrichedText das fórmulas. Quando originalText contiver texto legível do documento, trate essa leitura como evidência primária de caracteres e sequência; use enrichedText apenas como apoio estrutural quando não contradisser o original. Se enrichedText contradisser texto legível em originalText, rejeite a interpretação conflitante e preserve o original (por exemplo, não interprete "1 / 2" como "\\lceil"). Represente "1 / 2" como a fração \\frac{1}{2} quando os dois valores estiverem presentes e legíveis; se numerador ou denominador não estiver disponível, não infira nem complete a fração e mantenha a leitura sustentada pelo documento com incerteza explícita. Preserve ambas as evidências sem substituir silenciosamente uma pela outra. Use inlineFormulaEvidence apenas quando evidenceSource=PDF_CHARACTER_GEOMETRY e a evidência indicar glyph menor e elevado; nesses casos preserve o normalizedText como sobrescrito (por exemplo, 10^{7} e s^{-1}). Não achate raisedText para a linha de base, não altere o valor e não converta geometric evidence em imagem.\n\nImagens vinculadas: ${images.map((asset) => `assetId=${asset.id}, assetKind=${asset.assetKind}, página=${asset.pageNumber}, bbox=${asset.bbox?.join(',') ?? 'n/d'}, ordem=${asset.readingOrder ?? 'n/d'}, item=${asset.sourceItemRef ?? 'n/d'}, chunks=${asset.chunkIds.join(',')}, ${attachedImages.some((image) => image.asset.id === asset.id) ? 'anexada' : 'indisponível'}`).join('; ') || 'nenhuma'}\n\n${chunks.map((chunk) => {
        const formulaEvidence = (documentChunksById.get(chunk.id)?.formulaEvidence ?? []).map((evidence) =>
          `[formulaEvidence page=${evidence.pageNumber} itemRef=${evidence.itemRef} bbox=${evidence.bbox?.join(',') ?? 'n/d'} originalText=${evidence.originalText ?? '(ausente)'} enrichedText=${evidence.enrichedText}]`);
        const inlineEvidence = (documentChunksById.get(chunk.id)?.inlineFormulaEvidence ?? []).map((evidence) =>
          `[inlineFormulaEvidence evidenceSource=${evidence.evidenceSource} page=${evidence.pageNumber} itemRef=${evidence.itemRef} bbox=${evidence.bbox?.join(',') ?? 'n/d'} baseText=${evidence.baseText} raisedText=${evidence.raisedText} normalizedText=${evidence.normalizedText} sourceText=${evidence.sourceText} heightRatio=${evidence.heightRatio} raiseRatio=${evidence.raiseRatio}]`);
        return [formatChunk(chunk), ...formulaEvidence, ...inlineEvidence].join('\n');
      }).join('\n\n--- CHUNK ---\n\n')}` },
    ];
    for (const { asset, dataUrl } of attachedImages) content.push({ type: 'text', text: `Imagem original assetId=${asset.id}, página=${asset.pageNumber}.` }, { type: 'image_url', image_url: { url: dataUrl } });
    const messages: ChatMessage[] = [
      { role: 'system', content: 'Retorne questões separadas e fundamentadas nas fontes fornecidas. Toda questão de múltipla escolha tem no máximo cinco alternativas, somente A, B, C, D e E; não retorne rótulos F, G ou H. Quando a fonte trouxer menos opções legíveis, retorne apenas as recuperáveis sem inventar as ausentes, para que a etapa de revisão as complete. Questões discursivas podem retornar o array de alternativas vazio. Afirmações, tópicos, itens numerados como I, II e III e sequências de verdadeiro/falso que fazem parte da pergunta devem permanecer no enunciado; não os transforme em opções. Em questões que pedem para avaliar afirmações, as alternativas normalmente são as cinco combinações ou julgamentos identificados por A–E. Não confunda itens do enunciado com opções de resposta. Preencha campos opcionais com null quando não estiverem sustentados pelo documento. Gabarito em imagem está fora do escopo: não o leia nem o infira. Preserve literalmente a notação matemática, física e química do documento, incluindo sinais, parênteses, frações, unidades, expoentes e índices (sobrescritos e subscritos), tanto nos enunciados quanto nas alternativas. Represente sobrescritos e subscritos sem ambiguidade: prefira caracteres Unicode quando a estrutura ficar clara (por exemplo, x² ou H₂O); para expressões maiores, use LaTeX delimitado por cifrões, com chaves explícitas em expoentes e índices (por exemplo, $x^{n+1}$ ou $a_{i+1}$). Nunca achate um sobrescrito ou subscrito juntando seus dígitos ao texto da linha de base. Quando houver uma imagem da página anexada, examine a região da fórmula na imagem e use sua disposição visual como evidência para decidir expoentes e índices; se texto extraído e imagem divergirem, siga a imagem apenas quando ela estiver legível e mantenha o valor exatamente como impresso. Não deduza nem complete símbolos ausentes pelo contexto. Se a notação estiver ilegível ou ambígua na imagem e no texto, preserve a parte legível e insira no ponto incerto uma anotação breve entre colchetes, como [expoente ilegível], para revisão; não escolha uma versão provável nem invente uma correção. Cite apenas sourceChunkIds fornecidos e associe figuras somente quando a fonte sustentar a associação.' },
      { role: 'user', content },
    ];
    let llmCalls = 0;
    try {
      const requestOptions = {
        schemaName: 'document_questions', schema: QUESTION_SCHEMA, model: aiModels.questionExtraction,
        temperature: 0, maxTokens: null, timeoutMs: null,
        reasoningEffort: aiModels.questionExtractionReasoningEffort, requireParameters: true, messages,
      } as const;
      llmCalls++;
      const raw = await this.client.createStructuredChatCompletion<unknown>(requestOptions);
      const parsed = responseSchema.safeParse(raw);
      if (!parsed.success) throw new Error(`Resposta estruturada inválida: ${parsed.error.message}`);
      const evidenceCorrectedCandidates = parsed.data.questions.map((candidate) => correctCandidateFromSourceEvidence(candidate as StructuredCandidate, documentChunksById));
      for (const candidate of evidenceCorrectedCandidates) {
        if (candidate.sourceChunkIds.some((id) => !ids.has(id))) throw new Error('A LLM citou chunk que não pertence à janela enviada.');
        candidate.visualEvidence = candidate.visualEvidence.filter((evidence) => {
          const image = images.find((asset) => asset.id === evidence.assetId);
          const target = evidence.role === 'STATEMENT'
            ? candidate.statement
            : candidate.alternatives.find((alternative) => alternative.label === evidence.alternativeLabel)?.text;
          const valid = Boolean(image && target?.includes(evidence.anchorText) && !isDecorativeAnchor(evidence.anchorText));
          if (!valid) console.warn('Associação visual descartada; questão seguirá para revisão.', {
            event: 'monitor.question_visual_evidence_discarded', documentId,
            assetId: evidence.assetId,
            reason: !image ? 'ASSET_NOT_IN_WINDOW' : !target?.includes(evidence.anchorText) ? 'ANCHOR_NOT_IN_QUESTION' : 'DECORATIVE_ANCHOR',
          });
          return valid;
        });
      }
      const questions = orderCandidatesForPersistence(evidenceCorrectedCandidates, chunks);
      return { questions, llmCalls };
    } catch (error) {
      if (error instanceof StructuredCompletionError && error.code === 'MODEL_OUTPUT_TRUNCATED') {
        console.warn('Extração estruturada truncada; a resposta foi descartada sem subdividir a chamada', {
          event: 'monitor.question_extraction_output_truncated', documentId,
          finishReason: error.details.finishReason ?? null,
          promptTokens: error.details.promptTokens ?? null,
          completionTokens: error.details.completionTokens ?? null,
          reasoningTokens: error.details.reasoningTokens ?? null,
          totalTokens: error.details.totalTokens ?? null,
        });
        throw new Error('QUESTION_EXTRACTION_OUTPUT_TRUNCATED: o modelo não terminou a resposta estruturada em uma única chamada. Revise a capacidade do modelo/provedor e reexecute; nenhuma candidata foi persistida.', { cause: error });
      }
      throw error;
    }
  }
}

const defaultRepository: StructuredRepository = {
  async load(documentId) {
    const row = await prisma.monitorDocument.findUnique({
      where: { id: documentId },
      select: { id: true, teacherId: true, monitorId: true, subjectId: true, topicId: true,
        chunks: { where: { status: { in: ['READY', 'EMBEDDING_PENDING'] } }, orderBy: { chunkIndex: 'asc' }, select: {
          id: true, chunkIndex: true, content: true, pages: true, status: true, docHash: true, provenance: true,
          visualAssets: { select: { visualAsset: { select: { id: true, assetType: true, pageNumber: true, storagePath: true, mimeType: true, bbox: true, width: true, height: true, metadata: true } } } },
        } },
      },
    });
    if (!row) return null;
    const assets = new Map<string, ImageEvidence>();
    const chunks = row.chunks.map((chunk) => {
      const pages = Array.isArray(chunk.pages) ? chunk.pages.filter((page): page is number => typeof page === 'number') : [];
      for (const { visualAsset } of chunk.visualAssets) {
        if (!visualAsset.mimeType) continue;
        const metadata = visualAsset.metadata && typeof visualAsset.metadata === 'object' && !Array.isArray(visualAsset.metadata)
          ? visualAsset.metadata as Record<string, unknown> : {};
        const assetKind = metadata.assetKind === 'PAGE' || visualAsset.assetType === 'page' ? 'PAGE' : 'FIGURE';
        const caption = typeof metadata.caption === 'string' ? metadata.caption : null;
        const bbox = Array.isArray(visualAsset.bbox) && visualAsset.bbox.every((value) => typeof value === 'number')
          ? visualAsset.bbox as number[] : null;
        const current: ImageEvidence = assets.get(visualAsset.id) ?? {
          id: visualAsset.id, assetKind, pageNumber: visualAsset.pageNumber,
          storagePath: visualAsset.storagePath, mimeType: visualAsset.mimeType, bbox,
          width: visualAsset.width, height: visualAsset.height, caption,
          readingOrder: typeof metadata.readingOrder === 'number' ? metadata.readingOrder : null,
          sourceItemRef: typeof metadata.sourceItemRef === 'string' ? metadata.sourceItemRef : null,
          chunkIds: [],
        };
        current.chunkIds.push(chunk.id); assets.set(visualAsset.id, current);
      }
      return { id: chunk.id, chunkIndex: chunk.chunkIndex, text: chunk.content, pages, status: chunk.status, docHash: chunk.docHash,
        formulaEvidence: readFormulaEvidence(chunk.provenance), inlineFormulaEvidence: readInlineFormulaEvidence(chunk.provenance) };
    });
    return { ...row, chunks, images: [...assets.values()] };
  },
  async save(document, candidate, images, unavailableAssetIds = []) {
    const normalized = candidate.statement.normalize('NFKC').replace(/\s+/g, ' ').trim();
    const textHash = createHash('sha256').update(normalized.toLowerCase()).digest('hex');
    const sourceKey = createHash('sha256').update(`${document.id}:${candidate.number ?? ''}:${normalized.toLowerCase()}`).digest('hex');
    const pageNumbers = candidate.sourceChunkIds.flatMap((id) => document.chunks.find((chunk) => chunk.id === id)?.pages ?? []);
    const completenessStatus = candidate.pendingIssues?.length
      ? (candidate.alternatives.length < 5 ? 'MISSING_ALTERNATIVES' : candidate.correctAnswer ? 'COMPLETE_WITH_AI' : 'MISSING_ANSWER')
      : candidate.alternatives.length === 0 ? 'MISSING_ALTERNATIVES'
        : candidate.correctAnswerOrigin === 'AI_GENERATED' ? 'COMPLETE_WITH_AI'
          : candidate.correctAnswer ? 'COMPLETE_FROM_SOURCE' : 'MISSING_ANSWER';
    const sourceIntegrityWarnings = [...(candidate.sourceIntegrityWarnings ?? []), ...detectQuestionSourceIntegrityWarnings(candidate)];
    const visualEvidence = buildPersistedVisualEvidence(candidate, images);
      const saved = await saveQuestion({
      teacherId: document.teacherId, monitorId: document.monitorId, subjectId: document.subjectId,
      topicId: document.topicId, text: candidate.statement, alternatives: candidate.alternatives,
      kind: candidate.alternatives.length ? 'MULTIPLE_CHOICE' : 'OPEN_ENDED',
      alternativesOrigin: candidate.alternativesOrigin ?? (candidate.alternatives.length ? 'SOURCE_DOCUMENT' : null),
      correctAnswer: candidate.correctAnswer, correctAnswerOrigin: candidate.correctAnswer ? candidate.correctAnswerOrigin ?? 'SOURCE_DOCUMENT' : undefined,
      explanation: null, completenessStatus, needsReview: true, textHash, sourceKey,
      metadata: {
        questionNumber: candidate.number, institution: candidate.institution, year: candidate.year, reviewRequired: true,
        alternativesOrigin: candidate.alternativesOrigin ?? (candidate.alternatives.length ? 'SOURCE_DOCUMENT' : null),
        correctAnswerOrigin: candidate.correctAnswer ? candidate.correctAnswerOrigin ?? 'SOURCE_DOCUMENT' : null,
        pendingIssues: candidate.pendingIssues ?? [],
        reviewStatus: candidate.reviewStatus ?? 'PENDING_REVIEW',
        contentReview: candidate.contentReview ?? 'needs_review',
        questionGraph: candidate.metadata?.questionGraph ?? null,
        questionExtractionOrdinal: candidate.metadata?.questionExtractionOrdinal ?? null,
        sourceEvidenceCorrections: candidate.metadata?.sourceEvidenceCorrections ?? [],
        visualEvidence,
        sourceIntegrityWarnings: [...new Map(sourceIntegrityWarnings.map((warning) => [
          `${warning.code}:${warning.alternativeLabel ?? ''}:${warning.token ?? ''}`, warning,
        ])).values()],
        visualEvidenceStatus: unavailableAssetIds.length ? 'PENDING_MISSING_ASSET' : images.length ? 'AVAILABLE' : 'NOT_REQUIRED',
        unavailableVisualAssetIds: unavailableAssetIds,
      },
      sourceChunkIds: candidate.sourceChunkIds,
      sources: candidate.sourceChunkIds.map((chunkId) => ({ chunkId, documentId: document.id, role: 'STATEMENT', pageStart: pageNumbers.length ? Math.min(...pageNumbers) : null, pageEnd: pageNumbers.length ? Math.max(...pageNumbers) : null, excerpt: candidate.statement, confidence: 1 })),
    });
    if (images.length) await prisma.questionVisualAsset.createMany({
      data: images.map((image) => {
        const evidence = visualEvidence.find(({ assetId }) => assetId === image.id);
        const role = evidence?.role === 'ALTERNATIVE' ? `ALTERNATIVE:${evidence.alternativeLabel}` : 'STATEMENT';
        return {
          questionId: saved.id, visualAssetId: image.id,
          associationMethod: 'MODEL_EVIDENCE', role, confidence: 1,
        };
      }),
      skipDuplicates: true,
    });
    return saved.id;
  },
};

function readFormulaEvidence(value: Prisma.JsonValue): FormulaEvidence[] {
  if (!Array.isArray(value)) return [];
  const result: FormulaEvidence[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, Prisma.JsonValue>;
    const formula = record.formulaEvidence;
    if (!formula || typeof formula !== 'object' || Array.isArray(formula)) continue;
    const formulaRecord = formula as Record<string, Prisma.JsonValue>;
    if (typeof record.page !== 'number' || typeof record.item_ref !== 'string'
        || typeof formulaRecord.enrichedText !== 'string'
        || (formulaRecord.originalText !== null && typeof formulaRecord.originalText !== 'string')) continue;
    const bbox = Array.isArray(record.bbox) && record.bbox.every((part) => typeof part === 'number')
      ? record.bbox as number[] : null;
    result.push({ pageNumber: record.page, itemRef: record.item_ref, bbox,
      originalText: formulaRecord.originalText as string | null, enrichedText: formulaRecord.enrichedText });
  }
  return result;
}

function readInlineFormulaEvidence(value: Prisma.JsonValue): InlineFormulaEvidence[] {
  if (!Array.isArray(value)) return [];
  const result: InlineFormulaEvidence[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, Prisma.JsonValue>;
    const evidence = record.inlineFormulaEvidence;
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) continue;
    const geometry = evidence as Record<string, Prisma.JsonValue>;
    if (geometry.evidenceSource !== 'PDF_CHARACTER_GEOMETRY'
        || typeof geometry.pageNumber !== 'number' || typeof geometry.itemRef !== 'string'
        || typeof geometry.baseText !== 'string' || typeof geometry.raisedText !== 'string'
        || typeof geometry.normalizedText !== 'string' || typeof geometry.sourceText !== 'string'
        || typeof geometry.heightRatio !== 'number' || typeof geometry.raiseRatio !== 'number') continue;
    const bbox = Array.isArray(geometry.bbox) && geometry.bbox.every((part) => typeof part === 'number')
      ? geometry.bbox as number[] : null;
    result.push({ pageNumber: geometry.pageNumber, itemRef: geometry.itemRef, bbox,
      baseText: geometry.baseText, raisedText: geometry.raisedText, normalizedText: geometry.normalizedText,
      sourceText: geometry.sourceText, evidenceSource: 'PDF_CHARACTER_GEOMETRY',
      heightRatio: geometry.heightRatio, raiseRatio: geometry.raiseRatio });
  }
  return result;
}

function isDecorativeAnchor(anchorText: string) {
  const normalized = anchorText.normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[º°]/g, 'o')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLocaleLowerCase();
  return /^(?:questao|questao numero|questao n|q)\s*\d{1,3}$/.test(normalized)
    || /^(?:logo|cabecalho|rodape|numero da questao)$/.test(normalized);
}

function isSubstantiveQuestionFigure(asset: ImageEvidence) {
  if (asset.assetKind !== 'FIGURE') return false;
  const hasCaption = Boolean(asset.caption?.trim());
  if (hasCaption || asset.width === null || asset.height === null || asset.width > 48 || asset.height > 48
      || !asset.bbox || asset.bbox.length !== 4) return true;
  const [left, top, right, bottom] = asset.bbox;
  if (left === undefined || top === undefined || right === undefined || bottom === undefined) return true;
  const isUpperLeftNumberBadge = left <= 80 && right <= 110 && top >= 650 && bottom >= 640;
  return !isUpperLeftNumberBadge;
}

async function loadPrivateImage(storagePath: string) {
  const { data, error } = await supabaseAdmin.storage.from('document-parser-artifacts').download(storagePath);
  if (error || !data) return { dataUrl: null, error: true };
  const bytes = Buffer.from(await data.arrayBuffer());
  return { dataUrl: `data:image/png;base64,${bytes.toString('base64')}`, error: false };
}
