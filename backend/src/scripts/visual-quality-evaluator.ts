export type VisualEvalExpected = {
  caseId: string;
  category: string;
  critical: boolean;
  requiresImage: boolean;
  requiresKnowledgeRetrieval?: boolean;
  expectedAssets: Array<{ sha256: string; page: number }>;
  allowedAssets?: Array<{ sha256: string; page: number }>;
  allowedSentImageSha256?: string[];
  expectedFactIds: string[];
  expectedRetrievalAssets?: Array<{ sha256: string; page: number }>;
};

export type VisualEvalHumanReview = {
  questionUnderstood: boolean;
  visualFactsCorrect: boolean;
  relationToQuestionCorrect: boolean;
  pedagogicalReasoning: boolean;
  sourcePageCorrect: boolean;
  limitationHonest: boolean;
  matchedFactIds: string[];
  unsupportedVisualClaims: boolean;
};

export type VisualEvalObservation = {
  extractedAssets: Array<{ assetId: string; sha256: string; page: number }>;
  linkedAssets: Array<{ assetId: string; sha256: string; page: number }>;
  retrievedAssets: Array<{ assetId: string; sha256: string; page: number }>;
  contextManifest: Array<{ assetId: string; sha256: string; page: number | null; source: string }>;
  sentImageSha256: string[];
  answer: string;
  baselineAnswer?: string | null;
  humanReview: VisualEvalHumanReview | null;
  baselineHumanReview?: VisualEvalHumanReview | null;
};

export type VisualEvalCaseResult = {
  caseId: string;
  category: string;
  critical: boolean;
  extractionPass: boolean;
  associationPass: boolean;
  retrievalPass: boolean | null;
  contextPass: boolean;
  answerPass: boolean;
  baselineAnswerPass: boolean | null;
  reviewStatus: 'PENDING' | 'REVIEWED';
  missingAssets: Array<{ sha256: string; page: number }>;
  foreignAssets: Array<{ assetId: string; sha256: string; page: number | null }>;
  missingFactIds: string[];
};

export function evaluateVisualCase(expected: VisualEvalExpected, observed: VisualEvalObservation): VisualEvalCaseResult {
  const key = (asset: { sha256: string; page: number | null }) => `${asset.sha256}:${asset.page ?? 'unknown'}`;
  const allowed = new Set((expected.allowedAssets ?? expected.expectedAssets).map(key));
  const missingAssets = expected.expectedAssets.filter((asset) => {
    const evidence = (candidate: { sha256: string; page: number | null } | undefined) => candidate && key(candidate) === key(asset);
    return !observed.extractedAssets.some(evidence)
      || !observed.linkedAssets.some(evidence)
      || !observed.contextManifest.some(evidence);
  });
  const foreignAssets = [...observed.linkedAssets, ...observed.contextManifest]
    .filter((asset) => !allowed.has(key(asset)))
    .filter((asset, index, all) => all.findIndex((candidate) => candidate.assetId === asset.assetId) === index)
    .sort((a, b) => a.assetId.localeCompare(b.assetId));
  const expectedHashes = expected.expectedAssets.map((asset) => asset.sha256);
  const allowedSentHashes = new Set(expected.allowedSentImageSha256 ?? expectedHashes);
  const contextPass = expected.requiresImage
    ? expected.expectedAssets.length > 0
      && missingAssets.length === 0
      && foreignAssets.length === 0
      && expectedHashes.every((hash) => observed.sentImageSha256.includes(hash))
      && observed.sentImageSha256.every((hash) => allowedSentHashes.has(hash))
    : observed.contextManifest.length === 0 && observed.sentImageSha256.length === 0;
  const review = observed.humanReview;
  const matchedFacts = new Set(review?.matchedFactIds ?? []);
  const missingFactIds = expected.expectedFactIds.filter((factId) => !matchedFacts.has(factId));
  const answerPass = passesHumanReview(expected.expectedFactIds, review)
    && (!expected.requiresImage || contextPass);
  const baselineAnswerPass = observed.baselineHumanReview
    ? passesHumanReview(expected.expectedFactIds, observed.baselineHumanReview)
    : null;
  const retrievalPass = expected.requiresKnowledgeRetrieval
    ? (expected.expectedRetrievalAssets?.length ?? 0) > 0
      && expected.expectedRetrievalAssets!.every((asset) => observed.retrievedAssets.some((candidate) => key(candidate) === key(asset)))
    : null;

  return {
    caseId: expected.caseId,
    category: expected.category,
    critical: expected.critical,
    extractionPass: expected.expectedAssets.every((asset) => observed.extractedAssets.some((candidate) => key(candidate) === key(asset))),
    associationPass: expected.expectedAssets.every((asset) => observed.linkedAssets.some((candidate) => key(candidate) === key(asset))) && foreignAssets.length === 0,
    retrievalPass,
    contextPass,
    answerPass,
    baselineAnswerPass,
    reviewStatus: review ? 'REVIEWED' : 'PENDING',
    missingAssets,
    foreignAssets,
    missingFactIds,
  };
}

function passesHumanReview(expectedFactIds: string[], review: VisualEvalHumanReview | null | undefined) {
  if (!review) return false;
  const matched = new Set(review.matchedFactIds);
  return review.questionUnderstood
    && review.visualFactsCorrect
    && review.relationToQuestionCorrect
    && review.pedagogicalReasoning
    && review.sourcePageCorrect
    && review.limitationHonest
    && !review.unsupportedVisualClaims
    && expectedFactIds.every((factId) => matched.has(factId));
}

export function summarizeVisualEvaluation(results: VisualEvalCaseResult[]) {
  const extraction = results.filter((result) => result.extractionPass).length;
  const association = results.filter((result) => result.associationPass).length;
  const contextEligible = results.filter((result) => result.critical);
  const answerEligible = results.filter((result) => result.reviewStatus === 'REVIEWED');
  const retrievalEligible = results.filter((result) => result.retrievalPass !== null);
  return {
    cases: results.length,
    extraction: { passed: extraction, total: results.length },
    association: { passed: association, total: results.length },
    criticalContext: { passed: contextEligible.filter((result) => result.contextPass).length, total: contextEligible.length },
    retrievalRecall: { passed: retrievalEligible.filter((result) => result.retrievalPass).length, total: retrievalEligible.length },
    reviewedAnswers: { passed: answerEligible.filter((result) => result.answerPass).length, total: answerEligible.length },
    pairedComparison: (() => {
      const paired = results.filter((result) => result.baselineAnswerPass !== null && result.reviewStatus === 'REVIEWED');
      return {
        baselinePassed: paired.filter((result) => result.baselineAnswerPass).length,
        multimodalPassed: paired.filter((result) => result.answerPass).length,
        total: paired.length,
      };
    })(),
    pendingHumanReview: results.filter((result) => result.reviewStatus === 'PENDING').length,
  };
}
