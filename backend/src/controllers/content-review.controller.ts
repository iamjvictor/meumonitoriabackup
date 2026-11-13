import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../core/errors/app-error.js';
import { flashcardReviewSchema, manualFlashcardSchema, questionReviewSchema } from '../models/content-review.model.js';
import { createManualFlashcard, createQuestion, listDocumentsForMonitor, listFlashcardsForMonitor, listQuestionsForMonitor, reviewFlashcard, reviewQuestion } from '../repositories/content-review.repository.js';
type Params = { monitorId?: string; questionId?: string; flashcardId?: string };
const questionSchema = questionReviewSchema.extend({ prompt: questionReviewSchema.shape.text }).strict();
const authError = () => new AppError({ code: 'UNAUTHENTICATED', statusCode: 401, publicMessage: 'Sessão de usuário obrigatória.' });
const validationError = (details: unknown) => new AppError({ code: 'VALIDATION_ERROR', statusCode: 422, publicMessage: 'Dados de entrada inválidos.', internalDetails: details });

function questionPayloadValidationError(issues: Array<{ path: PropertyKey[]; code: string; message: string; minimum?: unknown; maximum?: unknown; origin?: string; keys?: string[] }>) {
  const summary = issues.map((issue) => {
    const path = issue.path.map(String).join('.') || issue.keys?.join(', ') || 'dados';
    let reason = issue.message;
    if (issue.code === 'invalid_type') reason = 'tipo de valor inválido';
    else if (issue.code === 'invalid_format') reason = 'formato inválido';
    else if (issue.code === 'too_small') {
      const limit = typeof issue.minimum === 'number' ? issue.minimum : null;
      reason = issue.origin === 'string'
        ? (limit === 1 ? 'é obrigatório' : `deve ter pelo menos ${limit ?? 'o mínimo permitido'} caracteres`)
        : `deve conter pelo menos ${limit ?? 'o mínimo permitido'} itens`;
    } else if (issue.code === 'too_big') {
      const limit = typeof issue.maximum === 'number' ? issue.maximum : null;
      reason = issue.origin === 'string'
        ? `deve ter no máximo ${limit ?? 'o limite permitido'} caracteres`
        : `deve conter no máximo ${limit ?? 'o limite permitido'} itens`;
    } else if (issue.code === 'unrecognized_keys') reason = 'campo não reconhecido';
    return `${path}: ${reason}`;
  });
  return new AppError({
    code: 'VALIDATION_ERROR',
    statusCode: 422,
    publicMessage: `Revise os dados da questão. ${summary.join('; ')}.`,
    internalDetails: issues,
  });
}

const questionReviewDomainMessages: Record<string, string> = {
  QUESTION_TOPIC_NOT_FOUND: 'O tópico selecionado não existe neste monitor.',
  QUESTION_SUBJECT_NOT_FOUND: 'A matéria selecionada não existe neste monitor.',
  QUESTION_REQUIRES_PRIMARY_TOPIC: 'Selecione um tópico principal antes de aprovar a questão.',
  QUESTION_REQUIRES_PROMPT: 'Informe o enunciado da questão antes de salvar.',
  QUESTION_REQUIRES_ANSWER_KEY: 'Selecione um gabarito que corresponda a uma alternativa preenchida.',
  QUESTION_REQUIRES_FIVE_ALTERNATIVES: 'Preencha as cinco alternativas, de A a E, antes de salvar a questão.',
};

function questionReviewDomainError(cause: unknown): AppError | null {
  if (!(cause instanceof Error) || !Object.hasOwn(questionReviewDomainMessages, cause.message)) return null;
  return new AppError({
    code: cause.message,
    statusCode: 422,
    publicMessage: questionReviewDomainMessages[cause.message]!,
    cause,
  });
}

