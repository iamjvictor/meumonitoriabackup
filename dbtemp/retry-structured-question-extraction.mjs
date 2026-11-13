import { readFile, writeFile } from 'node:fs/promises';
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
const { StructuredQuestionExtractionService } = await import('../backend/src/worker/services/structured-question-extraction.service.ts');
const fixture = JSON.parse(await readFile(new URL('./artifacts/question-formula-visual-fixture.json', import.meta.url), 'utf8'));

async function snapshot() {
  const questions = await prisma.question.findMany({
    where: { sources: { some: { documentId: fixture.id } } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, text: true, status: true, metadata: true, sources: { select: { id: true } }, visualAssets: { select: { visualAssetId: true, role: true } } },
  });
  return questions.map((question) => ({
    id: question.id, number: question.metadata?.questionNumber ?? null,
    ordinal: question.metadata?.questionExtractionOrdinal ?? null,
    status: question.status, sourceCount: question.sources.length,
    sourceIds: question.sources.map(({ id }) => id).sort(), visualAssets: question.visualAssets,
    text: question.text,
    corrections: question.metadata?.sourceEvidenceCorrections ?? [],
  })).sort((a, b) => Number(a.ordinal) - Number(b.ordinal));
}

try {
  const service = new StructuredQuestionExtractionService();
  const before = await snapshot();
  const runs = [];
  for (let run = 1; run <= 2; run += 1) {
    const result = await service.processDocument(fixture.id);
    const questions = await snapshot();
    runs.push({ run, result, count: questions.length, ids: questions.map(({ id }) => id), questions });
  }
  const sameIds = runs.length === 2 && JSON.stringify(runs[0].ids) === JSON.stringify(runs[1].ids);
  const uniqueOrdinals = runs[1].questions.length === 10
    && runs[1].questions.every((question, index) => question.ordinal === index);
  const q4 = runs[1].questions.find((question) => question.number === '04');
  const q5 = runs[1].questions.find((question) => question.number === '05');
  const q1 = runs[1].questions.find((question) => question.number === '01');
  const report = {
    documentId: fixture.id, database: 'dbtemp-local-only', model: envFile.QUESTION_EXTRACTION_MODEL ?? envFile.OPENROUTER_QUESTION_MODEL,
    beforeCount: before.length, sameIds, uniqueOrdinals,
    allPendingReview: runs[1].questions.every((question) => question.status === 'PENDING_REVIEW'),
    q01: q1 ? { id: q1.id, visualAssets: q1.visualAssets } : null,
    q04: q4 ? { id: q4.id, text: q4.text, corrections: q4.corrections } : null,
    q05: q5 ? { id: q5.id, text: q5.text, corrections: q5.corrections } : null,
    runs: runs.map(({ run, result, count }) => ({ run, result, count })),
  };
  const outputPath = resolve(root, 'dbtemp/artifacts/Quimica-3.structured-retry-qa.json');
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, ...report }, null, 2));
} finally {
  await prisma.$disconnect();
}
