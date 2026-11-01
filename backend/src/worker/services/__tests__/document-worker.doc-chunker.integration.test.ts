import assert from 'node:assert/strict';
import test from 'node:test';

function configureDoclingWorkerEnv() {
  Object.assign(process.env, {
    NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '3000', SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'publishable', SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    DATABASE_URL: 'postgresql://postgres:password@localhost:5432/test', REDIS_URL: 'redis://localhost:6379',
    OPENROUTER_EMBEDDING_MODEL: 'openrouter/test-embedding', OPENROUTER_QUESTION_MODEL: 'openrouter/test-chat',
    ASAAS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'), PAYMENTS_PROVIDER: 'SIMULATED',
    DOCUMENT_TEXT_SOURCE: 'docling', DOCUMENT_INGESTION_V3_ENABLED: 'false',
  });
}

test('routes only KNOWLEDGE_BASE through Doc-chunker and embeddings', async (t) => {
  configureDoclingWorkerEnv();
  let chunkerCalls = 0;
  let saveCalls = 0;
  let embeddingCalls = 0;
  let pdfJsCalls = 0;
  const operations: string[] = [];
  await t.mock.module('../../../repositories/document-worker.repository.js', { namedExports: {
    async findDocumentForProcessing() { return { id: 'doc-1', storagePath: 'storage/doc.pdf', originalName: 'aula.pdf', mimeType: 'application/pdf', sizeBytes: 12, tag: 'KNOWLEDGE_BASE', teacherId: 'teacher-db', monitorId: 'monitor-db', subjectId: 'subject-db', topicId: null, topicLinks: [] }; },
    async markDocumentProcessing() {}, async markDocumentReady() {}, async markDocumentFailed() {}, async markDocumentPartialSuccess() {}, async markDocumentNeedsOcr() {},
    async findReusableDoclingChunks() { return { reusable: false, chunkCount: 0, chunks: [] }; },
    async saveDoclingChunks(_id: string, input: any) { saveCalls++; assert.equal(input.chunks[0].rawText, 'texto'); return { savedCount: 1, reused: false, chunkIds: ['chunk-1'] }; },
    async findChunkForFlashcardGeneration() { return null; }, async findFlashcardGenerationChunkIds() { return []; },
  } });
  await t.mock.module('../../../repositories/document-processing-job.repository.js', { namedExports: {
    DOCUMENT_PROCESSING_VERSION: 4, async ensureDocumentProcessingJobs() {}, async updateDocumentProcessingStage() {},
    async startDocumentProcessingJob(_id: string, op: string) { operations.push(`start:${op}`); },
    async completeDocumentProcessingJob(_id: string, op: string) { operations.push(`complete:${op}`); },
    async failDocumentProcessingJob() {}, async skipDocumentProcessingJob(_id: string, op: string) { operations.push(`skip:${op}`); },
  } });
  await t.mock.module('../../../lib/supabase.js', { namedExports: { supabaseAdmin: { storage: { from() { return { async download() { return { data: new Blob(['%PDF-1.4 fixture']), error: null }; } }; } } } } });
  await t.mock.module('../processing-time-report.service.js', { namedExports: { async appendProcessingTimeReport() {}, async appendProcessingStageReport() {}, formatDuration() { return '0s'; } } });
  await t.mock.module('../chunk.service.js', { namedExports: { ChunkService: class { async processDocument() { pdfJsCalls++; return { chunkCount: 1 }; } } } });
  await t.mock.module('../document-text-extraction.service.js', { namedExports: { DocumentTextExtractionService: class {} } });
  await t.mock.module('../document-block-detection.service.js', { namedExports: { DocumentBlockDetectionService: class {} } });
  await t.mock.module('../embedding.service.js', { namedExports: { EmbeddingService: class { async processDocument() { embeddingCalls++; return { chunkCount: 1, batchCount: 1 }; } } } });
  await t.mock.module('../flashcard/flashcard-generation.service.js', { namedExports: { FlashcardGenerationService: class {} } });
  await t.mock.module('../question-extraction.service.js', { namedExports: { QuestionExtractionService: class { async processDocument() { throw new Error('must not run'); } } } });
  await t.mock.module('../topic-profile-generation.service.js', { namedExports: { TopicProfileGenerationService: class {} } });
  await t.mock.module('../pdf-layout-extraction.service.js', { namedExports: { async extractPdfPagesWithLayout() { pdfJsCalls++; throw new Error('PDF.js should not run'); } } });
  const { DocumentWorkerService } = await import('../document-worker.service.js');
  const service = new DocumentWorkerService(undefined, undefined, undefined, undefined, undefined, undefined, {
    docChunkerClient: { async chunk(input: any) { chunkerCalls++; return { schema_version: 'doc-chunker/v1', request_id: input.requestId, status: 'completed', doc_hash: input.expectedSha256, engine: 'docling', parser_version: '2.122.0', tokenizer_id: 'qwen', chunker_version: 'hybrid-v1', page_count: 1, chunks: [{ index: 0, text: 'contexto', raw_text: 'texto', headings: [], pages: [1], type: 'text', tokens: 1, provenance: [] }] }; } },
    saveDoclingChunks: async (_id: string, input: any) => { saveCalls++; assert.equal(input.chunks[0].rawText, 'texto'); return { savedCount: 1, reused: false, chunkIds: ['chunk-1'] }; },
  });
  await service.process('doc-1', { jobId: 'job-1', attempt: 1 });
  assert.equal(chunkerCalls, 1);
  assert.equal(saveCalls, 1);
  assert.equal(embeddingCalls, 1);
  assert.equal(pdfJsCalls, 0);
  assert.ok(operations.includes('skip:EXTRACT_QUESTIONS_TO_PENDING_REVIEW'));
});

