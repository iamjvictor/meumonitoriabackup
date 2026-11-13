import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const backendRoot = resolve(repoRoot, 'backend');
const require = createRequire(resolve(backendRoot, 'package.json'));
const dotenv = require('dotenv');
const backendEnv = dotenv.parse(await readFile(resolve(backendRoot, '.env')));
if (!backendEnv.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY ausente em backend/.env');

const status = spawnSync('supabase', ['status', '--workdir', 'dbtemp', '--output', 'env'], {
  cwd: repoRoot, encoding: 'utf8',
});
if (status.status !== 0) throw new Error('Não foi possível ler o ambiente do Supabase local dbtemp.');
const local = Object.fromEntries(status.stdout.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  return match ? [[match[1], match[2].replace(/^"|"$/g, '')]] : [];
}));
if (!local.API_URL || !local.PUBLISHABLE_KEY || !local.SERVICE_ROLE_KEY) {
  throw new Error('Supabase local dbtemp não retornou URL/chaves necessárias.');
}

// Allow only the AI/parser settings needed by document ingestion. All data
// services are pinned to dbtemp and the local Docling HTTP server.
const forwarded = [
  'OPENROUTER_API_KEY', 'OPENROUTER_QUESTION_MODEL', 'OPENROUTER_EMBEDDING_MODEL',
  'OPENROUTER_EMBEDDING_DIMENSIONS', 'OPENROUTER_STRUCTURED_TIMEOUT_MS',
  'DOCUMENT_VISUAL_DESCRIPTION_MODEL', 'QUESTION_EXTRACTION_MODEL',
  'QUESTION_SOURCE_RECONSTRUCTION_MODEL', 'QUESTION_COMPLETION_MODEL',
  'QUESTION_COMPLETION_FALLBACK_MODEL', 'QUESTION_QUALITY_REVIEW_MODEL',
  'QUESTION_CANDIDATE_CONCURRENCY', 'AI_REASONING_EFFORT',
  'QUESTION_EXTRACTION_MAX_TOKENS', 'QUESTION_SOURCE_RECONSTRUCTION_MAX_TOKENS',
  'QUESTION_COMPLETION_MAX_TOKENS', 'QUESTION_CATEGORIZE_MAX_TOKENS',
  'QUESTION_ALTERNATIVES_MAX_TOKENS', 'QUESTION_ANSWER_MAX_TOKENS',
  'QUESTION_EXPLANATION_MAX_TOKENS', 'QUESTION_QUALITY_REVIEW_MAX_TOKENS',
  'QUESTION_ALTERNATIVES_TEMPERATURE', 'QUESTION_ANSWER_TEMPERATURE',
  'QUESTION_EXPLANATION_TEMPERATURE', 'QUESTION_QUALITY_REVIEW_TEMPERATURE',
  'ASAAS_CREDENTIAL_ENCRYPTION_KEY', 'RAG_PARENT_CHUNK_TARGET_TOKENS',
  'RAG_PARENT_CHUNK_MAX_TOKENS', 'RAG_CHILD_CHUNK_TARGET_TOKENS',
  'RAG_CHILD_CHUNK_MAX_TOKENS', 'RAG_CHILD_CHUNK_OVERLAP_TOKENS',
  'EMBEDDING_MIN_TOKENS', 'EMBEDDING_MIN_CHARS', 'EMBEDDING_BATCH_SIZE',
];
const inheritedAllowlist = new Set(['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL']);
for (const name of Object.keys(process.env)) if (!inheritedAllowlist.has(name)) delete process.env[name];
for (const name of forwarded) if (backendEnv[name]) process.env[name] = backendEnv[name];
// If no explicit fallback is configured, follow the selected primary model.
if (!backendEnv.QUESTION_COMPLETION_FALLBACK_MODEL) {
  process.env.QUESTION_COMPLETION_FALLBACK_MODEL = backendEnv.OPENROUTER_QUESTION_MODEL;
}
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:56322/postgres',
  SUPABASE_URL: local.API_URL,
  SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  REDIS_URL: 'redis://127.0.0.1:6379',
  ASAAS_WEBHOOK_URL: 'http://127.0.0.1:33671/api/webhooks/asaas',
  DOCUMENT_PARSER_BASE_URL: 'http://127.0.0.1:8080',
  DOCUMENT_CHUNKER_BASE_URL: 'http://127.0.0.1:8080',
  DOCUMENT_VISUAL_ASSETS_ENABLED: 'true',
  DOCUMENT_TEXT_SOURCE: process.argv.includes('--questions') ? 'pdfjs' : 'docling',
});

const { prisma } = await import('../backend/src/lib/prisma.ts');
const { supabaseAdmin } = await import('../backend/src/lib/supabase.ts');
const { DocumentWorkerService } = await import('../backend/src/worker/services/document-worker.service.ts');
const auditOnly = process.argv.includes('--audit-only');
const ids = process.argv.slice(2).filter((value) => /^[0-9a-f-]{36}$/i.test(value));
if (!ids.length) throw new Error('Informe um ou mais IDs de documentos seedados em dbtemp.');

