import { z } from 'zod';
import { createHash } from 'node:crypto';
import { OpenRouterClient, StructuredCompletionError, type ChatMessage } from '../../client/openrouter.client.js';
import type { QuestionGraphContextProvider } from './context.provider.js';
import type { ExtractedQuestionCandidate, QuestionAgentResult, QuestionAlternative, QuestionGraphState } from './state.js';

const LABELS = ['A', 'B', 'C', 'D', 'E'] as const;
const ANSWER_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    answerLabel: { type: 'string', enum: LABELS },
    foundInSource: { type: 'boolean' },
    evidence: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    unresolvedReason: { type: ['string', 'null'] },
  },
  required: ['answerLabel', 'foundInSource', 'evidence', 'confidence', 'unresolvedReason'],
} as const;

const answerSchema = z.object({
  answerLabel: z.enum(LABELS),
  foundInSource: z.boolean(),
  evidence: z.string(),
  confidence: z.number().min(0).max(1),
  unresolvedReason: z.string().nullable(),
});

type AnswerClient = Pick<OpenRouterClient, 'createStructuredChatCompletion'>;

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase().replace(/\s+/g, ' ').trim();
}

function validAlternatives(alternatives: QuestionAlternative[]): boolean {
  return LABELS.every((label) => {
    const matches = alternatives.filter((alternative) => normalize(alternative.label).replace(/[).:]/g, '') === label);
    return matches.length === 1 && Boolean(matches[0]?.text.trim());
  });
}

function hasCompatibleAnswer(answer: string | null | undefined, alternatives: QuestionAlternative[]): boolean {
  const normalizedAnswer = normalize(answer ?? '').replace(/^(?:RESPOSTA|ALTERNATIVA)\s*/, '').replace(/[).:]/g, '').trim();
  if (!normalizedAnswer) return false;
  return alternatives.some((alternative) => normalize(alternative.label).replace(/[).:]/g, '') === normalizedAnswer
    || normalize(alternative.text) === normalizedAnswer);
}

function alternativeVersion(candidate: ExtractedQuestionCandidate, alternatives: QuestionAlternative[]): string {
  return createHash('sha256').update(JSON.stringify({
    base: candidate.contentVersion ?? candidate.originalSnapshot?.contentVersion ?? null,
    alternatives: alternatives.map(({ label, text }) => ({ label, text })),
  })).digest('hex');
}

function answerMessages(input: {
  candidate: ExtractedQuestionCandidate;
  candidateId: string;
  alternatives: QuestionAlternative[];
  contextText: string;
  alternativesVersion: string;
  documentId: string;
  documentVersion: string;
  segment?: NonNullable<QuestionGraphState['segments']>[number];
}): ChatMessage[] {
  const { candidate, candidateId, alternatives, contextText, alternativesVersion, documentId, documentVersion, segment } = input;
  return [{
    role: 'user',
    content: `Determine o gabarito da questão abaixo. Primeiro procure evidência explícita no documento. Só declare foundInSource=true se a evidência recuperada demonstrar a associação entre ESTE caderno/segmento, o número da questão e a letra. Cite literalmente a linha/tabela ou descreva a leitura visual e sua página. Se não encontrar gabarito verificável, resolva a questão pelas alternativas, declare foundInSource=false e registre conflito ou incerteza. Sempre escolha A–E; a questão permanece para revisão humana.\n\nIdentidade da execução: ${candidateId}\nDocumento: ${documentId}\nVersão do documento: ${documentVersion}\nSegmento/caderno: ${segment ? JSON.stringify({ segmentId: segment.segmentId, institution: segment.institution, examName: segment.examName, year: segment.year, modality: segment.modality, version: segment.version }) : candidate.segmentId ?? 'não identificado'}\nNúmero original da questão: ${candidate.number ?? 'não identificado'}\nVersão das alternativas finais: ${alternativesVersion}\n\nEnunciado: ${candidate.statement}\n\nAlternativas finais:\n${alternatives.map(({ label, text }) => `${label}) ${text}`).join('\n')}\n\nContexto recuperado do documento (pode incluir gabaritos de outros segmentos; não misture provas):\n${contextText}`,
  }];
}


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
    content: `A resposta anterior violou o schema JSON exigido ou ficou incompleta. Refazê-la agora. Erro/validação: ${validation}. Retorne um único objeto JSON completo no schema fornecido, com answerLabel obrigatório entre A, B, C, D e E, confidence entre 0 e 1 e todos os campos requeridos. Não retorne texto fora do JSON. Se não houver gabarito no contexto, resolva pelo enunciado e pelas alternativas.`,
  });
  return retryMessages;
}

