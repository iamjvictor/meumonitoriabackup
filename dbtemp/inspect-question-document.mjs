import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const backend = resolve(root, 'backend');
const require = createRequire(resolve(backend, 'package.json'));
const dotenv = require('dotenv');
const env = dotenv.parse(await readFile(resolve(backend, '.env')));
const status = require('node:child_process').spawnSync('supabase', ['status', '--workdir', 'dbtemp', '--output', 'env'], { cwd: root, encoding: 'utf8' });
const local = Object.fromEntries(status.stdout.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  return match ? [[match[1], match[2].replace(/^"|"$/g, '')]] : [];
}));
Object.assign(process.env, {
  NODE_ENV: 'test',
  REDIS_URL: 'redis://127.0.0.1:6379',
  OPENROUTER_EMBEDDING_MODEL: env.OPENROUTER_EMBEDDING_MODEL,
  OPENROUTER_QUESTION_MODEL: env.OPENROUTER_QUESTION_MODEL,
  ASAAS_CREDENTIAL_ENCRYPTION_KEY: env.ASAAS_CREDENTIAL_ENCRYPTION_KEY,
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:56322/postgres',
  SUPABASE_URL: local.API_URL,
  SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
});

const { prisma } = await import('../backend/src/lib/prisma.ts');
const documentId = process.argv[2] ?? '406fa2b0-db4f-40dd-a1e7-6243c87b02d6';
try {
  const document = await prisma.monitorDocument.findUnique({
    where: { id: documentId },
    select: { originalName: true, status: true, errorMessage: true, tag: true, _count: { select: { chunks: true, visualAssets: true } } },
  });
  const questions = await prisma.question.findMany({
    where: { sources: { some: { documentId } } },
    select: { id: true, text: true, textHash: true, sourceKey: true, createdAt: true, status: true, metadata: true, sources: { select: { id: true, documentId: true, chunkId: true, excerpt: true } }, visualAssets: { select: { visualAssetId: true, role: true } } },
  });
  const assets = await prisma.documentVisualAsset.findMany({
    where: { documentId }, orderBy: [{ pageNumber: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, pageNumber: true, assetType: true, storagePath: true, checksum: true, metadata: true },
  });
  const byChecksum = new Map();
  for (const asset of assets) byChecksum.set(asset.checksum, [...(byChecksum.get(asset.checksum) ?? []), asset]);
  const duplicateChecksums = [...byChecksum.entries()].filter(([, rows]) => rows.length > 1).map(([checksum, rows]) => ({ checksum, count: rows.length, ids: rows.map((row) => row.id), paths: rows.map((row) => row.storagePath) }));
  console.log(JSON.stringify({
    document,
    questionCount: questions.length,
    questions: questions.map(({ id, text, status, metadata, sources, visualAssets }) => ({
      id, status, number: metadata?.questionNumber ?? null,
      text: text.slice(0, 2400), ordinal: metadata?.questionExtractionOrdinal ?? null,
      corrections: metadata?.sourceEvidenceCorrections ?? [], sourceCount: sources.length,
      sourceIds: sources.map((source) => source.id), visualAssets,
    })).filter((question) => ['01', '1', '04', '4', '05', '5'].includes(String(question.number ?? ''))),
    questionStatuses: questions.reduce((counts, question) => ({ ...counts, [question.status]: (counts[question.status] ?? 0) + 1 }), {}),
    questionIdentities: questions.map((question) => ({
      id: question.id, number: question.metadata?.questionNumber ?? null,
      ordinal: question.metadata?.questionExtractionOrdinal ?? null,
      status: question.status, textHash: question.textHash,
      sourceKey: question.sourceKey, createdAt: question.createdAt,
      sourceCount: question.sources.length, sources: question.sources.map((source) => ({
        id: source.id, documentId: source.documentId, chunkId: source.chunkId, excerpt: source.excerpt?.slice(0, 250),
      })),
    })).sort((a, b) => Number(a.ordinal) - Number(b.ordinal)),
    visualAssetCount: assets.length,
    duplicateChecksums,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