try {
  for (const documentId of ids) {
    const startedAt = Date.now();
    let result;
    if (auditOnly) result = { skipped: 'audit-only' };
    else {
      try {
        result = await new DocumentWorkerService().process(documentId);
      } catch (error) {
        result = { error: { name: error instanceof Error ? error.name : 'UnknownError', message: error instanceof Error ? error.message : String(error) } };
      }
    }
    const document = await prisma.monitorDocument.findUnique({
      where: { id: documentId },
      select: {
        originalName: true, tag: true, status: true, errorMessage: true,
        teacherId: true, monitorId: true, subjectId: true, topicId: true,
        _count: { select: { chunks: true, blocks: true, textExtractions: true, visualAssets: true } },
      },
    });
    const chunks = await prisma.documentChunk.findMany({
      where: { documentId }, orderBy: { chunkIndex: 'asc' },
      select: { chunkIndex: true, status: true, pageStart: true, pageEnd: true, tokenCount: true, content: true, embeddedAt: true },
    });
    const blocks = await prisma.documentBlock.groupBy({ by: ['type'], where: { documentId }, _count: { _all: true } });
    let assets = await prisma.documentVisualAsset.findMany({
      where: { documentId }, orderBy: [{ pageNumber: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, pageNumber: true, assetType: true, storagePath: true, checksum: true, visualIndex: { select: { descriptionStatus: true, description: true } } },
    });
    if (process.argv.includes('--retry-visual-index')) {
      const { DocumentVisualIndexingService } = await import('../backend/src/worker/services/document-visual-indexing.service.ts');
      const indexing = new DocumentVisualIndexingService();
      for (const asset of assets.filter((item) => item.visualIndex?.descriptionStatus !== 'READY')) {
        try {
          await indexing.describeAndIndexAsset(asset.id);
        } catch (error) {
          console.warn('Visual asset retry failed', { assetId: asset.id, pageNumber: asset.pageNumber, error: error instanceof Error ? error.message : String(error) });
        }
      }
      assets = await prisma.documentVisualAsset.findMany({
        where: { documentId }, orderBy: [{ pageNumber: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, pageNumber: true, assetType: true, storagePath: true, checksum: true, visualIndex: { select: { descriptionStatus: true, description: true } } },
      });
    }
    const pageThreeAssets = assets.filter((asset) => asset.pageNumber === 3);
    const pageThreeStorageChecks = [];
    for (const asset of pageThreeAssets) {
      const { data, error } = await supabaseAdmin.storage.from('document-parser-artifacts').download(asset.storagePath);
      const bytes = data ? Buffer.from(await data.arrayBuffer()) : null;
      pageThreeStorageChecks.push({
        assetId: asset.id, storagePath: asset.storagePath, downloaded: !error && Boolean(bytes),
        byteLength: bytes?.length ?? 0,
        sha256: bytes ? createHash('sha256').update(bytes).digest('hex') : null,
        expectedChecksum: asset.checksum,
        checksumMatches: bytes ? createHash('sha256').update(bytes).digest('hex') === asset.checksum : false,
      });
    }
    const output = {
      documentId, result, document, visualAssets: assets.length,
      chunks: chunks.map(({ content, ...chunk }) => ({ ...chunk, content: content.slice(0, 1200) })),
      blockTypes: blocks.map((item) => ({ type: item.type, count: item._count._all })),
      questionSources: await prisma.questionSource.count({ where: { documentId } }),
      pageThreeAssets: pageThreeAssets.map(({ id, pageNumber, assetType, storagePath, checksum, visualIndex }) => ({
        id, pageNumber, assetType, storagePath, checksum,
        descriptionStatus: visualIndex?.descriptionStatus ?? null,
        description: visualIndex?.description ?? null,
      })),
      pageThreeStorageChecks,
      elapsedMs: Date.now() - startedAt,
    };
    if (auditOnly && document?.tag === 'KNOWLEDGE_BASE' && chunks.some((chunk) => chunk.embeddedAt)) {
      const [{ OpenRouterClient }, { KnowledgeRetrievalService }] = await Promise.all([
        import('../backend/src/worker/client/openrouter.client.ts'),
        import('../backend/src/services/knowledge-retrieval.service.ts'),
      ]);
      const queryText = document.originalName.startsWith('Estequiometria')
        ? 'anotação do professor e figura na página 3 sobre estequiometria'
        : 'resolução e anotação de pH e pOH';
      const [queryEmbedding] = await new OpenRouterClient().createEmbeddings([queryText]);
      const retrieval = await new KnowledgeRetrievalService().search({
        teacherId: document.teacherId, monitorId: document.monitorId,
        subjectId: document.subjectId, topicId: document.topicId ?? undefined,
        documentId, queryText, queryEmbedding, limit: 8,
      });
      output.retrieval = {
        queryText,
        candidateCount: retrieval.candidates.length,
        citations: retrieval.citations,
        contextBlocks: retrieval.contextBlocks.map((block) => ({
          blockType: block.blockType, content: block.content?.slice(0, 900),
          pages: block.pages, visualAssetIds: block.visualAssetIds,
        })),
      };
    }
    const report = JSON.stringify(output, null, 2);
    await mkdir(new URL('./artifacts/', import.meta.url), { recursive: true });
    await writeFile(new URL(`./artifacts/${documentId}.worker-audit.json`, import.meta.url), `${report}\n`, 'utf8');
    console.log(report);
  }
} finally {
  await prisma.$disconnect();
}