function verifiedTextEvidence(input: {
  evidence: string;
  answerLabel: string;
  questionNumber?: string | null;
  segmentId?: string | null;
  searchResult?: Awaited<ReturnType<NonNullable<QuestionGraphContextProvider['searchEvidence']>>>;
}) {
  const quote = normalize(input.evidence);
  const number = normalize(input.questionNumber ?? '');
  if (!quote || !number || !input.segmentId || !input.searchResult || input.searchResult.coverage === 'failed') return [];
  const escapedNumber = number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const answerPattern = new RegExp(`(?:quest[aã]o\\s*0*${escapedNumber}|(?<!\\d)0*${escapedNumber})(?:\\s*(?:=|:|[-–])\\s*|\\s+)([A-E])(?=$|[\\s|,;.])`, 'gi');
  return input.searchResult.hits.filter((hit) => {
    if (hit.kind === 'image' || hit.segmentId !== input.segmentId || !hit.excerpt) return false;
    const excerpt = normalize(hit.excerpt);
    // A model citation must be a verbatim subset of this hit. The reverse
    // containment direction would accept invented claims appended to a short hit.
    if (!excerpt.includes(quote)) return false;

    // Do not infer a mapping from a number in one table row and a letter in
    // another. If the retrieved block contains multiple entries for this
    // question number (common when two booklets share a page), its segment
    // association is ambiguous even if one entry happens to match the answer.
    const matches = [...excerpt.matchAll(answerPattern)].map((match) => match[1]?.toUpperCase()).filter(Boolean);
    return matches.length === 1 && matches[0] === input.answerLabel;
  });
}

/**
 * Answer-key node. It refuses to call the model until the final A–E alternatives
 * exist, so a key cannot be attached to a pre-completion set of choices.
 */
