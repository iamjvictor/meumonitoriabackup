#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const backend = resolve(root, 'backend');
const require = createRequire(resolve(backend, 'package.json'));
const dotenv = require('dotenv');
const runReportPath = resolve(process.argv[2] ?? '');
assert.ok(process.argv[2], 'Usage: node --import ./backend/node_modules/tsx/dist/loader.mjs tests/document-parser/local-agentic/qa-checkpoint-replay.mjs <upload-report.json>');
const original = JSON.parse(await readFile(runReportPath, 'utf8'));
const documentId = original.documentId ?? original.endpointUpload?.documentId;
assert.match(documentId ?? '', /^[0-9a-f-]{36}$/i, 'upload report must contain a documentId');

const status = spawnSync('supabase', ['status', '--workdir', 'dbtemp', '--output', 'env'], {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});
assert.equal(status.status, 0, 'Supabase dbtemp must be running');
const local = Object.fromEntries(status.stdout.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  return match ? [[match[1], match[2].replace(/^"|"$/g, '')]] : [];
}));
assert.equal(local.API_URL, 'http://127.0.0.1:56321');
const backendEnv = dotenv.parse(await readFile(resolve(backend, '.env')));
const forwardedNames = [
  'OPENROUTER_API_KEY', 'OPENROUTER_QUESTION_MODEL', 'OPENROUTER_EMBEDDING_MODEL',
  'OPENROUTER_EMBEDDING_DIMENSIONS', 'OPENROUTER_STRUCTURED_TIMEOUT_MS',
  'QUESTION_EXTRACTION_MODEL', 'QUESTION_EXTRACTION_INPUT_MAX_TOKENS', 'QUESTION_EXTRACTION_MAX_TOKENS',
  'QUESTION_EXTRACTION_TIMEOUT_MS', 'QUESTION_EXTRACTION_REASONING_EFFORT', 'QUESTION_EXTRACTION_TEMPERATURE',
  'QUESTION_COMPLETION_MODEL', 'QUESTION_COMPLETION_FALLBACK_MODEL', 'QUESTION_COMPLETION_MAX_TOKENS',
  'QUESTION_ALTERNATIVES_MODEL', 'QUESTION_ALTERNATIVES_MAX_TOKENS', 'QUESTION_ALTERNATIVES_TEMPERATURE',
  'QUESTION_ANSWER_MODEL', 'QUESTION_ANSWER_MAX_TOKENS', 'QUESTION_ANSWER_TEMPERATURE',
  'QUESTION_QUALITY_REVIEW_MODEL', 'QUESTION_QUALITY_REVIEW_MAX_TOKENS', 'QUESTION_QUALITY_REVIEW_TEMPERATURE',
  'QUESTION_CANDIDATE_CONCURRENCY', 'AI_REASONING_EFFORT',
];
const localEnv = Object.fromEntries(forwardedNames.flatMap((name) => backendEnv[name] ? [[name, backendEnv[name]]] : []));
Object.assign(localEnv, {
  NODE_ENV: 'test', DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:56322/postgres',
  SUPABASE_URL: local.API_URL, SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY, REDIS_URL: 'redis://127.0.0.1:56379',
  DOCUMENT_PARSER_BASE_URL: 'http://127.0.0.1:8080', DOCUMENT_CHUNKER_BASE_URL: 'http://127.0.0.1:8080',
  QUESTION_EXTRACTION_LANGGRAPH_ENABLED: 'true', QUESTION_GRAPH_CHECKPOINT_SCHEMA: 'question_graph_local_test',
  ASAAS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'), PAYMENTS_PROVIDER: 'SIMULATED',
  ASAAS_ENV: 'sandbox', EMAIL_ENABLED: 'false',
});
Object.assign(process.env, localEnv);

const { prisma } = await import(pathToFileURL(resolve(backend, 'src/lib/prisma.js')).href);
const { StructuredQuestionExtractionService } = await import(pathToFileURL(resolve(backend, 'src/worker/services/structured-question-extraction.service.js')).href);
async function snapshot() {
  const [questions, sourceCount, document] = await Promise.all([
    prisma.question.findMany({ where: { sources: { some: { documentId } } }, orderBy: { sourceKey: 'asc' },
      select: { id: true, sourceKey: true, textHash: true, status: true, needsReview: true, alternatives: true, correctAnswer: true,
        sources: { where: { documentId }, select: { id: true, chunkId: true, role: true } } } }),
    prisma.questionSource.count({ where: { documentId } }),
    prisma.monitorDocument.findUnique({ where: { id: documentId }, select: { status: true, errorMessage: true } }),
  ]);
  return { questions, sourceCount, document };
}

try {
  const before = await snapshot();
  const startedAt = Date.now();
  const replay = await new StructuredQuestionExtractionService().processDocument(documentId);
  const after = await snapshot();
  const identity = (rows) => rows.map(({ id, sourceKey, textHash }) => ({ id, sourceKey, textHash }));
  const report = {
    uploadRunId: original.runId,
    documentId,
    db: 'dbtemp local 127.0.0.1:56322/postgres',
    checkpointSchema: 'question_graph_local_test',
    before: { documentStatus: before.document?.status, questionCount: before.questions.length, sourceCount: before.sourceCount },
    replay: { llmCalls: replay.llmCalls, graphStatus: replay.graphStatus, elapsedMs: Date.now() - startedAt,
      returnedQuestionCount: replay.questions.length },
    after: { documentStatus: after.document?.status, questionCount: after.questions.length, sourceCount: after.sourceCount,
      pendingReviewCount: after.questions.filter((question) => question.status === 'PENDING_REVIEW' && question.needsReview).length,
      sameIdentity: JSON.stringify(identity(before.questions)) === JSON.stringify(identity(after.questions)),
      sameSourceCount: before.sourceCount === after.sourceCount,
      questions: after.questions.map(({ id, sourceKey, textHash, status, needsReview, alternatives, correctAnswer, sources }) => ({
        id, sourceKey, textHash, status, needsReview,
        alternativesCount: Array.isArray(alternatives) ? alternatives.length : 0,
        hasAnswer: typeof correctAnswer === 'string' && correctAnswer.length > 0,
        sourceRelations: sources.length,
      })),
    },
  };
  report.result = replay.llmCalls === 0 && report.after.sameIdentity && report.after.sameSourceCount ? 'PASS' : 'FAIL';
  const reportPath = resolve(dirname(runReportPath), 'checkpoint-replay.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ result: report.result, reportPath, documentId, llmCalls: replay.llmCalls,
    questionCountBefore: before.questions.length, questionCountAfter: after.questions.length,
    sourceCountBefore: before.sourceCount, sourceCountAfter: after.sourceCount,
    sameIdentity: report.after.sameIdentity, graphStatus: replay.graphStatus, elapsedMs: report.replay.elapsedMs }));
  assert.equal(replay.llmCalls, 0, 'terminal checkpoint replay must avoid all LLM calls');
  assert.equal(report.after.sameIdentity, true, 'question IDs/source keys/content hashes must survive replay');
  assert.equal(report.after.sameSourceCount, true, 'source relations must not duplicate');
} finally {
  await prisma.$disconnect();
}
