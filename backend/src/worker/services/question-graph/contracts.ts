/** Durable identity and provenance contracts shared by question graph nodes.
 * Keep these values JSON serializable so they can be checkpointed safely.
 */
export type QuestionGraphExecutionStatus =
  | 'running'
  | 'completed'
  | 'completed_with_issues'
  | 'failed';

export type QuestionCandidateValidity = 'valid' | 'fragment' | 'ambiguous';
export type QuestionStructuralCompleteness = 'complete' | 'partial';
export type QuestionContentReview = 'no_detected_issue' | 'needs_review';

export type QuestionGraphMetrics = {
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  llmCalls?: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  estimatedCost?: number | null;
  costCurrency?: string | null;
};

export type QuestionGraphExecutionMetadata = {
  pipelineVersion: string;
  provider?: string;
  status: QuestionGraphExecutionStatus;
  metrics?: QuestionGraphMetrics;
};

/** Exam/section identity is evidence-based; unknown properties stay null. */
export type QuestionDocumentSegment = {
  segmentId: string;
  pageStart: number | null;
  pageEnd: number | null;
  institution: string | null;
  examName: string | null;
  year: number | null;
  modality: string | null;
  version: string | null;
  evidenceRefs: string[];
  confidence?: number;
};

export type QuestionEvidenceKind = 'text' | 'table' | 'image' | 'formula';
export type QuestionEvidenceReference = {
  evidenceId: string;
  kind: QuestionEvidenceKind;
  pageNumber: number | null;
  chunkId?: string;
  assetId?: string;
  /** Normalized text or OCR when present. Never put image bytes here. */
  excerpt?: string;
  boundingBox?: { x: number; y: number; width: number; height: number } | null;
  segmentId?: string | null;
  score?: number;
};

export type QuestionEvidenceCoverage = 'complete' | 'partial' | 'failed';

export type QuestionEvidenceSearchResult = {
  query: string;
  coverage: QuestionEvidenceCoverage;
  hits: QuestionEvidenceReference[];
  nextCursor?: string | null;
  unresolvedReason?: string | null;
};

export type QuestionCandidateQuality = {
  validity: QuestionCandidateValidity;
  structuralCompleteness: QuestionStructuralCompleteness;
  contentReview: QuestionContentReview;
  issues: string[];
};

export type QuestionCandidateSourceRefs = {
  chunkIds: string[];
  pageNumbers: number[];
  evidenceRefs: string[];
  visualAssetIds: string[];
};

export type QuestionCandidateSnapshot = {
  statement: string;
  alternatives: Array<{ label: string; text: string }>;
  correctAnswer: string | null;
  contentVersion: string;
};

export type QuestionAgentChange = {
  field: 'statement' | 'alternatives' | 'correctAnswer';
  origin: 'SOURCE_DOCUMENT' | 'AI_GENERATED';
  beforeVersion: string;
  afterVersion: string;
  evidenceRefs: string[];
};

export type QuestionNodeMetrics = {
  durationMs: number;
  llmCalls: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
};
