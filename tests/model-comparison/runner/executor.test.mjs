import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { TESTS, ROOT } from './config.mjs';
import { executeRound, runTest, validateProviderPreflight, validateRunRequest } from './execute-pipeline.mjs';
import { makeChildEnvironment } from './child-environment.mjs';
import { provisionIsolatedDatabase, sanitizeSchemaDump } from './local-database.mjs';
import { parseSimpleEnv } from './child-environment.mjs';
import { summarizeQuestionQuality } from './pipeline-worker.mjs';

function catalogFor(testName, overrides = {}) {
  return [...new Set(Object.values(TESTS[testName]))].map((id) => ({
    id, exists: true, imageInput: id.includes('vl-') || id.includes('kimi-'),
    taskType: id === 'qwen/qwen3-embedding-8b' ? 'embedding' : 'chat',
    modelSupportedParameters: id === 'deepseek/deepseek-v3.2' ? ['reasoning'] : [],
    providers: [{ name: providerFor(testName, id), structuredOutputs: id !== 'qwen/qwen3-embedding-8b', supportedParameters: id === 'deepseek/deepseek-v3.2' ? ['structured_outputs','reasoning'] : ['structured_outputs'] }],
    ...overrides[id],
  }));
}

function providerFor(testName, model) {
  const key = `MODEL_COMPARISON_PROVIDER_${model.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`;
  // Values are read from each checked-in ignored env; use the same env parser as executor.
  return process.env[key] ?? ({
    'qwen/qwen3-vl-30b-a3b-instruct': 'siliconflow',
    'qwen/qwen3-vl-235b-a22b-instruct': 'parasail',
    'deepseek/deepseek-v3.2': 'deepinfra',
    'moonshotai/kimi-k2.5': 'atlascloud',
    'moonshotai/kimi-k2.6': 'chutes',
    'qwen/qwen3-embedding-8b': 'deepinfra',
  })[model];
}

test('run identity uses the strict test/round/runId allowlist', () => {
  const id = validateRunRequest({ testName: 'e2e_so_qwen235b', round: 2, runId: 'local-run-12345' });
  assert.match(id.databaseName, /^mc_[a-z0-9_]+_r2_[a-f0-9]{16}$/u);
  assert.throws(() => validateRunRequest({ testName: 'other', round: 1, runId: 'local-run-12345' }), /matriz/u);
  assert.throws(() => validateRunRequest({ testName: 'e2e_so_qwen235b', round: 1, runId: '../escape' }), /runId/u);
});

test('provider preflight fails closed on missing provider capability or image input', () => {
  const testName = 'e2e_economica_qwen30b_deepseek';
  const env = Object.fromEntries([...new Set(Object.values(TESTS[testName]))].map((id) => [
    `MODEL_COMPARISON_PROVIDER_${id.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`, providerFor(testName, id),
  ]));
  const preflight = { models: catalogFor(testName) };
  assert.equal(validateProviderPreflight({ testName, testEnv: env, preflight }).status, 'VALIDATED');
  const broken = { models: catalogFor(testName, { 'qwen/qwen3-vl-235b-a22b-instruct': { imageInput: false } }) };
  assert.throws(() => validateProviderPreflight({ testName, testEnv: env, preflight: broken }), /imagem/u);
});

test('todos os envs pinam o provider exigido para os modelos usados em cada matriz', async () => {
  for (const testName of Object.keys(TESTS)) {
    const testEnv = parseSimpleEnv(await readFile(`${ROOT}/backend/.env.test.${testName}`, 'utf8'));
    const expectedModels = [...new Set(Object.values(TESTS[testName]))];
    const catalog = catalogFor(testName).map((entry) => {
      const key = `MODEL_COMPARISON_PROVIDER_${entry.id.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`;
      return { ...entry, providers: [{ ...entry.providers[0], name: testEnv[key] ?? '' }] };
    });
    const validated = validateProviderPreflight({ testName, testEnv, preflight: { models: catalog } });
    assert.deepEqual(validated.models.sort(), expectedModels.sort());
    assert.equal(validated.status, 'VALIDATED');
  }
});

test('qualityChecks conta aprovações/falhas e mantém não verificados por questão/campo', () => {
  const alternatives = ['A','B','C','D','E'].map((label) => ({ label, text: `option ${label}` }));
  const { questions, qualityChecks } = summarizeQuestionQuality([
    { number:'01', alternatives, correctAnswer:'A', explanation:'x'.repeat(700), evidence:'e'.repeat(300), evidenceStatus:'VERIFIED_FROM_PERSISTED_SOURCE', missingFields:[], missingFieldsStatus:'PERSISTED' },
    { number:'02', alternatives:alternatives.slice(0, 4), correctAnswer:'E', explanation:'x'.repeat(701), evidence:'e'.repeat(301), evidenceStatus:'VERIFIED_FROM_PERSISTED_SOURCE', missingFields:['EXPLANATION'], missingFieldsStatus:'PERSISTED' },
    { number:'03', alternatives, correctAnswer:'B', explanation:'short', evidence:null, evidenceStatus:'NAO_VERIFICADO', missingFields:[], missingFieldsStatus:'NAO_VERIFICADO' },
  ]);
  assert.equal(qualityChecks.status, 'FAILED');
  assert.deepEqual([qualityChecks.passed, qualityChecks.failed, qualityChecks.notVerified, qualityChecks.total], [8,5,2,15]);
  assert.deepEqual(qualityChecks.byQuestion.map((question) => question.status), ['PASSED','FAILED','PARTIAL_UNVERIFIED']);
  assert.ok(questions[1].assertions.explanationUnder700Chars === false);
  assert.ok(questions[2].assertions.evidenceUnder300Chars === null);
});

