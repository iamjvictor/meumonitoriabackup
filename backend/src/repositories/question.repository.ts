import { prisma } from '../lib/prisma.js';
import { acquireDocumentAdvisoryLocks } from './document-advisory-lock.js';
import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';

const RETRYABLE_PRISMA_CODES = new Set(['P2024', 'P2028', 'P2034']);

async function withPrismaRetry<T>(operation: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const candidate = error as { code?: string; message?: string; meta?: { modelName?: string } };
      const retryable = RETRYABLE_PRISMA_CODES.has(candidate.code ?? '')
        || (candidate.code === 'P2002' && candidate.meta?.modelName === 'Question')
        || /Unable to start a transaction|expired transaction/i.test(candidate.message ?? '');
      if (!retryable || attempt === maxAttempts) throw error;

      const delayMs = 250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      console.log('Persistencia de questao sera repetida apos falha transitoria do Prisma', {
        event: 'monitor.question_persistence_retry_scheduled',
        attempt,
        maxAttempts,
        delayMs,
        prismaCode: candidate.code ?? null,
      });
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

type QuestionSourceInput = {
  chunkId: string;
  documentId?: string | null;
  documentBlockId?: string | null;
  role?: 'STATEMENT' | 'ALTERNATIVE' | 'ANSWER_KEY' | 'EXPLANATION' | 'CATEGORY_CONTEXT' | 'CONTEXT';
  pageStart?: number | null;
  pageEnd?: number | null;
  charStartInChunk?: number | null;
  charEndInChunk?: number | null;
  excerpt?: string | null;
  confidence?: number | null;
};

type QuestionAiGenerationInput = {
  generationType: 'ALTERNATIVES' | 'CORRECT_ANSWER' | 'EXPLANATION' | 'CATEGORY' | 'CORRECTION' | 'NORMALIZATION' | 'DIFFICULTY' | 'FULL_ENRICHMENT';
  model: string;
  promptVersion?: string | null;
  inputSnapshot: Prisma.InputJsonValue;
  outputSnapshot: Prisma.InputJsonValue;
  confidence?: number | null;
};

export async function findQuestionContext(topicId: string) {
  return prisma.monitorTopic.findUnique({
    where: { id: topicId },
    select: {
      id: true,
      subjectId: true,
      subject: {
        select: {
          monitorId: true,
          monitor: { select: { teacherId: true } },
        },
      },
    },
  });
}

export async function findQuestionExtractionData(documentId: string) {
  const document = await prisma.monitorDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      topicId: true,
      textExtractions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          pages: {
            select: { pageNumber: true, hasImages: true },
          },
        },
      },
      topicLinks: {
        select: {
          topic: {
            select: {
              id: true,
              name: true,
              definition: true,
              classificationGuidance: true,
              aiDefinition: true,
              aiClassificationGuidance: true,
            },
          },
        },
      },
      chunks: {
        // Question extraction can proceed with chunks whose embeddings are
        // pending. Vector readiness is not a prerequisite for parsing.
        where: { status: { in: ['READY', 'EMBEDDING_PENDING'] } },
        select: {
          id: true,
          documentId: true,
          chunkIndex: true,
          blockId: true,
          content: true,
          provenance: true,
          charStart: true,
          charEnd: true,
          block: { select: { pageStart: true, pageEnd: true } },
        },
        orderBy: { chunkIndex: 'asc' },
      },
      blocks: {
        // Incomplete question blocks are evidence for AI reconstruction. They
        // must remain available alongside their persisted chunks.
        where: { status: { not: 'FAILED' } },
        select: {
          id: true,
          blockIndex: true,
          type: true,
          title: true,
          normalizedContent: true,
          questionNumber: true,
          institution: true,
          examYear: true,
          pageStart: true,
          pageEnd: true,
          topicLinks: {
            where: { status: 'CLASSIFIED', topicId: { not: null } },
            select: {
              topicId: true,
              confidence: true,
              isPrimary: true,
            },
          },
          chunks: { select: { id: true, chunkIndex: true } },
        },
        orderBy: { blockIndex: 'asc' },
      },
    },
  });

  if (!document) return null;

  const pages = document.textExtractions[0]?.pages ?? [];
  const imagePages = new Set(pages.filter((page) => page.hasImages === true).map((page) => page.pageNumber));
  const chunks = document.chunks.map((chunk) => {
    const start = chunk.block?.pageStart;
    const end = chunk.block?.pageEnd ?? start;
    const pageHasImages = start !== null && start !== undefined && end !== null && end !== undefined
      ? Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index).some((page) => imagePages.has(page))
      : null;
    return { ...chunk, pageHasImages };
  });

  return { ...document, chunks };
}

