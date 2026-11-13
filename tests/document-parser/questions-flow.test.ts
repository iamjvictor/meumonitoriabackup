import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(process.cwd(), '..');
const backend = join(root, 'backend');
const professorPdfs = join(root, 'tests/document-parser/documentos-professor');
const questionsPdf = join(professorPdfs, 'Simulado Pedro Lucas.pdf');
const scannedKnowledgePdf = join(root, 'tests/document-parser/ocrTeste.pdf');

function configureBackendEnv() {
  Object.assign(process.env, {
    NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '3000',
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-publishable',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
    DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test', REDIS_URL: 'redis://127.0.0.1:6379',
    OPENROUTER_EMBEDDING_MODEL: 'openrouter/test-embedding', OPENROUTER_QUESTION_MODEL: 'openrouter/test-chat',
    ASAAS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'), ASAAS_WEBHOOK_URL: 'https://example.test/webhook',
    PAYMENTS_PROVIDER: 'SIMULATED', DOCUMENT_TEXT_SOURCE: 'pdfjs', DOCUMENT_INGESTION_V3_ENABLED: 'true',
    DOCUMENT_PARSER_BASE_URL: 'http://127.0.0.1:8080',
  });
}

test('QUESTIONS offline: PDF nativo segue chunks, embeddings e extração sem banco nem OpenRouter', async (t) => {
  configureBackendEnv();
  const steps: string[] = [];
  let inputToText: { text: string; pages: Array<{ num: number; text: string }> } | undefined;
  let questionCalls = 0;
  let parserCalls = 0;
  let currentSource: 'text' | 'ocr' = 'text';
  let fixture = Buffer.from('%PDF-1.4\nsynthetic question document');
  const ocrText = 'OCR_QUESTION_01: enunciado digitalizado e reconhecido.\nA) uma\nB) duas\nC) três';

  await t.mock.module('../../backend/src/lib/prisma.js', { namedExports: {
    prisma: {
      documentParseRun: { async findFirst() { return currentSource === 'ocr' ? { id: 'parse-test' } : null; } },
      documentLayoutElement: { async findMany() { return currentSource === 'ocr' ? [{
        pageNumber: 1, category: 'TEXT', readingOrder: 0, normalizedText: ocrText,
        rawText: null, latex: null, html: null,
      }] : []; } },
    },
  } });
  await t.mock.module('../../backend/src/repositories/document-worker.repository.js', { namedExports: {
    async findDocumentForProcessing() {
      return { id: 'question-flow', storagePath: 'question-flow.pdf', originalName: 'question-flow.pdf',
        mimeType: 'application/pdf', sizeBytes: fixture.length, tag: 'QUESTIONS', monitorId: 'monitor-test',
        subjectId: 'subject-test', topicId: 'topic-test', topicLinks: [{ topicId: 'topic-test' }] };
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
    steps.push('download'); return { data: new Blob([fixture]), error: null };
  } }; } } } } });
  await t.mock.module('../../backend/src/worker/services/pdf-layout-extraction.service.js', { namedExports: {
    async extractPdfPagesWithLayout() {
      steps.push('pdfjs');
      return [{ num: 1, text: currentSource === 'ocr' ? 'x' : 'Questão 01 - Enunciado.\nA) uma\nB) duas\nC) três\nD) quatro\nE) cinco', hasImages: currentSource === 'ocr', imageCount: currentSource === 'ocr' ? 1 : 0 }];
    },
  } });
  await t.mock.module('../../backend/src/worker/services/processing-time-report.service.js', { namedExports: {
    async appendProcessingTimeReport() {}, async appendProcessingStageReport() {}, formatDuration() { return '0s'; },
  } });
  await t.mock.module('../../backend/src/worker/services/chunk.service.js', { namedExports: { ChunkService: class {
    async processDocument() { steps.push('chunks'); return { chunkCount: 1 }; }
  } } });
  await t.mock.module('../../backend/src/worker/services/document-text-extraction.service.js', { namedExports: { DocumentTextExtractionService: class {
    async process(_id: string, input: { text: string; pages: Array<{ num: number; text: string }> }) {
      inputToText = input; return { quality: 'GOOD', documentTextId: 'text-test' };
    }
  } } });
  await t.mock.module('../../backend/src/worker/services/document-block-detection.service.js', { namedExports: { DocumentBlockDetectionService: class {
    async process() { steps.push('blocks'); return { blockCount: 1, typeCounts: { QUESTION: 1 } }; }
  } } });
  await t.mock.module('../../backend/src/worker/services/embedding.service.js', { namedExports: { EmbeddingService: class {
    async processDocument() { steps.push('embeddings'); return { chunkCount: 1, batchCount: 1 }; }
  }, logDocumentChunkContent() {} } });
  await t.mock.module('../../backend/src/worker/services/question-extraction.service.js', { namedExports: { QuestionExtractionService: class {
    async processDocument() { steps.push('questions'); questionCalls += 1; return { questionCount: 1 }; }
  } } });
  await t.mock.module('../../backend/src/worker/services/topic-profile-generation.service.js', { namedExports: { TopicProfileGenerationService: class {
    async processTopic() {} async processSubject() {}
  } } });
  await t.mock.module('../../backend/src/worker/services/flashcard/flashcard-generation.service.js', { namedExports: { FlashcardGenerationService: class {
    async processDocument() { return { status: 'READY' }; }
  } } });

  const { DocumentWorkerService } = await import('../../backend/src/worker/services/document-worker.service.js');
  const worker = new DocumentWorkerService(undefined, undefined, undefined, undefined, undefined, undefined, {
    documentIngestionV3Service: { async processDocument(input: { fileBytes: Uint8Array }) {
      assert.equal(Buffer.from(input.fileBytes).subarray(0, 5).toString(), '%PDF-');
      steps.push('docling'); parserCalls += 1;
      return { parseRunId: 'parse-test', status: 'COMPLETED', layoutPersisted: true };
    } } as never,
  });

  for (const source of ['text', 'ocr'] as const) {
    currentSource = source;
    steps.length = 0;
    await worker.process('question-flow');
    assert.equal(parserCalls, source === 'text' ? 1 : 2, 'envia o PDF ao serviço Docling configurado');
    assert.deepEqual(steps, ['download', 'docling', 'pdfjs', 'blocks', 'chunks', 'embeddings', 'questions']);
    assert.equal(questionCalls, source === 'text' ? 1 : 2, 'tag QUESTIONS chama o extrator depois dos embeddings');
    if (source === 'text') assert.match(inputToText!.text, /Questão 01/);
    else assert.match(inputToText!.text, /OCR_QUESTION_01/);
  }
});

