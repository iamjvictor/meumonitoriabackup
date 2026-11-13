import { z } from 'zod';
import { createHash } from 'node:crypto';
import { OpenRouterClient, StructuredCompletionError, type ChatMessage } from '../../client/openrouter.client.js';
import type { QuestionGraphContextProvider } from './context.provider.js';
import type { QuestionAlternative, QuestionGraphState, QuestionReviewDecision } from './state.js';

const LABELS = ['A', 'B', 'C', 'D', 'E'] as const;
const alternativeResponseSchema = z.object({
  alternatives: z.array(z.object({
    label: z.enum(LABELS),
    text: z.string().trim().min(1),
    origin: z.enum(['SOURCE_DOCUMENT', 'AI_GENERATED']),
    evidenceQuote: z.string().nullable(),
  }).superRefine((alternative, context) => {
    if (alternative.origin === 'SOURCE_DOCUMENT' && !alternative.evidenceQuote?.trim()) {
      context.addIssue({ code: 'custom', message: `A opção ${alternative.label} da fonte exige evidência literal.` });
    }
    if (alternative.origin === 'AI_GENERATED' && alternative.evidenceQuote !== null) {
      context.addIssue({ code: 'custom', message: `A opção ${alternative.label} gerada por IA não deve declarar evidência da fonte.` });
    }
  })).length(5)
    .superRefine((alternatives, context) => {
      const labels = alternatives.map(({ label }) => label);
      if (new Set(labels).size !== LABELS.length || !LABELS.every((label) => labels.includes(label))) {
        context.addIssue({ code: 'custom', message: 'A lista final deve conter uma alternativa A, B, C, D e E.' });
      }
    }),
  corrections: z.array(z.object({ label: z.enum(LABELS), text: z.string().trim().min(1), evidenceQuote: z.string().trim().min(8) })),
  pendingIssue: z.string().nullable(),
  // Legacy outputs may omit this field; omission is conservatively treated as unusable.
  optionsUsable: z.boolean().optional(),
});
type AlternativeResponse = z.infer<typeof alternativeResponseSchema>;

function isCorrectableStructuredFailure(error: unknown): error is StructuredCompletionError {
  return error instanceof StructuredCompletionError
    && ['INVALID_SCHEMA', 'INVALID_JSON', 'EMPTY_RESPONSE', 'MODEL_OUTPUT_TRUNCATED'].includes(error.code);
}

function correctiveMessages(messages: ChatMessage[], error: StructuredCompletionError): ChatMessage[] {
  const responseContent = error.details.responseContent?.trim();
  const retryMessages = [...messages];
  if (responseContent) retryMessages.push({ role: 'assistant', content: responseContent });
  const validation = error.details.validationError ? JSON.stringify(error.details.validationError) : error.message;
  retryMessages.push({
    role: 'user',
    content: `A resposta anterior violou o schema ou não é JSON válido. Refaça uma única vez. Erro/validação: ${validation}. Retorne um único objeto JSON no schema solicitado, com exatamente cinco alternativas A–E, correções, pendingIssue e optionsUsable booleano explícito. Defina optionsUsable=true somente se todas as cinco opções finais forem legíveis, coerentes e suficientes para resolver esta questão; se não for possível criar opções coerentes ou legíveis, defina false mesmo que o array contenha cinco itens. Para cada alternativa AI_GENERATED, evidenceQuote deve ser null; somente SOURCE_DOCUMENT pode citar evidenceQuote literal existente no contexto. Não declare suporte documental para conteúdo gerado. Preserve as referências válidas da fonte e não invente evidência.`,
  });
  return retryMessages;
}

const alternativeResponseJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    alternatives: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'object', additionalProperties: false, properties: { label: { type: 'string', enum: LABELS }, text: { type: 'string' }, origin: { type: 'string', enum: ['SOURCE_DOCUMENT', 'AI_GENERATED'] }, evidenceQuote: { type: ['string', 'null'] } }, required: ['label', 'text', 'origin', 'evidenceQuote'] } },
    corrections: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { label: { type: 'string', enum: LABELS }, text: { type: 'string' }, evidenceQuote: { type: 'string' } }, required: ['label', 'text', 'evidenceQuote'] } },
    pendingIssue: { type: ['string', 'null'] },
    optionsUsable: { type: 'boolean', description: 'true somente se as cinco opções finais forem legíveis, coerentes e suficientes para resolver a questão; false se alguma não puder ser validada ou completada com segurança.' },
  }, required: ['alternatives', 'corrections', 'pendingIssue', 'optionsUsable'],
} as const;

