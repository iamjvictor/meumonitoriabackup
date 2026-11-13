#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { Transform } from 'node:stream';
import net from 'node:net';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const backend = resolve(root, 'backend');
const runDir = resolve(root, 'tests/document-parser/local-agentic');
const artifactDir = resolve(runDir, 'artifacts', new Date().toISOString().replace(/[:.]/g, '-') + `-${randomUUID().slice(0, 8)}`);
const pdfPath = resolve(root, 'dbtemp/storage/monitor-documents/Quimica-3.pdf');
const runId = randomUUID();
const require = createRequire(resolve(backend, 'package.json'));
const dotenv = require('dotenv');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { Redis } = require('ioredis');
const localDb = 'postgresql://postgres:postgres@127.0.0.1:56322/postgres';
const localApi = 'http://127.0.0.1:56321';
const localRedis = 'redis://127.0.0.1:56379';
const localParser = 'http://127.0.0.1:8080';
const apiBase = 'http://127.0.0.1:33671';
const sanitize = (value) => String(value)
  .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[REDACTED_OPENROUTER_KEY]')
  .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[REDACTED_SUPABASE_KEY]')
  .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
  .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]')
  .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_URL]')
  .replace(/redis:\/\/[^\s"'<>]+/gi, '[REDACTED_REDIS_URL]');

function parseStatus(stdout) {
  return Object.fromEntries(stdout.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    return match ? [[match[1], match[2].replace(/^"|"$/g, '')]] : [];
  }));
}

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Could not reserve a local API port.'));
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

async function waitFor(check, label, maxMs = 45 * 60_000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const value = await check();
    if (value) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 2500));
  }
  throw new Error(`${label} did not finish within 45 minutes.`);
}

function attachSanitizedLog(source, destination) {
  const scrubber = new Transform({ transform(chunk, _encoding, callback) { callback(null, sanitize(chunk.toString())); } });
  source.pipe(scrubber).pipe(destination, { end: false });
}

const supabaseStatus = require('node:child_process').spawnSync('supabase', ['status', '--workdir', 'dbtemp', '--output', 'env'], {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});
assert.equal(supabaseStatus.status, 0, 'dbtemp Supabase must be running');
const local = parseStatus(supabaseStatus.stdout);
assert.equal(local.API_URL, localApi, 'Supabase API must be the local dbtemp gateway');
assert.match(local.PUBLISHABLE_KEY ?? '', /^sb_publishable_/);
assert.ok(local.SERVICE_ROLE_KEY?.length, 'local dbtemp service-role credential must be present');
const dbUrl = new URL(localDb);
assert.equal(dbUrl.hostname, '127.0.0.1');
assert.equal(dbUrl.port, '56322');
assert.equal(dbUrl.pathname, '/postgres');
assert.equal(new URL(localRedis).hostname, '127.0.0.1');
assert.equal(new URL(localRedis).port, '56379');
assert.equal(new URL(localParser).hostname, '127.0.0.1');
assert.equal(new URL(localParser).port, '8080');