test('QUESTIONS embeddings: serviço real envia textos ao client OpenRouter e persiste os vetores via repositório dublê', async (t) => {
  configureBackendEnv();
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  const chunks = [
    { id: 'chunk-1', chunkIndex: 0, content: 'Texto original 1', embeddingContent: 'Texto para embedding 1', blockId: 'block-1', tokenCount: 3 },
    { id: 'chunk-2', chunkIndex: 1, content: 'Texto original 2', embeddingContent: null, blockId: 'block-1', tokenCount: 3 },
  ];
  const repositoryCalls: Array<{ operation: string; value?: unknown }> = [];
  const persistedRows: Array<{ id: string; embedding: number[]; embeddingModel: string; embeddingVersion: string }> = [];
  await t.mock.module('../../backend/src/repositories/document-worker.repository.js', { namedExports: {
    async findDocumentBlocksForChunking() { return []; }, async saveExtractedChunks() { return { savedCount: 0 }; },
    async findPendingChunksForEmbedding(documentId: string) {
      repositoryCalls.push({ operation: 'find', value: documentId });
      return chunks;
    },
    async markChunksEmbeddingProcessing(ids: string[]) { repositoryCalls.push({ operation: 'processing', value: ids }); },
    async saveChunkEmbeddings(rows: typeof persistedRows) {
      repositoryCalls.push({ operation: 'save', value: rows.map((row) => row.id) });
      persistedRows.push(...rows);
    },
    async markChunksEmbeddingPending(ids: string[]) { repositoryCalls.push({ operation: 'pending', value: ids }); },
  } });

  const sentTexts: string[][] = [];
  const vectors = [[0.125, 0.25, 0.5], [0.75, 0.875, 1]];
  const client = { async createEmbeddings(texts: string[]) { sentTexts.push(texts); return vectors; } };
  const { EmbeddingService } = await import('../../backend/src/worker/services/embedding.service.js');
  const result = await new EmbeddingService(client as never).processDocument('doc-questions');

  assert.deepEqual(sentTexts, [['Texto para embedding 1', 'Texto original 2']], 'client recebe embeddingContent quando existe e content como fallback');
  assert.deepEqual(repositoryCalls, [
    { operation: 'find', value: 'doc-questions' },
    { operation: 'processing', value: ['chunk-1', 'chunk-2'] },
    { operation: 'save', value: ['chunk-1', 'chunk-2'] },
  ]);
  assert.deepEqual(persistedRows.map(({ id, embedding }) => ({ id, embedding })), [
    { id: 'chunk-1', embedding: vectors[0] },
    { id: 'chunk-2', embedding: vectors[1] },
  ], 'vetores retornados pelo client são associados aos chunks correspondentes');
  assert.ok(persistedRows.every((row) => row.embeddingModel === 'openrouter/test-embedding'));
  assert.ok(persistedRows.every((row) => typeof row.embeddingVersion === 'string' && row.embeddingVersion.length > 0));
  assert.deepEqual(result, { chunkCount: 2, batchCount: 1 });
});

