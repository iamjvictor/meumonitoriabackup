#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

const repoRoot = resolve(new URL('../../..', import.meta.url).pathname);
const backendRoot = resolve(repoRoot, 'backend');
const runRoot = resolve(repoRoot, 'tests/document-parser/local-agentic');
const require = createRequire(resolve(backendRoot, 'package.json'));
const dotenv = require('dotenv');
const { Pool } = require('pg');
const databaseUrl = 'postgresql://postgres:postgres@127.0.0.1:56322/postgres';
const supabaseUrl = 'http://127.0.0.1:56321';
const redisUrl = 'redis://127.0.0.1:56379';
const parserUrl = 'http://127.0.0.1:8080';
const checkpointSchema = 'question_graph_local_test';
const setupLocal = process.argv.includes('--setup-local');

function fail(message) {
  console.error(`[local-agentic] ${message}`);
  process.exit(1);
}

function parseStatus(stdout) {
  return Object.fromEntries(stdout.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    return match ? [[match[1], match[2].replace(/^"|"$/g, '')]] : [];
  }));
}

function validateLocalDatabaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('DATABASE_URL local inválida.'); }
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '56322' || url.pathname !== '/postgres') {
    throw new Error('Recusado: DATABASE_URL deve apontar exatamente para 127.0.0.1:56322/postgres.');
  }
}

