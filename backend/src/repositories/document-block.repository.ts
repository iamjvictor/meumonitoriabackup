import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { acquireDocumentAdvisoryLocks } from './document-advisory-lock.js';
import { prisma } from '../lib/prisma.js';

export type DocumentBlockInput = {
  documentId: string;
  documentTextId: string;
  parentBlockId?: string | null;
  blockIndex: number;
  type: 'TITLE' | 'SECTION' | 'SUBSECTION' | 'THEORY' | 'DEFINITION' | 'FORMULA' | 'EXAMPLE' | 'QUESTION' | 'ANSWER_KEY' | 'SOLUTION' | 'TABLE' | 'LIST' | 'IMAGE_REFERENCE' | 'UNKNOWN';
  title?: string | null;
  rawContent: string;
  normalizedContent: string;
  sectionPath: Prisma.InputJsonValue;
  questionNumber?: string | null;
  institution?: string | null;
  examYear?: number | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  charStart: number;
  charEnd: number;
  detectionMethod: 'REGEX' | 'HEURISTIC' | 'LLM' | 'MANUAL';
  confidence?: number | null;
  isComplete?: boolean;
  incompleteReason?: string | null;
  status: 'READY' | 'NEEDS_REVIEW' | 'FAILED';
};

type ExistingBlockIdentity = Pick<DocumentBlockInput,
  'blockIndex' | 'type' | 'questionNumber' | 'pageStart' | 'pageEnd' | 'charStart' | 'charEnd'> & {
  id: string;
  contentHash: string;
  referenced: boolean;
};
type IncomingBlockIdentity = Pick<DocumentBlockInput,
  'blockIndex' | 'type' | 'questionNumber' | 'pageStart' | 'pageEnd' | 'charStart' | 'charEnd' | 'normalizedContent'>;

function documentBlockIdentity(block: Pick<DocumentBlockInput,
  'blockIndex' | 'type' | 'questionNumber' | 'pageStart' | 'pageEnd' | 'charStart' | 'charEnd'> & { contentHash: string }) {
  return JSON.stringify([
    block.blockIndex, block.type, block.contentHash, block.questionNumber ?? null,
    block.pageStart ?? null, block.pageEnd ?? null, block.charStart, block.charEnd,
  ]);
}

export function planDocumentBlockReplacement(
  existing: ExistingBlockIdentity[],
  incoming: IncomingBlockIdentity[],
) {
  const incomingKeys = new Set(incoming.map((block) => documentBlockIdentity({
    ...block,
    contentHash: createHash('sha256').update(block.normalizedContent).digest('hex'),
  })));
  const existingByIdentity = new Map(existing.map((block) => [documentBlockIdentity(block), block]));
  const idsByBlockIndex = new Map<number, string>();
  const deleteIds: string[] = [];

  for (const block of existing) {
    const key = documentBlockIdentity(block);
    if (incomingKeys.has(key)) idsByBlockIndex.set(block.blockIndex, block.id);
    else if (block.referenced) {
      throw new Error(`Substituicao abortada: bloco referenciado ${block.id} nao pode ser remapeado com seguranca.`);
    } else deleteIds.push(block.id);
  }

  const createIndexes = incoming
    .filter((block) => !existingByIdentity.has(documentBlockIdentity({
      ...block,
      contentHash: createHash('sha256').update(block.normalizedContent).digest('hex'),
    })))
    .map((block) => block.blockIndex);

  return { idsByBlockIndex, deleteIds, createIndexes };
}

export async function replaceDocumentBlocks(documentTextId: string, blocks: DocumentBlockInput[]) {
  const transactionTimeoutMs = 60_000;
  console.log('Persistindo blocos estruturais do documento', {
    event: 'monitor.document_blocks_persistence_started',
    documentTextId,
    blockCount: blocks.length,
    transactionTimeoutMs,
  });

  const document = await prisma.documentText.findUnique({ where: { id: documentTextId }, select: { documentId: true } });
  if (!document) throw new Error('Extracao de texto nao encontrada para substituir blocos.');

  const result = await prisma.$transaction(async (transaction) => {
    await acquireDocumentAdvisoryLocks(transaction, [document.documentId]);
    const existing = await transaction.documentBlock.findMany({
      where: { documentTextId },
      select: {
        id: true, blockIndex: true, type: true, questionNumber: true,
        pageStart: true, pageEnd: true, charStart: true, charEnd: true, contentHash: true,
        questionSources: { select: { id: true }, take: 1 },
        questionSpans: { select: { id: true }, take: 1 },
      },
    });
    const plan = planDocumentBlockReplacement(existing.map((block) => ({
      ...block,
      referenced: block.questionSources.length > 0 || block.questionSpans.length > 0,
    })), blocks);
    const ids = new Map(plan.idsByBlockIndex);
    for (const blockIndex of plan.createIndexes) ids.set(blockIndex, randomUUID());

    if (plan.deleteIds.length) {
      await transaction.documentBlock.deleteMany({ where: { id: { in: plan.deleteIds } } });
    }

    for (const block of blocks) {
      const id = ids.get(block.blockIndex)!;
      const parentBlockId = block.parentBlockId ? ids.get(Number(block.parentBlockId)) ?? null : null;
      const data = {
        documentId: block.documentId,
        documentTextId: block.documentTextId,
        parentBlockId,
        blockIndex: block.blockIndex,
        type: block.type,
        title: block.title ?? null,
        rawContent: block.rawContent,
        normalizedContent: block.normalizedContent,
        sectionPath: block.sectionPath,
        questionNumber: block.questionNumber ?? null,
        institution: block.institution ?? null,
        examYear: block.examYear ?? null,
        pageStart: block.pageStart ?? null,
        pageEnd: block.pageEnd ?? null,
        charStart: block.charStart,
        charEnd: block.charEnd,
        contentHash: createHash('sha256').update(block.normalizedContent).digest('hex'),
        detectionMethod: block.detectionMethod,
        confidence: block.confidence ?? null,
        isComplete: block.isComplete ?? true,
        incompleteReason: block.incompleteReason ?? null,
        status: block.status,
      };
      if (plan.idsByBlockIndex.has(block.blockIndex)) {
        await transaction.documentBlock.update({ where: { id }, data });
      } else {
        await transaction.documentBlock.create({ data: { id, ...data } });
      }
    }
    return { blockCount: blocks.length, reusedCount: plan.idsByBlockIndex.size };
  }, { maxWait: 10_000, timeout: transactionTimeoutMs });

  console.log('Blocos estruturais persistidos', {
    event: 'monitor.document_blocks_persistence_completed',
    documentTextId,
    blockCount: result.blockCount,
    reusedCount: result.reusedCount,
  });
  return result;
}