export async function removeUnreviewedQuestionsForDocument(documentId: string) {
  return prisma.question.deleteMany({
    where: {
      status: 'PENDING_REVIEW',
      reviewedAt: null,
      sources: { some: { documentId } },
    },
  });
}

export async function findPendingQuestionForCompletion(
  sourceKey: string,
  source?: { documentId: string; documentBlockId: string | null },
) {
  const select = {
    id: true,
    text: true,
    status: true,
    reviewedAt: true,
    alternatives: true,
    correctAnswer: true,
    explanation: true,
    completenessStatus: true,
  } as const;
  const question = await prisma.question.findFirst({
    where: {
      OR: [
        { sourceKey },
        ...(source?.documentBlockId
          ? [{ sources: { some: { documentId: source.documentId, documentBlockId: source.documentBlockId } } }]
          : []),
      ],
    },
    select,
  });
  return question?.status === 'PENDING_REVIEW' && !question.reviewedAt
    ? question
    : null;
}

export async function findQuestionByTextHash(topicId: string | null, textHash: string) {
  if (!topicId) {
    return prisma.question.findFirst({
      where: { topicId: null, textHash },
      select: { id: true },
    });
  }
  return prisma.question.findUnique({
    where: { topicId_textHash: { topicId, textHash } },
    select: { id: true },
  });
}

