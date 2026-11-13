import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const backendRoot = resolve(repoRoot, 'backend');
const require = createRequire(resolve(backendRoot, 'package.json'));
const dotenv = require('dotenv');
const envFile = dotenv.parse(await readFile(resolve(backendRoot, '.env')));
const runId = process.argv[2];
if (!runId || !/^[0-9a-f-]{36}$/i.test(runId)) throw new Error('Uso: run-isolated-visual-chat.mts <run-id>');
const reportDir = new URL(`./artifacts/${runId}/`, import.meta.url);
const fixture = JSON.parse(await readFile(new URL('fixture.json', reportDir), 'utf8'));
const status = spawnSync('supabase', ['status', '--workdir', 'dbtemp', '--output', 'env'], { cwd: repoRoot, encoding: 'utf8' });
if (status.status !== 0) throw new Error('Supabase dbtemp indisponível.');
const local = Object.fromEntries(status.stdout.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  return match ? [[match[1], match[2].replace(/^"|"$/g, '')]] : [];
}));
const port = 33672;
const runtimeEnv = {
  ...envFile,
  PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin', HOME: process.env.HOME ?? '/tmp', TMPDIR: process.env.TMPDIR ?? '/tmp',
  NODE_ENV: 'test', DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:56322/postgres',
  SUPABASE_URL: local.API_URL, SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY, REDIS_URL: 'redis://127.0.0.1:6379',
  ASAAS_WEBHOOK_URL: `http://127.0.0.1:${port}/api/webhooks/asaas`,
  PORT: String(port), HOST: '127.0.0.1', DOCUMENT_VISUAL_ASSETS_ENABLED: 'true',
  DOCUMENT_PARSER_BASE_URL: 'http://127.0.0.1:8080', DOCUMENT_CHUNKER_BASE_URL: 'http://127.0.0.1:8080',
};
Object.assign(process.env, runtimeEnv);
const [{ prisma }, { supabaseAdmin }] = await Promise.all([
  import('../backend/src/lib/prisma.js'), import('../backend/src/lib/supabase.js'),
]);
const { createClient } = require('@supabase/supabase-js');
const authClient = createClient(local.API_URL, local.PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
let server: ReturnType<typeof spawn> | null = null;
const logPath = new URL('visual-chat-server.log', reportDir);
const logStream = (await import('node:fs')).createWriteStream(logPath);

async function login(email: string) {
  const link = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error || !link.data.properties?.hashed_token) throw new Error(`Não foi possível criar token de sessão local (${link.error?.message ?? 'hash ausente'}).`);
  const verified = await authClient.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'email' });
  if (verified.error || !verified.data.session) throw new Error(`Não foi possível validar sessão local (${verified.error?.message ?? 'sessão ausente'}).`);
  return verified.data.session.access_token;
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const result = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      if (result.ok) return;
    } catch { /* api starting */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error('API de chat local não iniciou.');
}

