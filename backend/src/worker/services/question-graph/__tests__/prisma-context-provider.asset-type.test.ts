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

test('loads lowercase figure assets from candidate, global index, and nearby page queries', async (context) => {
  const storedAssets = [
    { id: 'figure-candidate', assetType: 'figure', pageNumber: 1, storagePath: 'figures/candidate.png', mimeType: 'image/png', metadata: {} },
    { id: 'figure-indexed', assetType: 'figure', pageNumber: 2, storagePath: 'figures/indexed.png', mimeType: 'image/png', metadata: {} },
    { id: 'figure-nearby', assetType: 'figure', pageNumber: 1, storagePath: 'figures/nearby.png', mimeType: 'image/png', metadata: {} },
  ];
  const assetQueries: any[] = [];
  const restores = [
    replaceMethod(prisma.documentChunk as unknown as Record<string, unknown>, 'findMany', async (args: any) =>
      args.where.id?.in ? [{ id: 'question-chunk', content: 'Questão com figura.', pageStart: 1, pageEnd: 1 }] : []),
    replaceMethod(prisma.documentVisualAsset as unknown as Record<string, unknown>, 'findMany', async (args: any) => {
      assetQueries.push(args);
      const { where } = args;
      return storedAssets.filter((asset) => {
        if (asset.assetType !== where.assetType) return false;
        if (where.id?.in && !where.id.in.includes(asset.id)) return false;
        if (where.id?.notIn?.includes(asset.id)) return false;
        if (where.pageNumber && (asset.pageNumber < where.pageNumber.gte || asset.pageNumber > where.pageNumber.lte)) return false;
        return true;
      }).slice(0, args.take ?? storedAssets.length);
    }),
    replaceMethod(supabaseAdmin.storage as unknown as Record<string, unknown>, 'from', () => ({
      async download(path: string) { return { data: new Blob([path]), error: null }; },
    })),
  ];
  context.after(() => restores.reverse().forEach((restore) => restore()));

  const state = createQuestionGraphInput({
    executionId: 'lowercase-figure-provider-test', documentId: 'doc-visuals', documentVersion: 'v1', model: 'test', promptVersion: 'p1',
    contextRefs: { chunkIds: ['question-chunk'], pageNumbers: [1], formulaEvidenceRefs: [], imageAssetIds: ['figure-indexed'] },
    candidates: [{
      candidateId: 'candidate-1', id: 'candidate-1', number: '1', statement: 'Questão com figura.',
      alternatives: [], correctAnswer: null, sourceChunkIds: ['question-chunk'], visualAssetIds: ['figure-candidate'],
    }],
  });

  const loaded = await new PrismaQuestionGraphContextProvider().load(state, state.candidates[0]!);

  assert.deepEqual(loaded.images.map(({ assetId }) => assetId), ['figure-candidate', 'figure-indexed', 'figure-nearby']);
  assert.deepEqual(loaded.unresolvedIssues, undefined);
  assert.equal(assetQueries.length, 3, 'candidate, global, and page-nearby references should all be queried');
  assert.ok(assetQueries.every(({ where }) => where.assetType === 'figure'), 'queries must match the persisted lowercase asset type');
});
