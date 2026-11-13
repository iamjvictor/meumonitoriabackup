import { Annotation } from '@langchain/langgraph';
import type {
  QuestionAgentChange,
  QuestionCandidateQuality,
  QuestionCandidateSnapshot,
  QuestionCandidateSourceRefs,
  QuestionDocumentSegment,
  QuestionEvidenceReference,
  QuestionGraphExecutionMetadata,
  QuestionNodeMetrics,
} from './contracts.js';

export type {
  QuestionAgentChange,
  QuestionCandidateQuality,
  QuestionCandidateSnapshot,
  QuestionCandidateSourceRefs,
  QuestionDocumentSegment,
  QuestionEvidenceCoverage,
  QuestionEvidenceReference,
  QuestionEvidenceSearchResult,
  QuestionGraphExecutionMetadata,
  QuestionGraphExecutionStatus,
  QuestionGraphMetrics,
  QuestionNodeMetrics,
} from './contracts.js';

export type QuestionAlternative = { label: string; text: string };

/** Extracted candidate data is retained verbatim while review metadata is added. */
export type ExtractedQuestionCandidate = {
  id?: string;
  /** Stable identity independent of candidate array ordering. */
  candidateId?: string;
  segmentId?: string | null;
  contentVersion?: string;
  originalSnapshot?: QuestionCandidateSnapshot;
  sourceRefs?: QuestionCandidateSourceRefs;
  quality?: QuestionCandidateQuality;
  number?: string | null;
  statement: string;
  alternatives: QuestionAlternative[];
  correctAnswer: string | null;
  sourceChunkIds: string[];
  visualEvidence?: Array<{
    assetId: string;
    role: 'STATEMENT' | 'ALTERNATIVE';
    alternativeLabel: string | null;
    anchorText: string;
  }>;
  visualAssetIds?: string[];
  [key: string]: unknown;
};

export type QuestionReviewRoute = 'alternatives' | 'answer' | 'both' | 'complete';
export type QuestionGraphStage = 'awaiting_alternatives' | 'awaiting_answer' | 'awaiting_both' | 'ready';
export type QuestionGraphNextNode = 'alternatives_agent' | 'answer_agent' | 'end';

export type QuestionReviewDecision = {
  candidateId: string;
  route: QuestionReviewRoute;
  missingAlternativeLabels: string[];
  alternativesNeedRepair: boolean;
  missingAnswer: boolean;
  pendingIssues: string[];
};

export type QuestionAgentResult = {
  inputVersion?: string;
  outputVersion?: string;
  changes?: QuestionAgentChange[];
  evidenceRefs?: QuestionEvidenceReference[];
  matchedSegmentId?: string | null;
  confidence?: number;
  conflicts?: string[];
  unresolvedReasons?: string[];
  attempts?: number;
  metrics?: QuestionNodeMetrics;
  alternatives?: QuestionAlternative[];
  alternativesOrigin?: 'SOURCE_DOCUMENT' | 'AI_GENERATED';
  correctAnswer?: string | null;
  correctAnswerOrigin?: 'SOURCE_DOCUMENT' | 'AI_GENERATED';
  pendingIssues: string[];
};

export type QuestionBackendOutput = {
  questionNumber: string | null;
  statement: string;
  kind: 'MULTIPLE_CHOICE';
  alternatives: QuestionAlternative[];
  correctAnswer: string | null;
  institution: string | null;
  year: number | null;
  alternativesGenerated: boolean;
  answerGenerated: boolean;
  alternativesOrigin: 'SOURCE_DOCUMENT' | 'AI_GENERATED' | null;
  correctAnswerOrigin: 'SOURCE_DOCUMENT' | 'AI_GENERATED' | null;
  sourceChunkIds: string[];
  visualEvidence: NonNullable<ExtractedQuestionCandidate['visualEvidence']>;
  needsReview: true;
  status: 'PENDING_REVIEW';
  pendingIssues: string[];
};

/** Only durable references belong here. Do not put PDFs, image data URLs, or base64 in graph state. */
export type QuestionGraphState = {
  executionId: string;
  documentId: string;
  documentVersion: string;
  model: string;
  promptVersion: string;
  /** Optional during migration; populated by the integrated worker path. */
  execution?: QuestionGraphExecutionMetadata;
  segments?: QuestionDocumentSegment[];
  contextRefs: {
    chunkIds: string[];
    pageNumbers: number[];
    formulaEvidenceRefs: string[];
    imageAssetIds: string[];
    evidenceRefs?: string[];
  };
  candidates: ExtractedQuestionCandidate[];
  reviewDecisions: QuestionReviewDecision[];
  agentResults: Record<string, QuestionAgentResult>;
  selectedRoute: QuestionReviewRoute | null;
  nextNode: QuestionGraphNextNode | null;
  selectedCandidateId: string | null;
  stage: QuestionGraphStage | null;
  attempts: Record<string, number>;
  errors: Array<{ node: string; code: string; message: string }>;
  backendOutput: QuestionBackendOutput[];
};

export const QuestionGraphStateSchema = Annotation.Root({
  executionId: Annotation<string>(),
  documentId: Annotation<string>(),
  documentVersion: Annotation<string>(),
  model: Annotation<string>(),
  promptVersion: Annotation<string>(),
  execution: Annotation<QuestionGraphExecutionMetadata | undefined>(),
  segments: Annotation<QuestionDocumentSegment[] | undefined>(),
  contextRefs: Annotation<QuestionGraphState['contextRefs']>(),
  candidates: Annotation<ExtractedQuestionCandidate[]>(),
  reviewDecisions: Annotation<QuestionReviewDecision[]>(),
  agentResults: Annotation<Record<string, QuestionAgentResult>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
  selectedRoute: Annotation<QuestionReviewRoute | null>(),
  nextNode: Annotation<QuestionGraphNextNode | null>(),
  selectedCandidateId: Annotation<string | null>(),
  stage: Annotation<QuestionGraphStage | null>(),
  attempts: Annotation<Record<string, number>>(),
  errors: Annotation<QuestionGraphState['errors']>(),
  backendOutput: Annotation<QuestionBackendOutput[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
});
