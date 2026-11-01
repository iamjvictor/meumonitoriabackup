import type { PrismaClient } from '@prisma/client';
import type { AuthorizedQuestionRecord } from '../services/chat-question-context.service.js';

type QuestionClient = Pick<PrismaClient, 'question'>;

export class PrismaChatQuestionContextRepository {
  constructor(private readonly database: QuestionClient) {}

  async findAuthorizedQuestion(input: { questionId: string; teacherId: string; monitorId: string; subjectId: string }): Promise<AuthorizedQuestionRecord | null> {
    const question = await this.database.question.findFirst({
      where: {
        id: input.questionId,
        teacherId: input.teacherId,
        monitorId: input.monitorId,
        subjectId: input.subjectId,
        status: 'APPROVED',
      },
      select: {
        id: true,
        topicId: true,
        text: true,
        alternatives: true,
        topic: { select: { name: true } },
        sources: { take: 1, orderBy: [{ confidence: 'desc' }, { createdAt: 'asc' }], select: { documentId: true, documentBlockId: true } },
      },
    });
    if (!question) return null;
    return {
      id: question.id,
      topicId: question.topicId,
      topic: question.topic?.name ?? null,
      statement: question.text,
      alternatives: question.alternatives,
      sourceDocumentId: question.sources[0]?.documentId ?? null,
      sourceBlockId: question.sources[0]?.documentBlockId ?? null,
    };
  }
}
