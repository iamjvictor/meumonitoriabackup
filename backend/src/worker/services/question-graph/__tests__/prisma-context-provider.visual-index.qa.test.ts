import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../../../../lib/prisma.js';
import { supabaseAdmin } from '../../../../lib/supabase.js';
import { createAlternativesAgentNode } from '../alternatives.agent.js';
import { PrismaQuestionGraphContextProvider } from '../prisma-context.provider.js';
import { createQuestionGraphInput } from '../reviewer.js';
import type { QuestionGraphState } from '../state.js';

function replaceMethod(target: Record<string, unknown>, method: string, implementation: (...args: any[]) => any) {
  const original = target[method];
  target[method] = implementation;
  return () => { target[method] = original; };
}

function fixtureState(): QuestionGraphState {
  const assets = Array.from({ length: 30 }, (_, index) => `figure-${String(index + 1).padStart(2, '0')}`);
  return createQuestionGraphInput({
    executionId: 'visual-index-qa', documentId: 'doc-visuals', documentVersion: 'v1', model: 'test', promptVersion: 'p1',
    contextRefs: { chunkIds: ['question-chunk'], pageNumbers: [30], formulaEvidenceRefs: [], imageAssetIds: assets },
    candidates: [{
      candidateId: 'q-30', id: 'q-30', segmentId: 'segment-1', number: '30', statement: 'Questão com figura.', alternatives: [], correctAnswer: null,
      sourceChunkIds: ['question-chunk'], visualAssetIds: ['figure-30'],
      sourceRefs: { chunkIds: ['question-chunk'], pageNumbers: [30], evidenceRefs: ['question-chunk'], visualAssetIds: ['figure-30'] },
    }],
  });
}

function installMocks(context: { after(callback: () => void): void }, failDownload = false) {
  const assets = Array.from({ length: 30 }, (_, index) => ({
    id: `figure-${String(index + 1).padStart(2, '0')}`, pageNumber: index + 1,
    storagePath: `figures/${index + 1}.png`, mimeType: 'image/png', metadata: {},
  }));
  const restores = [
    replaceMethod(prisma.documentChunk as unknown as Record<string, unknown>, 'findMany', async (args: any) =>
      args.where.id?.in ? [{ id: 'question-chunk', content: 'Questão com figura. Escolha A Escolha B Escolha C Escolha D Escolha E', pageStart: 30, pageEnd: 30 }] : []),
    replaceMethod(prisma.documentVisualAsset as unknown as Record<string, unknown>, 'findMany', async (args: any) => {
      const { where } = args;
      if (where.id?.in) {
        const ids = new Set(where.id.in as string[]);
        return assets.filter(({ id }) => ids.has(id)).sort((left, right) => left.pageNumber - right.pageNumber).slice(0, args.take);
      }
      const excluded = new Set((where.id?.notIn ?? []) as string[]);
      const pages = where.pageNumber;
      return assets.filter((asset) => !excluded.has(asset.id) && asset.pageNumber >= pages.gte && asset.pageNumber <= pages.lte)
        .sort((left, right) => left.pageNumber - right.pageNumber).slice(0, args.take);
    }),
    replaceMethod(supabaseAdmin.storage as unknown as Record<string, unknown>, 'from', () => ({
      async download(path: string) {
        return failDownload && path === 'figures/30.png'
          ? { data: null, error: new Error('simulated storage outage') }
          : { data: new Blob([path]), error: null };
      },
    })),
  ];
  context.after(() => restores.reverse().forEach((restore) => restore()));
}

test('candidate figure is loaded before global visual assets consume the context limit', async (context) => {
  installMocks(context);
  const state = fixtureState();
  const loaded = await new PrismaQuestionGraphContextProvider().load(state, state.candidates[0]!);
  assert.ok(loaded.images.some(({ assetId }) => assetId === 'figure-30'), 'candidate-linked figure must be available to the multimodal agent');
});

test('candidate-linked image download failure becomes a pending VISUAL_CONTEXT issue on the agent result', async (context) => {
  installMocks(context, true);
  const state = fixtureState();
  state.reviewDecisions = [{ candidateId: 'q-30', route: 'alternatives', missingAlternativeLabels: ['A', 'B', 'C', 'D', 'E'], alternativesNeedRepair: true, missingAnswer: true, pendingIssues: ['ALTERNATIVES_INCOMPLETE_OR_INVALID'] }];
  state.selectedCandidateId = 'q-30';
  state.nextNode = 'alternatives_agent';
  state.stage = 'awaiting_alternatives';
  const provider = new PrismaQuestionGraphContextProvider();
  const node = createAlternativesAgentNode({
    contextProvider: provider,
    client: { async createStructuredChatCompletion<T>() {
      return { alternatives: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Escolha ${label}`, origin: 'AI_GENERATED', evidenceQuote: null })), corrections: [], pendingIssue: null } as T;
    } },
  });

  const result = await node(state);
  const issues = result.agentResults?.['q-30']?.pendingIssues ?? [];
  assert.ok(issues.includes('VISUAL_CONTEXT_VISUAL_ASSET_DOWNLOAD_FAILED:figure-30'));
});
