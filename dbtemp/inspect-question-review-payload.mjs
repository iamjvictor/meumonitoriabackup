import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const backend = resolve(root, 'backend');
const require = createRequire(resolve(backend, 'package.json'));
const dotenv = require('dotenv');
const envFile = dotenv.parse(await readFile(resolve(backend, '.env')));
const status = require('node:child_process').spawnSync('supabase', ['status', '--workdir', 'dbtemp', '--output', 'env'], { cwd: root, encoding: 'utf8' });
if (status.status !== 0) throw new Error('Supabase local dbtemp não está disponível.');
const local = Object.fromEntries(status.stdout.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  return match ? [[match[1], match[2].replace(/^"|"$/g, '')]] : [];
}));
Object.assign(process.env, envFile, {
  NODE_ENV: 'test', DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:56322/postgres',
  SUPABASE_URL: local.API_URL, SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY, REDIS_URL: 'redis://127.0.0.1:6379',
  ASAAS_WEBHOOK_URL: 'http://127.0.0.1:33671/api/webhooks/asaas',
});
const { prisma } = await import('../backend/src/lib/prisma.ts');
const { listQuestionsForMonitor } = await import('../backend/src/repositories/content-review.repository.ts');
const fixture = JSON.parse(await readFile(new URL('./artifacts/question-formula-visual-fixture.json', import.meta.url), 'utf8'));
try {
  const teacher = await prisma.teacher.findUnique({ where: { id: fixture.teacherId }, select: { userId: true } });
  if (!teacher) throw new Error('Professor local do fixture não foi encontrado.');
  const all = await listQuestionsForMonitor(teacher.userId, fixture.monitorId);
  const linkedQuestions = await prisma.question.findMany({
    where: { sources: { some: { documentId: fixture.id } } }, select: { id: true },
  });
  const linkedIds = new Set(linkedQuestions.map(({ id }) => id));
  const selected = all.filter((question) => linkedIds.has(question.id));
  const questions = selected.map((question) => ({
    id: question.id, number: question.metadata?.questionNumber ?? null, status: question.status,
    text: question.text, alternatives: question.alternatives, correctAnswer: question.correctAnswer,
    visualAssets: question.visualAssets.map((asset) => ({
      assetId: asset.assetId, role: asset.role, pageNumber: asset.pageNumber, bbox: asset.bbox,
      width: asset.width, height: asset.height, anchorText: asset.anchorText,
      readingOrder: asset.readingOrder, sourceItemRef: asset.sourceItemRef,
      imageUrlPresent: Boolean(asset.imageUrl), anchorOccurrences: asset.anchorText ? (question.text.split(asset.anchorText).length - 1) : 0,
    })),
  }));
  const report = {
    documentId: fixture.id, originalName: fixture.originalName,
    database: 'dbtemp-local-only', questionCount: questions.length,
    allQuestionsPendingReview: questions.every((question) => question.status === 'PENDING_REVIEW'),
    questions: questions.filter((question) => ['01', '04', '05'].includes(String(question.number))),
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const outputPath = resolve(root, 'dbtemp/artifacts/Quimica-3.content-review-qa.json');
  const fixturePath = resolve(root, 'tests/document-parser/results/quimica-3-content-review-local-2026-11-06.json');
  await mkdir(resolve(root, 'dbtemp/artifacts'), { recursive: true });
  await mkdir(resolve(root, 'tests/document-parser/results'), { recursive: true });
  await writeFile(outputPath, serialized);
  await writeFile(fixturePath, serialized);
  console.log(JSON.stringify({ outputPath, fixturePath, ...report }, null, 2));
} finally {
  await prisma.$disconnect();
}
