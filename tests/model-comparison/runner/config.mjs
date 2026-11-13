import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { finalizeSummaryWithTelemetry } from './telemetry-summary.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const TESTS = {
  e2e_economica_qwen30b_deepseek: {
    embedding: 'qwen/qwen3-embedding-8b',
    completionFull: 'deepseek/deepseek-v3.2',
    visual: 'qwen/qwen3-vl-30b-a3b-instruct', chatImage: 'qwen/qwen3-vl-235b-a22b-instruct',
    extraction: 'qwen/qwen3-vl-30b-a3b-instruct', alternatives: 'deepseek/deepseek-v3.2', answer: 'deepseek/deepseek-v3.2', explanation: 'deepseek/deepseek-v3.2',
    review: 'qwen/qwen3-vl-235b-a22b-instruct', normalize: 'qwen/qwen3-vl-235b-a22b-instruct',
  },
  e2e_qualidade_kimi_gera_qwen_revisa: {
    embedding: 'qwen/qwen3-embedding-8b',
    completionFull: 'moonshotai/kimi-k2.6',
    visual: 'qwen/qwen3-vl-235b-a22b-instruct', chatImage: 'moonshotai/kimi-k2.6',
    extraction: 'qwen/qwen3-vl-30b-a3b-instruct', alternatives: 'moonshotai/kimi-k2.5', answer: 'moonshotai/kimi-k2.6', explanation: 'moonshotai/kimi-k2.5',
    review: 'qwen/qwen3-vl-235b-a22b-instruct', normalize: 'qwen/qwen3-vl-235b-a22b-instruct',
  },
  e2e_so_qwen235b: {
    embedding: 'qwen/qwen3-embedding-8b',
    completionFull: 'qwen/qwen3-vl-235b-a22b-instruct',
    visual: 'qwen/qwen3-vl-235b-a22b-instruct', chatImage: 'qwen/qwen3-vl-235b-a22b-instruct',
    extraction: 'qwen/qwen3-vl-30b-a3b-instruct', alternatives: 'qwen/qwen3-vl-235b-a22b-instruct', answer: 'qwen/qwen3-vl-235b-a22b-instruct', explanation: 'qwen/qwen3-vl-235b-a22b-instruct',
    review: 'qwen/qwen3-vl-235b-a22b-instruct', normalize: 'qwen/qwen3-vl-235b-a22b-instruct',
  },
  e2e_revisao_cruzada_qwen_gera_deepseek_revisa: {
    embedding: 'qwen/qwen3-embedding-8b',
    completionFull: 'qwen/qwen3-vl-235b-a22b-instruct',
    visual: 'qwen/qwen3-vl-235b-a22b-instruct', chatImage: 'qwen/qwen3-vl-235b-a22b-instruct',
    extraction: 'qwen/qwen3-vl-30b-a3b-instruct', alternatives: 'qwen/qwen3-vl-235b-a22b-instruct', answer: 'qwen/qwen3-vl-235b-a22b-instruct', explanation: 'qwen/qwen3-vl-235b-a22b-instruct',
    review: 'deepseek/deepseek-v3.2', normalize: 'qwen/qwen3-vl-235b-a22b-instruct',
  },
};
const aliases = {
  embedding: ['OPENROUTER_EMBEDDING_MODEL'],
  completionFull: ['QUESTION_COMPLETION_MODEL'],
  extraction: ['QUESTION_EXTRACTION_MODEL', 'QUESTION_SOURCE_RECONSTRUCTION_MODEL', 'QUESTION_CATEGORIZE_MODEL', 'TOPIC_PROFILE_MODEL', 'DOCUMENT_BLOCK_TOPIC_CLASSIFICATION_MODEL'],
  alternatives: ['QUESTION_ALTERNATIVES_MODEL'], answer: ['QUESTION_ANSWER_MODEL'], explanation: ['QUESTION_EXPLANATION_MODEL'],
  review: ['QUESTION_QUALITY_REVIEW_MODEL'], normalize: ['QUESTION_COMPLETION_MODEL'], chatImage: ['CHAT_IMAGE_MODEL'], visual: ['DOCUMENT_VISUAL_DESCRIPTION_MODEL'],
};

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith('#')) return [];
    return [[match[1], match[2].replace(/^(["'])(.*)\1$/, '$2')]];
  }));
}

function readOnlyBaselineDatabaseAudit() {
  const sql = `SELECT d.original_name, d.id, d.status, count(c.id), count(c.embedding), coalesce(string_agg(DISTINCT c.chunker_version, ','), ''), coalesce(string_agg(DISTINCT c.embedding_model, ','), '') FROM monitor_documents d LEFT JOIN document_chunks c ON c.document_id=d.id WHERE d.id IN ('9ff3a570-9c14-42a6-8a89-ed9a53fa58bc','5796b615-8eea-498a-ad44-8690d3af0ee9','06fdb700-1039-4214-b856-170e75c17338') GROUP BY d.original_name,d.id,d.status ORDER BY d.original_name`;
  const result = spawnSync('psql', [
    'postgresql://postgres:postgres@127.0.0.1:56322/postgres', '-X', '-A', '-t', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-c', sql,
  ], { encoding: 'utf8', env: { ...process.env, PGOPTIONS: '-c default_transaction_read_only=on' }, timeout: 10000 });
  if (result.status !== 0) return { status: 'NAO_VERIFICADO', reason: 'Postgres local baseline indisponível ou consulta read-only falhou.' };
  const documents = result.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const [name, id, status, chunks, vectors, chunkerVersions, embeddingModels] = line.split('\t');
    return { name, id, status, chunks: Number(chunks), vectors: Number(vectors), chunkerVersions: chunkerVersions || null, embeddingModels: embeddingModels ? embeddingModels.split(',') : [] };
  });
  return { status: documents.length === 3 ? 'READ_ONLY_CONFIRMED' : 'PARTIAL', documents };
}

