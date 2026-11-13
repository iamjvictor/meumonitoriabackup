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

function input(assetIds: string[]) {
  return createQuestionGraphInput({
    executionId: 'visual-provider-test', documentId: 'doc-visuals', documentVersion: 'v1', model: 'test', promptVersion: 'p1',
    contextRefs: { chunkIds: ['question-chunk'], pageNumbers: [30], formulaEvidenceRefs: [], imageAssetIds: assetIds },
    candidates: [{ candidateId: 'candidate-30', id: 'candidate-30', number: '30', statement: 'Questão com figura.', alternatives: [], correctAnswer: null, sourceChunkIds: ['question-chunk'], visualAssetIds: ['figure-30'] }],
  });
}

test('candidate-linked figure takes priority over global and page-context images', async (context) => {
  const assets = Array.from({ length: 30 }, (_, index) => ({
    id: `figure-${String(index + 1).padStart(2, '0')}`, pageNumber: index + 1,
    storagePath: `figures/${index + 1}.png`, mimeType: 'image/png', metadata: {},
  }));
  const calls: any[] = [];
  const restores = [
    replaceMethod(prisma.documentChunk as unknown as Record<string, unknown>, 'findMany', async (args: any) =>
      args.where.id?.in ? [{ id: 'question-chunk', content: 'Questão com figura.', pageStart: 30, pageEnd: 30 }] : []),
    replaceMethod(prisma.documentVisualAsset as unknown as Record<string, unknown>, 'findMany', async (args: any) => {
      calls.push(args);
      if (args.where.id?.in) return assets.filter(({ id }) => args.where.id.in.includes(id)).slice(0, args.take ?? assets.length);
      return assets.filter(({ pageNumber, id }) => pageNumber >= args.where.pageNumber.gte && pageNumber <= args.where.pageNumber.lte
        && !args.where.id?.notIn?.includes(id)).slice(0, args.take);
    }),
    replaceMethod(supabaseAdmin.storage as unknown as Record<string, unknown>, 'from', () => ({
      async download(path: string) { return { data: new Blob([path]), error: null }; },
    })),
  ];
  context.after(() => restores.reverse().forEach((restore) => restore()));

  const state = input(assets.map(({ id }) => id));
  const loaded = await new PrismaQuestionGraphContextProvider().load(state, state.candidates[0]!);

  assert.equal(loaded.images[0]?.assetId, 'figure-30');
  assert.ok(loaded.images.length <= 24);
  assert.ok(calls.length >= 2, 'direct candidate references are queried before contextual assets');
});

test('failed download is returned as an explicit context issue', async (context) => {
  const restores = [
    replaceMethod(prisma.documentChunk as unknown as Record<string, unknown>, 'findMany', async () => [{ id: 'question-chunk', content: 'Questão.', pageStart: 1, pageEnd: 1 }]),
    replaceMethod(prisma.documentVisualAsset as unknown as Record<string, unknown>, 'findMany', async (args: any) => args.where.id?.in
      ? [{ id: 'figure-30', pageNumber: 1, storagePath: 'missing.png', mimeType: 'image/png', metadata: {} }]
      : []),
    replaceMethod(supabaseAdmin.storage as unknown as Record<string, unknown>, 'from', () => ({
      async download() { return { data: null, error: new Error('storage unavailable') }; },
    })),
  ];
  context.after(() => restores.reverse().forEach((restore) => restore()));

  const state = input([]);
  const loaded = await new PrismaQuestionGraphContextProvider().load(state, state.candidates[0]!);

  assert.ok(loaded.unresolvedIssues?.includes('VISUAL_ASSET_DOWNLOAD_FAILED:figure-30'));
  assert.match(loaded.text, /VISUAL_ASSET_DOWNLOAD_FAILED:figure-30/);
});