const backendEnv = dotenv.parse(await readFile(resolve(backend, '.env')));
for (const name of ['OPENROUTER_API_KEY', 'OPENROUTER_QUESTION_MODEL', 'OPENROUTER_EMBEDDING_MODEL']) {
  assert.ok(backendEnv[name], `${name} must be configured in backend/.env`);
}
const forwardedNames = [
  'OPENROUTER_API_KEY', 'OPENROUTER_QUESTION_MODEL', 'OPENROUTER_EMBEDDING_MODEL',
  'OPENROUTER_EMBEDDING_DIMENSIONS', 'OPENROUTER_STRUCTURED_TIMEOUT_MS',
  'QUESTION_EXTRACTION_MODEL', 'QUESTION_EXTRACTION_INPUT_MAX_TOKENS', 'QUESTION_EXTRACTION_MAX_TOKENS',
  'QUESTION_EXTRACTION_TIMEOUT_MS', 'QUESTION_EXTRACTION_REASONING_EFFORT', 'QUESTION_EXTRACTION_TEMPERATURE',
  'QUESTION_COMPLETION_MODEL', 'QUESTION_COMPLETION_FALLBACK_MODEL', 'QUESTION_COMPLETION_MAX_TOKENS',
  'QUESTION_ALTERNATIVES_MODEL', 'QUESTION_ALTERNATIVES_MAX_TOKENS', 'QUESTION_ALTERNATIVES_TEMPERATURE',
  'QUESTION_ANSWER_MODEL', 'QUESTION_ANSWER_MAX_TOKENS', 'QUESTION_ANSWER_TEMPERATURE',
  'QUESTION_QUALITY_REVIEW_MODEL', 'QUESTION_QUALITY_REVIEW_MAX_TOKENS', 'QUESTION_QUALITY_REVIEW_TEMPERATURE',
  'QUESTION_CANDIDATE_CONCURRENCY', 'AI_REASONING_EFFORT', 'EMBEDDING_BATCH_SIZE',
  'EMBEDDING_MIN_TOKENS', 'EMBEDDING_MIN_CHARS', 'RAG_PARENT_CHUNK_TARGET_TOKENS',
  'RAG_PARENT_CHUNK_MAX_TOKENS', 'RAG_CHILD_CHUNK_TARGET_TOKENS', 'RAG_CHILD_CHUNK_MAX_TOKENS',
  'RAG_CHILD_CHUNK_OVERLAP_TOKENS', 'DOCUMENT_VISUAL_DESCRIPTION_MODEL',
];
const statusEnv = Object.fromEntries(forwardedNames.flatMap((name) => backendEnv[name] ? [[name, backendEnv[name]]] : []));
Object.assign(statusEnv, {
  NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(await reservePort()),
  DATABASE_URL: localDb, SUPABASE_URL: localApi,
  SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  REDIS_URL: localRedis, DOCUMENT_PARSER_BASE_URL: localParser, DOCUMENT_CHUNKER_BASE_URL: localParser,
  DOCUMENT_VISUAL_ASSETS_ENABLED: 'true', DOCUMENT_INGESTION_V3_ENABLED: 'true', DOCUMENT_TEXT_SOURCE: 'pdfjs',
  QUESTION_EXTRACTION_LANGGRAPH_ENABLED: 'true', QUESTION_GRAPH_CHECKPOINT_SCHEMA: 'question_graph_local_test',
  ASAAS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  PAYMENTS_PROVIDER: 'SIMULATED', ASAAS_ENV: 'sandbox', EMAIL_ENABLED: 'false',
  ASAAS_WEBHOOK_URL: `http://127.0.0.1:${await reservePort()}/api/v1/webhooks/asaas`,
});
Object.assign(process.env, statusEnv);

