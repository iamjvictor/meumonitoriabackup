import type { QuestionSourceChunk } from './question-extraction-windows.js';

export type ReconciliableStructuredQuestion = {
  number: string | null;
  statement: string;
  alternatives: Array<{ label: string; text: string }>;
  correctAnswer: string | null;
  institution: string | null;
  year: number | null;
  sourceChunkIds: string[];
  visualEvidence: Array<{ assetId: string; role: 'STATEMENT' | 'ALTERNATIVE'; alternativeLabel: string | null }>;
  sourceIntegrityWarnings?: Array<{ code: string; alternativeLabel?: string; token?: string }>;
};

export function reconcileStructuredQuestions<T extends ReconciliableStructuredQuestion>(
  candidates: T[], sourceChunks: QuestionSourceChunk[], visualAssets: Array<{ id: string; pageNumber: number }> = [],
): T[] {
  const source = buildSourceText(sourceChunks);
  const canonical = candidates.map((candidate) => canonicalizeCandidate(candidate, source, visualAssets));
  for (const candidate of canonical) {
    const match = candidate.number?.match(/\d{1,3}/)?.[0];
    if (match) candidate.number = match.padStart(2, '0');
  }
  const result: T[] = [];
  for (const candidate of canonical) {
    const candidateIds = new Set(candidate.sourceChunkIds);
    const matchIndex = result.findIndex((existing) => existing.number === candidate.number
      && existing.sourceChunkIds.some((id) => candidateIds.has(id))
      && normalize(existing.statement) === normalize(candidate.statement));
    if (matchIndex < 0) { result.push(candidate); continue; }
    const previous = result[matchIndex]!;
    const alternativesByLabel = new Map(previous.alternatives.map((alternative) => [alternative.label, alternative]));
    for (const alternative of candidate.alternatives) {
      const current = alternativesByLabel.get(alternative.label);
      if (!current || alternative.text.length > current.text.length) alternativesByLabel.set(alternative.label, alternative);
    }
    result[matchIndex] = {
      ...previous,
      alternatives: [...alternativesByLabel.values()].sort((a, b) => a.label.localeCompare(b.label)),
      correctAnswer: previous.correctAnswer ?? candidate.correctAnswer,
      institution: previous.institution ?? candidate.institution,
      year: previous.year ?? candidate.year,
      sourceChunkIds: [...new Set([...previous.sourceChunkIds, ...candidate.sourceChunkIds])],
      visualEvidence: [...new Map([...previous.visualEvidence, ...candidate.visualEvidence].map((item) => [item.assetId, item])).values()],
      sourceIntegrityWarnings: [...new Map([...(previous.sourceIntegrityWarnings ?? []), ...(candidate.sourceIntegrityWarnings ?? [])]
        .map((warning) => [`${warning.code}:${warning.alternativeLabel ?? ''}:${warning.token ?? ''}`, warning])).values()],
    };
  }
  return result;
}

type SourceText = {
  text: string;
  spans: Array<{ id: string; chunkIndex: number; start: number; end: number; pages: number[] }>;
  repeatedFooters: Set<string>;
};

function buildSourceText(chunks: QuestionSourceChunk[]): SourceText {
  const ordered = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const footerPages = new Map<string, Set<number>>();
  for (const chunk of ordered) {
    const footer = chunk.text.trimEnd().split(/\r?\n/).at(-1)?.trim();
    if (!footer || footer.length > 100 || !/^@[^\s]+$/.test(footer)) continue;
    const pages = footerPages.get(footer) ?? new Set<number>();
    for (const page of chunk.pages) pages.add(page);
    footerPages.set(footer, pages);
  }
  const repeatedFooters = new Set([...footerPages].filter(([, pages]) => pages.size >= 2).map(([line]) => line));
  let text = '';
  const spans = ordered.map((chunk) => {
    const start = text.length;
    const lines = chunk.text.split(/\r?\n/);
    while (lines.length && repeatedFooters.has(lines.at(-1)!.trim())) lines.pop();
    text += `${lines.join('\n')}\n`;
    return { id: chunk.id, chunkIndex: chunk.chunkIndex, start, end: text.length, pages: chunk.pages };
  });
  return { text, spans, repeatedFooters };
}

