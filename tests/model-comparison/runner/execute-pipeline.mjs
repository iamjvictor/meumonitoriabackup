#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { TESTS, ROOT } from './config.mjs';
import { assertDatabaseDoesNotExist, provisionIsolatedDatabase, safeTargetUrl } from './local-database.mjs';
import { exportBaselineGraph, importBaselineGraph, expectedTargetDatabaseName } from './baseline-transfer.mjs';
import { runPreflight } from '../provider-preflight.mjs';
import { makeChildEnvironment } from './child-environment.mjs';
import { finalizeSummaryWithTelemetry } from './telemetry-summary.mjs';

const NV = 'NAO_VERIFICADO';
const TEST_NAMES = Object.keys(TESTS);
const ROOT_REPORTS = resolve(ROOT, 'reports');

export function validateRunRequest({ testName, round, runId }) {
  if (!Object.hasOwn(TESTS, testName)) throw new Error('Teste fora da matriz permitida.');
  if (![1, 2].includes(Number(round))) throw new Error('Rodada deve ser 1 ou 2.');
  if (!/^[a-z0-9][a-z0-9_-]{7,63}$/iu.test(runId)) throw new Error('runId deve ter 8–64 caracteres seguros.');
  return { testName, round: Number(round), runId, databaseName: expectedTargetDatabaseName(testName, Number(round), runId) };
}

function selectedProviders(testName, testEnv) {
  const models = new Set(Object.values(TESTS[testName]));
  return Object.fromEntries([...models].map((model) => {
    const key = `MODEL_COMPARISON_PROVIDER_${model.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`;
    return [model, testEnv[key] ?? null];
  }));
}

export function validateProviderPreflight({ testName, testEnv, preflight }) {
  const models = TESTS[testName];
  const uniqueModels = [...new Set(Object.values(models))];
  const providers = selectedProviders(testName, testEnv);
  const failures = [];
  for (const id of uniqueModels) {
    const model = preflight.models?.find((item) => item.id === id);
    if (!model?.exists) { failures.push(`Modelo não confirmado: ${id}`); continue; }
    const provider = providers[id];
    if (!provider) { failures.push(`Provedor sem pin para ${id}`); continue; }
    const endpoint = model.providers?.find((item) => item.name.toLowerCase() === provider.toLowerCase());
    if (!endpoint) failures.push(`Provedor ${provider} não anunciado para ${id}`);
    if (id !== 'qwen/qwen3-embedding-8b' && !endpoint?.structuredOutputs) failures.push(`structured_outputs não anunciado para ${id}/${provider}`);
    if (id === 'qwen/qwen3-embedding-8b' && model.taskType !== 'embedding') failures.push(`Tipo de tarefa embedding não confirmado para ${id}`);
    const usesReasoning = (model.modelSupportedParameters ?? []).some((parameter) => ['reasoning','reasoning_effort'].includes(parameter));
    const endpointReasoningParameter = ['reasoning','reasoning_effort'].find((parameter) => endpoint?.supportedParameters?.includes(parameter) && model.modelSupportedParameters?.includes(parameter));
    if (usesReasoning && !endpointReasoningParameter) failures.push(`Controle de reasoning não confirmado para ${id}/${provider}`);
    if (testName === 'e2e_revisao_cruzada_qwen_gera_deepseek_revisa' && id === models.review && !endpointReasoningParameter) failures.push(`Revisão D requer reasoning controlável em ${id}/${provider}`);
  }
  for (const stage of ['visual', 'chatImage']) {
    const id = models[stage];
    const model = preflight.models?.find((item) => item.id === id);
    if (!model?.imageInput) failures.push(`Entrada de imagem não confirmada para ${stage}/${id}`);
  }
  if (failures.length) throw new Error(`Provider preflight bloqueou a execução: ${failures.join('; ')}`);
  return { status: 'VALIDATED', models: uniqueModels, providers, retention: 'NAO_VERIFICADO' };
}