type AlternativesNodeDependencies = {
  contextProvider: QuestionGraphContextProvider;
  client?: Pick<OpenRouterClient, 'createStructuredChatCompletion'>;
};

function getTargetDecisions(state: QuestionGraphState): QuestionReviewDecision[] {
  const decisions = state.reviewDecisions.filter((decision) => decision.alternativesNeedRepair);
  return state.selectedCandidateId ? decisions.filter(({ candidateId }) => candidateId === state.selectedCandidateId) : decisions;
}

function normalizeCitationText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function alternativesVersion(candidate: QuestionGraphState['candidates'][number], alternatives: QuestionAlternative[]): string {
  return createHash('sha256').update(JSON.stringify({
    base: candidate.contentVersion ?? candidate.originalSnapshot?.contentVersion ?? null,
    alternatives: alternatives.map(({ label, text }) => ({ label, text })),
  })).digest('hex');
}

function withOriginalSnapshot(candidate: QuestionGraphState['candidates'][number]): QuestionGraphState['candidates'][number] {
  if (candidate.originalSnapshot) return candidate;
  const contentVersion = candidate.contentVersion ?? createHash('sha256').update(JSON.stringify({
    statement: candidate.statement,
    alternatives: candidate.alternatives,
    correctAnswer: candidate.correctAnswer,
  })).digest('hex');
  return {
    ...candidate,
    originalSnapshot: {
      statement: candidate.statement,
      alternatives: candidate.alternatives,
      correctAnswer: candidate.correctAnswer,
      contentVersion,
    },
  };
}

function isStandaloneAssertion(value: string): boolean {
  return /^\s*(?:(?:afirma(?:tiva|ção)|proposiç(?:ão|ões)|item)\s+(?:[ivxlcdm]+|\d+)\s*[:.)–-]|[ivxlcdm]{1,5}\s*[.)–-]\s+\S|(?:v|f)\s*[.)–-]\s+\S|(?:verdadeiro|falso)\s*[:.)–-])/iu.test(value);
}

type MarkedContextBlock = { chunkId: string; pageStart: number | null; pageEnd: number | null; text: string };
type RecoveredAssertion = { label: string; text: string; position: 'before' | 'after'; page: number; offset: number };

function parseMarkedContextBlocks(contextText: string): MarkedContextBlock[] {
  const header = /^\[páginas\s+(\d+|\?)-(\d+|\?);\s*chunk\s+([^\]\s]+)\]\s*$/gimu;
  const matches = [...contextText.matchAll(header)];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? contextText.length;
    const pageStart = Number(match[1]);
    const pageEnd = Number(match[2]);
    return {
      chunkId: match[3]!,
      pageStart: Number.isFinite(pageStart) ? pageStart : null,
      pageEnd: Number.isFinite(pageEnd) ? pageEnd : null,
      text: contextText.slice(start, end).trim(),
    };
  });
}

function normalizedOccurrences(haystack: string, needle: string): number[] {
  const source = normalizeCitationText(haystack).toLocaleLowerCase();
  const target = normalizeCitationText(needle).toLocaleLowerCase();
  if (!target) return [];
  const positions: number[] = [];
  let offset = 0;
  while (offset <= source.length - target.length) {
    const index = source.indexOf(target, offset);
    if (index < 0) break;
    positions.push(index);
    offset = index + target.length;
  }
  return positions;
}

function referenceIdMatches(reference: string, chunkId: string): boolean {
  return reference === chunkId || reference === `chunk:${chunkId}`;
}

