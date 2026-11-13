import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const backendRoot = resolve(repoRoot, 'backend');
const require = createRequire(resolve(backendRoot, 'package.json'));
const dotenv = require('dotenv');
const envFile = dotenv.parse(await readFile(resolve(backendRoot, '.env')));
const status = spawnSync('supabase', ['status', '--workdir', 'dbtemp', '--output', 'env'], { cwd: repoRoot, encoding: 'utf8' });
if (status.status !== 0) throw new Error('Supabase dbtemp não está disponível.');
const local = Object.fromEntries(status.stdout.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  return match ? [[match[1], match[2].replace(/^"|"$/g, '')]] : [];
}));
const databaseUrl = 'postgresql://postgres:postgres@127.0.0.1:56322/postgres';
const port = 33671;
const serverEnv = {
  ...envFile,
  PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
  HOME: process.env.HOME ?? '/tmp',
  TMPDIR: process.env.TMPDIR ?? '/tmp',
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  SUPABASE_URL: local.API_URL,
  SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  REDIS_URL: 'redis://127.0.0.1:6379',
  PORT: String(port),
  HOST: '127.0.0.1',
  ASAAS_WEBHOOK_URL: `http://127.0.0.1:${port}/api/webhooks/asaas`,
  DOCUMENT_VISUAL_ASSETS_ENABLED: 'true',
  DOCUMENT_PARSER_BASE_URL: 'http://127.0.0.1:8080',
  DOCUMENT_CHUNKER_BASE_URL: 'http://127.0.0.1:8080',
};
Object.assign(process.env, serverEnv);
const runId = randomUUID();
const skipChat = process.argv.includes('--skip-chat') || process.env.E2E_SKIP_CHAT === '1';
const reportDir = new URL(`./artifacts/${runId}/`, import.meta.url);
await mkdir(reportDir, { recursive: true });
const report: Record<string, any> = {
  runId, startedAt: new Date().toISOString(), db: '127.0.0.1:56322',
  docs: [], chat: { attempted: false }, cleanup: { complete: false },
  config: {
    chatImageModelConfigured: Boolean(serverEnv.CHAT_IMAGE_MODEL),
    questionModelConfigured: Boolean(serverEnv.OPENROUTER_QUESTION_MODEL),
    embeddingModelConfigured: Boolean(serverEnv.OPENROUTER_EMBEDDING_MODEL),
  },
};

