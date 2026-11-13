import { prisma } from '../lib/prisma.js';
import type { VisualAssetForLinking, VisualLink, VisualLinkStore } from '../worker/services/document-visual-linking.service.js';

type RawAsset = {
  id: string; sourceKey: string; pageNumber: number; bbox: unknown; metadata: unknown;
};

export class PrismaDocumentVisualLinkStore implements VisualLinkStore {
  async findAssetsForParseRun(parseRunId: string): Promise<VisualAssetForLinking[]> {
    const rows = await prisma.documentVisualAsset.findMany({ where: { parseRunId }, select: {
      id: true, sourceKey: true, pageNumber: true, bbox: true, metadata: true,
    } });
    return rows.map(mapAsset as (value: typeof rows[number]) => VisualAssetForLinking);
  }

  async findAssetsForDocument(documentId: string): Promise<VisualAssetForLinking[]> {
    const rows = await prisma.documentVisualAsset.findMany({ where: { documentId }, select: {
      id: true, sourceKey: true, pageNumber: true, bbox: true, metadata: true,
    } });
    return rows.map(mapAsset as (value: typeof rows[number]) => VisualAssetForLinking);
  }

  async persistChunkLinks(links: VisualLink[]) {
    await prisma.documentChunkVisualAsset.createMany({ data: links.flatMap((link) => link.chunkId ? [{
      chunkId: link.chunkId, visualAssetId: link.assetId, associationMethod: link.method,
      role: link.role, confidence: link.confidence,
    }] : []), skipDuplicates: true });
  }

  async persistQuestionLinks(links: VisualLink[]) {
    await prisma.questionVisualAsset.createMany({ data: links.flatMap((link) => link.questionId ? [{
      questionId: link.questionId, visualAssetId: link.assetId, associationMethod: link.method,
      role: link.role, confidence: link.confidence,
    }] : []), skipDuplicates: true });
  }

  async persistQuestionSpanLinks(links: VisualLink[]) {
    await prisma.questionSpanVisualAsset.createMany({ data: links.flatMap((link) => link.questionSpanId ? [{
      questionSpanId: link.questionSpanId, visualAssetId: link.assetId, associationMethod: link.method,
      role: link.role, confidence: link.confidence,
    }] : []), skipDuplicates: true });
  }

