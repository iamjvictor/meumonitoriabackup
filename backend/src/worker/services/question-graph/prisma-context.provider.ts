import { prisma } from '../../../lib/prisma.js';
import { supabaseAdmin } from '../../../lib/supabase.js';
import type { QuestionGraphContextProvider, QuestionGraphLoadedContext } from './context.provider.js';
import type { ExtractedQuestionCandidate, QuestionGraphState } from './state.js';

const FIGURE_ASSET_TYPE = 'figure';

/** Loads text and selected figure bytes on demand; bytes are passed to a node only. */
export class PrismaQuestionGraphContextProvider implements QuestionGraphContextProvider {
  async load(state: QuestionGraphState, candidate: ExtractedQuestionCandidate): Promise<QuestionGraphLoadedContext> {
    const sourceChunks = await prisma.documentChunk.findMany({
      where: { documentId: state.documentId, id: { in: candidate.sourceChunkIds } },
      orderBy: { chunkIndex: 'asc' }, select: { id: true, content: true, pageStart: true, pageEnd: true },
    });
    const hintedChunks = await prisma.documentChunk.findMany({
      where: { documentId: state.documentId, content: { contains: 'gabarito', mode: 'insensitive' } },
      orderBy: { chunkIndex: 'asc' }, take: 12, select: { id: true, content: true, pageStart: true, pageEnd: true },
    });
    const chunks = [...new Map([...sourceChunks, ...hintedChunks].map((chunk) => [chunk.id, chunk])).values()];
    const text = chunks.map((chunk) => `[páginas ${chunk.pageStart ?? '?'}-${chunk.pageEnd ?? '?'}; chunk ${chunk.id}]\n${chunk.content}`).join('\n\n');
    const sourcePageNumbers = sourceChunks.flatMap((chunk) => [chunk.pageStart, chunk.pageEnd].filter((page): page is number => page !== null));
    const minPage = sourcePageNumbers.length ? Math.min(...sourcePageNumbers) - 1 : 1;
    const maxPage = sourcePageNumbers.length ? Math.max(...sourcePageNumbers) + 1 : 1;
    const selectAsset = { id: true, pageNumber: true, storagePath: true, mimeType: true, metadata: true } as const;
    const candidateAssetIds = [...new Set([
      ...(candidate.visualAssetIds ?? []),
      ...(candidate.visualEvidence ?? []).map(({ assetId }) => assetId),
      ...(candidate.sourceRefs?.visualAssetIds ?? []),
    ])];
    const candidateAssets = candidateAssetIds.length
      ? await prisma.documentVisualAsset.findMany({
        where: { documentId: state.documentId, assetType: FIGURE_ASSET_TYPE, id: { in: candidateAssetIds } },
        orderBy: { pageNumber: 'asc' }, take: candidateAssetIds.length, select: selectAsset,
      })
      : [];
    const foundCandidateAssetIds = new Set(candidateAssets.map(({ id }) => id));
    const unresolvedIssues = candidateAssetIds
      .filter((assetId) => !foundCandidateAssetIds.has(assetId))
      .map((assetId) => `VISUAL_ASSET_REFERENCE_NOT_FOUND:${assetId}`);
    const usedAssetIds = new Set(candidateAssets.map(({ id }) => id));
    let remaining = Math.max(24 - candidateAssets.length, 0);
    const globalAssetIds = state.contextRefs.imageAssetIds.filter((assetId) => !usedAssetIds.has(assetId));
    const globalAssets = globalAssetIds.length && remaining
      ? await prisma.documentVisualAsset.findMany({
        where: { documentId: state.documentId, assetType: FIGURE_ASSET_TYPE, id: { in: globalAssetIds } },
        orderBy: { pageNumber: 'asc' }, take: remaining, select: selectAsset,
      })
      : [];
    globalAssets.forEach(({ id }) => usedAssetIds.add(id));
    remaining = Math.max(remaining - globalAssets.length, 0);
    const nearbyAssets = remaining
      ? await prisma.documentVisualAsset.findMany({
        where: {
          documentId: state.documentId,
          assetType: FIGURE_ASSET_TYPE,
          pageNumber: { gte: Math.max(1, minPage), lte: maxPage },
          ...(usedAssetIds.size ? { id: { notIn: [...usedAssetIds] } } : {}),
        },
        orderBy: { pageNumber: 'asc' }, take: remaining, select: selectAsset,
      })
      : [];
    const assets = [...candidateAssets, ...globalAssets, ...nearbyAssets];
    const images: QuestionGraphLoadedContext['images'] = [];
    for (const asset of assets) {
      try {
        const { data, error } = await supabaseAdmin.storage.from('document-parser-artifacts').download(asset.storagePath);
        if (error || !data) {
          unresolvedIssues.push(`VISUAL_ASSET_DOWNLOAD_FAILED:${asset.id}`);
          continue;
        }
        const bytes = Buffer.from(await data.arrayBuffer());
        images.push({ assetId: asset.id, pageNumber: asset.pageNumber, mimeType: asset.mimeType ?? 'image/png', dataUrl: `data:${asset.mimeType ?? 'image/png'};base64,${bytes.toString('base64')}` });
      } catch {
        unresolvedIssues.push(`VISUAL_ASSET_DOWNLOAD_FAILED:${asset.id}`);
      }
    }
    const textWithIssues = unresolvedIssues.length
      ? `${text}\n\nPendências de contexto visual:\n${unresolvedIssues.map((issue) => `[QUESTION_GRAPH_CONTEXT_ISSUE] ${issue}`).join('\n')}`
      : text;
    return { text: textWithIssues, images, ...(unresolvedIssues.length ? { unresolvedIssues } : {}) };
  }
}