function assertStrictLocalUrl(value, expected, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} local inválida.`); }
  const target = new URL(expected);
  if (url.protocol !== target.protocol || url.hostname !== target.hostname || url.port !== target.port || url.pathname !== target.pathname) {
    throw new Error(`Recusado: ${label} precisa ser exatamente ${target.origin}${target.pathname}.`);
  }
}

async function localEnvironment() {
  validateLocalDatabaseUrl(databaseUrl);
  assertStrictLocalUrl(supabaseUrl, 'http://127.0.0.1:56321', 'Supabase URL');
  assertStrictLocalUrl(redisUrl, 'redis://127.0.0.1:56379', 'Redis URL');
  assertStrictLocalUrl(parserUrl, 'http://127.0.0.1:8080', 'Docling URL');

  try { await access(resolve(runRoot, '.env')); throw new Error('Existe um .env em local-agentic; remova-o para impedir dotenv implícito.'); }
  catch (error) { if (error instanceof Error && error.message.startsWith('Existe um .env')) throw error; }

  const backendEnv = dotenv.parse(await readFile(resolve(backendRoot, '.env')));
  for (const name of ['OPENROUTER_API_KEY', 'OPENROUTER_QUESTION_MODEL', 'OPENROUTER_EMBEDDING_MODEL']) {
    if (!backendEnv[name]) throw new Error(`${name} ausente em backend/.env.`);
  }

  const status = spawnSync('supabase', ['status', '--workdir', 'dbtemp', '--output', 'env'], {
    cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (status.status !== 0) throw new Error('Supabase local dbtemp não está iniciado; execute `supabase start --workdir dbtemp`.');
  const local = parseStatus(status.stdout);
  if (local.API_URL !== supabaseUrl || !local.PUBLISHABLE_KEY || !local.SERVICE_ROLE_KEY) {
    throw new Error('Supabase status não corresponde ao endpoint local esperado 127.0.0.1:56321. Nenhuma chave foi exibida.');
  }

  const inheritedSafe = ['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL'];
  const env = Object.fromEntries(inheritedSafe.flatMap((name) => process.env[name] ? [[name, process.env[name]]] : []));
  const forwardedNames = [
    'OPENROUTER_API_KEY', 'OPENROUTER_QUESTION_MODEL', 'OPENROUTER_EMBEDDING_MODEL',
    'OPENROUTER_EMBEDDING_DIMENSIONS', 'OPENROUTER_STRUCTURED_TIMEOUT_MS',
    'QUESTION_EXTRACTION_MODEL', 'QUESTION_EXTRACTION_INPUT_MAX_TOKENS', 'QUESTION_EXTRACTION_MAX_TOKENS',
    'QUESTION_EXTRACTION_TIMEOUT_MS', 'QUESTION_EXTRACTION_REASONING_EFFORT', 'QUESTION_EXTRACTION_TEMPERATURE',
    'QUESTION_SOURCE_RECONSTRUCTION_MODEL', 'QUESTION_SOURCE_RECONSTRUCTION_MAX_TOKENS',
    'QUESTION_SOURCE_RECONSTRUCTION_TEMPERATURE', 'QUESTION_COMPLETION_MODEL',
    'QUESTION_COMPLETION_FALLBACK_MODEL', 'QUESTION_COMPLETION_MAX_TOKENS',
    'QUESTION_ALTERNATIVES_MODEL', 'QUESTION_ALTERNATIVES_MAX_TOKENS', 'QUESTION_ALTERNATIVES_TEMPERATURE',
    'QUESTION_ANSWER_MODEL', 'QUESTION_ANSWER_MAX_TOKENS', 'QUESTION_ANSWER_TEMPERATURE',
    'QUESTION_QUALITY_REVIEW_MODEL', 'QUESTION_QUALITY_REVIEW_MAX_TOKENS', 'QUESTION_QUALITY_REVIEW_TEMPERATURE',
    'QUESTION_CANDIDATE_CONCURRENCY', 'AI_REASONING_EFFORT', 'EMBEDDING_BATCH_SIZE',
    'EMBEDDING_MIN_TOKENS', 'EMBEDDING_MIN_CHARS', 'RAG_PARENT_CHUNK_TARGET_TOKENS',
    'RAG_PARENT_CHUNK_MAX_TOKENS', 'RAG_CHILD_CHUNK_TARGET_TOKENS', 'RAG_CHILD_CHUNK_MAX_TOKENS',
    'RAG_CHILD_CHUNK_OVERLAP_TOKENS', 'DOCUMENT_VISUAL_DESCRIPTION_MODEL',
  ];
  for (const name of forwardedNames) if (backendEnv[name]) env[name] = backendEnv[name];

  Object.assign(env, {
    NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '33671',
    DATABASE_URL: databaseUrl,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
    REDIS_URL: redisUrl,
    DOCUMENT_PARSER_BASE_URL: parserUrl,
    DOCUMENT_CHUNKER_BASE_URL: parserUrl,
    DOCUMENT_VISUAL_ASSETS_ENABLED: 'true',
    DOCUMENT_TEXT_SOURCE: 'pdfjs',
    QUESTION_EXTRACTION_LANGGRAPH_ENABLED: 'true',
    QUESTION_GRAPH_CHECKPOINT_SCHEMA: checkpointSchema,
    ASAAS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    PAYMENTS_PROVIDER: 'SIMULATED',
    ASAAS_ENV: 'sandbox',
    EMAIL_ENABLED: 'false',
    CORS_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
    PUBLIC_FRONT_URL: 'http://localhost:3000',
    ASAAS_WEBHOOK_URL: 'http://127.0.0.1:33671/api/v1/webhooks/asaas',
  });
  return env;
}

async function assertLocalDependencies(env) {
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1, connectionTimeoutMillis: 2500 });
  try {
    await pool.query('SELECT 1');
    const names = ['checkpoints', 'checkpoint_blobs', 'checkpoint_migrations', 'checkpoint_writes'];
    const [row] = (await pool.query(
      `SELECT ${names.map((_, index) => `to_regclass($${index + 1}) AS table_${index}`).join(', ')}`,
      names.map((name) => `${checkpointSchema}.${name}`),
    )).rows;
    if (!row || names.some((_, index) => !row[`table_${index}`])) {
      throw new Error(`Schema ${checkpointSchema} não inicializado. Rode uma vez: node tests/document-parser/local-agentic/start-local.mjs --setup-local`);
    }
  } finally { await pool.end(); }

  await redisPing();
  let response;
  try { response = await fetch(parserUrl, { signal: AbortSignal.timeout(2500) }); }
  catch { throw new Error('Docling não respondeu em 127.0.0.1:8080; inicie o serviço local antes.'); }
  if (!response) throw new Error('Docling local indisponível.');
}

function redisPing() {
  return new Promise((resolvePing, rejectPing) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 56379 });
    const timer = setTimeout(() => { socket.destroy(); rejectPing(new Error('Redis dedicado não respondeu em 127.0.0.1:56379.')); }, 2000);
    socket.once('connect', () => socket.write('*1\r\n$4\r\nPING\r\n'));
    socket.once('data', (data) => {
      clearTimeout(timer); socket.end();
      if (data.toString().includes('PONG')) resolvePing();
      else rejectPing(new Error('O serviço em 127.0.0.1:56379 não respondeu PONG ao comando Redis.'));
    });
    socket.once('error', () => { clearTimeout(timer); rejectPing(new Error('Redis dedicado local não está iniciado em 127.0.0.1:56379.')); });
  });
}

async function setupLocalCheckpoint(env) {
  validateLocalDatabaseUrl(env.DATABASE_URL);
  if (env.QUESTION_GRAPH_CHECKPOINT_SCHEMA !== checkpointSchema) throw new Error('Schema fora da allowlist local.');
  const tsxLoader = resolve(backendRoot, 'node_modules/tsx/dist/loader.mjs');
  const pgModule = require.resolve('pg');
  const checkpointModule = resolve(backendRoot, 'src/worker/services/question-graph/postgres-checkpoint.ts');
  const code = [
    `import { pathToFileURL } from 'node:url';`,
    `const pg = (await import(pathToFileURL(${JSON.stringify(pgModule)}).href)).default;`,
    `const { PostgresQuestionGraphCheckpointBackend } = await import(pathToFileURL(${JSON.stringify(checkpointModule)}).href);`,
    `const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 2500 });`,
    `try { const saver = new PostgresQuestionGraphCheckpointBackend(pool, { schema: ${JSON.stringify(checkpointSchema)} }); await saver.setup(); await saver.assertSchemaReady(); } finally { await pool.end(); }`,
  ].join('\n');
  const result = spawnSync(process.execPath, ['--import', tsxLoader, '--input-type=module', '-e', code], {
    cwd: runRoot, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    // Never echo subprocess output: errors may contain connection configuration.
    throw new Error('Falha ao inicializar schema LangGraph no banco local. Verifique dbtemp e dependências; nenhum outro endpoint é aceito.');
  }
  console.log(`Schema local inicializado e verificado: 127.0.0.1:56322/${checkpointSchema}`);
}

async function waitForApi(child) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API terminou antes de ficar pronta (código ${child.exitCode}).`);
    try {
      const response = await fetch('http://127.0.0.1:33671/health', { signal: AbortSignal.timeout(800) });
      if (response.ok) return;
    } catch { /* aguardando a API local */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error('API local não iniciou em 20 segundos; confira a saída acima.');
}

