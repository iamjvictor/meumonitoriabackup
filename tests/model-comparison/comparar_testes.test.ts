import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generate, TEST_NAMES } from './comparar_testes.js';

async function writeJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function question(overrides: Record<string, unknown> = {}) {
  return {
    number: '03',
    statement: 'Qual diferença visível aparece entre as duas estruturas químicas?',
    alternatives: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Alternativa ${label}` })),
    correctAnswer: 'A', explanation: 'A primeira cadeia é mais estendida.', evidence: 'A figura mostra duas geometrias diferentes.',
    missingFields: [], reviewDecision: 'REVIEW', status: 'PENDING_REVIEW', sourceBlockId: 'block-03',
    ...overrides,
  };
}

test('missing summaries show baseline and four tests as unverified, never as successful dry-runs', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'model-comparison-'));
  try {
    const reports = path.join(tmp, 'reports'); const out = path.join(tmp, 'out');
    const baseline = path.join(tmp, 'baseline.json'); const reference = path.join(tmp, 'reference.json'); const visuals = path.join(tmp, 'visuals.json');
    await writeJson(baseline, { questionCount: 0, questions: [] });
    await writeJson(path.join(tmp, 'e2e-results-summary.json'), {});
    await writeJson(reference, { status: 'SEM_VERDADE_DE_REFERENCIA', questions: [] });
    await writeJson(visuals, { questions: [] });
    await generate({ reports, out, baseline, reference, visuals });
    const md = await readFile(path.join(out, 'comparativo.md'), 'utf8');
    const csv = await readFile(path.join(out, 'comparativo.csv'), 'utf8');
    assert.match(md, /baseline_gemini_2_5_flash/);
    assert.match(md, /Nenhuma execução real elegível/);
    for (const name of TEST_NAMES) {
      assert.ok(md.includes(name));
      assert.ok(csv.includes(name));
    }
    assert.equal(await readFile(path.join(out, 'comparativo-rodadas.csv'), 'utf8').catch(() => ''), '');
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

test('filters dry-runs, includes Gemini baseline, computes round variance/cost and reports vision/chat evidence', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'model-comparison-'));
  try {
    const reports = path.join(tmp, 'reports'); const out = path.join(tmp, 'out');
    const name = TEST_NAMES[0]; const runId = 'real-run-12345678'; const runDir = path.join(reports, name, runId);
    const dryRunId = 'dry-run-12345678'; const dryRunDir = path.join(reports, name, dryRunId);
    const fakeRunId = 'fake-run-12345678'; const fakeRunDir = path.join(reports, name, fakeRunId);
    const baseline = path.join(tmp, 'question-origin-snapshot.json'); const reference = path.join(tmp, 'reference.json'); const visuals = path.join(tmp, 'visuals.json');
    const baselineQuestion = question({ correctAnswer: 'A', explanation: 'Versão de baseline.' });
    await writeJson(baseline, { questionCount: 1, questions: [baselineQuestion] });
    await writeJson(path.join(tmp, 'e2e-results-summary.json'), {
      runId: 'gemini-baseline', documents: [{ visualAssetCount: 31 }],
      tokenUsageAndRetries: {
        usageFromProviderLogs: { models: ['google/gemini-2.5-flash', 'qwen/qwen3-embedding-8b'], structuredCalls: 90, structuredPromptTokens: 141107, structuredCompletionTokens: 57889 },
        initial: { invalidSchemaEvents: 4 }, repeat: { invalidSchemaEvents: 2 },
      },
    });
    await writeJson(reference, { status: 'SEM_VERDADE_DE_REFERENCIA', questions: [] });
    await writeJson(visuals, { questions: [{ number: '03', page: 5, expectedElements: ['duas estruturas químicas', 'tretinoína', 'isotretinoína', 'grupo carboxila (-COOH)'], expectedVisibleDifference: 'cadeia mais estendida e dobrada' }] });

    const mkRound = (round: number, correctAnswer: string, labelText: string, cost: number) => ({
      round, status: 'PIPELINE_COMPLETED',
      questions: [question({ correctAnswer, alternatives: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: label === 'A' ? labelText : `Alternativa ${label}` })) })],
      calls: [
        { agent: 'question_alternatives', model: 'deepseek/deepseek-v3.2', requestedProvider: 'DeepInfra', provider: 'DeepInfra', attempt: 1, schemaValidFirstAttempt: true, inputTokens: 50, outputTokens: 20, reasoningTokens: 1, latencyMs: 100, costUsd: cost / 2, outcome: 'OK' },
        { agent: 'embedding', model: 'qwen/qwen3-embedding-8b', requestedProvider: 'DeepInfra', provider: 'DeepInfra', attempt: 1, inputTokens: 5, outputTokens: 0, reasoningTokens: 0, latencyMs: 10, costUsd: cost / 2, outcome: 'OK' },
      ],
      metrics: { totalDurationMs: 120, latencyP50Ms: 55, latencyP95Ms: 100 },
      knowledgeBase: { assetCount: 31, indexedCount: 31, descriptions: [{ assetId: 'asset-q03', pageNumber: 5, description: 'Duas estruturas químicas: tretinoína, isotretinoína e grupo carboxila (-COOH). Uma cadeia parece estendida e outra dobrada.', model: 'qwen/qwen3-vl-30b-a3b-instruct', status: 'READY' }] },
      chat: { questionNumber: '03', question: 'Qual diferença você vê?', answer: 'Uma cadeia é estendida e a outra está dobrada perto do grupo carboxila.', imageContextPassed: true, visibleDifferenceRecognized: true, status: 'VERIFIED' },
    });
    await writeJson(path.join(runDir, 'summary.json'), {
      test: name, runId, executionMode: 'execute', pipelineExecuted: true, fx: { usdBrl: 5.5, source: 'Banco Central', date: '2026-11-02' },
      rounds: [mkRound(1, 'A', 'Opção A na rodada 1', .01), mkRound(2, 'B', 'Opção A mudou na rodada 2', .02)],
    });
    await writeJson(path.join(dryRunDir, 'summary.json'), {
      test: name, runId: dryRunId, pipelineExecuted: false, executionMode: 'dry-run',
      rounds: [mkRound(1, 'E', 'Saída falsa', 999)],
    });
    await writeJson(path.join(fakeRunDir, 'summary.json'), {
      test: name, runId: fakeRunId, pipelineExecuted: true, executionMode: 'fake',
      rounds: [mkRound(1, 'E', 'Saída fake', 8888)],
    });

    await generate({ reports, out, baseline, reference, visuals });
    const md = await readFile(path.join(out, 'comparativo.md'), 'utf8');
    const csv = await readFile(path.join(out, 'comparativo.csv'), 'utf8');
    const comparison = await readFile(path.join(runDir, 'comparacao.md'), 'utf8');
    assert.match(md, /baseline_gemini_2_5_flash/);
    assert.match(md, /141107/);
    assert.match(md, /57889/);
    assert.match(md, /90/);
    assert.match(md, /0\.03/);
    assert.match(md, /0\.165/);
    assert.match(md, /1/);
    assert.match(md, /8\/8/);
    assert.doesNotMatch(md, /dry-run-12345678/);
    assert.doesNotMatch(md, /fake-run-12345678/);
    assert.doesNotMatch(md, /999/);
    assert.doesNotMatch(md, /8888/);
    assert.match(csv, /SEM_VERDADE_DE_REFERENCIA|NAO_VERIFICADO/);
    assert.match(comparison, /Baseline Gemini/);
    assert.match(comparison, /Rodada 1/);
    assert.match(comparison, /Rodada 2/);
    assert.match(comparison, /Gabarito vs referência humana: NAO_VERIFICADO/);
    assert.match(comparison, /4\/4 elementos recuperados/);
    assert.match(comparison, /imagem=passada; diferença=reconhecida/);
    assert.equal(await readFile(path.join(dryRunDir, 'comparacao.md'), 'utf8').catch(() => ''), '');
    assert.equal(await readFile(path.join(fakeRunDir, 'comparacao.md'), 'utf8').catch(() => ''), '');
    const roundCsv = await readFile(path.join(out, 'comparativo-rodadas.csv'), 'utf8');
    assert.match(roundCsv, /real-run-12345678/);
    assert.doesNotMatch(roundCsv, /dry-run-12345678/);
    assert.doesNotMatch(roundCsv, /fake-run-12345678/);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

test('missing visual page remains in the expected-elements denominator and counts as absent', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'model-comparison-'));
  try {
    const reports = path.join(tmp, 'reports'); const out = path.join(tmp, 'out');
    const name = TEST_NAMES[2]; const runId = 'missing-visual-123456';
    const baseline = path.join(tmp, 'baseline.json'); const reference = path.join(tmp, 'reference.json'); const visuals = path.join(tmp, 'visuals.json');
    await writeJson(baseline, { questions: [] }); await writeJson(path.join(tmp, 'e2e-results-summary.json'), {});
    await writeJson(reference, { status: 'SEM_VERDADE_DE_REFERENCIA', questions: [] });
    await writeJson(visuals, { questions: [{ number: '03', page: 5, expectedElements: ['rótulo visível', 'forma química'] }] });
    await writeJson(path.join(reports, name, runId, 'summary.json'), {
      test: name, runId, executionMode: 'local-e2e', pipelineExecuted: true,
      rounds: [{ round: 1, status: 'PARTIAL', questions: [], calls: [], metrics: {}, knowledgeBase: {
        assetCount: 1, indexedCount: 1,
        descriptions: [{ assetId: 'wrong-page-asset', pageNumber: 4, description: 'Descrição sem os elementos esperados.', model: 'visual-model', status: 'READY' }],
      } }],
    });
    await generate({ reports, out, baseline, reference, visuals });
    const md = await readFile(path.join(out, 'comparativo.md'), 'utf8');
    const comparison = await readFile(path.join(reports, name, runId, 'comparacao.md'), 'utf8');
    assert.match(md, /0\/2/);
    assert.match(md, /descrição ausente da página 5/);
    assert.match(comparison, /0\/2 elementos recuperados/);
    assert.match(comparison, /ausentes: rótulo visível, forma química/);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

test('cost stays unverified if any call in the run has no priced usage', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'model-comparison-'));
  try {
    const reports = path.join(tmp, 'reports'); const out = path.join(tmp, 'out'); const name = TEST_NAMES[1]; const runId = 'partial-cost-123456';
    const baseline = path.join(tmp, 'baseline.json'); const reference = path.join(tmp, 'reference.json'); const visuals = path.join(tmp, 'visuals.json');
    await writeJson(baseline, { questions: [] }); await writeJson(path.join(tmp, 'e2e-results-summary.json'), {});
    await writeJson(reference, { status: 'SEM_VERDADE_DE_REFERENCIA', questions: [] }); await writeJson(visuals, { questions: [] });
    await writeJson(path.join(reports, name, runId, 'summary.json'), {
      test: name, runId, pipelineExecuted: true,
      rounds: [{ round: 1, status: 'PARTIAL', questions: [question()], calls: [
        { agent: 'question_answer', inputTokens: 10, outputTokens: 4, reasoningTokens: 0, latencyMs: 50, costUsd: .01 },
        { agent: 'visual', inputTokens: 5, outputTokens: 2, reasoningTokens: 0, latencyMs: 60, costUsd: 'NAO_VERIFICADO' },
      ], metrics: {} }],
    });
    await generate({ reports, out, baseline, reference, visuals });
    const md = await readFile(path.join(out, 'comparativo.md'), 'utf8');
    assert.match(md, /NAO_VERIFICADO/);
    assert.doesNotMatch(md, /0\.01\b/);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});
