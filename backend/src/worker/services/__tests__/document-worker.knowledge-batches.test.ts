import assert from 'node:assert/strict';
import test from 'node:test';

function setBackendEnv() {
  process.env.NODE_ENV = 'test';
  process.env.HOST = '127.0.0.1';
  process.env.PORT = '3000';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/test';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.OPENROUTER_EMBEDDING_MODEL = 'openrouter/test-embedding';
  process.env.OPENROUTER_QUESTION_MODEL = 'openrouter/test-chat';
  process.env.DOCUMENT_INGESTION_V3_ENABLED = 'false';
  process.env.KNOWLEDGE_BATCH_PROCESSING_ENABLED = 'true';
  process.env.KNOWLEDGE_BATCH_SIZE = '10';
}

test('KNOWLEDGE_BASE usa batches e só materializa após READY_TO_PUBLISH', async (t) => {
  setBackendEnv();
  const jobs: Array<{ action: string; operation: string; summary?: unknown }> = [];
  const order: string[] = [];
  let batchInput: Record<string, unknown> | undefined;

  await t.mock.module('../../../lib/prisma.js', {
    namedExports: { prisma: { monitorDocument: { async findFirst() { return { teacherId: 'teacher-1' }; } } } },
  });
  await t.mock.module('../../../repositories/document-worker.repository.js', {
    namedExports: {
      async findDocumentForProcessing() {
        return {
          id: 'document-1', storagePath: 'documents/document-1.pdf', originalName: 'book.pdf',
          mimeType: 'application/pdf', sizeBytes: 42, tag: 'KNOWLEDGE_BASE', monitorId: 'monitor-1',
          subjectId: 'subject-1', topicId: null, topicLinks: [],
        };
      },
      async markDocumentProcessing() { order.push('document-processing'); },
      async markDocumentReady() { order.push('document-ready'); },
      async markDocumentFailed() { order.push('document-failed'); },
      async markDocumentPartialSuccess() {},
      async markDocumentNeedsOcr() {},
      async saveDoclingChunks() { throw new Error('O caminho legado não deve executar com a flag ligada.'); },
      async findReusableDoclingChunks() { throw new Error('O cache legado não deve executar com a flag ligada.'); },
      async findChunkForFlashcardGeneration() { return null; },
      async findFlashcardGenerationChunkIds() { return []; },
    },
  });
  await t.mock.module('../../../repositories/document-processing-job.repository.js', {
    namedExports: {
      DOCUMENT_PROCESSING_VERSION: 4,
      async ensureDocumentProcessingJobs() {},
      async updateDocumentProcessingStage() {},
      async startDocumentProcessingJob(_documentId: string, operation: string) { jobs.push({ action: 'start', operation }); },
      async completeDocumentProcessingJob(_documentId: string, operation: string, summary?: unknown) { jobs.push({ action: 'complete', operation, summary }); },
      async failDocumentProcessingJob() {},
      async skipDocumentProcessingJob(_documentId: string, operation: string, summary?: unknown) { jobs.push({ action: 'skip', operation, summary }); },
    },
  });
  await t.mock.module('../../../lib/supabase.js', {
    namedExports: { supabaseAdmin: { storage: { from() { return { async download() { return { data: new Blob(['pdf']), error: null }; } }; } } } },
  });
  await t.mock.module('../processing-time-report.service.js', {
    namedExports: { async appendProcessingTimeReport() {}, async appendProcessingStageReport() {}, formatDuration() { return '0s'; } },
  });
  await t.mock.module('../chunk.service.js', { namedExports: { ChunkService: class {} } });
  await t.mock.module('../document-text-extraction.service.js', { namedExports: { DocumentTextExtractionService: class {} } });
  await t.mock.module('../document-block-detection.service.js', { namedExports: { DocumentBlockDetectionService: class {} } });
  await t.mock.module('../embedding.service.js', { namedExports: { EmbeddingService: class {}, logDocumentChunkContent() {} } });
  await t.mock.module('../question-extraction.service.js', { namedExports: { QuestionExtractionService: class {} } });
  await t.mock.module('../topic-profile-generation.service.js', { namedExports: { TopicProfileGenerationService: class {} } });
  await t.mock.module('../knowledge-batch-processing.service.js', { namedExports: { createKnowledgeBatchProcessingService() { throw new Error('O serviço injetado deve ser usado.'); } } });
  await t.mock.module('../knowledge-generation-materializer.service.js', { namedExports: { KnowledgeGenerationMaterializerService: class {} } });

  const { DocumentWorkerService, buildKnowledgeProfile, hashKnowledgeProfile } = await import('../document-worker.service.js');
  const profile = buildKnowledgeProfile(10);
  assert.deepEqual(profile, {
    version: 'knowledge-v1', do_ocr: true, do_formula_enrichment: true, do_table_structure: true,
    ocr_scale: 3, images_scale: 1, num_threads: 4, batch_pages: 10,
    document_timeout_seconds: 540, batch_timeout_seconds: 600,
  });
  assert.equal(hashKnowledgeProfile(profile), '7aeb530ea42649d75fed380eea701fb7b5a7102cfd2e925faf02f9355fcd966d');

  const worker = new DocumentWorkerService(
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    {
      countPdfPages: async () => 354,
      knowledgeBatchProcessingService: {
        async process(input: Record<string, unknown>) {
          order.push('batches-ready');
          batchInput = input;
          return { runId: 'run-1', status: 'READY_TO_PUBLISH', completedPages: 354, totalPages: 354, completedBatches: 36, totalBatches: 36, retryable: false };
        },
      },
      knowledgeGenerationMaterializer: {
        async materializeAndPublish(input: Record<string, unknown>) {
          order.push('materialize');
          assert.equal(input.runId, 'run-1');
          return { generationId: 'generation-1', status: 'COMPLETED', pageCount: 354, chunkCount: 42, assetCount: 5, coveredPages: 354 };
        },
      },
    } as never,
  );

  await worker.process('document-1', { jobId: 'reprocess-document-1-123', attempt: 1 });

  assert.equal(batchInput?.parserVersion, '2.122.0');
  assert.equal(batchInput?.explicitRestartKey, 'reprocess-document-1-123');
  assert.equal(batchInput?.configurationHash, '7aeb530ea42649d75fed380eea701fb7b5a7102cfd2e925faf02f9355fcd966d');
  assert.deepEqual(order, ['document-processing', 'batches-ready', 'materialize', 'document-ready']);
  assert.equal(jobs.filter(({ operation }) => operation === 'CREATE_RETRIEVAL_CHUNKS').at(-1)?.action, 'complete');
  assert.equal(jobs.find(({ operation }) => operation === 'GENERATE_CHUNK_EMBEDDINGS')?.action, 'complete');
  assert.ok(jobs.some(({ operation, action }) => operation === 'EXTRACT_TEXT' && action === 'skip'));
});