export async function runDryRun(testName, { validateCatalog = true } = {}) {
  const runId = `${testName}-${new Date().toISOString().replaceAll(':', '').replaceAll('.', '')}-${randomUUID()}`;
  const envFile = resolve(ROOT, `backend/.env.test.${testName}`);
  const env = parseEnv(await readFile(envFile, 'utf8'));
  const models = TESTS[testName];
  const modelIds = [...new Set(Object.values(models))];
  const baselinePath = resolve(ROOT, 'dbtemp/artifacts/9df3b11e-d426-4542-aa57-1d1982f17f01/e2e-results-summary.json');
  let baseline = null;
  try { baseline = JSON.parse(await readFile(baselinePath, 'utf8')); } catch { /* baseline artifact is reported as unavailable */ }
  const baselineDatabaseAudit = readOnlyBaselineDatabaseAudit();
  let catalog = null;
  let catalogError = null;
  if (validateCatalog) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`catálogo HTTP ${response.status}`);
      catalog = await response.json();
    } catch (error) { catalogError = error instanceof Error ? error.message : String(error); }
  }
  const catalogModels = new Map((catalog?.data ?? []).map((item) => [item.id, item]));
  const mappings = Object.fromEntries(Object.entries(aliases).map(([stage, keys]) => [stage, {
    model: models[stage], envVariables: keys,
    configured: keys.filter((key) => env[key] === models[stage]),
    limitation: 'produção compartilha variáveis de algumas etapas; interceptor em teste poderá rotear por schemaName quando executar',
  }]));
  const modelCapabilities = Object.fromEntries(modelIds.map((id) => {
    const item = catalogModels.get(id);
    return [id, item ? {
      inputModalities: item.architecture?.input_modalities ?? null,
      responseFormatParameter: item.supported_parameters?.includes('response_format') ?? null,
      jsonSchemaPerProvider: 'NAO_VERIFICADO',
      status: item.architecture?.input_modalities && item.supported_parameters ? 'CATALOG_METADATA_AVAILABLE' : 'NAO_VERIFICADO',
    } : { inputModalities: null, responseFormatParameter: null, jsonSchemaPerProvider: 'NAO_VERIFICADO', status: 'NAO_VERIFICADO' }];
  }));
  const outDir = resolve(ROOT, 'reports', testName, runId);
  await mkdir(outDir, { recursive: true });
  const summary = {
    runId, test: testName, executionMode: 'dry-run', paidCallsMade: 0, pipelineExecuted: false,
    generatedAt: new Date().toISOString(), modelIds,
    catalog: catalogError ? { status: 'NAO_VERIFICADO', error: catalogError } : { status: 'VALIDATED', listedIds: modelIds.filter((id) => catalogModels.has(id)), missingIds: modelIds.filter((id) => !catalogModels.has(id)) },
    modelCapabilities,
    capabilityValidation: {
      visualInput: ['visual', 'chatImage'].map((stage) => ({ stage, model: models[stage], supported: modelCapabilities[models[stage]]?.inputModalities?.includes('image') ?? null })),
      structuredJsonSchema: Object.fromEntries(modelIds.map((id) => [id, modelCapabilities[id]?.responseFormatParameter === true ? 'PARTIAL_CATALOG_SUPPORT_JSON_SCHEMA_PROVIDER_SPECIFIC_UNVERIFIED' : 'NAO_VERIFICADO'])),
    },
    stages: mappings,
    provider: { status: 'UNRESOLVED', order: null, allow_fallbacks: false, reason: 'Dry-run não seleciona provedor. Exige consulta de endpoints/preços e revisão de política de retenção antes de orçamento ou execução.' },
    cost: { currency: 'USD', estimatedMaximum: null, status: 'NAO_VERIFICADO', reason: 'Sem provedor e preço de endpoint validados; nenhum valor foi inventado.' },
    repetitions: 2,
    rounds: [1, 2].map((round) => ({
      round, status: 'NAO_VERIFICADO', questions: Array.from({ length: 10 }, (_, i) => ({
        number: String(i + 1).padStart(2, '0'), statement: null, alternatives: null,
        correctAnswer: null, explanation: null, reviewDecision: null, status: 'NAO_VERIFICADO',
      })), calls: [], metrics: { status: 'NAO_VERIFICADO' },
    })),
    baseline: baseline ? {
      status: 'FOUND', runId: baseline.runId, documents: (baseline.documents ?? []).map(({ name, sha256, chunks, embeddedChunks }) => ({ name, sha256, chunks, embeddedChunks })),
      reuseStatus: 'NAO_VERIFICADO',
    } : { status: 'NAO_VERIFICADO' },
    baselineDatabaseAudit,
    metrics: { status: 'NAO_VERIFICADO', jsonValidFirstAttempt: null, retries: null, finalFailures: null, answerAccuracy: null, reviewAgreement: null, tokens: null, costUsd: null, costBrl: null, latencyP50Ms: null, latencyP95Ms: null, totalPipelineMs: null, betweenRoundVariance: null },
    parameters: {
      documentTextSource: env.DOCUMENT_TEXT_SOURCE,
      documentParserEnableOcr: env.DOCUMENT_PARSER_ENABLE_OCR === 'true',
      documentIngestionV3Enabled: env.DOCUMENT_INGESTION_V3_ENABLED === 'true',
      embeddingModel: env.OPENROUTER_EMBEDDING_MODEL,
      reasoningEffortGlobal: env.AI_REASONING_EFFORT,
      reasoning: {
        shortStages: 'Disable with reasoning.enabled=false or reasoning_effort=none only when the model and selected provider endpoint advertise the same parameter; block if a reasoning model lacks endpoint control.',
        crossReviewTestD: { enabled: testName === 'e2e_revisao_cruzada_qwen_gera_deepseek_revisa', maxTokens: testName === 'e2e_revisao_cruzada_qwen_gera_deepseek_revisa' ? 2400 : null, status: testName === 'e2e_revisao_cruzada_qwen_gera_deepseek_revisa' ? 'configured_test_only' : 'not_applicable' },
      },
      temperaturesByTask: {
        visual: 0,
        chatImage: env.CHAT_AI_TEMPERATURE,
        extraction: env.QUESTION_EXTRACTION_TEMPERATURE,
        sourceReconstruction: env.QUESTION_SOURCE_RECONSTRUCTION_TEMPERATURE,
        categorize: env.QUESTION_CATEGORIZE_TEMPERATURE,
        topicProfile: env.TOPIC_PROFILE_TEMPERATURE,
        completion: env.QUESTION_COMPLETION_TEMPERATURE,
        alternatives: env.QUESTION_ALTERNATIVES_TEMPERATURE,
        answer: env.QUESTION_ANSWER_TEMPERATURE,
        explanation: env.QUESTION_EXPLANATION_TEMPERATURE,
        review: env.QUESTION_QUALITY_REVIEW_TEMPERATURE,
        documentBlockTopicClassification: env.DOCUMENT_BLOCK_TOPIC_CLASSIFICATION_TEMPERATURE,
      },
      temperaturePolicy: 'Interceptor preserva body.temperature sem sobrescrever. Valores registrados no calls.jsonl são os enviados pelo código no processo de teste.',
    },
    isolation: { status: 'BLOCKED', databaseSchema: env.MODEL_COMPARISON_DATABASE_SCHEMA ?? null, runIdPrefix: runId, reason: 'Arquivo env define schema isolado, mas o runner atual de ingestão grava no Postgres local compartilhado; isolamento real ainda não está implementado.' },
    baselineReuse: { status: 'BLOCKED', reason: `Auditoria read-only encontrou chunks/vetores do baseline (${baselineDatabaseAudit.status}); Quimica-3 não tem chunker_version registrado. Ainda não há exportação/importação isolada verificada: rows de chunks dependem de documento/tenant/bloco e de text, blocks, parse runs, visual assets, spans e sources; copiar apenas chunks não preserva o grafo.` },
    assertions: { status: 'NOT_RUN', reason: 'Dry-run valida apenas configuração/catálogo; não simula resultado do pipeline.' },
    blockers: [
      'O schema question_completion_full combina alternativas, gabarito e explicação num pedido só. Não há mapeamento objetivo para três modelos separados; o interceptor bloqueia esse schema até haver decisão explícita de atribuição.',
      'Provider order e preços precisam ser resolvidos por endpoint de cada modelo; retenção exige revisão da política do provedor escolhido.',
      'Reuso fiel bloqueado: chunks têm FK para documento/tenant/bloco e o grafo inclui text, blocks, parse runs, visual assets, spans e sources com chaves únicas; copiar só chunks quebra relações e copiar o banco inteiro preserva IDs do baseline em vez do prefixo da rodada.',
      ...(catalogError ? [`Catálogo OpenRouter não consultado: ${catalogError}`] : []),
    ],
  };
  const finalizedSummary = finalizeSummaryWithTelemetry(summary);
  await writeFile(resolve(outDir, 'summary.json'), `${JSON.stringify(finalizedSummary, null, 2)}\n`, { mode: 0o600 });
  return finalizedSummary;
}
