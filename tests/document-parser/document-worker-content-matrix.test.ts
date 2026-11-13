import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const fixtures = join(process.cwd(), '../tests/document-parser/documentos-professor');
const pdfText = 'PDFJS_TEXT: texto nativo de teste com informação única.';
const ocrElements = [
  { pageNumber: 1, category: 'TEXT', readingOrder: 0, normalizedText: 'OCR_PAGE_1: conteúdo que falta no texto nativo.', rawText: null, latex: null, html: null },
  { pageNumber: 2, category: 'TEXT', readingOrder: 1, normalizedText: null, rawText: 'OCR_PAGE_2: conteúdo reconhecido integralmente.', latex: null, html: null },
];

const scenarios = [
  { name: 'OCR QUESTIONS (layout OCR sintético)', tag: 'QUESTIONS' as const, source: 'ocr' as const, fixture: null },
  { name: 'OCR KNOWLEDGE', tag: 'KNOWLEDGE_BASE' as const, source: 'ocr' as const, fixture: null },
  { name: 'PDF textual KNOWLEDGE', tag: 'KNOWLEDGE_BASE' as const, source: 'pdf-text' as const, fixture: null },
  { name: 'PDF textual QUESTIONS', tag: 'QUESTIONS' as const, source: 'pdf-text' as const, fixture: null },
];

test('worker: matriz OCR/PDF textual para QUESTÕES e KNOWLEDGE_BASE', async (t) => {
  Object.assign(process.env, {
    NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '3000',
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-publishable',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
    DATABASE_URL: 'postgresql://postgres:password@localhost:5432/test', REDIS_URL: 'redis://localhost:6379',
    OPENROUTER_EMBEDDING_MODEL: 'openrouter/test-embedding', OPENROUTER_QUESTION_MODEL: 'openrouter/test-chat',
    ASAAS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'), ASAAS_WEBHOOK_URL: 'https://example.test/webhook',
    PAYMENTS_PROVIDER: 'SIMULATED', DOCUMENT_TEXT_SOURCE: 'pdfjs', DOCUMENT_INGESTION_V3_ENABLED: 'true',
    DOCUMENT_PARSER_BASE_URL: 'http://127.0.0.1:8080',
  });

  let current: typeof scenarios[number] = scenarios[0]!;
  let fixtureBytes = Buffer.from('%PDF-1.4\n% synthetic scan fixture for layout OCR tests\n');
  const extracted: Array<{ text: string; pages: Array<{ num: number; text: string }> }> = [];
  let questionExtractionCalls = 0;
  let parserCalls = 0;

  await t.mock.module('../../backend/src/lib/prisma.js', { namedExports: {
    prisma: {
      documentParseRun: { async findFirst() { return current.source === 'ocr' ? { id: 'parse-fixture' } : null; } },
      documentLayoutElement: { async findMany() { return ocrElements; } },
    },
  } });
  await t.mock.module('../../backend/src/repositories/document-worker.repository.js', { namedExports: {
    async findDocumentForProcessing() {
      return {
        id: `fixture-${current.tag}-${current.source}`, storagePath: current.fixture ?? 'synthetic-ocr.pdf',
        originalName: current.fixture ?? 'ocr-questions-synthetic.pdf', mimeType: 'application/pdf', sizeBytes: fixtureBytes.byteLength,
        tag: current.tag, monitorId: 'monitor-fixture', subjectId: 'subject-fixture', topicId: null, topicLinks: [],
      };
    },
    async markDocumentProcessing() {}, async markDocumentPartialSuccess() {}, async markDocumentReady() {},
    async markDocumentFailed() {}, async markDocumentNeedsOcr() {},
    async saveDoclingChunks() { return { savedCount: 0, reused: false, chunkIds: [] }; },
    async findReusableDoclingChunks() { return { reusable: false, chunkCount: 0, chunks: [] }; },
    async findChunkForFlashcardGeneration() { return null; }, async findFlashcardGenerationChunkIds() { return []; },
  } });
  await t.mock.module('../../backend/src/repositories/document-processing-job.repository.js', { namedExports: {
    DOCUMENT_PROCESSING_VERSION: 4, async ensureDocumentProcessingJobs() {}, async updateDocumentProcessingStage() {},
    async startDocumentProcessingJob() {}, async completeDocumentProcessingJob() {}, async failDocumentProcessingJob() {},
    async skipDocumentProcessingJob() {},
  } });
  await t.mock.module('../../backend/src/lib/supabase.js', { namedExports: { supabaseAdmin: { storage: { from() { return { async download() {
    return { data: new Blob([fixtureBytes]), error: null };
  } }; } } } } });
  await t.mock.module('../../backend/src/worker/services/pdf-layout-extraction.service.js', { namedExports: {
    async extractPdfPagesWithLayout() { return [{ num: 1, text: pdfText, hasImages: false, imageCount: 0 }]; },
  } });
  await t.mock.module('../../backend/src/worker/services/processing-time-report.service.js', { namedExports: {
    async appendProcessingTimeReport() {}, async appendProcessingStageReport() {}, formatDuration() { return '0s'; },
  } });
  await t.mock.module('../../backend/src/worker/services/chunk.service.js', { namedExports: { ChunkService: class { async processDocument() { return { chunkCount: 1 }; } } } });
  await t.mock.module('../../backend/src/worker/services/document-text-extraction.service.js', { namedExports: { DocumentTextExtractionService: class {
    async process(_documentId: string, input: { text: string; pages: Array<{ num: number; text: string }> }) {
      extracted.push(input);
      return { quality: 'GOOD', documentTextId: 'text-fixture' };
    }
  } } });
  await t.mock.module('../../backend/src/worker/services/document-block-detection.service.js', { namedExports: { DocumentBlockDetectionService: class { async process() { return { blockCount: 1, typeCounts: { THEORY: 1 } }; } } } });
  await t.mock.module('../../backend/src/worker/services/embedding.service.js', { namedExports: { EmbeddingService: class { async processDocument() { return { chunkCount: 1, batchCount: 1 }; } }, logDocumentChunkContent() {} } });
  await t.mock.module('../../backend/src/worker/services/question-extraction.service.js', { namedExports: { QuestionExtractionService: class { async processDocument() { questionExtractionCalls += 1; return { questionCount: 2 }; } } } });
  await t.mock.module('../../backend/src/worker/services/topic-profile-generation.service.js', { namedExports: { TopicProfileGenerationService: class { async processTopic() {} async processSubject() {} } } });
  await t.mock.module('../../backend/src/worker/services/flashcard/flashcard-generation.service.js', { namedExports: { FlashcardGenerationService: class { async processDocument() { return { status: 'READY' }; } } } });

  const { DocumentWorkerService } = await import('../../backend/src/worker/services/document-worker.service.js');
  const service = new DocumentWorkerService(undefined, undefined, undefined, undefined, undefined, undefined, {
    documentIngestionV3Service: { async processDocument() { parserCalls += 1; return { parseRunId: 'parse-fixture', status: 'COMPLETED', layoutPersisted: true }; } } as never,
  });

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      current = scenario;
      fixtureBytes = Buffer.from('%PDF-1.4\n% synthetic worker fixture; parser/PDF.js are mocked in this matrix\n');
      assert.equal(fixtureBytes.subarray(0, 5).toString('ascii'), '%PDF-');
      const start = extracted.length;
      await service.process(`fixture-${scenario.tag}-${scenario.source}`);
      assert.equal(parserCalls, scenarios.indexOf(scenario) + 1);
      assert.equal(extracted.length, start + 1);
      const actual = extracted.at(-1)!;
      if (scenario.source === 'ocr') {
        assert.match(actual.text, /OCR_PAGE_1/);
        assert.match(actual.text, /OCR_PAGE_2/);
        assert.doesNotMatch(actual.text, /PDFJS_TEXT/);
        assert.deepEqual(actual.pages.map((page) => page.num), [1, 2]);
      } else {
        assert.equal(actual.text, pdfText);
        assert.equal(actual.pages[0]?.num, 1);
      }
      assert.equal(questionExtractionCalls, scenarios.slice(0, scenarios.indexOf(scenario) + 1).filter((item) => item.tag === 'QUESTIONS').length);
    });
  }
});

