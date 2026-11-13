import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const dotenv = require('dotenv');
const backendEnv = dotenv.parse(await readFile(new URL('../backend/.env', import.meta.url)));
const status = spawnSync('supabase', ['status', '--workdir', 'dbtemp', '--output', 'env'], { encoding: 'utf8' });
if (status.status !== 0) throw new Error('Não foi possível obter a configuração do Supabase local dbtemp.');
const local = Object.fromEntries(status.stdout.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  return match ? [[match[1], match[2].replace(/^"|"$/g, '')]] : [];
}));
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:56322/postgres',
  SUPABASE_URL: local.API_URL,
  SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  REDIS_URL: 'redis://127.0.0.1:6379',
  ASAAS_CREDENTIAL_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  OPENROUTER_EMBEDDING_MODEL: backendEnv.OPENROUTER_EMBEDDING_MODEL ?? 'qwen/qwen3-embedding-8b',
  OPENROUTER_QUESTION_MODEL: backendEnv.OPENROUTER_QUESTION_MODEL ?? 'google/gemini-2.5-flash',
});
const { prisma } = await import('../backend/src/lib/prisma.js');

const documentId = 'e2000000-0000-4000-8000-000000000012';

try {
  const questions = await prisma.question.findMany({
    where: { sources: { some: { documentId } } },
    select: {
      id: true,
      text: true,
      alternatives: true,
      alternativesOrigin: true,
      correctAnswer: true,
      explanation: true,
      kind: true,
      status: true,
      completenessStatus: true,
      needsReview: true,
      qualityScore: true,
      sources: {
        where: { documentId },
        select: { pageStart: true, pageEnd: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const report = {
    documentId,
    questionCount: questions.length,
    withAlternatives: questions.filter((question) => Array.isArray(question.alternatives) && question.alternatives.length > 0).length,
    withCorrectAnswer: questions.filter((question) => Boolean(question.correctAnswer)).length,
    needsReview: questions.filter((question) => question.needsReview).length,
    questions: questions.map((question, index) => ({
      number: index + 1,
      id: question.id,
      pages: [...new Set(question.sources.flatMap((source) => [source.pageStart, source.pageEnd].filter((page): page is number => page !== null)))],
      text: question.text,
      alternativeCount: Array.isArray(question.alternatives) ? question.alternatives.length : 0,
      alternatives: question.alternatives,
      alternativesOrigin: question.alternativesOrigin,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
      status: question.status,
      completenessStatus: question.completenessStatus,
      needsReview: question.needsReview,
      qualityScore: question.qualityScore,
    })),
  };

  const output = new URL('./artifacts/question-ai/Quimica-3.persisted-summary.json', import.meta.url);
  await mkdir(new URL('.', output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    questionCount: report.questionCount,
    withAlternatives: report.withAlternatives,
    withCorrectAnswer: report.withCorrectAnswer,
    needsReview: report.needsReview,
    questions: report.questions.map(({ number, alternativeCount, correctAnswer, status, completenessStatus, pages }) => ({
      number, alternativeCount, hasCorrectAnswer: Boolean(correctAnswer), status, completenessStatus, pages,
    })),
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
