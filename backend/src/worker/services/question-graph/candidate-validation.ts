/** Conservative, document-agnostic validation helpers for extracted candidates.
 * These helpers report issues; they never synthesize question content.
 */

export type CandidateSourceRef = {
  id: string;
  page?: number | null;
  quote?: string | null;
};

export type CandidateForValidation = {
  candidateId: string;
  segmentId?: string | null;
  questionNumber?: string | null;
  statement: string;
  alternatives?: Array<{ label: string; text: string }>;
  sourceRefs: CandidateSourceRef[];
};

export type CandidateValidity = 'valid' | 'fragment' | 'ambiguous';

export type CandidateValidation = {
  candidateId: string;
  validity: CandidateValidity;
  reasons: string[];
};

export type CandidateDuplicateGroup = {
  canonicalCandidateId: string;
  duplicateCandidateIds: string[];
  evidenceRefIds: string[];
};

export type CandidateDeduplicationResult = {
  duplicateGroups: CandidateDuplicateGroup[];
  ambiguousCandidateIds: string[];
};

export type StatementPatch = {
  candidateId: string;
  statement: string;
  origin: 'SOURCE_DOCUMENT';
  originalStatement: string;
  evidenceRefId: string;
  evidenceQuote: string;
};

const URL_ONLY = /^(?:https?:\/\/|www\.)\S+\s*$/iu;
const CAPTION_ONLY = /^(?:(?:fig(?:ura)?|imagem)\s*\d*\s*[:\-–.]?\s*(?:fonte\s*[:\-–.]\s*)?|fonte\s*[:\-–.]\s*|adaptado(?:\s+de)?\s+|dispon[ií]vel\s+em\s*[:\-–.]?\s*|acesso\s+em\s*[:\-–.]?\s*)\S[\s\S]{0,160}$/iu;

function normalize(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
}

function stableEvidence(candidate: CandidateForValidation): Set<string> {
  return new Set(candidate.sourceRefs.map((ref) => ref.id.trim()).filter(Boolean));
}

/** Detects clear non-question fragments without guessing based on subject or institution. */
export function validateQuestionCandidate(candidate: CandidateForValidation): CandidateValidation {
  const statement = candidate.statement.trim();
  const reasons: string[] = [];
  if (!statement || URL_ONLY.test(statement)) reasons.push('STATEMENT_URL_OR_EMPTY_FRAGMENT');
  else if (CAPTION_ONLY.test(statement)) reasons.push('STATEMENT_CAPTION_FRAGMENT');
  return {
    candidateId: candidate.candidateId,
    validity: reasons.length ? 'fragment' : 'valid',
    reasons,
  };
}

/**
 * Finds only high-confidence duplicates. Same question numbers in different
 * segments are deliberately ambiguous; number equality alone never merges.
 */
export function findConservativeDuplicates(candidates: CandidateForValidation[]): CandidateDeduplicationResult {
  const duplicateGroups: CandidateDuplicateGroup[] = [];
  const ambiguousCandidateIds = new Set<string>();
  const consumed = new Set<string>();
  const orderedCandidates = [...candidates].sort((left, right) => left.candidateId.localeCompare(right.candidateId));

  for (let leftIndex = 0; leftIndex < orderedCandidates.length; leftIndex += 1) {
    const left = orderedCandidates[leftIndex]!;
    if (consumed.has(left.candidateId)) continue;
    const sameNumber = orderedCandidates.filter((candidate) => candidate.candidateId !== left.candidateId
      && candidate.questionNumber && left.questionNumber
      && normalize(candidate.questionNumber) === normalize(left.questionNumber));
    const differentSegments = sameNumber.filter((candidate) => candidate.segmentId !== left.segmentId);
    if (differentSegments.length) {
      if (!consumed.has(left.candidateId)) ambiguousCandidateIds.add(left.candidateId);
      differentSegments.forEach(({ candidateId }) => { if (!consumed.has(candidateId)) ambiguousCandidateIds.add(candidateId); });
    }

    const duplicates: CandidateForValidation[] = [];
    for (let rightIndex = leftIndex + 1; rightIndex < orderedCandidates.length; rightIndex += 1) {
      const right = orderedCandidates[rightIndex]!;
      if (consumed.has(right.candidateId) || left.segmentId !== right.segmentId) continue;
      const sharedRefs = [...stableEvidence(left)].filter((refId) => stableEvidence(right).has(refId));
      const sameNumberAndStatement = Boolean(left.questionNumber && right.questionNumber)
        && normalize(left.questionNumber!) === normalize(right.questionNumber!)
        && normalize(left.statement) === normalize(right.statement);
      const sameStatementWithOverlappingEvidence = normalize(left.statement) === normalize(right.statement) && sharedRefs.length > 0;
      if ((sameNumberAndStatement || sameStatementWithOverlappingEvidence) && sharedRefs.length > 0) {
        duplicates.push(right);
        consumed.add(right.candidateId);
      }
    }
    if (duplicates.length) {
      duplicateGroups.push({
        canonicalCandidateId: left.candidateId,
        duplicateCandidateIds: duplicates.map(({ candidateId }) => candidateId),
        evidenceRefIds: [...stableEvidence(left)].filter((refId) => duplicates.some((duplicate) => stableEvidence(duplicate).has(refId))),
      });
    }
  }
  return { duplicateGroups, ambiguousCandidateIds: [...ambiguousCandidateIds] };
}

/** Applies a statement repair only when its quoted evidence is present in the supplied source. */
export function applyEvidenceBackedStatementPatch(input: {
  candidateId: string;
  currentStatement: string;
  proposedStatement: string;
  evidenceRefId: string;
  evidenceQuote: string;
  sourceText: string;
  sourceRefs?: CandidateSourceRef[];
}): StatementPatch | null {
  const quote = normalize(input.evidenceQuote);
  const proposed = input.proposedStatement.trim();
  const normalizedProposed = normalize(proposed);
  const evidenceRef = input.sourceRefs?.find((reference) => reference.id === input.evidenceRefId);
  const sourceHasPageReferences = /(?:page|p[aá]gina)[-_ ]?\d+/iu.test(input.sourceText);
  const referenceValid = evidenceRef
    ? Boolean(evidenceRef.quote && normalize(evidenceRef.quote) === quote)
    : !sourceHasPageReferences || normalize(input.sourceText).includes(normalize(input.evidenceRefId));
  if (!proposed || !quote || !referenceValid
    || !normalize(input.sourceText).includes(quote)
    || (!normalizedProposed.includes(quote) && !quote.includes(normalizedProposed))) return null;
  if (normalize(input.currentStatement) === normalize(proposed)) return null;
  return {
    candidateId: input.candidateId,
    statement: proposed,
    origin: 'SOURCE_DOCUMENT',
    originalStatement: input.currentStatement,
    evidenceRefId: input.evidenceRefId,
    evidenceQuote: input.evidenceQuote,
  };
}