try {
  const [teacher, student, spans, assets] = await Promise.all([
    prisma.teacher.findUnique({ where: { id: fixture.teacherId }, select: { email: true } }),
    prisma.student.findUnique({ where: { id: fixture.studentId }, select: { email: true } }),
    prisma.questionSpan.findMany({ where: { documentId: fixture.documentIds[0].id }, orderBy: { questionNumber: 'asc' }, select: { id: true, sourceKey: true, questionNumber: true, pageStart: true, pageEnd: true, chunks: { select: { chunkId: true } } } }),
    prisma.documentVisualAsset.findMany({ where: { documentId: fixture.documentIds[0].id }, orderBy: [{ pageNumber: 'asc' }, { createdAt: 'asc' }], select: { id: true, pageNumber: true, checksum: true, storagePath: true, width: true, height: true, metadata: true } }),
  ]);
  const span = spans.find((item) => item.questionNumber === '03');
  const question = span ? await prisma.question.findUnique({ where: { sourceKey: span.sourceKey }, select: { id: true, sourceKey: true, text: true, alternatives: true, status: true, topicId: true } }) : null;
  const pageFiveAssets = assets.filter((item) => item.pageNumber === 5);
  const selectedAsset = pageFiveAssets.find((item) => item.width === 379 && item.height === 77 && (item.metadata as any)?.sourceItemRef === '#/pictures/7');
  if (!teacher || !student || !span || !question || !selectedAsset) {
    throw new Error(`Q03 fixture incompleta: span=${Boolean(span)}, question=${Boolean(question)}, correctPage5Figure=${Boolean(selectedAsset)}`);
  }
  server = spawn(resolve(backendRoot, 'node_modules/.bin/tsx'), ['src/server.ts'], { cwd: backendRoot, env: runtimeEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.pipe(logStream, { end: false }); server.stderr.pipe(logStream, { end: false });
  await waitForServer();
  const teacherToken = await login(teacher.email);
  const studentToken = await login(student.email);
  const base = `http://127.0.0.1:${port}/api/v1`;
  const incorrectLinksBefore = await prisma.questionVisualAsset.findMany({ where: { questionId: question.id, visualAssetId: { in: pageFiveAssets.filter((item) => item.id !== selectedAsset.id).map((item) => item.id) } }, select: { visualAssetId: true, associationMethod: true, role: true } });
  await prisma.$transaction([
    prisma.questionVisualAsset.deleteMany({ where: { questionId: question.id, visualAssetId: { in: pageFiveAssets.filter((item) => item.id !== selectedAsset.id).map((item) => item.id) } } }),
    prisma.questionSpanVisualAsset.deleteMany({ where: { questionSpanId: span.id, visualAssetId: { in: pageFiveAssets.filter((item) => item.id !== selectedAsset.id).map((item) => item.id) } } }),
  ]);
  const review = await fetch(`${base}/monitors/documents/${fixture.documentIds[0].id}/questions/${question.id}/visual-assets/${selectedAsset.id}/review`, {
    method: 'POST', headers: { authorization: `Bearer ${teacherToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ questionSpanId: span.id }),
  });
  const reviewBody = await review.json().catch(() => null);
  if (!review.ok) throw new Error(`Rota de confirmação visual retornou ${review.status}: ${JSON.stringify(reviewBody)}`);
  await prisma.question.update({ where: { id: question.id }, data: { status: 'APPROVED' } });
  const download = await supabaseAdmin.storage.from('document-parser-artifacts').download(selectedAsset.storagePath);
  const bytes = download.data ? Buffer.from(await download.data.arrayBuffer()) : null;
  const actualSha = bytes ? createHash('sha256').update(bytes).digest('hex') : null;
  const options = Array.isArray(question.alternatives) ? question.alternatives as Array<{ label?: string; text?: string }> : [];
  const message = 'Observe a figura da questão. Qual diferença de geometria da cadeia aparece entre a tretinoína e a isotretinoína? Explique com base no desenho, sem completar pela teoria se não conseguir ver a imagem.';
  const chat = await fetch(`${base}/student/monitors/${fixture.monitorId}/chat/subjects/${fixture.subjectId}/messages`, {
    method: 'POST', headers: { authorization: `Bearer ${studentToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      message,
      questionContext: {
        questionId: question.id, monitorId: fixture.monitorId, subjectId: fixture.subjectId,
        topicId: question.topicId, number: 3, topic: 'Isomeria espacial', statement: question.text,
        options: options.map((option, index) => ({ label: option.label ?? String.fromCharCode(65 + index), text: option.text ?? '' })),
      },
    }),
  });
  const chatBody = await chat.json().catch(() => null);
  const chatEvidence = {
    runId, questionId: question.id, spanId: span.id, questionNumber: span.questionNumber,
    pageRange: [span.pageStart, span.pageEnd], assetId: selectedAsset.id, assetPage: selectedAsset.pageNumber,
    expectedSha256: selectedAsset.checksum, downloadedSha256: actualSha, byteChecksumMatches: actualSha === selectedAsset.checksum,
    selectedDimensions: [selectedAsset.width, selectedAsset.height], selectedItemRef: (selectedAsset.metadata as any)?.sourceItemRef,
    removedIncorrectPageFiveLinks: incorrectLinksBefore,
    reviewHttpStatus: review.status, reviewBody, chatHttpStatus: chat.status, questionStatusAfter: 'APPROVED',
    prompt: message, response: chatBody, serverLog: logPath.pathname,
    result: chat.ok && actualSha === selectedAsset.checksum ? 'REAL_CHAT_RESPONSE_REVIEW_REQUIRED' : 'FAIL',
  };
  const reportPath = new URL('visual-chat.json', reportDir);
  await writeFile(reportPath, `${JSON.stringify(chatEvidence, null, 2)}\n`);
  const auditPath = new URL('report.partial.json', reportDir);
  try {
    const mainReport = JSON.parse(await readFile(auditPath, 'utf8'));
    mainReport.chat = chatEvidence;
    await writeFile(auditPath, `${JSON.stringify(mainReport, null, 2)}\n`);
  } catch { /* keep standalone chat evidence if orchestration has not written a partial report */ }
  console.log(JSON.stringify({ result: chatEvidence.result, review: review.status, chat: chat.status, questionId: question.id, assetId: selectedAsset.id, assetPage: selectedAsset.pageNumber, byteChecksumMatches: chatEvidence.byteChecksumMatches, report: reportPath.pathname }, null, 2));
} catch (error) {
  const failure = { runId, result: 'FAILED', error: error instanceof Error ? error.message : String(error), serverLog: logPath.pathname };
  await writeFile(new URL('visual-chat.failed.json', reportDir), `${JSON.stringify(failure, null, 2)}\n`);
  console.error(failure.error);
  process.exitCode = 1;
} finally {
  server?.kill('SIGTERM');
  await new Promise<void>((resolveEnd) => { if (!server) return resolveEnd(); server.once('close', () => resolveEnd()); setTimeout(resolveEnd, 3000).unref(); });
  const finish = new Promise<void>((resolveFinish) => logStream.once('finish', resolveFinish));
  logStream.end(); await finish;
  await prisma.$disconnect();
}