export async function findSimilarQuestionByEmbedding(
  topicId: string | null,
  embedding: number[],
  threshold = 0.95,
) {
  if (!topicId) return null;
  const rows = await prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
    SELECT
      q.id,
      1 - (
        q.embedding::extensions.halfvec(2048)
        <=> ${JSON.stringify(embedding)}::extensions.halfvec(2048)
      ) AS similarity
    FROM questions q
    WHERE q.topic_id = ${topicId}::uuid
      AND q.embedding IS NOT NULL
      AND q.status <> 'REJECTED'::"QuestionStatus"
      AND 1 - (
        q.embedding::extensions.halfvec(2048)
        <=> ${JSON.stringify(embedding)}::extensions.halfvec(2048)
      ) >= ${threshold}
    ORDER BY q.embedding::extensions.halfvec(2048)
      <=> ${JSON.stringify(embedding)}::extensions.halfvec(2048)
    LIMIT 1
  `;

  return rows[0] || null;
}

export async function findDocumentRagContextForQuestionAnswer(
  documentId: string,
  queryEmbedding: number[],
  limit = 8,
) {
  return prisma.$queryRaw<Array<{ id: string; chunkIndex: number; content: string; similarity: number }>>`
    SELECT
      dc.id,
      dc.chunk_index AS "chunkIndex",
      dc.content,
      1 - (
        dc.embedding::extensions.halfvec(2048)
        <=> ${JSON.stringify(queryEmbedding)}::extensions.halfvec(2048)
      ) AS similarity
    FROM document_chunks dc
    JOIN monitor_documents d ON d.id = dc.document_id
    WHERE dc.document_id = ${documentId}::uuid
      AND dc.status = 'READY'::"ChunkStatus"
      AND dc.embedding IS NOT NULL
      AND ((d.active_generation_id IS NULL AND dc.generation_id IS NULL) OR dc.generation_id = d.active_generation_id)
      AND (d.active_generation_id IS NULL OR dc.embedding_model = ${env.OPENROUTER_EMBEDDING_MODEL})
    ORDER BY dc.embedding::extensions.halfvec(2048)
      <=> ${JSON.stringify(queryEmbedding)}::extensions.halfvec(2048)
    LIMIT ${limit}
  `;
}

export async function saveQuestion(input: {
  teacherId: string;
  monitorId: string;
  subjectId: string;
  topicId: string | null;
  relatedTopics?: Array<{ topicId: string; confidence: number }>;
  text: string;
  alternatives: Array<{ label: string; text: string }>;
  kind: 'OPEN_ENDED' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'UNKNOWN';
  statementOrigin?: 'SOURCE_DOCUMENT' | 'RECONSTRUCTED_FROM_DOCUMENT' | 'AI_GENERATED' | 'TEACHER_EDITED' | 'TEACHER_CREATED';
  statementConfidence?: number | null;
  alternativesOrigin?: 'SOURCE_DOCUMENT' | 'RECONSTRUCTED_FROM_DOCUMENT' | 'AI_GENERATED' | 'TEACHER_EDITED' | 'TEACHER_CREATED' | null;
  alternativesConfidence?: number | null;
  correctAnswer: string | null;
  correctAnswerOrigin?: 'SOURCE_DOCUMENT' | 'EXTERNAL_SOURCE' | 'TEACHER' | 'AI_GENERATED';
  correctAnswerConfidence?: number | null;
  explanation: string | null;
  explanationOrigin?: 'SOURCE_DOCUMENT' | 'EXTERNAL_SOURCE' | 'TEACHER' | 'AI_GENERATED';
  explanationConfidence?: number | null;
  completenessStatus?: 'COMPLETE_FROM_SOURCE' | 'COMPLETE_WITH_EXTERNAL_ANSWER' | 'COMPLETE_WITH_AI' | 'MISSING_ALTERNATIVES' | 'MISSING_ANSWER' | 'MISSING_EXPLANATION' | 'INVALID_FRAGMENT';
  qualityScore?: number | null;
  needsReview?: boolean;
  textHash: string;
  sourceKey: string;
  metadata?: Record<string, unknown>;
  sourceChunkIds: string[];
  sources?: QuestionSourceInput[];
  aiGenerations?: QuestionAiGenerationInput[];
  embedding?: number[];
  embeddingModel?: string;
  embeddingVersion?: string;
}) {
  return withPrismaRetry(() => prisma.$transaction(async (transaction) => {
    const sourceChunkIds = Array.from(new Set([
      ...input.sourceChunkIds,
      ...(input.sources ?? []).map((source) => source.chunkId),
    ]));
    const sourceChunks = sourceChunkIds.length
      ? await transaction.documentChunk.findMany({
        where: { id: { in: sourceChunkIds } },
        select: { documentId: true },
      })
      : [];
    const documentIds = Array.from(new Set([
      ...(input.sources ?? []).map((source) => source.documentId).filter((id): id is string => Boolean(id)),
      ...sourceChunks.map((chunk: { documentId: string }) => chunk.documentId),
    ]));
    const questionExtractionOrdinal = typeof input.metadata?.questionExtractionOrdinal === 'number'
      ? input.metadata.questionExtractionOrdinal
      : null;
    const extractionDocumentId = documentIds.length === 1 ? documentIds[0] : null;
    const hasStableExtractionIdentity = Number.isInteger(questionExtractionOrdinal)
      && Number(questionExtractionOrdinal) >= 0
      && Boolean(extractionDocumentId);
    // Global lock order: document locks first, then sorted question identity locks.
    // Chunk replacement only acquires document locks, so it cannot form a cycle.
    await acquireDocumentAdvisoryLocks(transaction, documentIds);

    const lockKeys = [
      `question-source:${input.sourceKey}`,
      `question-content:${input.topicId ?? 'none'}:${input.textHash}`,
      ...(hasStableExtractionIdentity
        ? [`question-document-ordinal:${extractionDocumentId}:${questionExtractionOrdinal}`]
        : []),
    ].sort();
    for (const lockKey of lockKeys) {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    }

    const sourceExisting = await transaction.question.findUnique({
      where: { sourceKey: input.sourceKey },
      select: {
        id: true, status: true, reviewedAt: true, completenessStatus: true,
        alternatives: true, correctAnswer: true, explanation: true,
      },
    });
    const contentExisting = await transaction.question.findFirst({
      where: { topicId: input.topicId, textHash: input.textHash },
      select: { id: true, status: true, reviewedAt: true },
    });
    const ordinalExisting = hasStableExtractionIdentity
      ? await transaction.question.findFirst({
        where: {
          sources: { some: { documentId: extractionDocumentId } },
          metadata: { path: ['questionExtractionOrdinal'], equals: questionExtractionOrdinal! },
        },
        select: {
          id: true, sourceKey: true, status: true, reviewedAt: true, completenessStatus: true,
          alternatives: true, correctAnswer: true, explanation: true,
        },
      })
      : null;
    const completeExisting = [sourceExisting, ordinalExisting].find((question) =>
      question && isQuestionCompletionReusable(question),
    ) ?? null;
    const contentCollision = Boolean(contentExisting && contentExisting.id !== sourceExisting?.id);
    const existing = completeExisting
      ? completeExisting
      : contentCollision
        ? contentExisting
        : sourceExisting ?? ordinalExisting ?? contentExisting;
    const preserveExisting = Boolean(existing && (contentCollision || (
      existing.status !== 'PENDING_REVIEW'
      || existing.reviewedAt
      || existing === completeExisting
      || (!sourceExisting && !ordinalExisting && contentExisting)
    )));

    const data = {
        teacherId: input.teacherId,
        monitorId: input.monitorId,
        subjectId: input.subjectId,
        topicId: input.topicId,
        text: input.text,
        alternatives: input.alternatives,
        kind: input.kind,
        statementOrigin: input.statementOrigin ?? 'SOURCE_DOCUMENT',
        statementConfidence: input.statementConfidence ?? null,
        alternativesOrigin: input.alternativesOrigin ?? (input.alternatives.length > 0 ? 'SOURCE_DOCUMENT' : null),
        alternativesConfidence: input.alternativesConfidence ?? null,
        correctAnswer: input.correctAnswer,
        correctAnswerOrigin: input.correctAnswerOrigin,
        correctAnswerConfidence: input.correctAnswerConfidence ?? null,
        explanation: input.explanation,
        explanationOrigin: input.explanationOrigin,
        explanationConfidence: input.explanationConfidence ?? null,
        completenessStatus: input.completenessStatus ?? 'MISSING_ANSWER',
        qualityScore: input.qualityScore ?? null,
        needsReview: input.needsReview ?? true,
        textHash: input.textHash,
        sourceKey: input.sourceKey,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        status: 'PENDING_REVIEW',
    } as const;
    const question = preserveExisting && existing
      ? existing
      : ordinalExisting && !sourceExisting
        ? await transaction.question.update({
          where: { id: ordinalExisting.id },
          data: { ...data, sourceKey: ordinalExisting.sourceKey },
        })
        : await transaction.question.upsert({
        where: { sourceKey: input.sourceKey },
        create: data,
        update: data,
      });

    const topicIds = Array.from(new Set([
      ...(input.topicId ? [input.topicId] : []),
      ...(input.relatedTopics || [])
        .filter(({ topicId, confidence }) => topicId !== input.topicId && confidence > 0.5)
        .map(({ topicId }) => topicId),
    ]));
    if (topicIds.length > 0) {
      await transaction.questionTopic.createMany({
        data: topicIds.map((topicId) => ({
          questionId: question.id,
          topicId,
          isPrimary: topicId === input.topicId,
        })),
        skipDuplicates: true,
      });
    }

    const sources: QuestionSourceInput[] = input.sources?.length
      ? input.sources
      : input.sourceChunkIds.map((chunkId) => ({ chunkId }));
    const alreadyLinkedSourceKeys = question.id === sourceExisting?.id
      ? new Set((await transaction.questionSource.findMany({
        where: { questionId: question.id },
        select: { chunkId: true, role: true },
      })).map((source: { chunkId: string; role: string }) => `${source.chunkId}:${source.role}`))
      : new Set<string>();
    const newSources = sources.filter((source) => !alreadyLinkedSourceKeys.has(`${source.chunkId}:${source.role ?? 'CONTEXT'}`));
    if (newSources.length > 0) {
      await transaction.questionSource.createMany({
        data: newSources.map((source) => ({
          questionId: question.id,
          chunkId: source.chunkId,
          documentId: source.documentId ?? null,
          documentBlockId: source.documentBlockId ?? null,
          role: source.role ?? 'CONTEXT',
          pageStart: source.pageStart ?? null,
          pageEnd: source.pageEnd ?? null,
          charStartInChunk: source.charStartInChunk ?? null,
          charEndInChunk: source.charEndInChunk ?? null,
          excerpt: source.excerpt ?? null,
          confidence: source.confidence ?? null,
        })),
        skipDuplicates: true,
      });
    }

    if (input.aiGenerations?.length) {
      try {
        await transaction.questionAiGeneration.createMany({
          data: input.aiGenerations.map((generation) => ({
            questionId: question.id,
            generationType: generation.generationType,
            model: generation.model,
            promptVersion: generation.promptVersion ?? null,
            inputSnapshot: generation.inputSnapshot,
            outputSnapshot: generation.outputSnapshot,
            confidence: generation.confidence ?? null,
          })),
        });
      } catch (error) {
        // A generation log is observability data. It must never roll back the
        // question itself, especially while a deployment is catching up with
        // a newly introduced enum value such as CORRECTION.
        console.log('Trilha de geração da IA não foi persistida; questão será mantida', {
          event: 'monitor.question_ai_generation_persistence_failed_non_blocking',
          questionId: question.id,
          generationTypes: input.aiGenerations.map((generation) => generation.generationType),
          error,
        });
      }
    }

    if (input.embedding) {
      await transaction.$executeRaw`
        UPDATE questions
        SET embedding = ${JSON.stringify(input.embedding)}::extensions.vector,
            embedding_model = ${input.embeddingModel ?? null},
            embedding_version = ${input.embeddingVersion ?? null},
            embedded_at = NOW(),
            updated_at = NOW()
        WHERE id = ${question.id}::uuid
      `;
    }

    return question;
  }, { maxWait: 10_000, timeout: 15_000 }));
}

export function isQuestionCompletionReusable(question: {
  alternatives: unknown;
  correctAnswer: string | null;
  explanation: string | null;
  completenessStatus: string;
}) {
  return question.completenessStatus.startsWith('COMPLETE_')
    && Array.isArray(question.alternatives)
    && question.alternatives.length === 5
    && Boolean(question.correctAnswer?.trim())
    && Boolean(question.explanation?.trim());
}

export async function findStudentAvailableQuestions(input: {
  monitorId: string;
  subjectId?: string;
  topicId?: string;
  limit?: number;
}) {
  return prisma.question.findMany({
    where: {
      monitorId: input.monitorId,
      subjectId: input.subjectId,
      topicId: input.topicId,
      status: 'APPROVED',
      correctAnswer: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(input.limit ?? 20, 1), 100),
  });
}