function recoverCandidateAssertions(input: {
  assertions: QuestionAlternative[];
  statement: string;
  contextText: string;
  state: QuestionGraphState;
  candidate: QuestionGraphState['candidates'][number];
}): { recovered: RecoveredAssertion[]; contextUnverifiedLabels: string[]; positionUnverifiedLabels: string[] } {
  const blocks = parseMarkedContextBlocks(input.contextText);
  const sourceRefs = new Set([
    ...input.candidate.sourceChunkIds,
    ...(input.candidate.sourceRefs?.chunkIds ?? []),
    ...(input.candidate.sourceRefs?.evidenceRefs ?? []),
  ]);
  const segment = input.candidate.segmentId ? input.state.segments?.find(({ segmentId }) => segmentId === input.candidate.segmentId) : undefined;
  const recovered: RecoveredAssertion[] = [];
  const contextUnverifiedLabels: string[] = [];
  const positionUnverifiedLabels: string[] = [];

  for (const assertion of input.assertions) {
    const occurrences = blocks.filter((block) => normalizedOccurrences(block.text, assertion.text).length > 0);
    const candidateBlocks = blocks.filter((block) => {
      if (![...sourceRefs].some((reference) => referenceIdMatches(reference, block.chunkId))) return false;
      if (!input.candidate.segmentId || !segment) return false;
      if (!segment.evidenceRefs.some((reference) => referenceIdMatches(reference, block.chunkId))) return false;
      if (segment.pageStart === null || segment.pageEnd === null || block.pageStart === null || block.pageEnd === null) return false;
      if (block.pageStart < segment.pageStart || block.pageEnd > segment.pageEnd) return false;
      return !input.state.segments?.some((other) => other.segmentId !== segment.segmentId
        && other.pageStart !== null && other.pageEnd !== null
        && block.pageStart! <= other.pageEnd && block.pageEnd! >= other.pageStart);
    });
    const hasCandidateLocalSource = candidateBlocks.some((block) => normalizedOccurrences(block.text, assertion.text).length > 0);
    const otherSegmentOccurrence = occurrences.some((block) => input.state.segments?.some((other) => {
      if (other.segmentId === input.candidate.segmentId) return false;
      return other.evidenceRefs.some((reference) => referenceIdMatches(reference, block.chunkId));
    }));
    if (!hasCandidateLocalSource && otherSegmentOccurrence) {
      contextUnverifiedLabels.push(assertion.label.trim().toUpperCase());
      continue;
    }
    const anchoredBlocks = candidateBlocks.flatMap((block) => {
      const assertionPositions = normalizedOccurrences(block.text, assertion.text);
      const statementPositions = normalizedOccurrences(block.text, input.statement);
      if (assertionPositions.length !== 1 || statementPositions.length !== 1 || assertionPositions[0] === statementPositions[0]) return [];
      return [{ block, assertionOffset: assertionPositions[0]!, statementOffset: statementPositions[0]! }];
    });
    if (anchoredBlocks.length !== 1) {
      positionUnverifiedLabels.push(assertion.label.trim().toUpperCase());
      continue;
    }
    const { block, assertionOffset, statementOffset } = anchoredBlocks[0]!;
    recovered.push({
      label: assertion.label.trim().toUpperCase(),
      text: assertion.text,
      position: assertionOffset < statementOffset ? 'before' : 'after',
      page: block.pageStart!,
      offset: assertionOffset,
    });
  }

  return { recovered: recovered.sort((left, right) => left.page - right.page || left.offset - right.offset), contextUnverifiedLabels, positionUnverifiedLabels };
}

function insertRecoveredAssertions(statement: string, assertions: RecoveredAssertion[]): string {
  const before = assertions.filter(({ position }) => position === 'before').map(({ text }) => text.trim());
  const after = assertions.filter(({ position }) => position === 'after').map(({ text }) => text.trim());
  return [...before, statement.trim(), ...after].filter(Boolean).join('\n');
}