await mkdir(artifactDir, { recursive: true });
const logStream = (await import('node:fs')).createWriteStream(resolve(artifactDir, 'api-worker.sanitized.log'));
const reportPath = resolve(artifactDir, 'report.json');
const logPath = resolve(artifactDir, 'api-worker.sanitized.log');
const { prisma } = await import(pathToFileURL(resolve(backend, 'src/lib/prisma.js')).href);
const { supabaseAdmin } = await import(pathToFileURL(resolve(backend, 'src/lib/supabase.js')).href);
const authClient = createClient(localApi, local.PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const teacherEmail = `qa-agentic-${runId}@local.test`;
const teacherPassword = randomUUID() + randomUUID();
const userResult = await supabaseAdmin.auth.admin.createUser({
  email: teacherEmail, password: teacherPassword, email_confirm: true,
  user_metadata: { full_name: `QA agentic ${runId.slice(0, 8)}` }, app_metadata: { role: 'teacher' },
});
assert.equal(userResult.error, null, 'local Supabase Auth must create the isolated teacher account');
const userId = userResult.data.user.id;
const ids = { teacherId: randomUUID(), monitorId: randomUUID(), subjectId: randomUUID(), topicId: randomUUID() };
let launcher;
let logClosed = false;
let documentId;
let report = { runId, database: 'dbtemp local 127.0.0.1:56322', redis: 'isolated 127.0.0.1:56379', parser: 'local 127.0.0.1:8080', teacherId: ids.teacherId, monitorId: ids.monitorId, subjectId: ids.subjectId, topicId: ids.topicId, localAuthEmail: teacherEmail, endpointUpload: null, runs: [] };

async function questionSnapshot(id) {
  const rows = await prisma.question.findMany({
    where: { sources: { some: { documentId: id } } }, orderBy: { sourceKey: 'asc' },
    select: {
      id: true, sourceKey: true, textHash: true, status: true, needsReview: true,
      completenessStatus: true, correctAnswerOrigin: true, alternativesOrigin: true,
      alternatives: true, correctAnswer: true,
      visualAssets: { select: { visualAsset: { select: { id: true, assetType: true, pageNumber: true, mimeType: true, storagePath: true, bbox: true } } } },
      sources: { where: { documentId: id }, orderBy: { chunkId: 'asc' }, select: { id: true, chunkId: true, role: true } },
      visualAssets: { select: { visualAsset: { select: { id: true, assetType: true, pageNumber: true, mimeType: true, storagePath: true, bbox: true } } } },
    },
  });
  return rows.map((row) => ({ ...row, alternativesCount: Array.isArray(row.alternatives) ? row.alternatives.length : 0 }));
}

function collectUsage(logText) {
  const totals = (eventName, fields) => {
    const summary = Object.fromEntries(fields.map((field) => [field, 0]));
    let count = 0;
    for (const match of logText.matchAll(new RegExp(`event: '${eventName}',[\\s\\S]*?\\n\\}`, 'g'))) {
      count += 1;
      for (const field of fields) {
        const value = match[0].match(new RegExp(`\\b${field}: (\\d+)`));
        if (value) summary[field] += Number(value[1]);
      }
    }
    return { count, ...summary };
  };
  return {
    structured: totals('monitor.llm_structured_response_received', ['durationMs', 'promptTokens', 'completionTokens', 'reasoningTokens', 'totalTokens']),
    embeddings: totals('monitor.embedding_request_completed', ['promptTokens', 'totalTokens']),
    costUsd: null,
    costNote: 'Custo não aparece nos dados de uso coletados e fica desconhecido, não zero.',
  };
}

async function stopLauncher() {
  if (launcher && launcher.exitCode === null) {
    launcher.kill('SIGTERM');
    await Promise.race([new Promise((resolveExit) => launcher.once('exit', resolveExit)), new Promise((resolveWait) => setTimeout(resolveWait, 10_000))]);
  }
}

async function closeLog() {
  if (logClosed) return;
  logClosed = true;
  await new Promise((resolveFinish, reject) => {
    logStream.once('error', reject);
    logStream.end(resolveFinish);
  });
}

async function waitForDocument(id) {
  let lastStatus = '';
  return waitFor(async () => {
    const row = await prisma.monitorDocument.findUnique({ where: { id }, select: { status: true, errorMessage: true, updatedAt: true } });
    if (!row) return null;
    lastStatus = row.status;
    report.lastObservedDocumentStatus = lastStatus;
    if (['READY', 'PARTIAL_SUCCESS', 'FAILED'].includes(row.status)) return row;
    return null;
  }, `document processing (last status ${lastStatus})`);
}

try {
  const redis = new Redis(localRedis, { maxRetriesPerRequest: 1, connectTimeout: 2000 });
  assert.equal(await redis.ping(), 'PONG', 'dedicated Redis must answer PING');
  await redis.quit();
  const parserHealth = await fetch(localParser, { signal: AbortSignal.timeout(3000) });
  assert.ok(parserHealth.status < 500, 'local Docling must respond');
  const pool = new Pool({ connectionString: localDb, max: 1, connectionTimeoutMillis: 3000 });
  try {
    const [row] = (await pool.query("select current_database() as db, to_regclass('question_graph_local_test.checkpoints') as checkpoint_table")).rows;
    assert.equal(row.db, 'postgres');
    assert.equal(row.checkpoint_table, 'question_graph_local_test.checkpoints');
  } finally { await pool.end(); }
  const pdf = await readFile(pdfPath);
  report.pdf = { file: 'dbtemp/storage/monitor-documents/Quimica-3.pdf', bytes: pdf.length, sha256: createHash('sha256').update(pdf).digest('hex') };
  assert.ok(pdf.length > 0 && pdf.length < 5 * 1024 * 1024, 'fixture must satisfy API 5 MB upload limit');

  await prisma.teacher.create({ data: {
    id: ids.teacherId, userId, fullName: `QA agentic ${runId.slice(0, 8)}`, email: teacherEmail,
    username: `qa-agentic-${runId.slice(0, 8)}`, area: 'Química', pageSlug: `qa-agentic-${runId.slice(0, 8)}`,
    role: 'teacher', status: 'active', termsAcceptedAt: new Date(),
  } });
  await prisma.monitor.create({ data: { id: ids.monitorId, teacherId: ids.teacherId, name: `QA upload ${runId.slice(0, 8)}`, status: 'DRAFT' } });
  await prisma.monitorSubject.create({ data: { id: ids.subjectId, monitorId: ids.monitorId, name: 'Química', position: 0 } });
  await prisma.monitorTopic.create({ data: { id: ids.topicId, subjectId: ids.subjectId, name: 'Questões de Química', position: 0 } });

  const login = await authClient.auth.signInWithPassword({ email: teacherEmail, password: teacherPassword });
  assert.equal(login.error, null, 'isolated teacher must be able to log into local Supabase');
  const token = login.data.session.access_token;

  const launcherEntry = resolve(runDir, 'start-local.mjs');
  launcher = spawn(process.execPath, [launcherEntry], { cwd: runDir, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  attachSanitizedLog(launcher.stdout, logStream);
  attachSanitizedLog(launcher.stderr, logStream);
  await waitFor(async () => {
    if (launcher.exitCode !== null) throw new Error(`local launcher exited with ${launcher.exitCode}`);
    try { const response = await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(800) }); return response.ok; }
    catch { return false; }
  }, 'local API and worker startup', 30_000);

  const multipart = new FormData();
  multipart.set('file', new Blob([pdf], { type: 'application/pdf' }), 'Quimica-3.pdf');
  multipart.set('subjectId', ids.subjectId);
  multipart.set('topicId', ids.topicId);
  multipart.set('tag', 'questions');
  const uploadStarted = Date.now();
  const response = await fetch(`${apiBase}/api/v1/monitors/${ids.monitorId}/documents`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: multipart,
  });
  const body = await response.json();
  assert.equal(response.status, 201, `real endpoint upload rejected: ${JSON.stringify(body)}`);
  documentId = body.data.id;
  report.endpointUpload = { method: 'POST', route: '/api/v1/monitors/:monitorId/documents', httpStatus: response.status,
    documentId, tag: body.data.tag, status: body.data.status, durationMs: Date.now() - uploadStarted };

  // This launcher starts the worker against the dedicated Redis. It consumes only the new isolated queue job.
  const firstStatus = await waitForDocument(documentId);
  const firstQuestions = await questionSnapshot(documentId);
  const visualAssets = await prisma.documentVisualAsset.findMany({
    where: { documentId }, orderBy: [{ pageNumber: 'asc' }, { assetType: 'asc' }],
    select: { id: true, assetType: true, pageNumber: true, mimeType: true, storagePath: true, bbox: true },
  });
  const chunkCount = await prisma.documentChunk.count({ where: { documentId } });
  const embeddedChunkCount = await prisma.documentChunk.count({ where: { documentId, embeddedAt: { not: null } } });
  const sourceCount = await prisma.questionSource.count({ where: { documentId } });
  report.runs.push({ label: 'upload_processing', status: firstStatus.status, errorMessage: firstStatus.errorMessage,
    questionCount: firstQuestions.length, chunkCount, embeddedChunkCount, sourceCount,
    pendingReviewCount: firstQuestions.filter((q) => q.status === 'PENDING_REVIEW' && q.needsReview).length,
    exactlyFiveAlternativesCount: firstQuestions.filter((question) => question.alternativesCount === 5).length,
    questionsWithAnswerCount: firstQuestions.filter((question) => typeof question.correctAnswer === 'string' && question.correctAnswer.trim().length > 0).length,
    visualAssets: {
      total: visualAssets.length,
      figureCount: visualAssets.filter((asset) => asset.assetType === 'figure').length,
      pageCount: visualAssets.filter((asset) => asset.assetType === 'page').length,
      assets: visualAssets,
    },
    questions: firstQuestions.map(({ id, sourceKey, textHash, status, needsReview, alternativesCount, alternatives, correctAnswer, correctAnswerOrigin, alternativesOrigin, sources, visualAssets: questionVisualAssets }) => ({
      id, sourceKey, textHash, status, needsReview, alternativesCount, alternatives, correctAnswer, correctAnswerOrigin, alternativesOrigin,
      sourceRelations: sources.length,
      visualAssets: questionVisualAssets.map(({ visualAsset }) => ({ id: visualAsset.id, assetType: visualAsset.assetType, pageNumber: visualAsset.pageNumber, bbox: visualAsset.bbox })),
    })) });

  const firstIdentity = firstQuestions.map(({ id, sourceKey, textHash }) => ({ id, sourceKey, textHash }));
  // Replay the terminal checkpoint directly; this is not an explicit reprocess request.
  // A completed durable checkpoint should return with zero model calls while the repository remains idempotent.
  const { StructuredQuestionExtractionService } = await import(pathToFileURL(resolve(backend, 'src/worker/services/structured-question-extraction.service.js')).href);
  const replay = await new StructuredQuestionExtractionService().processDocument(documentId);
  const replayQuestions = await questionSnapshot(documentId);
  const replayIdentity = replayQuestions.map(({ id, sourceKey, textHash }) => ({ id, sourceKey, textHash }));
  const replayStable = JSON.stringify(firstIdentity) === JSON.stringify(replayIdentity);
  const replaySourceCount = await prisma.questionSource.count({ where: { documentId } });
  report.runs.push({ label: 'terminal_checkpoint_replay', llmCalls: replay.llmCalls, graphStatus: replay.graphStatus,
    questionCount: replayQuestions.length, identitiesStable: replayStable, sourceCountStable: replaySourceCount === sourceCount });
  assert.equal(replay.llmCalls, 0, 'completed checkpoint replay must not call extraction/reviewer LLMs');
  assert.equal(replayQuestions.length, firstQuestions.length);
  assert.equal(replayStable, true, 'replaying the terminal checkpoint must preserve question identities');
  assert.equal(replaySourceCount, sourceCount, 'replaying must not duplicate source relations');

  await stopLauncher();
  await closeLog();
  const sanitizedLogs = await readFile(logPath, 'utf8');
  report.openRouterUsage = collectUsage(sanitizedLogs);
  report.completedAt = new Date().toISOString();
  report.documentId = documentId;
  report.result = firstStatus.status === 'READY' ? 'PASS' : 'PASS_WITH_PROCESSING_WARNINGS';
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ result: report.result, reportPath, documentId, uploadStatus: response.status,
    processingStatus: firstStatus.status, questions: firstQuestions.length,
    exactlyFiveAlternativesCount: report.runs[0].exactlyFiveAlternativesCount,
    questionsWithAnswerCount: report.runs[0].questionsWithAnswerCount,
    figureCount: report.runs[0].visualAssets.figureCount,
    pageCount: report.runs[0].visualAssets.pageCount,
    openRouterUsage: report.openRouterUsage,
    replayLlmCalls: replay.llmCalls, sameQuestionIdentity: replayStable }));
} catch (error) {
  report.completedAt = new Date().toISOString();
  report.result = 'FAIL';
  report.error = sanitize(error instanceof Error ? error.message : String(error));
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(JSON.stringify({ result: 'FAIL', reportPath, documentId: documentId ?? null, error: report.error }));
  process.exitCode = 1;
} finally {
  if (documentId) {
  }
  await stopLauncher();
  await closeLog();
  await prisma.$disconnect();
}
