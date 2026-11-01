import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runVisualEvaluation } from './evaluate-visual-chat.js';

test('gera comparação pareada e exige revisão visual mesmo se baseline acerta a resposta', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'visual-eval-'));
  try {
    const corpus = join(directory, 'gold.jsonl');
    const observations = join(directory, 'run.jsonl');
    const output = join(directory, 'results.jsonl');
    const report = join(directory, 'report.md');
    const checksum = 'a'.repeat(64);
    await writeFile(corpus, `${JSON.stringify({
      caseId: 'q1', category: 'figure-required', critical: true, requiresImage: true,
      expectedAssets: [{ sha256: checksum, page: 15 }], expectedFactIds: ['group-17'],
      prompt: 'Onde está o bromo?', questionContext: 'Questão 01', requiredVisualFacts: [{ id: 'group-17', description: 'Grupo 17' }],
      acceptableAnswer: 'Grupo 17', forbiddenClaims: [],
    })}\n`);
    const review = {
      questionUnderstood: true, visualFactsCorrect: true, relationToQuestionCorrect: true,
      pedagogicalReasoning: true, sourcePageCorrect: true, limitationHonest: true,
      matchedFactIds: ['group-17'], unsupportedVisualClaims: false,
    };
    const baselineReview = { ...review, visualFactsCorrect: false, matchedFactIds: [] };
    await writeFile(observations, `${JSON.stringify({
      caseId: 'q1', model: 'vision-model', promptVersion: 'v1', latencyMs: 100, costUsd: 0.01,
      observation: {
        extractedAssets: [{ assetId: 'db-asset', sha256: checksum, page: 15 }],
        linkedAssets: [{ assetId: 'db-asset', sha256: checksum, page: 15 }], retrievedAssets: [],
        contextManifest: [{ assetId: 'db-asset', sha256: checksum, page: 15, source: 'QUESTION' }],
        sentImageSha256: [checksum], answer: 'Grupo 17.', baselineAnswer: 'Grupo 17.',
        humanReview: review, baselineHumanReview: baselineReview,
      },
    })}\n`);
    await runVisualEvaluation({ corpus, observations, output, report });
    const markdown = await readFile(report, 'utf8');
    assert.match(markdown, /Baseline textual vs multimodal/);
    assert.match(markdown, /0\/1 → 1\/1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