function mergeAlternatives(
  existing: QuestionAlternative[],
  response: AlternativeResponse,
  sourceText: string,
  state: QuestionGraphState,
  candidate: QuestionGraphState['candidates'][number],
): { alternatives: QuestionAlternative[]; unresolvedLabels: string[]; rejectedCorrectionLabels: string[]; contextUnverifiedAssertionLabels: string[]; positionUnverifiedAssertionLabels: string[]; recoveredAssertions: RecoveredAssertion[]; statement: string; changed: boolean; generatedContent: boolean; requiresAnswerRefresh: boolean } {
  const alternativesByLabel = new Map<string, QuestionAlternative>();
  for (const alternative of existing) {
    const label = alternative.label.trim().toUpperCase();
    if (LABELS.includes(label as typeof LABELS[number]) && !alternativesByLabel.has(label)) {
      alternativesByLabel.set(label, { label, text: alternative.text });
    }
  }
  let changed = false;
  let generatedContent = false;
  let requiresAnswerRefresh = false;
  const rejectedCorrectionLabels: string[] = [];
  const normalizedSourceText = normalizeCitationText(sourceText);
  const existingLabels = existing.map(({ label }) => label.trim().toUpperCase());
  if (new Set(existingLabels).size !== existingLabels.length) requiresAnswerRefresh = true;

  for (const alternative of response.alternatives) {
    const normalizedEvidenceQuote = alternative.evidenceQuote ? normalizeCitationText(alternative.evidenceQuote) : '';
    const normalizedAlternativeText = normalizeCitationText(alternative.text);
    const evidenceValid = alternative.origin === 'AI_GENERATED'
      || Boolean(normalizedEvidenceQuote && normalizedSourceText.includes(normalizedEvidenceQuote) && normalizedEvidenceQuote.includes(normalizedAlternativeText));
    const current = alternativesByLabel.get(alternative.label);
    if (!evidenceValid) {
      rejectedCorrectionLabels.push(alternative.label);
      continue;
    }
    if (!current) {
      alternativesByLabel.set(alternative.label, { label: alternative.label, text: alternative.text });
      changed = true;
      if (alternative.origin === 'AI_GENERATED') generatedContent = true;
    } else if (current.text !== alternative.text) {
      // The per-option evidence is authoritative for SOURCE_DOCUMENT. The
      // corrections list may describe OCR/layout reconciliation separately.
      // AI_GENERATED remains explicitly generated and is never treated as
      // source-supported evidence.
      if (evidenceValid) {
        current.text = alternative.text;
        changed = true;
        requiresAnswerRefresh = true;
        if (alternative.origin === 'AI_GENERATED') generatedContent = true;
      } else {
        // Never silently discard a proposed correction. The old text may be
        // structurally invalid (for example, an assertion mistaken for an
        // answer choice), so retaining it cannot count as a successful repair.
        rejectedCorrectionLabels.push(alternative.label);
      }
    }
  }
  const ordered = LABELS.flatMap((label) => {
    const alternative = alternativesByLabel.get(label);
    return alternative?.text.trim() ? [alternative] : [];
  });
  const unresolvedLabels = LABELS.filter((label) => !ordered.some((alternative) => alternative.label === label));
  const assertionsMissingFromResult = existing
    .filter((alternative) => isStandaloneAssertion(alternative.text))
    .filter((alternative) => {
      const assertion = normalizeCitationText(alternative.text);
      return !normalizeCitationText(candidate.statement).includes(assertion) && !ordered.some((finalAlternative) => normalizeCitationText(finalAlternative.text).includes(assertion));
    });
  const assertionRecovery = recoverCandidateAssertions({ assertions: assertionsMissingFromResult, statement: candidate.statement, contextText: sourceText, state, candidate });
  const updatedStatement = insertRecoveredAssertions(candidate.statement, assertionRecovery.recovered);
  if (updatedStatement !== candidate.statement) requiresAnswerRefresh = true;
  if (existing.length !== ordered.length || existing.some((alternative, index) => alternative.label.trim().toUpperCase() !== ordered[index]?.label)) changed = true;
  // A correction that references no final choice is also a malformed repair
  // attempt and must remain visible to the reviewer.
  for (const correction of response.corrections) {
    if (!response.alternatives.some((alternative) => alternative.label === correction.label)) rejectedCorrectionLabels.push(correction.label);
  }
  return {
    alternatives: ordered,
    unresolvedLabels,
    changed,
    generatedContent,
    requiresAnswerRefresh,
    rejectedCorrectionLabels,
    contextUnverifiedAssertionLabels: assertionRecovery.contextUnverifiedLabels,
    positionUnverifiedAssertionLabels: assertionRecovery.positionUnverifiedLabels,
    recoveredAssertions: assertionRecovery.recovered,
    statement: updatedStatement,
  };
}