export function createQuestionAnswerAgentNode(
  client: AnswerClient,
  contextProvider: QuestionGraphContextProvider,
) {
  return async (state: QuestionGraphState) => {
    const results: Record<string, QuestionAgentResult> = {};
    const errors = [...state.errors];
    for (let index = 0; index < state.candidates.length; index += 1) {
      const candidate = state.candidates[index]!;
      const decision = state.reviewDecisions[index];
      const candidateId = decision?.candidateId ?? candidate.id ?? `${state.documentId}:candidate:${index}`;
      if (state.selectedCandidateId && candidateId !== state.selectedCandidateId) continue;
      const prior = state.agentResults[candidateId] ?? { pendingIssues: [] };
      const alternatives = prior.alternatives ?? candidate.alternatives;
      const answer = prior.correctAnswer ?? candidate.correctAnswer;
      if (!validAlternatives(alternatives)) continue;
      const version = alternativeVersion(candidate, alternatives);
      if (prior.inputVersion === version && hasCompatibleAnswer(answer, alternatives)
        && (prior.evidenceRefs?.length || prior.correctAnswerOrigin === 'AI_GENERATED')
        && !prior.pendingIssues.some((issue) => issue.startsWith('VISUAL_CONTEXT_'))) continue;

      let visualContextIssues: string[] = [];
      try {
        const context = await contextProvider.load(state, candidate);
        visualContextIssues = (context.unresolvedIssues ?? []).map((issue) => `VISUAL_CONTEXT_${issue}`);
        const decision = state.reviewDecisions[index];
        const stableCandidateId = candidate.candidateId ?? decision?.candidateId ?? candidate.id ?? candidateId;
        const segmentId = candidate.segmentId ?? undefined;
        const segment = state.segments?.find((item) => item.segmentId === segmentId);
        const searchResult = contextProvider.searchEvidence
          ? await contextProvider.searchEvidence({ state, candidate, query: `gabarito questão ${candidate.number ?? ''} ${candidate.statement}`, intent: 'answer_key', ...(segmentId ? { segmentId } : {}), cursor: null, limit: 20 })
          : undefined;
        const searchText = searchResult?.hits.map((hit) => `[evidenceId=${hit.evidenceId}; kind=${hit.kind}; page=${hit.pageNumber ?? '?'}; segment=${hit.segmentId ?? '?'}] ${hit.excerpt ?? ''}`).join('\n') ?? '';
        const contextText = [context.text, searchText && `Resultados da ferramenta de busca do documento:\n${searchText}`].filter(Boolean).join('\n\n');
        const messages = answerMessages({ candidate, candidateId: stableCandidateId, alternatives, contextText, alternativesVersion: version, documentId: state.documentId, documentVersion: state.documentVersion, segment });
        const userMessage = messages[0]!;
        const textContent = typeof userMessage.content === 'string'
          ? userMessage.content
          : userMessage.content.map((part) => part.type === 'text' ? part.text : '').filter(Boolean).join('\n');
        userMessage.content = [{ type: 'text', text: textContent }];
        for (const image of context.images) {
          (userMessage.content as Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>).push({ type: 'image_url', image_url: { url: image.dataUrl } });
        }
        let completion: z.infer<typeof answerSchema> | undefined;
        let requestMessages = messages;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            completion = await client.createStructuredChatCompletion({
              model: state.model,
              schemaName: 'question_answer_key',
              schema: ANSWER_SCHEMA,
              messages: requestMessages,
              // Null means the client omits a local max_tokens cap for this call.
              maxTokens: null,
              timeoutMs: null,
              reasoningEffort: 'low',
              temperature: 0,
              requireParameters: true,
              validate: (value) => answerSchema.parse(value),
            });
            break;
          } catch (error) {
            if (attempt === 1 && isCorrectableStructuredFailure(error)) {
              requestMessages = correctiveMessages(messages, error);
              continue;
            }
            throw error;
          }
        }
        if (!completion) throw new Error('Agente de gabarito não retornou resposta estruturada.');

        const selected = alternatives.find(({ label }) => normalize(label).replace(/[).:]/g, '') === completion.answerLabel);
        const verifiedEvidence = completion.foundInSource ? verifiedTextEvidence({
          evidence: completion.evidence,
          answerLabel: completion.answerLabel,
          questionNumber: candidate.number,
          segmentId,
          searchResult,
        }) : [];
        const sourceEvidenceVerified = verifiedEvidence.length > 0;
        const sourceEvidenceMissing = completion.foundInSource && !sourceEvidenceVerified;
        const confidenceSufficient = completion.confidence >= 0.55;
        const answerPendingIssues = [
          ...(!selected ? ['ANSWER_NOT_MATCHING_FINAL_ALTERNATIVE'] : []),
          ...(completion.unresolvedReason ? ['ANSWER_CONTEXT_INSUFFICIENT'] : []),
          ...(!confidenceSufficient ? ['ANSWER_LOW_CONFIDENCE'] : []),
          ...(sourceEvidenceMissing ? ['ANSWER_SOURCE_EVIDENCE_UNVERIFIED'] : []),
          ...visualContextIssues,
        ];
        results[candidateId] = {
          ...prior,
          correctAnswer: selected?.label ?? null,
          correctAnswerOrigin: selected ? (sourceEvidenceVerified ? 'SOURCE_DOCUMENT' : 'AI_GENERATED') : undefined,
          inputVersion: version,
          outputVersion: version,
          evidenceRefs: verifiedEvidence,
          matchedSegmentId: sourceEvidenceVerified ? segmentId : null,
          confidence: completion.confidence,
          conflicts: sourceEvidenceMissing ? ['Modelo declarou origem no documento, mas a busca não confirmou segmento, número e letra.'] : [],
          unresolvedReasons: [completion.unresolvedReason, ...(sourceEvidenceMissing ? ['SOURCE_EVIDENCE_NOT_VERIFIED'] : [])].filter((reason): reason is string => Boolean(reason)),
          pendingIssues: [...prior.pendingIssues.filter((issue) => !issue.startsWith('ANSWER_') && !issue.startsWith('VISUAL_CONTEXT_')), ...answerPendingIssues],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ node: 'answer_agent', code: 'ANSWER_AGENT_FAILED', message });
        results[candidateId] = {
          ...prior,
          correctAnswer: null,
          pendingIssues: [...prior.pendingIssues.filter((issue) => !issue.startsWith('ANSWER_') && !issue.startsWith('VISUAL_CONTEXT_')), 'ANSWER_AGENT_FAILED', ...visualContextIssues],
        };
      }
    }
    return Object.keys(results).length ? { agentResults: results, errors } : {};
  };
}