const [{ prisma }, { supabaseAdmin }] = await Promise.all([
  import('../backend/src/lib/prisma.js'),
  import('../backend/src/lib/supabase.js'),
]);
const { createClient } = require('@supabase/supabase-js');
const authClient = createClient(local.API_URL, local.PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const teacherPassword = randomBytes(24).toString('base64url');
const studentPassword = randomBytes(24).toString('base64url');
const teacherAuth = await supabaseAdmin.auth.admin.createUser({
  email: `e2e-teacher-${runId}@local.test`, password: teacherPassword, email_confirm: true,
});
if (teacherAuth.error || !teacherAuth.data.user) throw new Error(`Não foi possível criar usuário local do professor: ${teacherAuth.error?.message}`);
const studentAuth = await supabaseAdmin.auth.admin.createUser({
  email: `e2e-student-${runId}@local.test`, password: studentPassword, email_confirm: true,
});
if (studentAuth.error || !studentAuth.data.user) throw new Error(`Não foi possível criar usuário local do aluno: ${studentAuth.error?.message}`);
const teacherLogin = await authClient.auth.signInWithPassword({ email: teacherAuth.data.user.email!, password: teacherPassword });
const studentLogin = await authClient.auth.signInWithPassword({ email: studentAuth.data.user.email!, password: studentPassword });
if (teacherLogin.error || !teacherLogin.data.session || studentLogin.error || !studentLogin.data.session) {
  throw new Error('Login dos usuários locais de teste falhou.');
}

const teacherId = randomUUID();
const studentId = randomUUID();
const monitorId = randomUUID();
const subjectId = randomUUID();
const topicId = randomUUID();
const prefix = `question-chat-e2e/${runId}`;
const documents = [
  { name: 'Quimica-3.pdf', tag: 'QUESTIONS' as const, source: 'Quimica-3.pdf', textSource: 'pdfjs' },
  { name: 'Estequiometria.pdf', tag: 'KNOWLEDGE_BASE' as const, source: 'Estequiometria.pdf', textSource: 'docling' },
  { name: 'pH e pOH.pdf', tag: 'KNOWLEDGE_BASE' as const, source: 'pH e pOH.pdf', textSource: 'docling' },
].map((document) => ({ ...document, id: randomUUID(), storagePath: `${prefix}/${document.source}` }));
const serverLogPath = new URL('server.log', reportDir);
let server: ReturnType<typeof spawn> | null = null;
let serverLog: import('node:fs').WriteStream | null = null;
const uploaded: Array<{ bucket: string; path: string }> = [];

const sourceAuditSelect = {
  id: true, chunkId: true, documentId: true, documentBlockId: true, role: true,
  pageStart: true, pageEnd: true, charStartInChunk: true, charEndInChunk: true,
  excerpt: true, confidence: true,
} as const;

async function captureQuestionSnapshot(documentId: string) {
  const [questions, spans] = await Promise.all([
    prisma.question.findMany({
      where: { sources: { some: { documentId } } }, orderBy: { sourceKey: 'asc' },
      select: {
        id: true, sourceKey: true, text: true, textHash: true, alternatives: true,
        correctAnswer: true, explanation: true, status: true, completenessStatus: true,
        needsReview: true, statementOrigin: true, alternativesOrigin: true,
        categoryOrigin: true, difficultyOrigin: true, correctAnswerOrigin: true,
        explanationOrigin: true, updatedAt: true,
        sources: { where: { documentId }, orderBy: [{ chunkId: 'asc' }, { role: 'asc' }, { pageStart: 'asc' }, { charStartInChunk: 'asc' }], select: sourceAuditSelect },
      },
    }),
    prisma.questionSpan.findMany({
      where: { documentId }, orderBy: [{ questionNumber: 'asc' }, { sourceKey: 'asc' }],
      select: {
        id: true, sourceKey: true, documentBlockId: true, questionNumber: true,
        pageStart: true, pageEnd: true, charStart: true, charEnd: true,
        status: true, visualStatus: true, evidence: true,
        candidate: { select: { id: true, status: true, originType: true, statement: true, promotionReasons: true } },
        chunks: { orderBy: { position: 'asc' }, select: { chunkId: true, role: true, position: true } },
        visualAssets: { select: { visualAssetId: true, associationMethod: true, role: true, confidence: true } },
      },
    }),
  ]);
  return {
    questions: questions.map((question) => ({
      ...question,
      sources: question.sources.map((source) => ({
        ...source,
        excerptSha256: source.excerpt ? createHash('sha256').update(source.excerpt).digest('hex') : null,
      })),
    })),
    spans,
  };
}

async function runWorker(documentId: string, mode: 'questions' | 'knowledge', label: string) {
  const args = [resolve(backendRoot, 'node_modules/.bin/tsx'), 'dbtemp/run-document-worker.mjs'];
  if (mode === 'questions') args.push('--questions');
  args.push(documentId);
  const logPath = new URL(`${label}.worker.log`, reportDir);
  const child = spawn(args[0]!, args.slice(1), { cwd: repoRoot, env: serverEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = await import('node:fs').then((fs) => fs.createWriteStream(logPath));
  const streamsEnded = Promise.all([
    new Promise<void>((resolveEnd) => child.stdout.once('end', resolveEnd)),
    new Promise<void>((resolveEnd) => child.stderr.once('end', resolveEnd)),
  ]);
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolveExit(code ?? 1));
  });
  await streamsEnded;
  const logFinished = new Promise<void>((resolveFinish, reject) => {
    log.once('finish', resolveFinish);
    log.once('error', reject);
  });
  log.end();
  await logFinished;
  return { exitCode, logPath: logPath.pathname };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* startup in progress */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error('API local não iniciou em 30 segundos.');
}