export class ContentReviewController {
  async listQuestions(request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) { if (!request.user) throw authError(); try { return reply.send({ data: await listQuestionsForMonitor(request.user.id, request.params.monitorId!) }); } catch (cause) { throw new AppError({ code: 'FAILED_TO_LIST_QUESTIONS', statusCode: 500, publicMessage: 'Não foi possível listar as questões.', cause }); } }
  async listFlashcards(request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) { if (!request.user) throw authError(); try { return reply.send({ data: await listFlashcardsForMonitor(request.user.id, request.params.monitorId!) }); } catch (cause) { throw new AppError({ code: 'FAILED_TO_LIST_FLASHCARDS', statusCode: 500, publicMessage: 'Não foi possível listar os flashcards.', cause }); } }
  async listDocuments(request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) { if (!request.user) throw authError(); try { return reply.send({ data: await listDocumentsForMonitor(request.user.id, request.params.monitorId!) }); } catch (cause) { throw new AppError({ code: 'FAILED_TO_LIST_DOCUMENTS', statusCode: 500, publicMessage: 'Não foi possível listar os documentos.', cause }); } }
  async createQuestion(request: FastifyRequest<{ Params: Params; Body: unknown }>, reply: FastifyReply) { if (!request.user) throw authError(); const monitorId = request.params.monitorId; if (!monitorId) throw new AppError({ code: 'MISSING_MONITOR_ID', statusCode: 422, publicMessage: 'Identificador do monitor é obrigatório.' }); const parsed = questionSchema.safeParse(request.body); if (!parsed.success) throw validationError(parsed.error.flatten()); const text = parsed.data.text ?? parsed.data.prompt; if (!text) throw new AppError({ code: 'TEXT_REQUIRED', statusCode: 422, publicMessage: 'O enunciado da questão é obrigatório.' }); try { return reply.status(201).send({ data: await createQuestion(request.user.id, monitorId, { ...parsed.data, text }) }); } catch (cause) { throw new AppError({ code: 'FAILED_TO_CREATE_QUESTION', statusCode: 500, publicMessage: 'Não foi possível criar a questão.', cause }); } }
  async createFlashcard(request: FastifyRequest<{ Params: Params; Body: unknown }>, reply: FastifyReply) { if (!request.user) throw authError(); const monitorId = request.params.monitorId; if (!monitorId) throw new AppError({ code: 'MISSING_MONITOR_ID', statusCode: 422, publicMessage: 'Identificador do monitor é obrigatório.' }); const parsed = manualFlashcardSchema.safeParse(request.body); if (!parsed.success) throw validationError(parsed.error.flatten()); try { return reply.status(201).send({ data: await createManualFlashcard(request.user.id, monitorId, parsed.data) }); } catch (cause) { if (cause instanceof Error && ['TEACHER_NOT_FOUND', 'MONITOR_NOT_FOUND', 'TOPIC_NOT_FOUND'].includes(cause.message)) throw new AppError({ code: cause.message, statusCode: 404, publicMessage: cause.message === 'TOPIC_NOT_FOUND' ? 'O tópico não pertence a este monitor.' : 'Monitor não encontrado.' }); if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'P2002') throw new AppError({ code: 'FLASHCARD_ALREADY_EXISTS', statusCode: 409, publicMessage: 'Já existe um flashcard com essa pergunta neste tópico.', cause }); throw new AppError({ code: 'FAILED_TO_CREATE_FLASHCARD', statusCode: 500, publicMessage: 'Não foi possível criar o flashcard.', cause }); } }
  async question(request: FastifyRequest<{ Params: Params; Body: unknown }>, reply: FastifyReply) {
    if (!request.user) throw authError();
    const parsed = questionSchema.safeParse(request.body);
    if (!parsed.success) throw questionPayloadValidationError(parsed.error.issues);
    const questionId = request.params.questionId;
    if (!questionId) throw new AppError({ code: 'MISSING_QUESTION_ID', statusCode: 422, publicMessage: 'Identificador da questão é obrigatório.' });
    const monitorId = request.params.monitorId || null;
    try {
      const result = await reviewQuestion(request.user.id, monitorId, questionId, parsed.data);
      if (!result) throw new AppError({ code: 'QUESTION_NOT_FOUND', statusCode: 404, publicMessage: 'Questão não encontrada.' });
      return reply.send({ data: result });
    } catch (cause) {
      if (cause instanceof AppError) throw cause;
      const domainError = questionReviewDomainError(cause);
      if (domainError) throw domainError;
      request.log.error({
        event: 'content_review.question_update_failed',
        requestId: request.id,
        monitorId,
        questionId,
        err: cause,
      }, 'Falha inesperada ao atualizar a questão');
      throw new AppError({ code: 'FAILED_TO_UPDATE_QUESTION', statusCode: 500, publicMessage: 'Não foi possível atualizar a questão. Tente novamente; se o erro continuar, informe o identificador da solicitação ao suporte.', cause });
    }
  }
  async flashcard(request: FastifyRequest<{ Params: Params; Body: unknown }>, reply: FastifyReply) { if (!request.user) throw authError(); const parsed = flashcardReviewSchema.strict().safeParse(request.body); if (!parsed.success) throw validationError(parsed.error.flatten()); const flashcardId = request.params.flashcardId; if (!flashcardId) throw new AppError({ code: 'MISSING_FLASHCARD_ID', statusCode: 422, publicMessage: 'Identificador do flashcard é obrigatório.' }); const result = await reviewFlashcard(request.user.id, request.params.monitorId || null, flashcardId, parsed.data); if (!result) throw new AppError({ code: 'FLASHCARD_NOT_FOUND', statusCode: 404, publicMessage: 'Flashcard não encontrado.' }); return reply.send({ data: result }); }
}