async function waitForWorker(api, worker) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (worker.exitCode !== null) throw new Error(`Worker terminou antes de ficar pronto (código ${worker.exitCode}).`);
    try {
      const response = await fetch('http://127.0.0.1:33671/health/worker', { signal: AbortSignal.timeout(800) });
      if (response.ok) return;
    } catch { /* aguardando o heartbeat do worker */ }
    if (api.exitCode !== null) throw new Error(`API terminou antes da prontidão do worker (código ${api.exitCode}).`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error('Worker local não ficou pronto em 20 segundos; confira a saída acima.');
}

async function run() {
  const env = await localEnvironment();
  if (setupLocal) return setupLocalCheckpoint(env);
  await assertLocalDependencies(env);

  const tsxLoader = resolve(backendRoot, 'node_modules/tsx/dist/loader.mjs');
  const api = spawn(process.execPath, ['--import', tsxLoader, resolve(backendRoot, 'src/server.ts')], { cwd: runRoot, env, stdio: 'inherit' });
  const worker = spawn(process.execPath, ['--import', tsxLoader, resolve(backendRoot, 'src/worker.ts')], { cwd: runRoot, env, stdio: 'inherit' });
  const children = [api, worker];
  let stopping = false;
  const stop = (signal = 'SIGTERM') => {
    if (stopping) return;
    stopping = true;
    for (const child of children) if (child.exitCode === null) child.kill(signal);
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));
  for (const child of children) child.once('exit', (code, signal) => {
    if (!stopping) {
      console.error(`[local-agentic] processo encerrou (${signal ?? code}); encerrando o par.`);
      stop();
    }
  });

  try {
    await waitForApi(api);
    await waitForWorker(api, worker);
  } catch (error) {
    stop();
    throw error;
  }
  console.log('\nAPI local: http://127.0.0.1:33671');
  console.log('Worker local ativo; LangGraph habilitado com checkpoints em question_graph_local_test.');
  console.log('Banco: 127.0.0.1:56322/postgres | Supabase: http://127.0.0.1:56321 | Redis dedicado: 127.0.0.1:56379 | Docling: http://127.0.0.1:8080');
  console.log('Use Ctrl+C para encerrar API e worker. Nenhuma chave será exibida.');
  await new Promise((resolveExit) => {
    let remaining = children.length;
    for (const child of children) child.once('exit', () => { remaining -= 1; if (remaining === 0) resolveExit(); });
  });
}

run().catch((error) => fail(error instanceof Error ? error.message : 'Falha no launcher local.'));