test('PDFs locais do professor: classificação e texto nativo via PDF.js (opcional)', async (t) => {
  const files = ['pH e pOH.pdf', 'Simulado Pedro Lucas.pdf'];
  try {
    await Promise.all(files.map((filename) => access(join(fixtures, filename))));
  } catch {
    t.skip('PDFs privados ausentes; coloque-os em tests/document-parser/documentos-professor para habilitar esta verificação local.');
    return;
  }
  const { extractPdfPagesWithLayout } = await import('../../backend/src/worker/services/pdf-layout-extraction.service.js');
  for (const [filename, expectedPages, minimumChars] of [
    ['pH e pOH.pdf', 4, 50], ['Simulado Pedro Lucas.pdf', 5, 1000],
  ] as const) {
    const bytes = await readFile(join(fixtures, filename));
    const pages = await extractPdfPagesWithLayout(new Uint8Array(bytes));
    const text = pages.map((page) => page.text).join('\n');
    assert.equal(pages.length, expectedPages, filename);
    assert.ok(text.length >= minimumChars, `${filename}: expected at least ${minimumChars} native text chars, got ${text.length}`);
    if (filename === 'pH e pOH.pdf') assert.ok(text.length < 1000, 'pH PDF should remain classified as scanned/low native text');
    if (filename === 'Simulado Pedro Lucas.pdf') {
      const questionMarkers = [...text.matchAll(/quest[aã]o\s*0?\d+/gi)].map((match) => match[0]);
      assert.equal(questionMarkers.length, 10, 'the real PDF has ten textual question markers');
      // Marker count verifies fixture text only; it is not a count of extracted or persisted questions.
    }
  }
});