test('QUESTIONS real: parser Docling opcional recebe o PDF e devolve layout', async (t) => {
  const parserUrl = process.env.DOC_CHUNKER_URL;
  if (!parserUrl) { t.skip('Defina DOC_CHUNKER_URL para enviar o PDF real ao parser local.'); return; }
  try { await access(questionsPdf); } catch { t.skip('PDF privado Simulado Pedro Lucas.pdf ausente.'); return; }

  configureBackendEnv();
  const { MineruParserAdapter } = await import('../../backend/src/worker/services/document-parser/mineru-parser.adapter.js');
  const bytes = new Uint8Array(await readFile(questionsPdf));
  const parser = new MineruParserAdapter({ baseUrl: parserUrl, requestTimeoutMs: 600_000 });
  const submission = await parser.parse({
    documentId: 'questions-flow-local', fileUrl: '', fileBytes: bytes, fileName: 'Simulado Pedro Lucas.pdf',
    originalName: 'Simulado Pedro Lucas.pdf', mimeType: 'application/pdf', contentHash: 'questions-flow-local-hash',
    parser: 'DOCLING', backend: 'pipeline', configurationHash: 'questions-flow-test-v1',
  });
  const layout = submission.result ?? await parser.getResult(submission.parseRunId, submission.resultUrl);
  const textualElements = layout.pages.flatMap((page) => page.elements)
    .map((element) => element.normalizedText ?? element.rawText ?? '').filter(Boolean);
  assert.ok(layout.pages.length > 0, 'Docling deve devolver páginas');
  assert.ok(textualElements.length > 0, 'Docling deve devolver elementos textuais');
  console.log(JSON.stringify({ parser: 'Docling', pages: layout.pages.length, elements: textualElements.length,
    textChars: textualElements.join('\n').length, warnings: layout.warnings.length }));
  // This transport smoke does not count extracted/persisted questions or call paid embedding APIs.
});

test('QUESTIONS real via backend: audit PDF.js produz dez questões, chunks e candidatas (offline)', async (t) => {
  try { await access(questionsPdf); } catch { t.skip('PDF privado Simulado Pedro Lucas.pdf ausente.'); return; }
  const outputDir = await mkdtemp(join(tmpdir(), 'questions-flow-audit-'));
  const reportPath = join(outputDir, 'audit.json');
  try {
    const run = spawnSync(process.execPath, ['--import', 'tsx', 'src/scripts/audit-question-chunks.ts', questionsPdf,
      reportPath, '--source=pdfjs', '--expect-numbers=01,02,03,04,05,06,07,08,09,10'],
    { cwd: backend, encoding: 'utf8', timeout: 120_000 });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const report = JSON.parse(await readFile(reportPath, 'utf8')) as {
      textSource: string; summary: { questionBlocks: number; questionBlocksWithChunks: number; deterministicCandidates: number; missingCandidateNumbers: string[] };
    };
    assert.equal(report.textSource, 'pdfjs');
    assert.equal(report.summary.questionBlocks, 10);
    assert.equal(report.summary.questionBlocksWithChunks, 10);
    assert.equal(report.summary.deterministicCandidates, 10);
    assert.deepEqual(report.summary.missingCandidateNumbers, []);
  } finally { await rm(outputDir, { recursive: true, force: true }); }
});

test('PDF.js identifica camada textual nativa no Simulado e baixa camada nativa no corpus escaneado', async (t) => {
  try { await Promise.all([access(questionsPdf), access(scannedKnowledgePdf)]); }
  catch { t.skip('Fixtures locais de professor e OCR ausentes.'); return; }
  const { extractPdfPagesWithLayout } = await import('../../backend/src/worker/services/pdf-layout-extraction.service.js');
  const questionsPages = await extractPdfPagesWithLayout(new Uint8Array(await readFile(questionsPdf)));
  const scannedPages = await extractPdfPagesWithLayout(new Uint8Array(await readFile(scannedKnowledgePdf)));
  const questionNativeChars = questionsPages.map((page) => page.text.trim().length);
  const scannedNativeChars = scannedPages.map((page) => page.text.trim().length);
  assert.ok(questionNativeChars.every((chars) => chars >= 80), `Simulado deveria ser TEXT, chars/página=${questionNativeChars}`);
  assert.ok(scannedNativeChars.some((chars) => chars < 80), `Corpus escaneado deveria acionar OCR, chars/página=${scannedNativeChars}`);
});