test('dry-run records unique DB, providers and no imported graph/inference', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mc-executor-test-'));
  const testName = 'e2e_so_qwen235b';
  const runId = 'fake-run-123456';
  let provisionCalls = 0;
  try {
    const summary = await executeRound({ testName, round: 1, runId, reportsRoot: directory, adapters: {
      preflight: async () => ({ models: catalogFor(testName) }),
      assertDatabaseDoesNotExist: async ({ testName: name, round: r, runId: rid }) => {
        provisionCalls += 1;
        return validateRunRequest({ testName: name, round: r, runId: rid }).databaseName;
      },
      writeFile: async () => {},
    } });
    assert.equal(summary.pipelineExecuted, false);
    assert.equal(summary.paidCallsMade, 0);
    assert.equal(summary.executionMode, 'dry-run');
    assert.equal(summary.database.host, '127.0.0.1');
    assert.equal(summary.database.existsBeforeRun, false);
    assert.equal(summary.visual.visualEmbeddingCallsExpected, 31);
    assert.equal(summary.questionExtraction.sourceExtraction, 'DETERMINISTIC_SOURCE_EXTRACTION');
    assert.equal(provisionCalls, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('worker bootstrap usa process.execPath absoluto sem depender do PATH herdado', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mc-worker-bootstrap-'));
  const testName = 'e2e_so_qwen235b';
  const runId = 'worker-bootstrap-1234';
  let childSpawned = false;
  try {
    const summary = await executeRound({ testName, round: 1, runId, execute: true, reportsRoot: directory, adapters: {
      preflight: async () => ({ models: catalogFor(testName) }),
      assertDatabaseDoesNotExist: async ({ testName: name, round, runId: id }) => validateRunRequest({ testName: name, round, runId: id }).databaseName,
      exportGraph: async () => ({ sourceProof: { chunkerEquivalenceStatus: 'NAO_VERIFICADO' } }),
      provision: async ({ testName: name, round, runId: id }) => ({ databaseName: validateRunRequest({ testName: name, round, runId: id }).databaseName, tableCount: 83, schemaSha256: 'fake-schema' }),
      importGraph: async () => ({ status: 'IMPORTED_CHUNKER_VERSION_UNVERIFIED', writesExecuted: true }),
      makeChildEnvironment: async () => ({ NODE_ENV: 'test', MODEL_COMPARISON_READY: '1' }),
      spawnSync: (command, args, options) => {
        childSpawned = true;
        assert.equal(command, process.execPath);
        assert.equal(options.env.PATH, undefined);
        assert.ok(args.includes(resolve(ROOT, 'tests/model-comparison/runner/pipeline-worker.mjs')));
        assert.ok(args.includes('--test') && args.includes(testName));
        return { status: 0, error: null };
      },
      readFile: async (path, encoding) => path.endsWith('pipeline-result.json')
        ? JSON.stringify({ visual: { status: 'COMPLETED', assetsRequested: 31, assetsIndexed: 31 }, extraction: { status: 'COMPLETED' }, questions: [], imageChatQ03: { status: 'NOT_VERIFIED' }, totalPipelineMs: 1 })
        : readFile(path, encoding),
      writeFile: async () => {},
    } });
    assert.equal(childSpawned, true);
    assert.equal(summary.pipelineExecuted, true);
    assert.equal(summary.paidCallsMade, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('child environment only receives loopback DB/Supabase and one key from base env', async () => {
  const testName = 'e2e_so_qwen235b';
  const dbName = validateRunRequest({ testName, round: 1, runId: 'env-test-12345' }).databaseName;
  const data = {
    [`${ROOT}/backend/.env.test.${testName}`]: 'NODE_ENV=test\nDATABASE_URL=postgresql://remote.example/sandbox\nMODEL_COMPARISON_ALLOW_PAID=0\n',
    [`${ROOT}/backend/.env`]: 'OPENROUTER_API_KEY=test-secret\nDATABASE_URL=postgresql://remote.example/prod\nAWS_SECRET_ACCESS_KEY=should-not-copy\n',
  };
  const env = await makeChildEnvironment({ root: ROOT, testName, databaseUrl: `postgresql://postgres:postgres@127.0.0.1:56322/${dbName}`, runId: 'env-test-12345', round: 1, outputDir: '/tmp/mc-output', read: async (path) => data[path], spawn: () => ({ status: 0, stdout: 'API_URL=http://127.0.0.1:56321\nANON_KEY=local-anon\nSERVICE_ROLE_KEY=local-service\n', error: null }) });
  assert.equal(new URL(env.DATABASE_URL).hostname, '127.0.0.1');
  assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:56321/');
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, 'local-service');
  assert.equal(env.OPENROUTER_API_KEY, 'test-secret');
  assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(new URL(env.REDIS_URL).hostname, '127.0.0.1');
});

test('all four child envs accept the explicit visual-description and image-chat model keys', async () => {
  for (const testName of Object.keys(TESTS)) {
    const databaseName = validateRunRequest({ testName, round: 1, runId: `allowlist-${testName.slice(4)}` }).databaseName;
    const env = await makeChildEnvironment({
      root: ROOT, testName,
      databaseUrl: `postgresql://postgres:postgres@127.0.0.1:56322/${databaseName}`,
      runId: `allowlist-${testName.slice(4)}`, round: 1, outputDir: '/tmp/mc-allowlist-test',
      read: async (path, encoding) => path.endsWith(`/backend/.env.test.${testName}`)
        ? readFile(path, encoding)
        : 'OPENROUTER_API_KEY=fake-test-key\n',
      spawn: () => ({ status: 0, stdout: 'API_URL=http://127.0.0.1:56321\nPUBLISHABLE_KEY=local-publishable\nSERVICE_ROLE_KEY=local-service\n', error: null }),
    });
    assert.equal(env.DOCUMENT_VISUAL_DESCRIPTION_MODEL, TESTS[testName].visual);
    assert.equal(env.CHAT_IMAGE_MODEL, TESTS[testName].chatImage);
  }
});

test('database provision refuses a preexisting run database before any DDL command', async () => {
  const calls = [];
  await assert.rejects(provisionIsolatedDatabase({
    testName: 'e2e_so_qwen235b', round: 1, runId: 'existing-db-run', workdir: ROOT,
    dependencies: { databaseExists: async () => true, run: (...args) => calls.push(args) },
  }), /já existe/u);
  assert.equal(calls.length, 0);
});

test('schema dump removes only Supabase admin role escalation, preserving local owners and grants', () => {
  const dump = [
    'ALTER TABLE public.a OWNER TO "supabase_admin";\n',
    'ALTER FUNCTION auth.f() OWNER TO "supabase_auth_admin";\n',
    'ALTER TABLE public.b OWNER TO postgres;\n',
    'ALTER SCHEMA extensions OWNER TO pg_database_owner;\n',
    'ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA auth GRANT SELECT ON TABLES TO authenticated;\n',
    'SET ROLE "supabase_admin";\n',
    'GRANT SELECT ON public.b TO authenticated;\n',
    'REVOKE UPDATE ON public.b FROM anon;\n',
    'CREATE TABLE public.b (id integer);\n',
  ].join('');
  const result = sanitizeSchemaDump(dump);
  assert.deepEqual(result.removed, { ownership: 2, grants: 1, roleSwitches: 1 });
  assert.equal(result.removedTotal, 4);
  assert.match(result.sql, /OWNER TO postgres/u);
  assert.match(result.sql, /OWNER TO pg_database_owner/u);
  assert.match(result.sql, /GRANT SELECT ON public\.b/u);
  assert.match(result.sql, /REVOKE UPDATE ON public\.b/u);
  assert.match(result.sql, /CREATE TABLE public\.b/u);
  assert.doesNotMatch(result.sql, /supabase_(?:auth_)?admin/u);

  const realDumpShape = [
    ...Array.from({ length: 38 }, (_, index) => `ALTER TABLE auth.object_${index} OWNER TO "${index === 0 ? 'supabase_admin' : 'supabase_auth_admin'}";\n`),
    ...Array.from({ length: 6 }, () => 'ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA auth GRANT SELECT ON TABLES TO authenticated;\n'),
    'ALTER SCHEMA public OWNER TO "pg_database_owner";\nCREATE TABLE public.kept (id integer);\n',
  ].join('');
  const realShapeResult = sanitizeSchemaDump(realDumpShape);
  assert.equal(realShapeResult.removed.ownership, 38);
  assert.equal(realShapeResult.removed.grants, 6);
  assert.match(realShapeResult.sql, /OWNER TO "pg_database_owner"/u);
  assert.match(realShapeResult.sql, /CREATE TABLE public\.kept/u);
});

test('runTest agrega duas rodadas sob um runId com diretórios de chamadas separados', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mc-two-rounds-'));
  const testName = 'e2e_so_qwen235b';
  try {
    const summary = await runTest({ testName, runId: 'two-round-run-12345', reportsRoot: directory, adapters: {
      preflightData: { models: catalogFor(testName) },
      assertDatabaseDoesNotExist: async ({ testName: name, round, runId }) => validateRunRequest({ testName: name, round, runId }).databaseName,
    } });
    assert.equal(summary.pipelineExecuted, false);
    assert.equal(summary.rounds.length, 2);
    assert.deepEqual(summary.rounds.map((round) => round.round), [1, 2]);
    assert.notEqual(summary.rounds[0].database.name, summary.rounds[1].database.name);
    assert.equal(summary.rounds[0].status, 'DRY_RUN_NOT_EXECUTED');
    assert.equal(summary.callTelemetry.apiCallsSent, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
