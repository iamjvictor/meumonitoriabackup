import type { AuthorizedQuestionContext } from '../models/chat-generation.model.js';

export type ChatQuestionScope = { studentId: string; teacherId: string; monitorId: string; subjectId: string };
export type AuthorizedQuestionRecord = {
  id: string;
  topicId: string | null;
  topic: string | null;
  statement: string;
  alternatives: unknown;
  sourceDocumentId: string | null;
  sourceBlockId: string | null;
};

export type ChatQuestionAttemptIdentity = {
  studentId: string;
  questionId: string;
  monitorId: string;
  selectedAnswer: string | null;
};

export function isChatQuestionAttemptAuthorized(input: {
  attempt: ChatQuestionAttemptIdentity | null | undefined;
  studentId: string;
  questionId: string;
  monitorId: string;
}): boolean {
  return Boolean(input.attempt
    && input.attempt.studentId === input.studentId
    && input.attempt.questionId === input.questionId
    && input.attempt.monitorId === input.monitorId);
}

export function resolveChatSelectedOption(input: {
  attempt: ChatQuestionAttemptIdentity | null | undefined;
  requestedOption?: string | null;
}): string | null {
  return input.attempt?.selectedAnswer ?? input.requestedOption ?? null;
}

export class ChatQuestionContextService {
  constructor(private readonly repository: {
    findAuthorizedQuestion(input: { questionId: string; teacherId: string; monitorId: string; subjectId: string }): Promise<AuthorizedQuestionRecord | null>;
  }) {}

  async load(input: {
    questionId: string;
    attemptId?: string | null;
    number?: number | null;
    topicId?: string | null;
    topic?: string | null;
    selectedOption?: string | null;
    scope: ChatQuestionScope;
  }): Promise<AuthorizedQuestionContext | null> {
    const question = await this.repository.findAuthorizedQuestion({
      questionId: input.questionId,
      teacherId: input.scope.teacherId,
      monitorId: input.scope.monitorId,
      subjectId: input.scope.subjectId,
    });
    if (!question) return null;
    return {
      questionId: question.id,
      questionAttemptId: input.attemptId ?? null,
      monitorId: input.scope.monitorId,
      subjectId: input.scope.subjectId,
      topicId: question.topicId ?? input.topicId ?? null,
      number: input.number ?? null,
      topic: input.topic ?? question.topic ?? null,
      statement: question.statement,
      options: normalizeAlternatives(question.alternatives),
      selectedOption: input.selectedOption ?? null,
      sourceDocumentId: question.sourceDocumentId,
      sourceBlockId: question.sourceBlockId,
    };
  }
}

function normalizeAlternatives(value: unknown): Array<{ label: string; text: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const alternative = item as { label?: unknown; text?: unknown };
    return typeof alternative.label === 'string' && typeof alternative.text === 'string'
      ? [{ label: alternative.label, text: alternative.text }]
      : [];
  });
}
