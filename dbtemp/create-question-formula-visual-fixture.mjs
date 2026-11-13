import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

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
const fixturePath = resolve(root, 'dbtemp/artifacts/question-formula-visual-fixture.json');
const existing = await readFile(fixturePath, 'utf8').then((value) => JSON.parse(value)).catch(() => null);
if (existing) {
  console.log(JSON.stringify({ fixture: existing, reused: true }));
  await prisma.$disconnect();
  process.exit(0);
}
const source = await prisma.monitorDocument.findUnique({
  where: { id: '406fa2b0-db4f-40dd-a1e7-6243c87b02d6' },
  include: { topicLinks: { select: { topicId: true } } },
});
if (!source) throw new Error('Documento base do QA não foi encontrado em dbtemp.');
const id = randomUUID();
try {
  const document = await prisma.monitorDocument.create({
    data: {
      id, teacherId: source.teacherId, monitorId: source.monitorId, subjectId: source.subjectId,
      topicId: source.topicId, tag: 'QUESTIONS', originalName: 'Quimica-3-QA-2026-11-06.pdf',
      storagePath: source.storagePath, mimeType: source.mimeType, sizeBytes: source.sizeBytes,
      status: 'QUEUED', processingVersion: source.processingVersion,
      topicLinks: { create: source.topicLinks.map(({ topicId }) => ({ topicId })) },
    },
    select: { id: true, originalName: true, storagePath: true, teacherId: true, monitorId: true, subjectId: true, topicId: true, sizeBytes: true },
  });
  const fixture = { ...document, sourceDocumentId: source.id, database: 'dbtemp-local-only' };
  await mkdir(resolve(root, 'dbtemp/artifacts'), { recursive: true });
  await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(JSON.stringify({ fixture, reused: false }, null, 2));
} finally {
  await prisma.$disconnect();
}