  async confirmQuestionVisualReview(documentId: string, link: VisualLink, actorUserId: string): Promise<{ teacherId: string }> {
    if (!link.questionSpanId || link.method !== 'REVIEW') throw new Error('A confirmação visual exige uma candidata e decisão de revisão.');
    if (!actorUserId) throw new Error('A identidade do professor é obrigatória para confirmar uma revisão visual.');
    return prisma.$transaction(async (transaction) => {
      const [document, asset, span] = await Promise.all([
        transaction.monitorDocument.findFirst({
          where: { id: documentId, teacher: { userId: actorUserId } },
          select: { id: true, teacherId: true },
        }),
        transaction.documentVisualAsset.findFirst({
          where: { id: link.assetId, documentId },
          select: { id: true, pageNumber: true },
        }),
        transaction.questionSpan.findFirst({
          where: { id: link.questionSpanId, documentId },
          select: {
            id: true, sourceKey: true, pageStart: true, pageEnd: true,
            chunks: { select: { chunkId: true } },
          },
        }),
      ]);
      if (!document || !asset || !span) throw new Error('A questão ou o asset visual não pertence ao documento autorizado.');
      if (span.pageStart !== null && span.pageEnd !== null && (asset.pageNumber < span.pageStart || asset.pageNumber > span.pageEnd)) {
        throw new Error('O asset visual selecionado está fora do intervalo de páginas da questão.');
      }

      if (link.questionId) {
        const question = await transaction.question.findFirst({
          where: {
            id: link.questionId,
            teacherId: document.teacherId,
            sources: { some: { documentId, role: 'STATEMENT' } },
          },
          select: {
            sourceKey: true,
            sources: {
              where: { documentId, role: 'STATEMENT' },
              select: { chunkId: true, pageStart: true, pageEnd: true },
            },
          },
        });
        if (!question || !span.sourceKey || question.sourceKey !== span.sourceKey) {
          throw new Error('A questão selecionada não possui identidade de origem verificável para o span informado.');
        }
        const spanChunkIds = [...new Set(span.chunks.map(({ chunkId }) => chunkId))].sort();
        const sourceChunkIds = [...new Set(question.sources.map(({ chunkId }) => chunkId))].sort();
        const sameChunks = spanChunkIds.length > 0
          && spanChunkIds.length === sourceChunkIds.length
          && spanChunkIds.every((chunkId, index) => chunkId === sourceChunkIds[index]);
        const sourceCoversSpan = question.sources.some((source) =>
          (source.pageStart === null || span.pageEnd === null || source.pageStart <= span.pageEnd)
          && (source.pageEnd === null || span.pageStart === null || source.pageEnd >= span.pageStart));
        if (!sameChunks || !sourceCoversSpan) {
          throw new Error('A questão não corresponde inequivocamente ao span selecionado.');
        }

        const competingSpans = await transaction.questionSpan.findMany({
          where: { documentId, sourceKey: question.sourceKey },
          select: { id: true, sourceKey: true, chunks: { select: { chunkId: true } } },
        });
        const matchingSpans = competingSpans.filter((candidateSpan) =>
          candidateSpan.sourceKey === question.sourceKey
          && sameStringSet(candidateSpan.chunks.map(({ chunkId }) => chunkId), sourceChunkIds));
        if (matchingSpans.length !== 1 || matchingSpans[0]?.id !== span.id) {
          throw new Error('A questão corresponde a mais de um span ou a um span diferente.');
        }
      }

      await transaction.questionSpanVisualAsset.deleteMany({
        where: { questionSpanId: span.id, role: 'REVIEW_CANDIDATE', visualAssetId: { not: asset.id } },
      });
      await transaction.questionSpanVisualAsset.upsert({
        where: { questionSpanId_visualAssetId: { questionSpanId: span.id, visualAssetId: asset.id } },
        update: { associationMethod: 'REVIEW', role: 'STATEMENT', confidence: 1 },
        create: {
          questionSpanId: span.id, visualAssetId: asset.id,
          associationMethod: 'REVIEW', role: 'STATEMENT', confidence: 1,
        },
      });
      if (link.questionId) {
        await transaction.questionVisualAsset.upsert({
          where: { questionId_visualAssetId: { questionId: link.questionId, visualAssetId: asset.id } },
          update: { associationMethod: 'REVIEW', role: 'STATEMENT', confidence: 1 },
          create: {
            questionId: link.questionId, visualAssetId: asset.id,
            associationMethod: 'REVIEW', role: 'STATEMENT', confidence: 1,
          },
        });
      }
      await transaction.questionSpan.update({ where: { id: span.id }, data: { visualStatus: 'AVAILABLE' } });
      return { teacherId: document.teacherId };
    });
  }

  async updateQuestionSpanVisualStatuses(rows: Array<{ questionSpanId: string; status: 'AVAILABLE' | 'PENDING_EXTRACTION' | 'MISSING' }>) {
    await prisma.$transaction(rows.map((row) => prisma.questionSpan.update({
      where: { id: row.questionSpanId }, data: { visualStatus: row.status },
    })));
  }
}

function sameStringSet(left: string[], right: string[]) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length > 0 && a.length === b.length && a.every((value, index) => value === b[index]);
}

function mapAsset(raw: RawAsset): VisualAssetForLinking {
  const metadata = isRecord(raw.metadata) ? raw.metadata : {};
  return {
    id: raw.id, assetKey: raw.sourceKey,
    sourceItemRef: typeof metadata.sourceItemRef === 'string' ? metadata.sourceItemRef : '',
    readingOrder: typeof metadata.readingOrder === 'number' ? metadata.readingOrder : null,
    pageNumber: raw.pageNumber, bbox: toBbox(raw.bbox),
    caption: typeof metadata.caption === 'string' ? metadata.caption : null,
    contentAvailable: true,
  };
}

function toBbox(value: unknown): number[] | null {
  if (Array.isArray(value) && value.length === 4 && value.every((part) => typeof part === 'number')) return value;
  if (isRecord(value) && ['x0', 'y0', 'x1', 'y1'].every((key) => typeof value[key] === 'number')) {
    return [value.x0, value.y0, value.x1, value.y1] as number[];
  }
  return null;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