try {
  const sourcePaths = new Map<string, string>([
    ['Quimica-3.pdf', resolve(repoRoot, 'dbtemp/storage/monitor-documents/Quimica-3.pdf')],
    ['Estequiometria.pdf', resolve(repoRoot, 'dbtemp/storage/monitor-documents/Estequiometria.pdf')],
    ['pH e pOH.pdf', resolve(repoRoot, 'dbtemp/storage/monitor-documents/pH e pOH.pdf')],
  ]);
  const objectStorage = supabaseAdmin.storage.from('monitor-documents');
  for (const document of documents) {
    const bytes = await readFile(sourcePaths.get(document.source)!);
    const result = await objectStorage.upload(document.storagePath, bytes, { contentType: 'application/pdf', upsert: false });
    if (result.error) throw new Error(`Falha ao copiar fixture ${document.source} para Storage local: ${result.error.message}`);
    uploaded.push({ bucket: 'monitor-documents', path: document.storagePath });
    (document as any).bytes = bytes.length;
    (document as any).sourceSha256 = createHash('sha256').update(bytes).digest('hex');
  }

  await prisma.teacher.create({ data: {
    id: teacherId, userId: teacherAuth.data.user.id, fullName: 'E2E Professor OCR',
    email: teacherAuth.data.user.email!, username: `e2e-${runId}`, area: 'Química',
    pageSlug: `e2e-${runId}`, role: 'teacher', status: 'active', termsAcceptedAt: new Date(),
  } });
  await prisma.student.create({ data: { id: studentId, userId: studentAuth.data.user.id, fullName: 'E2E Aluno OCR', email: studentAuth.data.user.email!, role: 'student', status: 'active' } });
  await prisma.monitor.create({ data: { id: monitorId, teacherId, name: 'E2E OCR Química', status: 'PUBLISHED', publishedAt: new Date() } });
  await prisma.monitorSubject.create({ data: { id: subjectId, monitorId, name: 'Química', position: 0 } });
  await prisma.monitorTopic.create({ data: { id: topicId, subjectId, name: 'Química orgânica e soluções', position: 0 } });
  await prisma.studentEnrollment.create({ data: { studentId, monitorId, status: 'ACTIVE', startsAt: new Date(Date.now() - 60_000) } });
  for (const document of documents) {
    await prisma.monitorDocument.create({ data: {
      id: document.id, teacherId, monitorId, subjectId, topicId, tag: document.tag,
      originalName: document.name, storagePath: document.storagePath, mimeType: 'application/pdf',
      sizeBytes: (document as any).bytes, status: 'QUEUED', processingVersion: 4,
      topicLinks: { create: [{ topicId }] },
    } });
  }
  report.fixture = { prefix, teacherId, studentId, monitorId, subjectId, topicId, documentIds: documents.map(({ id, name, tag }) => ({ id, name, tag })) };
  await writeFile(new URL('fixture.json', reportDir), `${JSON.stringify(report.fixture, null, 2)}\n`);

  for (const document of documents) {
    const started = Date.now();
    const worker = await runWorker(document.id, document.tag === 'QUESTIONS' ? 'questions' : 'knowledge', document.name.replaceAll(/[^A-Za-z0-9]+/g, '-'));
    const [row, blocks, chunks, assets, spans, questions] = await Promise.all([
      prisma.monitorDocument.findUnique({ where: { id: document.id }, select: { status: true, errorMessage: true } }),
      prisma.documentBlock.groupBy({ by: ['type'], where: { documentId: document.id }, _count: { _all: true } }),
      prisma.documentChunk.findMany({ where: { documentId: document.id }, orderBy: { chunkIndex: 'asc' }, select: { id: true, chunkIndex: true, status: true, pageStart: true, pageEnd: true, embeddedAt: true } }),
      prisma.documentVisualAsset.findMany({ where: { documentId: document.id }, orderBy: [{ pageNumber: 'asc' }, { createdAt: 'asc' }], select: { id: true, pageNumber: true, sourceKey: true, checksum: true, storagePath: true, bbox: true, metadata: true, mimeType: true } }),
      prisma.questionSpan.findMany({ where: { documentId: document.id }, orderBy: { questionNumber: 'asc' }, select: { id: true, sourceKey: true, documentBlockId: true, questionNumber: true, pageStart: true, pageEnd: true, charStart: true, charEnd: true, status: true, visualStatus: true, evidence: true, candidate: { select: { id: true, status: true, originType: true, statement: true, promotionReasons: true } }, chunks: { orderBy: { position: 'asc' }, select: { chunkId: true, role: true, position: true } }, visualAssets: { select: { visualAssetId: true, associationMethod: true, role: true, confidence: true } } } }),
      prisma.question.findMany({ where: { sources: { some: { documentId: document.id } } }, select: { id: true, sourceKey: true, textHash: true, text: true, alternatives: true, correctAnswer: true, explanation: true, status: true, completenessStatus: true, needsReview: true, statementOrigin: true, alternativesOrigin: true, categoryOrigin: true, difficultyOrigin: true, correctAnswerOrigin: true, explanationOrigin: true, updatedAt: true, sources: { where: { documentId: document.id }, orderBy: [{ chunkId: 'asc' }, { role: 'asc' }, { pageStart: 'asc' }, { charStartInChunk: 'asc' }], select: sourceAuditSelect } } }),
    ]);
    report.docs.push({
      id: document.id, name: document.name, tag: document.tag, sourceSha256: (document as any).sourceSha256,
      workerExitCode: worker.exitCode, workerLog: worker.logPath, status: row?.status, errorMessage: row?.errorMessage,
      blockTypes: blocks.map((item) => ({ type: item.type, count: item._count._all })),
      chunks: chunks.length, embeddedChunks: chunks.filter((chunk) => chunk.embeddedAt).length,
      chunksByStatus: Object.entries(Object.groupBy(chunks, (chunk) => chunk.status)).map(([state, items]) => ({ state, count: items?.length ?? 0 })),
      visualAssets: assets.map(({ id, pageNumber, checksum, bbox, mimeType }) => ({ id, pageNumber, checksum, bbox, mimeType })),
      spans: spans.map(({ id, questionNumber, pageStart, pageEnd, status, visualStatus }) => ({ id, questionNumber, pageStart, pageEnd, status, visualStatus })),
      questions: questions.map((question) => ({ id: question.id, sourceKey: question.sourceKey, textHash: question.textHash, text: question.text, alternativeCount: Array.isArray(question.alternatives) ? question.alternatives.length : 0, alternatives: question.alternatives, correctAnswer: question.correctAnswer, explanation: question.explanation, status: question.status, completenessStatus: question.completenessStatus, needsReview: question.needsReview, statementOrigin: question.statementOrigin, alternativesOrigin: question.alternativesOrigin, categoryOrigin: question.categoryOrigin, difficultyOrigin: question.difficultyOrigin, correctAnswerOrigin: question.correctAnswerOrigin, explanationOrigin: question.explanationOrigin, updatedAt: question.updatedAt, sources: question.sources.map((source) => ({ ...source, excerptSha256: source.excerpt ? createHash('sha256').update(source.excerpt).digest('hex') : null })) })),
      elapsedMs: Date.now() - started,
    });
    await writeFile(new URL('report.partial.json', reportDir), `${JSON.stringify(report, null, 2)}\n`);
  }

  const questionDocument = documents[0]!;
  const beforeSnapshot = await captureQuestionSnapshot(questionDocument.id);
  const beforeRetry = beforeSnapshot.questions;
  const retry = await runWorker(questionDocument.id, 'questions', 'Quimica-3-repeat');
  const afterSnapshot = await captureQuestionSnapshot(questionDocument.id);
  const afterRetry = afterSnapshot.questions;
  const sourceIdentity = (source: {
    id: string; chunkId: string; documentId: string | null; documentBlockId: string | null; role: string;
    pageStart: number | null; pageEnd: number | null; charStartInChunk: number | null;
    charEndInChunk: number | null; excerpt: string | null; excerptSha256: string | null; confidence: number | null;
  }) => JSON.stringify({
    id: source.id, documentId: source.documentId, chunkId: source.chunkId,
    documentBlockId: source.documentBlockId, role: source.role,
    pageStart: source.pageStart, pageEnd: source.pageEnd,
    charStartInChunk: source.charStartInChunk, charEndInChunk: source.charEndInChunk,
    excerpt: source.excerpt, excerptSha256: source.excerptSha256, confidence: source.confidence,
  });
  const sourceLogicalIdentity = (source: Parameters<typeof sourceIdentity>[0]) => JSON.stringify({
    documentId: source.documentId, chunkId: source.chunkId,
    documentBlockId: source.documentBlockId, role: source.role,
    pageStart: source.pageStart, pageEnd: source.pageEnd,
    charStartInChunk: source.charStartInChunk, charEndInChunk: source.charEndInChunk,
    excerptSha256: source.excerptSha256,
  });
  const identitySet = (questions: typeof beforeRetry) => questions.flatMap((question) => question.sources.map(sourceIdentity)).sort();
  const sourceMultiplicity = (questions: typeof beforeRetry) => {
    const counts = new Map<string, number>();
    for (const question of questions) for (const source of question.sources) {
      const key = `${question.sourceKey}:${sourceLogicalIdentity(source)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].filter(([, count]) => count > 1).map(([identity, count]) => ({ identity, count }));
  };
  const sortedQuestionState = (questions: typeof beforeRetry) => questions.map((question) => ({
    id: question.id, sourceKey: question.sourceKey, textHash: question.textHash,
    text: question.text, alternatives: question.alternatives, correctAnswer: question.correctAnswer,
    explanation: question.explanation, status: question.status, completenessStatus: question.completenessStatus,
    needsReview: question.needsReview, statementOrigin: question.statementOrigin,
    alternativesOrigin: question.alternativesOrigin, categoryOrigin: question.categoryOrigin,
    difficultyOrigin: question.difficultyOrigin, correctAnswerOrigin: question.correctAnswerOrigin,
    explanationOrigin: question.explanationOrigin,
    sources: question.sources,
  }));
  report.reprocess = {
    workerExitCode: retry.exitCode, workerLog: retry.logPath,
    beforeCount: beforeRetry.length, afterCount: afterRetry.length,
    before: sortedQuestionState(beforeRetry), after: sortedQuestionState(afterRetry),
    beforeSpans: beforeSnapshot.spans, afterSpans: afterSnapshot.spans,
    stable: JSON.stringify(sortedQuestionState(beforeRetry)) === JSON.stringify(sortedQuestionState(afterRetry)),
    sameQuestionIdentitySet: beforeRetry.length === afterRetry.length && beforeRetry.every((before) => afterRetry.some((after) => after.id === before.id && after.sourceKey === before.sourceKey)),
    sameSourceIdentityMultiset: JSON.stringify(identitySet(beforeRetry)) === JSON.stringify(identitySet(afterRetry)),
    duplicateLogicalSourceRelationsBefore: sourceMultiplicity(beforeRetry),
    duplicateLogicalSourceRelationsAfter: sourceMultiplicity(afterRetry),
    beforeSourceLinkCount: beforeRetry.reduce((total, question) => total + question.sources.length, 0),
    afterSourceLinkCount: afterRetry.reduce((total, question) => total + question.sources.length, 0),
    changedTextHashes: beforeRetry.filter((before) => afterRetry.some((after) => after.sourceKey === before.sourceKey && after.textHash !== before.textHash)).map(({ id, sourceKey, textHash }) => ({ id, sourceKey, beforeTextHash: textHash, afterTextHash: afterRetry.find((after) => after.sourceKey === sourceKey)?.textHash })),
  };
  await writeFile(new URL('snapshot-after-reprocess.json', reportDir), `${JSON.stringify({ fixture: report.fixture, docs: report.docs, reprocess: report.reprocess }, null, 2)}\n`);
  await writeFile(new URL('report.partial.json', reportDir), `${JSON.stringify(report, null, 2)}\n`);

  for (const document of documents.filter((item) => item.tag === 'KNOWLEDGE_BASE')) {
    const env = { ...serverEnv, DOCUMENT_TEXT_SOURCE: 'docling' };
    const args = [resolve(backendRoot, 'node_modules/.bin/tsx'), 'dbtemp/run-document-worker.mjs', '--audit-only', document.id];
    const audit = spawnSync(args[0]!, args.slice(1), { cwd: repoRoot, env, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
    report.ragAudits ??= [];
    const auditLogPath = new URL(`${document.id}.worker-audit.log`, reportDir);
    await writeFile(auditLogPath, `${audit.stdout ?? ''}${audit.stderr ? `\n--- stderr ---\n${audit.stderr}` : ''}`);
    report.ragAudits.push({ documentId: document.id, exitCode: audit.status, logPath: auditLogPath.pathname, stdoutTail: audit.status === 0 ? undefined : audit.stderr.slice(-2000) });
    await writeFile(new URL('report.partial.json', reportDir), `${JSON.stringify(report, null, 2)}\n`);
  }

  // Continue with an isolated authenticated route call only when the real visual asset and its source span are available.
  const questionRow = await prisma.monitorDocument.findUnique({ where: { id: questionDocument.id }, include: { visualAssets: { where: { pageNumber: 5 }, select: { id: true, pageNumber: true, checksum: true, storagePath: true, width: true, height: true, metadata: true } } } });
  const q03span = await prisma.questionSpan.findFirst({ where: { documentId: questionDocument.id, questionNumber: '03' }, include: { candidate: true, chunks: { select: { chunkId: true } } } });
  const q03question = q03span ? await prisma.question.findUnique({ where: { sourceKey: q03span.sourceKey }, select: { id: true, status: true, sourceKey: true, text: true, alternatives: true, topicId: true } }) : null;
  const imageAsset = questionRow?.visualAssets.find((asset) => asset.width === 379 && asset.height === 77 && (asset.metadata as any)?.sourceItemRef === '#/pictures/7') ?? null;
  if (skipChat) {
    report.chat = {
      attempted: false, result: 'SKIPPED_REUSED_PRIOR_RUN_EVIDENCE',
      reason: 'Real authenticated Q03 visual chat with the verified figure is already recorded in the prior isolated run.',
      evidencePath: resolve(repoRoot, 'dbtemp/artifacts/2d7bc13c-7573-435d-b43a-37e68702ee37/visual-chat.json'),
    };
  } else if (!q03span || !q03question || !imageAsset) {
    report.chat = { attempted: false, result: 'BLOCKED', reason: 'Q03 source span, persisted question or page 5 visual asset not found after ingestion.', spanId: q03span?.id ?? null, questionId: q03question?.id ?? null, page5Assets: questionRow?.visualAssets ?? [] };
  } else {
    serverLog = (await import('node:fs')).createWriteStream(serverLogPath);
    server = spawn(resolve(backendRoot, 'node_modules/.bin/tsx'), ['src/server.ts'], { cwd: backendRoot, env: serverEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.pipe(serverLog); server.stderr.pipe(serverLog);
    await waitForServer();
    const baseUrl = `http://127.0.0.1:${port}/api/v1`;
    const teacherToken = teacherLogin.data.session.access_token;
    const studentToken = studentLogin.data.session.access_token;
    const incorrectAssets = questionRow.visualAssets.filter((asset) => asset.id !== imageAsset.id).map((asset) => asset.id);
    await prisma.$transaction([
      prisma.questionVisualAsset.deleteMany({ where: { questionId: q03question.id, visualAssetId: { in: incorrectAssets } } }),
      prisma.questionSpanVisualAsset.deleteMany({ where: { questionSpanId: q03span.id, visualAssetId: { in: incorrectAssets } } }),
    ]);
    const reviewResponse = await fetch(`${baseUrl}/monitors/documents/${questionDocument.id}/questions/${q03question.id}/visual-assets/${imageAsset.id}/review`, {
      method: 'POST', headers: { authorization: `Bearer ${teacherToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ questionSpanId: q03span.id }),
    });
    const reviewBody = await reviewResponse.json().catch(() => null);
    if (!reviewResponse.ok) throw new Error(`Confirmação visual da Q03 falhou (${reviewResponse.status}): ${JSON.stringify(reviewBody)}`);
    await prisma.question.update({ where: { id: q03question.id }, data: { status: 'APPROVED' } });
    const imageDownload = await supabaseAdmin.storage.from('document-parser-artifacts').download(imageAsset.storagePath);
    const imageBytes = imageDownload.data ? Buffer.from(await imageDownload.data.arrayBuffer()) : null;
    const storedSha = imageBytes ? createHash('sha256').update(imageBytes).digest('hex') : null;
    const q03options = Array.isArray(q03question.alternatives) ? q03question.alternatives as Array<{ label?: string; text?: string }> : [];
    const message = 'Observe a figura anexada à questão. Qual característica estrutural distingue a tretinoína da isotretinoína no desenho? Responda citando apenas algo que possa verificar na imagem.';
    report.chat = { attempted: true, reviewStatus: reviewResponse.status, reviewBody, questionId: q03question.id, spanId: q03span.id, assetId: imageAsset.id, page: imageAsset.pageNumber, dimensions: [imageAsset.width, imageAsset.height], sourceItemRef: (imageAsset.metadata as any)?.sourceItemRef, expectedSha256: imageAsset.checksum, downloadedSha256: storedSha, checksumMatches: storedSha === imageAsset.checksum, requestMessage: message };
    const chatResponse = await fetch(`${baseUrl}/student/monitors/${monitorId}/chat/subjects/${subjectId}/messages`, {
      method: 'POST', headers: { authorization: `Bearer ${studentToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message,
        questionContext: { questionId: q03question.id, monitorId, subjectId, topicId, number: 3, topic: 'Isomeria e funções orgânicas', statement: q03question.text.slice(0, 20_000), options: q03options.map((option, index) => ({ label: option.label ?? String.fromCharCode(65 + index), text: option.text ?? '' })) },
      }),
    });
    const chatBody = await chatResponse.json().catch(() => null);
    report.chat.httpStatus = chatResponse.status;
    report.chat.response = chatBody;
    report.chat.serverLogPath = serverLogPath.pathname;
    if (!chatResponse.ok) report.chat.result = 'FAIL';
    else report.chat.result = 'MODEL_RESPONSE_RECEIVED_REVIEW_REQUIRED';
    await writeFile(new URL('report.partial.json', reportDir), `${JSON.stringify(report, null, 2)}\n`);
  }

  report.finishedAt = new Date().toISOString();
  const allQuestionDocs = report.docs.find((item: any) => item.tag === 'QUESTIONS');
  report.acceptance = {
    ac001: { detectedQuestionBlocks: allQuestionDocs?.blockTypes.find((item: any) => item.type === 'QUESTION')?.count ?? 0, spans: allQuestionDocs?.spans.length ?? 0, persisted: allQuestionDocs?.questions.length ?? 0 },
    ac003: report.reprocess?.stable ?? false,
    ac004: report.chat?.reviewStatus === 200,
    ac005: report.chat?.result === 'MODEL_RESPONSE_RECEIVED_REVIEW_REQUIRED',
    ac007: report.docs.filter((item: any) => item.tag === 'KNOWLEDGE_BASE').map((item: any) => ({ id: item.id, status: item.status, chunks: item.chunks, visuals: item.visualAssets.length })),
  };
  await writeFile(new URL('report.json', reportDir), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ runId, reportPath: new URL('report.json', reportDir).pathname, docs: report.docs.map((d: any) => ({ name: d.name, status: d.status, blocks: d.blockTypes, questions: d.questions.length, visuals: d.visualAssets.length })), reprocess: report.reprocess?.stable, chat: report.chat?.result ?? report.chat?.reason }, null, 2));
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.failure = { message: error instanceof Error ? error.message : String(error) };
  await writeFile(new URL('report.failed.json', reportDir), `${JSON.stringify(report, null, 2)}\n`);
  console.error(`E2E fixture ${runId} failed; report ${new URL('report.failed.json', reportDir).pathname}`);
  console.error(report.failure.message);
  process.exitCode = 1;
} finally {
  if (server) { server.kill('SIGTERM'); }
  serverLog?.end();
  // Preserve run data by default for review; cleanup requires explicit opt-in.
  if (process.env.E2E_CLEANUP === '1') try {
    const artifactPaths = await prisma.documentVisualAsset.findMany({ where: { documentId: { in: documents.map((d) => d.id) } }, select: { storagePath: true } });
    const parseRuns = await prisma.documentParseRun.findMany({ where: { documentId: { in: documents.map((d) => d.id) } }, select: { artifactManifestPath: true, rawOutputPath: true } });
    const privatePaths = new Set<string>(artifactPaths.map((row) => row.storagePath));
    for (const run of parseRuns) { if (run.artifactManifestPath) privatePaths.add(run.artifactManifestPath); if (run.rawOutputPath) privatePaths.add(run.rawOutputPath); }
    if (privatePaths.size) await supabaseAdmin.storage.from('document-parser-artifacts').remove([...privatePaths]);
    if (uploaded.length) await supabaseAdmin.storage.from('monitor-documents').remove(uploaded.map((file) => file.path));
    await prisma.$transaction(async (tx) => {
      await tx.studentEnrollment.deleteMany({ where: { studentId } });
      await tx.student.deleteMany({ where: { id: studentId } });
      await tx.teacher.deleteMany({ where: { id: teacherId } });
    });
    await supabaseAdmin.auth.admin.deleteUser(teacherAuth.data.user.id);
    await supabaseAdmin.auth.admin.deleteUser(studentAuth.data.user.id);
    report.cleanup = { complete: true, runPrefix: prefix, isolatedTeacherDeleted: true, isolatedStudentDeleted: true };
    await writeFile(new URL(report.failure ? 'report.failed.json' : 'report.json', reportDir), `${JSON.stringify(report, null, 2)}\n`);
  } catch (cleanupError) {
    report.cleanup = { complete: false, error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) };
    await writeFile(new URL('cleanup-failed.json', reportDir), `${JSON.stringify(report, null, 2)}\n`);
  } else {
    report.cleanup = { complete: false, preservedForReview: true, runPrefix: prefix };
    await writeFile(new URL(report.failure ? 'report.failed.json' : 'report.json', reportDir), `${JSON.stringify(report, null, 2)}\n`);
  }
  await prisma.$disconnect();
}
