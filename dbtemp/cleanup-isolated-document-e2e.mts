import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

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
Object.assign(process.env, envFile, {
  NODE_ENV: 'test', DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:56322/postgres',
  SUPABASE_URL: local.API_URL, SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY, REDIS_URL: 'redis://127.0.0.1:6379',
  ASAAS_WEBHOOK_URL: 'http://127.0.0.1:33671/api/webhooks/asaas',
});
const runId = process.argv[2];
if (!runId || !/^[0-9a-f-]{36}$/i.test(runId)) throw new Error('Uso: cleanup-isolated-document-e2e.mts <run-id>');
const fixture = JSON.parse(await readFile(new URL(`./artifacts/${runId}/fixture.json`, import.meta.url), 'utf8'));
const [{ prisma }, { supabaseAdmin }] = await Promise.all([
  import('../backend/src/lib/prisma.js'), import('../backend/src/lib/supabase.js'),
]);
try {
  const [teacher, student] = await Promise.all([
    prisma.teacher.findUnique({ where: { id: fixture.teacherId }, select: { userId: true } }),
    prisma.student.findUnique({ where: { id: fixture.studentId }, select: { userId: true } }),
  ]);
  const docIds = fixture.documentIds.map((item: { id: string }) => item.id);
  const [assets, parseRuns] = await Promise.all([
    prisma.documentVisualAsset.findMany({ where: { documentId: { in: docIds } }, select: { storagePath: true } }),
    prisma.documentParseRun.findMany({ where: { documentId: { in: docIds } }, select: { artifactManifestPath: true, rawOutputPath: true } }),
  ]);
  const artifactPaths = new Set<string>(assets.map((item) => item.storagePath));
  for (const run of parseRuns) {
    if (run.artifactManifestPath) artifactPaths.add(run.artifactManifestPath);
    if (run.rawOutputPath) artifactPaths.add(run.rawOutputPath);
  }
  if (artifactPaths.size) await supabaseAdmin.storage.from('document-parser-artifacts').remove([...artifactPaths]);
  await supabaseAdmin.storage.from('monitor-documents').remove(fixture.documentIds.map((item: { name: string }) => `${fixture.prefix}/${item.name}`));
  await prisma.$transaction(async (tx) => {
    await tx.studentEnrollment.deleteMany({ where: { studentId: fixture.studentId, monitorId: fixture.monitorId } });
    await tx.student.deleteMany({ where: { id: fixture.studentId } });
    await tx.teacher.deleteMany({ where: { id: fixture.teacherId } });
  });
  if (teacher?.userId) await supabaseAdmin.auth.admin.deleteUser(teacher.userId);
  if (student?.userId) await supabaseAdmin.auth.admin.deleteUser(student.userId);
  const [teachersLeft, studentsLeft, docsLeft] = await Promise.all([
    prisma.teacher.count({ where: { id: fixture.teacherId } }),
    prisma.student.count({ where: { id: fixture.studentId } }),
    prisma.monitorDocument.count({ where: { id: { in: docIds } } }),
  ]);
  console.log(JSON.stringify({ runId, cleanup: teachersLeft === 0 && studentsLeft === 0 && docsLeft === 0 ? 'PASS' : 'FAIL', teachersLeft, studentsLeft, docsLeft }));
} finally {
  await prisma.$disconnect();
}
