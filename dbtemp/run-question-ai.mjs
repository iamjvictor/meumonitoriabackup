import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const backendRoot = resolve(repoRoot, 'backend');
const require = createRequire(resolve(backendRoot, 'package.json'));
const dotenv = require('dotenv');
const backendEnv = dotenv.parse(await readFile(resolve(backendRoot, '.env')));
if (!backendEnv.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY ausente em backend/.env');

const inheritedAllowlist = new Set(['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL']);
for (const name of Object.keys(process.env)) if (!inheritedAllowlist.has(name)) delete process.env[name];
for (const name of [
  'OPENROUTER_API_KEY', 'OPENROUTER_QUESTION_MODEL', 'OPENROUTER_EMBEDDING_MODEL',
  'OPENROUTER_EMBEDDING_DIMENSIONS', 'OPENROUTER_STRUCTURED_TIMEOUT_MS',
  'QUESTION_COMPLETION_MODEL', 'QUESTION_COMPLETION_FALLBACK_MODEL',
  'QUESTION_COMPLETION_MAX_TOKENS', 'QUESTION_COMPLETION_TEMPERATURE',
  'QUESTION_SOURCE_RECONSTRUCTION_MODEL', 'QUESTION_SOURCE_RECONSTRUCTION_MAX_TOKENS',
  'QUESTION_SOURCE_RECONSTRUCTION_TEMPERATURE', 'QUESTION_QUALITY_REVIEW_MODEL',
  'QUESTION_QUALITY_REVIEW_MAX_TOKENS', 'QUESTION_QUALITY_REVIEW_TEMPERATURE',
  'QUESTION_ALTERNATIVES_MODEL', 'QUESTION_ALTERNATIVES_MAX_TOKENS', 'QUESTION_ALTERNATIVES_TEMPERATURE',
  'QUESTION_ANSWER_MODEL', 'QUESTION_ANSWER_MAX_TOKENS', 'QUESTION_ANSWER_TEMPERATURE',
  'QUESTION_EXPLANATION_MODEL', 'QUESTION_EXPLANATION_MAX_TOKENS', 'QUESTION_EXPLANATION_TEMPERATURE',
  'AI_REASONING_EFFORT', 'ENABLE_PAID_STRUCTURED_FALLBACK', 'ASAAS_CREDENTIAL_ENCRYPTION_KEY',
]) if (Object.hasOwn(backendEnv, name)) process.env[name] = backendEnv[name];

Object.assign(process.env, {
  NODE_ENV: 'test',
  SUPABASE_URL: 'http://127.0.0.1:56321',
  SUPABASE_PUBLISHABLE_KEY: 'local-test-only',
  SUPABASE_SERVICE_ROLE_KEY: 'local-test-only',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:56322/postgres',
  REDIS_URL: 'redis://127.0.0.1:6379',
});

const outputDirectory = resolve(new URL('./artifacts/question-ai/', import.meta.url).pathname);
await mkdir(outputDirectory, { recursive: true });
process.argv = [
  process.argv[0],
  resolve(backendRoot, 'src/scripts/test-question-dry-run.ts'),
  resolve(repoRoot, 'tests/document-parser/teacher-materials'),
  'Quimica-3.pdf',
  outputDirectory,
];
await import('../backend/src/scripts/test-question-dry-run.ts');