function createMessages(input: {
  statement: string; existing: QuestionAlternative[]; contextText: string;
  images: Array<{ assetId: string; pageNumber: number; dataUrl: string }>;
}): ChatMessage[] {
  const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [{
    type: 'text',
    text: [
      `Enunciado:\n${input.statement}`,
      `Alternativas extraídas (podem conter opções ausentes, duplicadas ou excesso de rótulos):\n${JSON.stringify(input.existing)}`,
      `Contexto extraído do documento (texto OCR/Docling):\n${input.contextText}`,
      'Retorne a lista FINAL completa com exatamente cinco alternativas, uma para cada rótulo A, B, C, D e E, sem rótulos extras. Para cada opção, declare origin SOURCE_DOCUMENT ou AI_GENERATED. Opções SOURCE_DOCUMENT exigem evidenceQuote literal que contenha o texto completo da opção e apareça no contexto; opções sem esse suporte devem permanecer pendentes ou ser recriadas como AI_GENERATED. Para toda opção AI_GENERATED, evidenceQuote deve ser exatamente null; nunca inclua citação, explicação ou trecho nesse campo. Não classifique afirmações I/II/III, tópicos, itens de verdadeiro/falso ou frases do enunciado como opções da fonte sem evidência de que são uma escolha de resposta. Preserve literalmente opções A–E existentes quando forem escolhas válidas sustentadas pelo contexto; remova opções fora de A–E e corrija entradas que sejam afirmações isoladas do enunciado, não alternativas. Se a questão enumera afirmações I, II, III, mantenha-as como conteúdo do enunciado e use como opções somente as combinações/julgamentos A–E. Para opções realmente ausentes, gere opções plausíveis e pedagogicamente coerentes. Se substituir texto de uma opção existente, inclua também em corrections uma evidenceQuote literal do contexto que sustente a correção. Não informe gabarito. Informe optionsUsable=true somente se todas as cinco opções forem legíveis, coerentes e suficientes para resolver a questão; informe false se alguma opção não puder ser criada ou validada com segurança, ainda que o array final tenha cinco itens. Se não for possível completar cinco opções coerentes, ainda retorne somente A–E e explique a limitação em pendingIssue.',
      'As imagens anexadas pertencem ao contexto da questão; use-as quando forem necessárias para entender o enunciado ou suas opções.',
    ].join('\n\n'),
  }];
  for (const image of input.images) content.push({ type: 'text', text: `Figura de contexto assetId=${image.assetId}, página=${image.pageNumber}.` }, { type: 'image_url', image_url: { url: image.dataUrl } });
  return [
    { role: 'system', content: 'Você normaliza as alternativas de uma questão para revisão de professor. Sua saída tem exatamente cinco opções A–E. Preserve opções válidas da fonte; não confunda afirmações do enunciado com opções. Informe optionsUsable explicitamente: true somente para cinco opções legíveis, coerentes e suficientes para resolver a questão; false se isso não for garantido. Se origin=AI_GENERATED, evidenceQuote deve ser null; citações são exclusivas de SOURCE_DOCUMENT e devem ser literais. Não produza gabarito.' },
    { role: 'user', content },
  ];
}

