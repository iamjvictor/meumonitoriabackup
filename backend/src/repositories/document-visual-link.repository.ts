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

  async updateQuestionSpanVisualStatuses(rows: Array<{ questionSpanId: string; status: 'AVAILABLE' | 'PENDING_EXTRACTION' | 'MISSING' }>) {
    await prisma.$transaction(rows.map((row) => prisma.questionSpan.update({
      where: { id: row.questionSpanId }, data: { visualStatus: row.status },
    })));
  }
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