export async function executeRound({ testName, round, runId, execute = false, adapters = {}, reportsRoot = ROOT_REPORTS, outDirOverride }) {
  const request = validateRunRequest({ testName, round, runId });
  const outDir = outDirOverride ? resolve(outDirOverride) : resolve(reportsRoot, testName, runId, `round-${request.round}`);
  await mkdir(outDir, { recursive: true, mode: 0o700 });
  const envText = await (adapters.readFile ?? readFile)(resolve(ROOT, `backend/.env.test.${testName}`), 'utf8');
  const { parseSimpleEnv } = await import('./child-environment.mjs');
  const testEnv = parseSimpleEnv(envText);
  const preflightOutput = resolve(outDir, `provider-preflight-round-${round}.json`);
  const preflight = await (adapters.preflight ?? runPreflight)({ out: preflightOutput });
  const providerProof = validateProviderPreflight({ testName, testEnv, preflight });
  const targetUrl = safeTargetUrl(request.databaseName, request);
  const absentDatabase = await (adapters.assertDatabaseDoesNotExist ?? assertDatabaseDoesNotExist)(request);
  if (absentDatabase !== request.databaseName) throw new Error('Nome de banco retornado diverge do destino calculado.');

  const summary = {
    runId, test: testName, round: request.round,
    executionMode: execute ? 'execute' : 'dry-run', paidCallsMade: 0, pipelineExecuted: false,
    database: { name: request.databaseName, host: '127.0.0.1', port: 56322, existsBeforeRun: false, schemaStatus: execute ? 'NOT_PROVISIONED' : 'NOT_PROVISIONED_DRY_RUN' },
    provider: providerProof,
    baseline: { status: 'NOT_IMPORTED_DRY_RUN', source: 'local dbtemp baseline (read-only export)', reuseEvidence: NV, chunkerVersion: NV },
    visual: { assetsExpected: 31, visualDescriptionCallsExpected: 31, visualEmbeddingCallsExpected: 31, status: 'NOT_RUN' },
    questionExtraction: { explicitBlocksExpected: 10, sourceExtraction: 'DETERMINISTIC_SOURCE_EXTRACTION', llmCallsAttributedToStatementExtraction: 0, status: 'NOT_RUN' },
    questionEmbeddings: { countExpected: 10, status: NV, reason: 'Embeddings de perguntas são chamadas adicionais do serviço de extração e serão contadas pelo interceptor.' },
    imageChatQ03: { status: 'NOT_RUN', inputPromptSource: 'baseline visual-chat.json prompt field', response: null },
    cost: { reportedUsd: NV, estimatedUsd: NV, status: NV, reason: 'Preço de endpoint disponível não define um teto máximo para tokens de visão, embeddings e respostas; relatório de custo real ficará por chamada.' },
    limitations: ['Retenção do provedor permanece NAO_VERIFICADO.', 'chunker_version está ausente em parte das linhas do baseline; igualdade de versão não será afirmada.'],
  };

  if (execute) {
    // This branch is intentionally callable only from an explicit coordinator CLI flag.
    const graph = await (adapters.exportGraph ?? exportBaselineGraph)({ ...request });
    const provision = await (adapters.provision ?? provisionIsolatedDatabase)({ ...request, workdir: ROOT });
    summary.database = { name: provision.databaseName, host: '127.0.0.1', port: 56322, existsBeforeRun: false, schemaStatus: 'LOADED', tableCount: provision.tableCount, schemaSha256: provision.schemaSha256 };
    const oldLocalWriteFlag = process.env.MODEL_COMPARISON_ALLOW_LOCAL_WRITE;
    process.env.MODEL_COMPARISON_ALLOW_LOCAL_WRITE = '1';
    let imported;
    try { imported = await (adapters.importGraph ?? importBaselineGraph)({ snapshot: graph, targetDatabaseUrl: targetUrl, ...request, execute: true, requireExpectedBaselineCounts: true }); }
    finally {
      if (oldLocalWriteFlag === undefined) delete process.env.MODEL_COMPARISON_ALLOW_LOCAL_WRITE;
      else process.env.MODEL_COMPARISON_ALLOW_LOCAL_WRITE = oldLocalWriteFlag;
    }
    summary.baseline = { status: imported.status, reuseEvidence: graph.sourceProof, chunkerVersion: graph.sourceProof.chunkerEquivalenceStatus };
    if (!imported.writesExecuted) throw new Error('Importador não confirmou escrita no banco dedicado.');
    const tempCwd = await mkdtemp(join(tmpdir(), 'mc-worker-env-'));
    try {
    const childEnv = await (adapters.makeChildEnvironment ?? makeChildEnvironment)({ root: ROOT, testName, databaseUrl: targetUrl, runId, round: request.round, outputDir: outDir });
      childEnv.MODEL_COMPARISON_READY = '1';
      childEnv.MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED = '1';
      childEnv.MODEL_COMPARISON_ALLOW_PAID = '1';
      const child = (adapters.spawnSync ?? spawnSync)(process.execPath, ['--import',resolve(ROOT,'backend/node_modules/tsx/dist/loader.mjs'),resolve(ROOT,'tests/model-comparison/runner/pipeline-worker.mjs'),'--test',testName,'--round',String(request.round),'--run',runId,'--output',outDir], {
        cwd: tempCwd, env: childEnv, stdio: 'ignore', timeout: 45 * 60_000,
      });
      if (child.error || child.status !== 0) throw new Error(`Pipeline child falhou (${child.status ?? 'sem status'}); stdout/stderr omitidos para impedir vazamento de prompts, conteúdo ou segredo.`);
      const result = JSON.parse(await (adapters.readFile ?? readFile)(resolve(outDir, 'pipeline-result.json'), 'utf8'));
      summary.pipelineExecuted = true;
      summary.paidCallsMade = true;
      summary.visual = result.visual;
      summary.questionExtraction = result.extraction;
      summary.questions = result.questions;
      summary.imageChatQ03 = result.imageChatQ03;
      summary.totalPipelineMs = result.totalPipelineMs;
      summary.database.childExit = 'SUCCESS';
    } finally { await rm(tempCwd, { recursive: true, force: true }); }
  }
  summary.assertions = execute ? { status: 'EXECUTED', questionCount: summary.questions?.length ?? 0 } : { status: 'NOT_RUN', reason: 'Dry-run valida preflight e destino, sem importar baseline ou chamar inferência.' };
  const destination = resolve(outDir, 'summary.json');
  await (adapters.writeFile ?? writeFile)(destination, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  return summary;
}

export async function runTest({ testName, runId = `${Date.now().toString(36)}-${randomUUID()}`, execute = false, adapters = {}, reportsRoot = ROOT_REPORTS }) {
  if (!Object.hasOwn(TESTS, testName)) throw new Error('Teste fora da matriz permitida.');
  validateRunRequest({ testName, round: 1, runId });
  const testRunDirectory = resolve(reportsRoot, testName, runId);
  await mkdir(testRunDirectory, { recursive: true, mode: 0o700 });
  const rounds = [];
  let executionError = null;
  let commonPreflight = adapters.preflightData ?? null;
  if (!commonPreflight) commonPreflight = await (adapters.preflight ?? runPreflight)({ out: resolve(testRunDirectory, 'provider-preflight.json') });
  for (const round of [1, 2]) {
    try {
      const roundAdapters = commonPreflight ? { ...adapters, preflight: async () => commonPreflight } : adapters;
      const result = await executeRound({ testName, round, runId, execute, adapters: roundAdapters, outDirOverride: resolve(testRunDirectory, `round-${round}`) });
      rounds.push({
        round, status: result.pipelineExecuted ? 'COMPLETED' : 'DRY_RUN_NOT_EXECUTED',
        questions: result.questions ?? [],
        qualityChecks: result.qualityChecks ?? { status: 'NAO_VERIFICADO', passed: 0, failed: 0, notVerified: 0, total: 0, byQuestion: [] },
        knowledgeBase: {
          status: result.visual?.status ?? 'NOT_RUN', assetCount: result.visual?.assetsRequested ?? 31,
          indexedCount: result.visual?.assetsIndexed ?? 0,
          descriptions: (result.visual?.descriptions ?? []).map((description) => ({ ...description, pageNumber: description.page })),
        },
        extraction: result.questionExtraction,
        chat: result.imageChatQ03?.status === 'COMPLETED' ? {
          status: result.imageChatQ03.imageContextPassed ? 'VERIFIED' : 'NOT_VERIFIED',
          questionNumber: '03', answer: result.imageChatQ03.response ?? null,
          imageContextPassed: result.imageChatQ03.imageContextPassed === true,
          visibleDifferenceRecognized: result.imageChatQ03.identifiedVisibleDifference ?? null,
          attachedAssetIds: result.imageChatQ03.attachedAssetIds ?? [],
        } : { status: result.imageChatQ03?.status ?? 'NAO_VERIFICADO', questionNumber: '03', imageContextPassed: false, visibleDifferenceRecognized: null },
        totalPipelineMs: result.totalPipelineMs ?? NV, database: result.database,
        baseline: result.baseline, calls: [], metrics: { status: 'PENDING_TELEMETRY_AGGREGATION' },
      });
    } catch (error) {
      executionError = 'Execução da rodada falhou; detalhes brutos foram omitidos do resumo.';
      let pipelineAttempted = false;
      try { await readFile(resolve(testRunDirectory, `round-${round}`, 'pipeline-started.json'), 'utf8'); pipelineAttempted = true; } catch { /* worker não iniciou */ }
      rounds.push({ round, status: 'FAILED', pipelineAttempted, qualityChecks: { status: 'NOT_RUN', passed: 0, failed: 0, notVerified: 0, total: 0, byQuestion: [] }, questions: [], calls: [], errorType: error instanceof Error ? error.name : 'UNKNOWN_ERROR' });
      break;
    }
  }
  const callsByRound = [];
  for (const round of [1, 2]) {
    try { callsByRound.push(await readFile(resolve(testRunDirectory, `round-${round}`, 'calls.jsonl'), 'utf8')); }
    catch { callsByRound.push(''); }
  }
  const callsJsonl = callsByRound.join('');
  await writeFile(resolve(testRunDirectory, 'calls.jsonl'), callsJsonl, { mode: 0o600, flag: 'wx' });
  const aggregated = finalizeSummaryWithTelemetry({
    runId, test: testName, executionMode: execute ? 'execute' : 'dry-run',
    modelMatrix: TESTS[testName],
    completionModelAssignment: {
      schemaName: 'question_completion_full', model: TESTS[testName].completionFull,
      outputFields: ['alternatives','correctAnswer','explanation'],
      reason: 'Produção combina os três campos em uma chamada; o executor não decompõe nem repete chamadas.',
      matrixDeviation: testName === 'e2e_qualidade_kimi_gera_qwen_revisa' ? 'Kimi K2.6 atende à conclusão combinada; alternativas/explicação com Kimi K2.5 não são isoladas pelo pipeline atual.' : null,
    },
    paidCallsMade: false,
    pipelineAttempted: execute && rounds.some((round) => round.status === 'COMPLETED' || round.pipelineAttempted),
    pipelineExecuted: execute && rounds.some((round) => round.status === 'COMPLETED' || round.pipelineAttempted),
    pipelineComplete: execute && rounds.length === 2 && rounds.every((round) => round.status === 'COMPLETED'),
    generatedAt: new Date().toISOString(), rounds,
    baseline: { path: 'dbtemp/artifacts/9df3b11e-d426-4542-aa57-1d1982f17f01/e2e-results-summary.json', status: 'FOUND', questionCount: 10, structuredCalls: 90, inputTokens: 141107, outputTokens: 57889, costUsd: NV },
    comparison: { humanAnswerKey: 'SEM_VERDADE_DE_REFERENCIA', chunkerVersion: NV, retention: NV },
    ...(executionError ? { executionError } : {}),
  }, callsJsonl);
  aggregated.paidCallsMade = (aggregated.callTelemetry?.apiCallsSent ?? 0) > 0;
  const qualityPairs = aggregated.rounds.filter((round) => round.qualityChecks && round.qualityChecks.status !== 'NOT_RUN').map((round) => ({ round: round.round, quality: round.qualityChecks }));
  const qualityRows = qualityPairs.map((pair) => pair.quality);
  aggregated.qualityChecks = {
    status: !qualityRows.length ? 'NOT_RUN' : qualityRows.some((quality) => quality.status === 'FAILED') ? 'FAILED' : qualityRows.some((quality) => quality.status !== 'PASSED') ? 'PARTIAL_UNVERIFIED' : 'PASSED',
    passed: qualityRows.reduce((total, quality) => total + (quality.passed ?? 0), 0),
    failed: qualityRows.reduce((total, quality) => total + (quality.failed ?? 0), 0),
    notVerified: qualityRows.reduce((total, quality) => total + (quality.notVerified ?? 0), 0),
    total: qualityRows.reduce((total, quality) => total + (quality.total ?? 0), 0),
    byRound: qualityPairs.map(({ round, quality }) => ({ round, ...quality })),
  };
  for (const round of aggregated.rounds ?? []) {
    if (round.metrics) round.metrics.totalDurationMs = round.totalPipelineMs ?? NV;
  }
  await writeFile(resolve(testRunDirectory, 'summary.json'), `${JSON.stringify(aggregated, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  return aggregated;
}

function args(argv) {
  const out = { execute: false, round: null, testName: null, runId: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--execute') out.execute = true;
    else if (argv[i] === '--test') out.testName = argv[++i];
    else if (argv[i] === '--round') out.round = Number(argv[++i]);
    else if (argv[i] === '--run-id') out.runId = argv[++i];
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = args(process.argv.slice(2));
  if (!options.testName) {
    process.stderr.write(`Uso: node tests/model-comparison/runner/execute-pipeline.mjs --test <${TEST_NAMES.join('|')}> --run-id <id> [--execute]\n`);
    process.exitCode = 2;
  } else {
    const runId = options.runId ?? `${options.testName}-${randomUUID()}`;
    runTest({ ...options, runId }).then((summary) => {
      process.stdout.write(JSON.stringify({ runId: summary.runId, mode: summary.executionMode, pipelineExecuted: summary.pipelineExecuted, paidCallsMade: summary.paidCallsMade, rounds: summary.rounds.map(({ round, status }) => ({ round, status })), summary: resolve(ROOT_REPORTS, summary.test, summary.runId, 'summary.json') }) + '\n');
    }).catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'executor falhou'}\n`); process.exitCode = 1; });
  }
}