function canonicalizeCandidate<T extends ReconciliableStructuredQuestion>(
  candidate: T, source: SourceText, visualAssets: Array<{ id: string; pageNumber: number }>,
): T {
  if (!candidate.number) return candidate;
  const numberToken = candidate.number.match(/\d{1,3}/)?.[0];
  const questionNumber = numberToken ? Number.parseInt(numberToken, 10) : Number.NaN;
  if (!Number.isFinite(questionNumber)) return candidate;
  const explicitHeaderPattern = /(?:^|[\r\n])\s*quest(?:ão|ao)\s*(\d{1,3})\s*[.):–—-]\s*/giu;
  const findHeaders = (pattern: RegExp) => {
    const found: Array<{ number: number; start: number; bodyStart: number }> = [];
    for (const match of source.text.matchAll(pattern)) {
    const matchStart = match.index ?? 0;
    const bodyStart = matchStart + match[0].length;
    const matchNumber = Number.parseInt(match[1]!, 10);
      const leadingWhitespace = match[0].search(/\S/);
      found.push({ number: matchNumber, start: matchStart + Math.max(0, leadingWhitespace), bodyStart });
    }
    return found;
  };
  let headers = findHeaders(explicitHeaderPattern);
  let targetHeaders = headers.filter((header) => header.number === questionNumber);
  if (!targetHeaders.length) {
    headers = findHeaders(/(?:^|[\r\n])\s*(\d{1,3})\s*[.):–—-]\s*/gu);
    targetHeaders = headers.filter((header) => header.number === questionNumber);
  }
  if (!targetHeaders.length) return candidate;
  const sourceIndexes = source.spans.filter((span) => candidate.sourceChunkIds.includes(span.id)).map((span) => span.chunkIndex);
  const expectedIndex = sourceIndexes.length ? Math.min(...sourceIndexes) : 0;
  const nearest = targetHeaders.sort((a, b) => nearestChunkDistance(source, a.start, expectedIndex) - nearestChunkDistance(source, b.start, expectedIndex))[0]!;
  // Repeated question numbers occur in separate exams/sections. The next
  // explicit question header is the safe boundary regardless of numbering.
  const nextHeader = headers.find((header) => header.start > nearest.start);
  const end = nextHeader?.start ?? source.text.length;
  const section = source.text.slice(nearest.bodyStart, end).trim();
  const sectionSpanIds = source.spans.filter((span) => span.start < end && span.end > nearest.start).map((span) => span.id);
  const parsed = parseSourceQuestionSection(section);
  if (!parsed) return { ...candidate, sourceChunkIds: sectionSpanIds.length ? sectionSpanIds : candidate.sourceChunkIds };
  const alternatives = [...parsed.alternatives];
  const sourcePages = new Set(source.spans.filter((span) => sectionSpanIds.includes(span.id)).flatMap((span) => span.pages));
  const hasPageVisualProof = candidate.visualEvidence.some((evidence) => visualAssets.some((asset) =>
    asset.id === evidence.assetId && sourcePages.has(asset.pageNumber)));
  if (hasPageVisualProof) {
    for (const sourceAlternative of alternatives) {
      const modelAlternative = candidate.alternatives.find((alternative) => alternative.label === sourceAlternative.label);
      const cleanModelText = modelAlternative ? stripRepeatedFooterLines(modelAlternative.text, source.repeatedFooters) : null;
      // Keep explicit visual-model detail when it extends the PDF.js text;
      // never manufacture placement from nearby orphan tokens.
      if (cleanModelText && cleanModelText.trim().length > sourceAlternative.text.trim().length
        && normalize(cleanModelText).startsWith(normalize(sourceAlternative.text))) {
        sourceAlternative.text = cleanModelText;
      }
    }
  }
  const sourceIntegrityWarnings = [...(candidate.sourceIntegrityWarnings ?? [])];
  const orphanedToken = parsed.orphanedStatementToken;
  if (orphanedToken) {
    sourceIntegrityWarnings.push({ code: 'ORPHANED_NUMERIC_TOKEN_BEFORE_ALTERNATIVES', token: orphanedToken });
  }
  let statement = parsed.statement || candidate.statement;
  if (orphanedToken) {
    // The source parser put a numeric glyph on its own line between the
    // statement and option A. Keep it out of the statement; its destination
    // is ambiguous, so preserve the model's statement and flag review.
    const candidateStatementWithoutOrphan = candidate.statement.replace(new RegExp(`\\s${escapeRegExp(orphanedToken)}\\s*$`), '').trim();
    statement = candidateStatementWithoutOrphan || candidate.statement;
  }
  return {
    ...candidate,
    statement,
    alternatives: parsed.alternatives.length ? alternatives : candidate.alternatives,
    sourceChunkIds: sectionSpanIds.length ? sectionSpanIds : candidate.sourceChunkIds,
    sourceIntegrityWarnings,
  };
}

function nearestChunkDistance(source: SourceText, charIndex: number, expectedChunkIndex: number) {
  const span = source.spans.find((candidate) => charIndex >= candidate.start && charIndex < candidate.end);
  return Math.abs((span?.chunkIndex ?? 0) - expectedChunkIndex);
}

function parseSourceQuestionSection(section: string) {
  const markerPattern = /(?:^|\s)([A-E])[.)]\s*/gim;
  const markers: Array<{ label: string; start: number; textStart: number }> = [];
  for (const match of section.matchAll(markerPattern)) {
    const prefixWhitespace = /^\s/.test(match[0]) ? 1 : 0;
    markers.push({ label: match[1]!.toUpperCase(), start: (match.index ?? 0) + prefixWhitespace, textStart: (match.index ?? 0) + match[0].length });
  }
  const firstA = markers.findIndex((marker) => marker.label === 'A');
  if (firstA < 0) return null;
  const ordered: typeof markers = [];
  for (let index = firstA; index < markers.length; index += 1) {
    const expected = String.fromCharCode('A'.charCodeAt(0) + ordered.length);
    const marker = markers[index]!;
    if (marker.label !== expected) break;
    ordered.push(marker);
    if (ordered.length === 5) break;
  }
  if (ordered.length < 2) return null;
  const rawStatement = section.slice(0, ordered[0]!.start).trim();
  const orphanedStatementToken = rawStatement.match(/\r?\n\s*(\d{1,3})\s*$/)?.[1] ?? null;
  const statementSource = orphanedStatementToken
    ? rawStatement.replace(new RegExp(`\\r?\\n\\s*${escapeRegExp(orphanedStatementToken)}\\s*$`), '').trim()
    : rawStatement;
  const statement = statementSource;
  const alternatives = ordered.map((marker, index) => ({
    label: marker.label,
    text: section.slice(marker.textStart, ordered[index + 1]?.start ?? section.length).trim(),
  })).filter((alternative) => alternative.text.length > 0);
  return { statement: statement.replace(/\s+/g, ' ').trim(), alternatives, orphanedStatementToken };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalize(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function stripRepeatedFooterLines(value: string, footers: Set<string>) {
  return value.split(/\r?\n/).filter((line) => !footers.has(line.trim())).join('\n').trim();
}
