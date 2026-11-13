import assert from 'node:assert/strict';
import test from 'node:test';

test('QUESTIONS chama Docling v2 com flag visual false, persiste/vincula assets e só extrai após embeddings', async (t) => {
  Object.assign(process.env, {
    NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '3000', SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'publishable', SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    DATABASE_URL: 'postgresql://postgres:password@localhost:5432/test', REDIS_URL: 'redis://localhost:6379',
    OPENROUTER_EMBEDDING_MODEL: 'openrouter/test-embedding', OPENROUTER_QUESTION_MODEL: 'openrouter/test-chat',
    ASAAS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'), PAYMENTS_PROVIDER: 'SIMULATED',
    DOCUMENT_TEXT_SOURCE: 'pdfjs', DOCUMENT_VISUAL_ASSETS_ENABLED: 'false', DOCUMENT_INGESTION_V3_ENABLED: 'false',
    DOCUMENT_EXTRACTION_CONTENT_LOG_ENABLED: 'false',
  });
  const steps: string[] = [];
  const operations: string[] = [];
  const parseRuns = new Map<string, any>();
  let v2Calls = 0;
  let persistedAssetCount = 0;
  let linkedChunkIds: string[] = [];
  let persistedFormulaEvidence: unknown;
  let persistedInlineFormulaEvidence: unknown;
  let shouldFailChunkSave = false;
  let partialReason = '';

  await t.mock.module('../../../repositories/document-worker.repository.js', { namedExports: {
    async findDocumentForProcessing() { return { id: 'doc-q', storagePath: 'storage/q.pdf', originalName: 'q.pdf', mimeType: 'application/pdf', sizeBytes: 12, tag: 'QUESTIONS', teacherId: 'teacher-db', monitorId: 'monitor-db', subjectId: 'subject-db', topicId: null, topicLinks: [] }; },
    async markDocumentProcessing() {}, async markDocumentReady() {}, async markDocumentFailed() {}, async markDocumentPartialSuccess(_id: string, reason: string) { partialReason = reason; }, async markDocumentNeedsOcr() {},
    async findReusableDoclingChunks() { return { reusable: false, chunkCount: 0, chunks: [] }; },
    async saveDoclingChunks() { return { savedCount: 1, reused: false, chunkIds: ['chunk-q1'] }; },
    async findDocumentBlocksForChunking() { return []; }, async saveExtractedChunks() { return { savedCount: 0, reused: false, chunkIds: [] }; },
    async findChunkForFlashcardGeneration() { return null; }, async findFlashcardGenerationChunkIds() { return []; },
  } });
  await t.mock.module('../../../repositories/document-processing-job.repository.js', { namedExports: {
    DOCUMENT_PROCESSING_VERSION: 4, async ensureDocumentProcessingJobs() {}, async updateDocumentProcessingStage() {},
    async startDocumentProcessingJob(_id: string, op: string) { operations.push(`start:${op}`); },
    async completeDocumentProcessingJob(_id: string, op: string) { operations.push(`complete:${op}`); },
    async failDocumentProcessingJob() {}, async skipDocumentProcessingJob(_id: string, op: string) { operations.push(`skip:${op}`); },
  } });
  await t.mock.module('../../../lib/supabase.js', { namedExports: { supabaseAdmin: { storage: { from() { return { async download() { return { data: new Blob(['%PDF-1.4 fixture']), error: null }; } }; } } } } });
  await t.mock.module('../../../repositories/document-parser.repository.js', { namedExports: {
    PrismaDocumentParseRunStore: class {
      async findByIdempotencyKey(key: string) { return [...parseRuns.values()].find((run) => run.idempotencyKey === key) ?? null; }
      async save(run: any) { parseRuns.set(run.parseRunId, run); }
      async update(id: string, patch: any) { parseRuns.set(id, { ...parseRuns.get(id), ...patch }); }
    },
    async persistLayoutDocument() {}, async updateDocumentParseRun() {},
  } });
  await t.mock.module('../processing-time-report.service.js', { namedExports: { async appendProcessingTimeReport() {}, async appendProcessingStageReport() {}, formatDuration() { return '0s'; } } });
  await t.mock.module('../chunk.service.js', { namedExports: { ChunkService: class {} } });
  await t.mock.module('../document-text-extraction.service.js', { namedExports: { DocumentTextExtractionService: class {} } });
  await t.mock.module('../document-block-detection.service.js', { namedExports: { DocumentBlockDetectionService: class {} } });
  await t.mock.module('../flashcard/flashcard-generation.service.js', { namedExports: { FlashcardGenerationService: class {} } });
  await t.mock.module('../embedding.service.js', { namedExports: { EmbeddingService: class { async processDocument() { steps.push('embeddings'); return { chunkCount: 1, batchCount: 1 }; } }, logDocumentChunkContent() {} } });
  await t.mock.module('../question-extraction.service.js', { namedExports: { QuestionExtractionService: class { async processDocument() { steps.push('questions'); return { questions: [] }; } } } });
  await t.mock.module('../topic-profile-generation.service.js', { namedExports: { TopicProfileGenerationService: class {} } });

  const { DocumentWorkerService } = await import('../document-worker.service.js');
  const service = new DocumentWorkerService(undefined, undefined, undefined, undefined, undefined, undefined, {
    docChunkerV2Client: { async chunkWithAssets() {
      v2Calls++; steps.push('v2');
      return { docHash: 'a'.repeat(64), engine: 'docling', parserVersion: 'test', tokenizerId: 'test', chunkerVersion: 'hybrid-v2-formula-evidence-geometry-v2', pageCount: 1,
        chunks: [{ index: 0, text: 'Enunciado com gráfico', raw_text: 'Enunciado com gráfico', headings: [], pages: [1], type: 'mixed', tokens: 4,
          provenance: [{ page: 1, item_ref: '#/pictures/0', reading_order: 2, bbox: [1, 2, 30, 40] }],
          formulaEvidence: [{ pageNumber: 1, itemRef: '#/texts/1', bbox: [4, 5, 10, 12], originalText: 'H2O', enrichedText: 'H_2O' }],
          inlineFormulaEvidence: [{ pageNumber: 1, itemRef: 'pypdfium2:page-1:chars-2-4', bbox: [4, 5, 10, 12], baseText: '10', raisedText: '7', normalizedText: '10^{7}', sourceText: '107', evidenceSource: 'PDF_CHARACTER_GEOMETRY', heightRatio: 0.56, raiseRatio: 0.37 }] }],
        assets: [{ assetKey: 'asset-key', assetKind: 'FIGURE', sourceItemRef: '#/pictures/0', readingOrder: 2, pageNumber: 1, bbox: [1, 2, 30, 40], coordOrigin: 'TOPLEFT', caption: null,
          mimeType: 'image/png', width: 10, height: 10, sha256: 'b'.repeat(64), content: Buffer.from('png') }], warnings: [] };
    } },
    documentVisualAssetRepository: { async persistVisualParseRun(input: any) { persistedAssetCount = input.assets.length; steps.push('persist-assets'); return { parseRunId: input.parseRunId, assetIdsByKey: { 'asset-key': 'asset-id' } }; } },
    documentVisualLinkingService: { async linkVisualAssetsToChunks(_parseRunId: string, chunks: any[]) { linkedChunkIds = chunks.map((chunk) => chunk.id); steps.push('link-assets'); return { linked: [{ assetId: 'asset-id', assetKey: 'asset-key', chunkId: 'chunk-q1', method: 'ITEM_REF', confidence: 1, role: 'INLINE' }], ambiguous: [], missing: [], detectedByPage: { 1: 1 }, linkedByPage: { 1: 1 }, ambiguousByPage: {}, missingByPage: {} }; } },
    saveDoclingChunks: async (_id: string, input: any) => {
      persistedFormulaEvidence = input.chunks[0]?.formulaEvidence;
      persistedInlineFormulaEvidence = input.chunks[0]?.inlineFormulaEvidence;
      steps.push('persist-chunks');
      if (shouldFailChunkSave) throw new Error('Substituicao de chunks abortada por fonte de questao vinculada.');
      return { savedCount: 1, reused: false, chunkIds: ['chunk-q1'] };
    },
  });

  await service.process('doc-q', { jobId: 'job-q', attempt: 1 });
  assert.equal(v2Calls, 1, 'QUESTIONS força v2 mesmo com DOCUMENT_VISUAL_ASSETS_ENABLED=false');
  assert.equal(persistedAssetCount, 1);
  assert.deepEqual(persistedFormulaEvidence, [{ pageNumber: 1, itemRef: '#/texts/1', bbox: [4, 5, 10, 12], originalText: 'H2O', enrichedText: 'H_2O' }]);
  assert.deepEqual(persistedInlineFormulaEvidence, [{ pageNumber: 1, itemRef: 'pypdfium2:page-1:chars-2-4', bbox: [4, 5, 10, 12], baseText: '10', raisedText: '7', normalizedText: '10^{7}', sourceText: '107', evidenceSource: 'PDF_CHARACTER_GEOMETRY', heightRatio: 0.56, raiseRatio: 0.37 }]);
  const persistedParseRun = [...parseRuns.values()][0];
  assert.deepEqual(persistedParseRun.metrics, { pageCount: 1, visualAssetPages: [1] });
  assert.deepEqual(linkedChunkIds, ['chunk-q1']);
  assert.deepEqual(steps, ['v2', 'persist-chunks', 'persist-assets', 'link-assets', 'embeddings', 'questions']);
  assert.ok(operations.includes('start:EXTRACT_QUESTIONS_TO_PENDING_REVIEW'));
  assert.ok(!operations.includes('skip:EXTRACT_QUESTIONS_TO_PENDING_REVIEW'));
  assert.match(partialReason, /QUESTIONS_TEXT_COVERAGE_UNVERIFIED/);

  steps.length = 0;
  persistedAssetCount = 0;
  shouldFailChunkSave = true;
  const parseRunCountBeforeAbort = parseRuns.size;
  await assert.rejects(
    service.process('doc-q', { jobId: 'job-q-retry', attempt: 2 }),
    /Substituicao de chunks abortada/,
  );
  assert.deepEqual(steps, ['v2', 'persist-chunks']);
  assert.equal(persistedAssetCount, 0, 'não grava assets nem cria parse run se o guard de substituição dos chunks abortar');
  assert.equal(parseRuns.size, parseRunCountBeforeAbort, 'a falha do guard não deve deixar parse run órfão');
});
