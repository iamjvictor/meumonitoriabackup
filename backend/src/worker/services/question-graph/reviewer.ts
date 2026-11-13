import { createHash } from 'node:crypto';
import { END, START, StateGraph, type BaseCheckpointSaver } from '@langchain/langgraph';
import { OpenRouterClient } from '../../client/openrouter.client.js';
import { createAlternativesAgentNode } from './alternatives.agent.js';
import { createQuestionAnswerAgentNode } from './answer.agent.js';
import { findConservativeDuplicates, validateQuestionCandidate } from './candidate-validation.js';
import type { QuestionGraphContextProvider } from './context.provider.js';
import {
  QuestionGraphStateSchema,
  type ExtractedQuestionCandidate,
  type QuestionGraphStage,
  type QuestionGraphState,
  type QuestionGraphNextNode,
  type QuestionReviewDecision,
  type QuestionReviewRoute,
  type QuestionBackendOutput,
} from './state.js';

const EXPECTED_LABELS = ['A', 'B', 'C', 'D', 'E'] as const;

function normalized(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase().replace(/\s+/g, ' ').trim();
}

export function stableCandidateId(candidate: ExtractedQuestionCandidate): string {
  if (candidate.candidateId?.trim()) return candidate.candidateId.trim();
  if (candidate.id?.trim()) return candidate.id.trim();
  const sourceRefs = candidate.sourceRefs?.evidenceRefs ?? candidate.sourceChunkIds;
  const identity = [candidate.segmentId ?? '', candidate.number?.trim() ?? '', [...sourceRefs].sort().join(','), normalized(candidate.statement)].join('\u0000');
  return `candidate:${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}

function candidateContentVersion(candidate: ExtractedQuestionCandidate): string {
  return createHash('sha256').update(JSON.stringify({
    base: candidate.contentVersion ?? candidate.originalSnapshot?.contentVersion ?? null,
    alternatives: candidate.alternatives.map(({ label, text }) => ({ label, text })),
  })).digest('hex');
}

function uniqueValues(values: Array<string | number | null | undefined>): Array<string | number> {
  return [...new Set(values.filter((value): value is string | number => value !== null && value !== undefined && value !== ''))];
}

function mergeDuplicateReferences(canonical: ExtractedQuestionCandidate, duplicates: ExtractedQuestionCandidate[]): ExtractedQuestionCandidate {
  const all = [canonical, ...duplicates];
  const sourceChunkIds = uniqueValues(all.flatMap((candidate) => candidate.sourceChunkIds)) as string[];
  const sourceRefs = {
    chunkIds: uniqueValues(all.flatMap((candidate) => candidate.sourceRefs?.chunkIds ?? [])) as string[],
    pageNumbers: uniqueValues(all.flatMap((candidate) => candidate.sourceRefs?.pageNumbers ?? [])) as number[],
    evidenceRefs: uniqueValues(all.flatMap((candidate) => candidate.sourceRefs?.evidenceRefs ?? [])) as string[],
    visualAssetIds: uniqueValues(all.flatMap((candidate) => candidate.sourceRefs?.visualAssetIds ?? candidate.visualAssetIds ?? [])) as string[],
  };
  const visualEvidence = [...new Map(all.flatMap((candidate) => candidate.visualEvidence ?? [])
    .map((evidence) => [JSON.stringify(evidence), evidence] as const)).values()];
  return {
    ...canonical,
    sourceChunkIds,
    sourceRefs,
    visualAssetIds: uniqueValues(all.flatMap((candidate) => candidate.visualAssetIds ?? candidate.sourceRefs?.visualAssetIds ?? [])) as string[],
    visualEvidence,
  };
}

/**
 * Give duplicate rows distinct identities only inside duplicate analysis. The
 * persisted candidate identity remains content/evidence based and never uses
 * the array position. Exact clones share a stable ID and are consolidated.
 */
function analyzeDuplicates(candidates: ExtractedQuestionCandidate[]): {
  candidates: ExtractedQuestionCandidate[];
  ambiguousIds: Set<string>;
} {
  const baseIds = candidates.map(stableCandidateId);
  const counts = new Map<string, number>();
  const analysisIds = baseIds.map((baseId) => {
    const occurrence = counts.get(baseId) ?? 0;
    counts.set(baseId, occurrence + 1);
    return occurrence === 0 ? baseId : `${baseId}:duplicate-copy:${occurrence}`;
  });
  const rowsByAnalysisId = new Map(analysisIds.map((analysisId, index) => [analysisId, candidates[index]!]));
  const stableIdsByAnalysisId = new Map(analysisIds.map((analysisId, index) => [analysisId, baseIds[index]!]));
  const duplicateAnalysis = findConservativeDuplicates(candidates.map((candidate, index) => ({
    candidateId: analysisIds[index]!,
    // Unknown segment identity is not proof that two occurrences belong to
    // the same exam/caderno. Isolate it so it cannot be merged accidentally.
    segmentId: candidate.segmentId || `unknown-segment:${analysisIds[index]}`,
    questionNumber: candidate.number,
    statement: candidate.statement,
    alternatives: candidate.alternatives,
    sourceRefs: (candidate.sourceRefs?.evidenceRefs ?? []).map((id) => ({ id })),
  })));
  const removedIds = new Set(duplicateAnalysis.duplicateGroups.flatMap((group) => group.duplicateCandidateIds));
  const canonicalByAnalysisId = new Map<string, ExtractedQuestionCandidate>();
  for (const group of duplicateAnalysis.duplicateGroups) {
    const canonical = rowsByAnalysisId.get(group.canonicalCandidateId);
    if (!canonical) continue;
    const duplicateRows = group.duplicateCandidateIds.flatMap((id) => {
      const duplicate = rowsByAnalysisId.get(id);
      return duplicate ? [duplicate] : [];
    });
    canonicalByAnalysisId.set(group.canonicalCandidateId, mergeDuplicateReferences(canonical, duplicateRows));
  }
  const consolidated = candidates.flatMap((candidate, index) => {
    const analysisId = analysisIds[index]!;
    if (removedIds.has(analysisId)) return [];
    const canonical = canonicalByAnalysisId.get(analysisId) ?? candidate;
    return [canonical];
  });
  const ambiguousIds = new Set(duplicateAnalysis.ambiguousCandidateIds.map((id) => stableIdsByAnalysisId.get(id) ?? id));
  return {
    candidates: consolidated,
    ambiguousIds,
  };
}

function hasCompatibleAnswer(candidate: ExtractedQuestionCandidate): boolean {
  const answer = normalized(candidate.correctAnswer ?? '').replace(/^(?:RESPOSTA|ALTERNATIVA)\s*/, '').replace(/[).:]/g, '').trim();
  if (!answer) return false;
  return candidate.alternatives.some((alternative) => {
    const label = normalized(alternative.label).replace(/[).:]/g, '').trim();
    const text = normalized(alternative.text);
    return label === answer || text === answer;
  });
}

/**
 * Minimum deterministic review rule: every A–E label must occur exactly once
 * with nonblank text, and the extracted answer must identify one of those
 * alternatives by label or exact normalized text. This does not assess
 * correctness against source evidence or images; that remains for later nodes.
 */
export function classifyQuestionGaps(candidate: ExtractedQuestionCandidate): QuestionReviewDecision {
  const alternatives = candidate.alternatives ?? [];
  const missingAlternativeLabels = EXPECTED_LABELS.filter((label) => {
    const matching = alternatives.filter((alternative) => normalized(alternative.label).replace(/[).:]/g, '').trim() === label);
    return matching.length !== 1 || !matching[0]?.text.trim();
  });
  const alternativesNeedRepair = alternatives.length !== EXPECTED_LABELS.length || missingAlternativeLabels.length > 0;
  const missingAnswer = !hasCompatibleAnswer(candidate);
  const pendingIssues: string[] = [];
  if (alternativesNeedRepair) pendingIssues.push('ALTERNATIVES_INCOMPLETE_OR_INVALID');
  if (missingAnswer) pendingIssues.push(candidate.correctAnswer?.trim() ? 'ANSWER_NOT_MATCHING_FINAL_ALTERNATIVE' : 'ANSWER_MISSING');
  const route: QuestionReviewRoute = alternativesNeedRepair
    ? (missingAnswer ? 'both' : 'alternatives')
    : (missingAnswer ? 'answer' : 'complete');
  return { candidateId: stableCandidateId(candidate), route, missingAlternativeLabels: [...missingAlternativeLabels], alternativesNeedRepair, missingAnswer, pendingIssues };
}

function aggregateRoute(decisions: QuestionReviewDecision[]): QuestionReviewRoute {
  const needsAlternatives = decisions.some(({ alternativesNeedRepair }) => alternativesNeedRepair);
  const needsAnswer = decisions.some(({ missingAnswer }) => missingAnswer);
  return needsAlternatives ? (needsAnswer ? 'both' : 'alternatives') : (needsAnswer ? 'answer' : 'complete');
}

function candidateVisualAssetIds(candidate: ExtractedQuestionCandidate): Set<string> {
  return new Set([
    ...(candidate.visualAssetIds ?? []),
    ...(candidate.visualEvidence ?? []).map(({ assetId }) => assetId),
    ...(candidate.sourceRefs?.visualAssetIds ?? []),
  ]);
}

function isIntegrityBlockingIssue(candidate: ExtractedQuestionCandidate | undefined, decision: QuestionReviewDecision): boolean {
  if (!candidate) return decision.pendingIssues.length > 0;
  if (decision.alternativesNeedRepair || decision.missingAlternativeLabels.length > 0) return true;
  if (decision.pendingIssues.some((issue) => [
    'STATEMENT_URL_OR_EMPTY_FRAGMENT',
    'STATEMENT_CAPTION_FRAGMENT',
    'CANDIDATE_FRAGMENT',
    'CANDIDATE_SEGMENT_AMBIGUOUS',
    'CANDIDATE_DUPLICATE_OR_SEGMENT_AMBIGUOUS',
  ].includes(issue))) return true;

  const integrityFailure = decision.pendingIssues.some((issue) => issue.startsWith('ALTERNATIVES_AGENT_')
    || issue === 'ANSWER_AGENT_FAILED'
    || issue === 'ANSWER_AGENT_SCHEMA_INVALID'
    || issue === 'ANSWER_SOURCE_EVIDENCE_UNVERIFIED'
    || issue === 'ANSWER_CONTEXT_INSUFFICIENT'
    || issue === 'ANSWER_LOW_CONFIDENCE'
    || issue === 'ANSWER_NOT_MATCHING_FINAL_ALTERNATIVE');
  if (integrityFailure) return true;

  const visualReferences = candidateVisualAssetIds(candidate);
  return decision.pendingIssues.some((issue) => {
    if (!issue.startsWith('VISUAL_CONTEXT_') || visualReferences.size === 0) return false;
    const separator = issue.lastIndexOf(':');
    if (separator < 0) return true;
    const failedAssetId = issue.slice(separator + 1).trim();
    return !failedAssetId || visualReferences.has(failedAssetId);
  });
}

function stageForRoute(route: QuestionReviewRoute): QuestionGraphStage {
  switch (route) {
    case 'alternatives': return 'awaiting_alternatives';
    case 'answer': return 'awaiting_answer';
    case 'both': return 'awaiting_both';
    case 'complete': return 'ready';
  }
}

function reviewerNode(state: QuestionGraphState) {
  const duplicateResult = analyzeDuplicates(state.candidates);
  const ambiguousIds = duplicateResult.ambiguousIds;
  const sourceUnverifiedIds = new Set<string>();
  const candidates = duplicateResult.candidates.map((candidate) => {
    const id = stableCandidateId(candidate);
    const result = state.agentResults[id];
    const overlaid = !result ? candidate : {
      ...candidate,
      ...(result.alternatives ? { alternatives: result.alternatives } : {}),
      ...(result.correctAnswer !== undefined ? { correctAnswer: result.correctAnswer } : {}),
    };
    const version = candidateContentVersion(overlaid);
    // Existing letters are hypotheses until the answer agent ties them to
    // evidence for this document, candidate and final alternatives version.
    const prior = state.agentResults[id];
    const verifiedAnswer = prior?.inputVersion === version
      && Boolean(prior.evidenceRefs?.length || prior.correctAnswerOrigin === 'AI_GENERATED');
    const hasFinalAlternatives = overlaid.alternatives.length === EXPECTED_LABELS.length
      && EXPECTED_LABELS.every((label) => overlaid.alternatives.filter((alternative) => normalized(alternative.label) === label).length === 1);
    if (overlaid.correctAnswer && hasFinalAlternatives && !verifiedAnswer) {
      sourceUnverifiedIds.add(id);
    }
    return overlaid;
  });
  const reviewDecisions = candidates.map((candidate) => {
    const decision = classifyQuestionGaps(candidate);
    const agentPendingIssues = state.agentResults[decision.candidateId]?.pendingIssues ?? [];
    const validation = validateQuestionCandidate({
      candidateId: decision.candidateId,
      segmentId: candidate.segmentId,
      questionNumber: candidate.number,
      statement: candidate.statement,
      alternatives: candidate.alternatives,
      sourceRefs: (candidate.sourceRefs?.evidenceRefs ?? candidate.sourceChunkIds).map((id) => ({ id })),
    });
    const contentIssues = [
      ...(validation.validity === 'fragment' ? validation.reasons : []),
      ...(candidate.quality?.validity === 'fragment' ? ['CANDIDATE_FRAGMENT'] : []),
      ...(candidate.quality?.validity === 'ambiguous' ? ['CANDIDATE_SEGMENT_AMBIGUOUS'] : []),
      ...(candidate.quality?.contentReview === 'needs_review' && !(candidate.quality.issues?.length) ? ['CANDIDATE_CONTENT_REVIEW_REQUIRED'] : []),
      ...(ambiguousIds.has(decision.candidateId) ? ['CANDIDATE_DUPLICATE_OR_SEGMENT_AMBIGUOUS'] : []),
      ...(candidate.quality?.issues ?? []),
      ...(sourceUnverifiedIds.has(decision.candidateId) ? ['ANSWER_SOURCE_UNVERIFIED'] : []),
      ...agentPendingIssues,
    ];
    // A rejected/failed alternative repair is unresolved even when filtering
    // bad labels happens to leave five non-empty A–E entries. Do not let the
    // structural count alone promote that candidate to ready.
    const alternativesAgentPending = agentPendingIssues.some((issue) => issue.startsWith('ALTERNATIVES_AGENT_'));
    if (!alternativesAgentPending && !contentIssues.length) return decision;
    const alternativesNeedRepair = decision.alternativesNeedRepair || alternativesAgentPending;
    const missingAnswer = decision.missingAnswer || sourceUnverifiedIds.has(decision.candidateId);
    const route: QuestionReviewRoute = alternativesNeedRepair
      ? (missingAnswer ? 'both' : 'alternatives')
      : (missingAnswer ? 'answer' : 'complete');
    return {
      ...decision,
      alternativesNeedRepair,
      missingAnswer,
      route,
      pendingIssues: [...new Set([...decision.pendingIssues, ...agentPendingIssues, ...contentIssues])],
    };
  });
  const selectedRoute = aggregateRoute(reviewDecisions);
  const backendOutput: QuestionBackendOutput[] = candidates.map((candidate, index) => {
    const decision = reviewDecisions[index]!;
    const result = state.agentResults[decision.candidateId];
    const alternativesGenerated = result?.alternativesOrigin === 'AI_GENERATED';
    const answerGenerated = result?.correctAnswerOrigin === 'AI_GENERATED';
    const pendingIssues = [...new Set([...decision.pendingIssues, ...(result?.pendingIssues ?? [])])];
    return {
      questionNumber: candidate.number ?? null,
      statement: candidate.statement,
      kind: 'MULTIPLE_CHOICE',
      alternatives: candidate.alternatives,
      correctAnswer: candidate.correctAnswer,
      institution: typeof candidate.institution === 'string' ? candidate.institution : null,
      year: typeof candidate.year === 'number' ? candidate.year : null,
      alternativesGenerated,
      answerGenerated,
      alternativesOrigin: candidate.alternatives.length ? (alternativesGenerated ? 'AI_GENERATED' : 'SOURCE_DOCUMENT') : null,
      correctAnswerOrigin: candidate.correctAnswer ? (answerGenerated ? 'AI_GENERATED' : 'SOURCE_DOCUMENT') : null,
      sourceChunkIds: candidate.sourceChunkIds,
      visualEvidence: candidate.visualEvidence ?? [],
      needsReview: true,
      status: 'PENDING_REVIEW',
      pendingIssues,
    };
  });
  const attempts = { ...state.attempts };
  const candidateById = new Map(candidates.map((candidate) => [stableCandidateId(candidate), candidate]));
  const needsAlternativeWork = reviewDecisions.find((decision) => decision.alternativesNeedRepair
    && !decision.pendingIssues.some((issue) => issue === 'STATEMENT_URL_OR_EMPTY_FRAGMENT' || issue === 'STATEMENT_CAPTION_FRAGMENT' || issue === 'CANDIDATE_FRAGMENT' || issue.startsWith('CANDIDATE_DUPLICATE') || issue === 'CANDIDATE_SEGMENT_AMBIGUOUS')
    && !attempts[`${decision.candidateId}:alternatives`]);
  const needsAnswerWork = reviewDecisions.find((decision) => !decision.alternativesNeedRepair
    && (decision.missingAnswer || decision.pendingIssues.includes('ANSWER_SOURCE_UNVERIFIED'))
    && !isIntegrityBlockingIssue(candidateById.get(decision.candidateId), decision)
    && !attempts[`${decision.candidateId}:answer`]);
  let nextNode: QuestionGraphNextNode = 'end';
  let selectedCandidateId: string | null = null;
  if (needsAlternativeWork) {
    nextNode = 'alternatives_agent';
    selectedCandidateId = needsAlternativeWork.candidateId;
    attempts[`${needsAlternativeWork.candidateId}:alternatives`] = (attempts[`${needsAlternativeWork.candidateId}:alternatives`] ?? 0) + 1;
  } else if (needsAnswerWork) {
    nextNode = 'answer_agent';
    selectedCandidateId = needsAnswerWork.candidateId;
    attempts[`${needsAnswerWork.candidateId}:answer`] = (attempts[`${needsAnswerWork.candidateId}:answer`] ?? 0) + 1;
  }
  const hasBlockingIssues = reviewDecisions.some((decision) => {
    return isIntegrityBlockingIssue(candidateById.get(decision.candidateId), decision);
  });
  const hasUnresolvedIssues = reviewDecisions.some((decision) => decision.pendingIssues.length > 0);
  return {
    candidates,
    reviewDecisions,
    selectedRoute,
    nextNode,
    selectedCandidateId,
    attempts,
    stage: hasBlockingIssues
      ? (selectedRoute === 'both' ? 'awaiting_both' : selectedRoute === 'answer' || reviewDecisions.some((decision) => decision.pendingIssues.some((issue) => issue.startsWith('ANSWER_'))) ? 'awaiting_answer' : 'awaiting_alternatives')
      : stageForRoute(selectedRoute),
    ...(state.execution ? { execution: { ...state.execution, status: nextNode !== 'end' || state.execution.status === 'failed'
      ? state.execution.status
      : (hasUnresolvedIssues || hasBlockingIssues ? 'completed_with_issues' : 'completed') } } : {}),
    backendOutput,
  };
}

/**
 * Build the first LangGraph stage after extraction. Terminal route nodes record
 * where later completion agents should run; this package intentionally does
 * not implement those agents or mutate extracted candidate content.
 */
export function createQuestionReviewerGraph(dependencies: {
  contextProvider?: QuestionGraphContextProvider;
  client?: Pick<OpenRouterClient, 'createStructuredChatCompletion'>;
  checkpointer?: BaseCheckpointSaver;
} = {}) {
  const contextProvider = dependencies.contextProvider;
  const client = dependencies.client ?? new OpenRouterClient();
  const alternativesNode = contextProvider ? createAlternativesAgentNode({ contextProvider, client }) : () => ({});
  const answerNode = contextProvider ? createQuestionAnswerAgentNode(client, contextProvider) : () => ({});
  const graph = new StateGraph(QuestionGraphStateSchema)
    .addNode('reviewer', reviewerNode)
    .addNode('alternatives_agent', alternativesNode)
    .addNode('answer_agent', answerNode)
    .addEdge(START, 'reviewer')
    .addConditionalEdges('reviewer', (state) => state.nextNode ?? 'end', {
      alternatives_agent: 'alternatives_agent',
      answer_agent: 'answer_agent',
      end: END,
    })
    .addEdge('alternatives_agent', 'reviewer')
    .addEdge('answer_agent', 'reviewer');
  return graph.compile({ ...(dependencies.checkpointer ? { checkpointer: dependencies.checkpointer } : {}) });
}

export function createQuestionGraphInput(input: Omit<QuestionGraphState, 'reviewDecisions' | 'selectedRoute' | 'nextNode' | 'selectedCandidateId' | 'stage' | 'attempts' | 'errors' | 'agentResults' | 'backendOutput'>): QuestionGraphState {
  return { ...input, reviewDecisions: [], agentResults: {}, selectedRoute: null, nextNode: null, selectedCandidateId: null, stage: null, attempts: {}, errors: [], backendOutput: [] };
}