export function createAlternativesAgentNode(dependencies: AlternativesNodeDependencies) {
  const client = dependencies.client ?? new OpenRouterClient();
  return async (state: QuestionGraphState): Promise<Partial<QuestionGraphState>> => {
    const targeted = getTargetDecisions(state);
    if (!targeted.length) return {};

    const candidates = [...state.candidates];
    const agentResults: NonNullable<QuestionGraphState['agentResults']> = {};
    const errors = [...state.errors];
    for (const decision of targeted) {
      const index = state.candidates.findIndex((_, candidateIndex) => state.reviewDecisions[candidateIndex]?.candidateId === decision.candidateId);
      if (index < 0) continue;
      const candidate = state.candidates[index]!;
      let visualContextIssues: string[] = [];
      try {
        const versionedCandidate = withOriginalSnapshot(candidate);
        const inputVersion = alternativesVersion(versionedCandidate, candidate.alternatives);
        const context = await dependencies.contextProvider.load(state, candidate);
        visualContextIssues = (context.unresolvedIssues ?? []).map((issue) => `VISUAL_CONTEXT_${issue}`);
        const messages = createMessages({ statement: candidate.statement, existing: candidate.alternatives, contextText: context.text, images: context.images });
        let parsedData: AlternativeResponse | undefined;
        let requestMessages = messages;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            const raw = await client.createStructuredChatCompletion<unknown>({
              model: state.model,
              schemaName: 'question_alternatives_completion',
              schema: alternativeResponseJsonSchema,
              messages: requestMessages,
              temperature: 0,
              // Null removes the backend output cap; the model/provider still owns its maximum.
              maxTokens: null,
              timeoutMs: null,
              reasoningEffort: 'low',
              requireParameters: true,
              validate: (value) => alternativeResponseSchema.parse(value),
            });
            try {
              parsedData = alternativeResponseSchema.parse(raw);
            } catch (error) {
              throw new StructuredCompletionError('INVALID_SCHEMA', 'OpenRouter retornou uma resposta que não atende ao schema local.', {
                model: state.model,
                validationError: error,
                responseContent: JSON.stringify(raw).slice(0, 4_000),
              });
            }
            break;
          } catch (error) {
            if (attempt === 1 && isCorrectableStructuredFailure(error)) {
              requestMessages = correctiveMessages(messages, error);
              continue;
            }
            throw error;
          }
        }
        if (!parsedData) throw new Error('Agente de alternativas não retornou saída estruturada válida.');
        const merged = mergeAlternatives(candidate.alternatives, parsedData, context.text, state, candidate);
        const statementChanged = merged.statement !== candidate.statement;
        const outputCandidate = statementChanged
          ? {
            ...versionedCandidate,
            contentVersion: createHash('sha256').update(JSON.stringify({
              base: versionedCandidate.contentVersion ?? versionedCandidate.originalSnapshot?.contentVersion ?? null,
              statement: merged.statement,
              alternatives: merged.alternatives,
            })).digest('hex'),
          }
          : versionedCandidate;
        const outputVersion = alternativesVersion(outputCandidate, merged.alternatives);
        candidates[index] = {
          ...outputCandidate,
          statement: merged.statement,
          alternatives: merged.alternatives,
          ...(merged.requiresAnswerRefresh ? { correctAnswer: null } : {}),
        };
        const previousIssues = state.agentResults?.[decision.candidateId]?.pendingIssues ?? [];
        const hasExactlyFiveAlternatives = merged.alternatives.length === LABELS.length
          && LABELS.every((label) => merged.alternatives.filter((alternative) => alternative.label === label && alternative.text.trim()).length === 1);
        const optionsUsable = parsedData.optionsUsable === true && hasExactlyFiveAlternatives && merged.unresolvedLabels.length === 0;
        const incompleteIssue = optionsUsable ? [] : ['ALTERNATIVES_AGENT_INCOMPLETE'];
        const contentReviewIssues = parsedData.pendingIssue
          ? ['ALTERNATIVES_CONTENT_REQUIRES_TEACHER_REVIEW', parsedData.pendingIssue]
          : [];
        const correctionIssues = merged.rejectedCorrectionLabels.length
          ? ['ALTERNATIVES_AGENT_UNVERIFIED_CORRECTION', ...merged.rejectedCorrectionLabels.map((label) => `Correção da alternativa ${label} sem evidência literal válida.`)]
          : [];
        const assertionContextIssues = merged.contextUnverifiedAssertionLabels.length
          ? ['ALTERNATIVES_AGENT_ASSERTION_CONTEXT_UNVERIFIED', ...merged.contextUnverifiedAssertionLabels.map((label) => `Afirmação extraída junto à opção ${label} aparece fora das referências autorizadas da candidata.`)]
          : [];
        const assertionPositionIssues = merged.positionUnverifiedAssertionLabels.length
          ? ['ALTERNATIVES_AGENT_ASSERTION_POSITION_UNVERIFIED', ...merged.positionUnverifiedAssertionLabels.map((label) => `Afirmação extraída junto à opção ${label} não tem âncora de ordem comprovada no chunk da candidata.`)]
          : [];
        const origin = merged.generatedContent || state.agentResults?.[decision.candidateId]?.alternativesOrigin === 'AI_GENERATED'
          ? 'AI_GENERATED' as const
          : 'SOURCE_DOCUMENT' as const;
        const change = merged.changed ? [{
          field: 'alternatives' as const,
          origin: merged.generatedContent ? 'AI_GENERATED' as const : 'SOURCE_DOCUMENT' as const,
          beforeVersion: inputVersion,
          afterVersion: outputVersion,
          evidenceRefs: merged.generatedContent ? [] : (candidate.sourceRefs?.evidenceRefs.length ? candidate.sourceRefs.evidenceRefs : candidate.sourceRefs?.chunkIds ?? candidate.sourceChunkIds),
        }] : [];
        const statementChange = statementChanged ? [{
          field: 'statement' as const,
          origin: 'SOURCE_DOCUMENT' as const,
          beforeVersion: inputVersion,
          afterVersion: outputVersion,
          evidenceRefs: candidate.sourceRefs?.evidenceRefs.length ? candidate.sourceRefs.evidenceRefs : candidate.sourceRefs?.chunkIds ?? candidate.sourceChunkIds,
        }] : [];
        agentResults[decision.candidateId] = {
          ...state.agentResults?.[decision.candidateId],
          alternatives: merged.alternatives,
          alternativesOrigin: origin,
          inputVersion,
          outputVersion,
          changes: [...(state.agentResults?.[decision.candidateId]?.changes ?? []), ...statementChange, ...change],
          ...(merged.requiresAnswerRefresh ? { correctAnswer: null, correctAnswerOrigin: undefined } : {}),
          pendingIssues: [...new Set([
            ...previousIssues.filter((issue) => issue !== 'ALTERNATIVES_AGENT_INCOMPLETE'
              && issue !== 'ALTERNATIVES_AGENT_UNVERIFIED_CORRECTION'
              && issue !== 'ALTERNATIVES_AGENT_ASSERTIONS_NOT_PRESERVED'
              && issue !== 'ALTERNATIVES_AGENT_ASSERTION_CONTEXT_UNVERIFIED'
              && issue !== 'ALTERNATIVES_AGENT_ASSERTION_POSITION_UNVERIFIED'
              && !issue.startsWith('VISUAL_CONTEXT_')
              && !/^Correção da alternativa [A-E] sem evidência literal válida\.$/.test(issue)
              && !/^Afirmação extraída junto à opção [A-E] não foi localizada no enunciado nem nas alternativas finais\.$/.test(issue)
              && !/^Afirmação extraída junto à opção [A-E] aparece fora das referências autorizadas da candidata\.$/.test(issue)
              && !/^Afirmação extraída junto à opção [A-E] não tem âncora de ordem comprovada no chunk da candidata\.$/.test(issue)),
            ...incompleteIssue,
            ...contentReviewIssues,
            ...correctionIssues,
            ...assertionContextIssues,
            ...assertionPositionIssues,
            ...visualContextIssues,
          ])],
        };
      } catch (error) {
        errors.push({ node: 'alternatives_agent', code: 'ALTERNATIVES_AGENT_FAILED', message: error instanceof Error ? error.message : String(error) });
        agentResults[decision.candidateId] = {
          ...state.agentResults?.[decision.candidateId],
          alternatives: candidate.alternatives,
          pendingIssues: [...new Set([...(state.agentResults?.[decision.candidateId]?.pendingIssues ?? []).filter((issue) => !issue.startsWith('VISUAL_CONTEXT_')), 'ALTERNATIVES_AGENT_FAILED', ...visualContextIssues])],
        };
      }
    }
    return { candidates, agentResults, errors };
  };
}
