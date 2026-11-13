import type { ExtractedQuestionCandidate, QuestionGraphState } from './state.js';
import type { QuestionEvidenceSearchResult } from './contracts.js';

/** Context payload loaded on demand; image bytes must never be checkpointed. */
export type QuestionGraphLoadedContext = {
  text: string;
  images: Array<{ assetId: string; mimeType: string; dataUrl: string; pageNumber: number }>;
  /** Non-fatal context retrieval problems; optional to preserve existing providers. */
  unresolvedIssues?: string[];
};

export interface QuestionGraphContextProvider {
  load(state: QuestionGraphState, candidate: ExtractedQuestionCandidate): Promise<QuestionGraphLoadedContext>;
  searchEvidence?(input: {
    state: QuestionGraphState;
    candidate: ExtractedQuestionCandidate;
    query: string;
    intent: 'answer_key' | 'question_context';
    segmentId?: string;
    cursor?: string | null;
    limit?: number;
  }): Promise<QuestionEvidenceSearchResult>;
}
