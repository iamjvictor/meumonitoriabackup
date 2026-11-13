import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../../../../lib/prisma.js';
import { supabaseAdmin } from '../../../../lib/supabase.js';
import { createQuestionGraphInput } from '../reviewer.js';
import { PrismaQuestionGraphContextProvider } from '../prisma-context.provider.js';

function replaceMethod(target: Record<string, unknown>, method: string, implementation: (...args: any[]) => any) {
  const original = target[method];
  target[method] = implementation;
  return () => { target[method] = original; };
}

test('Prisma context provider retorna somente assetType figure lowercase e não envia page ao nó visual', async (context) => {
  const persistedAssets = [
    { id: 'figure-question', assetType: 'figure', pageNumber: 7, storagePath: 'figures/q.png', mimeType: 'image/png', metadata: {} },
    { id: 'figure-nearby', assetType: 'figure', pageNumber: 8, storagePath: 'figures/nearby.png', mimeType: 'image/png', metadata: {} },
    { id: 'page-7', assetType: 'page', pageNumber: 7, storagePath: 'pages/7.png', mimeType: 'image/png', metadata: {} },
    { id: 'page-8', assetType: 'page', pageNumber: 8, storagePath: 'pages/8.png', mimeType: 'image/png', metadata: {} },
  ];
  const requestedAssetTypes: string[] = [];
  const downloadedPaths: string[] = [];
  const restores = [
    replaceMethod(prisma.documentChunk as unknown as Record<string, unknown>, 'findMany', async (args: any) =>
      args.where.id?.in ? [{ id: 'question-chunk', content: 'Questão associada à figura.', pageStart: 7, pageEnd: 7 }] : []),
    replaceMethod(prisma.documentVisualAsset as unknown as Record<string, unknown>, 'findMany', async (args: any) => {
      const expectedType = args.where.assetType;
      requestedAssetTypes.push(expectedType);
      // Model the database's exact equality semantics over stored lowercase rows.
      return persistedAssets.filter((asset) => {
        if (asset.assetType !== expectedType) return false;
        if (args.where.id?.in && !args.where.id.in.includes(asset.id)) return false;
        if (args.where.id?.notIn?.includes(asset.id)) return false;
        if (args.where.pageNumber && (asset.pageNumber < args.where.pageNumber.gte || asset.pageNumber > args.where.pageNumber.lte)) return false;
        return true;
      }).slice(0, args.take ?? persistedAssets.length);
    }),
    replaceMethod(supabaseAdmin.storage as unknown as Record<string, unknown>, 'from', () => ({
      async download(path: string) {
        downloadedPaths.push(path);
        return { data: new Blob([path]), error: null };
      },
    })),
  ];
  context.after(() => restores.reverse().forEach((restore) => restore()));

  const state = createQuestionGraphInput({
    executionId: 'asset-type-lowercase-db-shape', documentId: 'doc-visuals', documentVersion: 'v1', model: 'test', promptVersion: 'p1',
    contextRefs: { chunkIds: ['question-chunk'], pageNumbers: [7], formulaEvidenceRefs: [], imageAssetIds: ['figure-nearby', 'page-8'] },
    candidates: [{
      id: 'candidate-visual', candidateId: 'candidate-visual', number: '4', statement: 'Questão associada à figura.',
      alternatives: [], correctAnswer: null, sourceChunkIds: ['question-chunk'], visualAssetIds: ['figure-question', 'page-7'],
    }],
  });

  const loaded = await new PrismaQuestionGraphContextProvider().load(state, state.candidates[0]!);
  assert.deepEqual(loaded.images.map(({ assetId }) => assetId), ['figure-question', 'figure-nearby']);
  assert.deepEqual(downloadedPaths, ['figures/q.png', 'figures/nearby.png']);
  assert.ok(requestedAssetTypes.length >= 1);
  assert.ok(requestedAssetTypes.every((assetType) => assetType === 'figure'));
  assert.ok(!loaded.images.some(({ assetId }) => assetId.startsWith('page-')));
  assert.ok(!downloadedPaths.some((path) => path.startsWith('pages/')));
});
