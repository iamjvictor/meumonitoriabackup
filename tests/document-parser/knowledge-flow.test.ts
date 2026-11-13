import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';

const nativeText = 'NATIVE_PAGE_1: conteúdo textual suficientemente longo para ser aproveitado na base de conhecimento.';
const ocrPage1 = 'OCR_PAGE_1: texto reconhecido a partir de um documento digitalizado.';
const ocrPage2 = 'OCR_PAGE_2: conteúdo completo persistido pelo Docling.';

test('knowledge flow: Docling classifica conteúdo digitalizado e nativo antes de extração/chunks/embeddings', async (t) => {
  Object.assign(process.env, {
    NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '3000',
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-publishable',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
    DATABASE_URL: 'postgresql://postgres:password@localhost:5432/test', REDIS_URL: 'redis://localhost:6379',
    OPENROUTER_EMBEDDING_MODEL: 'openrouter/test-embedding', OPENROUTER_QUESTION_MODEL: 'openrouter/test-chat',
    ASAAS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'), ASAAS_WEBHOOK_URL: 'https://example.test/webhook',
    PAYMENTS_PROVIDER: 'SIMULATED', DOCUMENT_TEXT_SOURCE: 'pdfjs', DOCUMENT_INGESTION_V3_ENABLED: 'true',
    DOCUMENT_PARSER_BASE_URL: 'http://docling.test',
  });

  const pdfBytes = Buffer.from('%PDF-1.4\n% scanned knowledge fixture\n');
  const operations: string[] = [];
  const parseInput: Array<{ fileBytes: Uint8Array; originalName: string }> = [];
  const savedText: Array<{ rawContent: string; pageCount: number; quality: string; pages: Array<{ pageNumber: number; rawContent: string }> }> = [];
  const savedChunks: string[][] = [];
  const embeddedDocuments: string[] = [];
  let source: 'ocr' | 'native' = 'ocr';
  const processingDocument = { id: 'knowledge-ocr', storagePath: 'teacher/monitor/subject/scanned.pdf',
    originalName: 'scanned.pdf', mimeType: 'application/pdf', sizeBytes: pdfBytes.length,
    tag: 'KNOWLEDGE_BASE', monitorId: 'monitor-1', subjectId: 'subject-1', topicId: null, topicLinks: [] };

  await t.mock.module('../../backend/src/lib/prisma.js', { namedExports: {
    prisma: {
      documentParseRun: { async findFirst() { return source === 'ocr' ? { id: 'parse-ocr-1' } : null; } },
      documentLayoutElement: { async findMany() { return source === 'ocr' ? [
        { pageNumber: 1, readingOrder: 0, normalizedText: ocrPage1, rawText: null, latex: null, html: null },
        { pageNumber: 2, readingOrder: 1, normalizedText: null, rawText: ocrPage2, latex: null, html: null },
      ] : []; } },
    },
  } });
  await t.mock.module('../../backend/src/repositories/document-worker.repository.js', { namedExports: {
    async findDocumentForProcessing() { return processingDocument; },
    async markDocumentProcessing() {}, async markDocumentReady() {}, async markDocumentPartialSuccess() {},
    async markDocumentFailed() {}, async markDocumentNeedsOcr() {},
    async saveDocumentTextExtraction(input: typeof savedText[number]) { savedText.push(input); return { id: source === 'ocr' ? 'text-ocr-1' : 'text-native-1' }; },
    async saveExtractedChunks(input: Array<{ content: string }>) { savedChunks.push(input.map((chunk) => chunk.content)); return { savedCount: input.length, chunkIds: input.map((_, index) => `chunk-${index}`) }; },
    async findDocumentBlocksForChunking() { return [{ id: 'block-1', blockIndex: 0, type: 'THEORY', title: null, normalizedContent: source === 'ocr' ? `${ocrPage1}\n${ocrPage2}` : nativeText, isComplete: true, incompleteReason: null, sectionPath: null, questionNumber: null, institution: null, examYear: null, pageStart: 1, pageEnd: 2, topicLinks: [] }]; },
    async saveDoclingChunks(input: Array<{ content: string }>) { savedChunks.push(input.map((chunk) => chunk.content)); return { savedCount: input.length, reused: false, chunkIds: input.map((_, index) => `chunk-${index}`) }; },
    async findReusableDoclingChunks() { return { reusable: false, chunkCount: 0, chunks: [] }; },
    async findChunkForFlashcardGeneration() { return null; }, async findFlashcardGenerationChunkIds() { return []; },
  } });
  await t.mock.module('../../backend/src/repositories/document-processing-job.repository.js', { namedExports: {
    DOCUMENT_PROCESSING_VERSION: 4, async ensureDocumentProcessingJobs() {}, async updateDocumentProcessingStage() {},
    async startDocumentProcessingJob(_id: string, operation: string) { operations.push(`start:${operation}`); },
    async completeDocumentProcessingJob(_id: string, operation: string) { operations.push(`complete:${operation}`); },
    async failDocumentProcessingJob(_id: string, operation: string) { operations.push(`fail:${operation}`); },
    async skipDocumentProcessingJob(_id: string, operation: string) { operations.push(`skip:${operation}`); },
  } });
  await t.mock.module('../../backend/src/lib/supabase.js', { namedExports: { supabaseAdmin: { storage: { from() { return { async download() {
    operations.push('storage:download'); return { data: new Blob([pdfBytes]), error: null };
  } }; } } } } });
  await t.mock.module('../../backend/src/worker/services/pdf-layout-extraction.service.js', { namedExports: {
    async extractPdfPagesWithLayout() { operations.push('pdfjs:extract'); return source === 'ocr'
      ? [{ num: 1, text: '', hasImages: true, imageCount: 1 }, { num: 2, text: '', hasImages: false, imageCount: 0 }]
      : [{ num: 1, text: nativeText, hasImages: false, imageCount: 0 }]; },
  } });
  await t.mock.module('../../backend/src/worker/services/processing-time-report.service.js', { namedExports: {
    async appendProcessingTimeReport() {}, async appendProcessingStageReport() {}, formatDuration() { return '0s'; },
  } });
  await t.mock.module('../../backend/src/worker/services/document-text-extraction.service.js', { namedExports: {
    DocumentTextExtractionService: class { async process(documentId: string, parsed: { text: string; total: number; pages: Array<{ num: number; text: string }> }) {
      operations.push('extract:text');
      const pages = parsed.pages.map((page) => ({ pageNumber: page.num, rawContent: page.text }));
      const result = await (await import('../../backend/src/repositories/document-worker.repository.js')).saveDocumentTextExtraction({
        documentId, rawContent: parsed.text, pageCount: parsed.total, quality: 'GOOD', pages,
      } as never) as { id: string };
      return { documentTextId: result.id, quality: 'GOOD', shouldStopProcessing: false, rawContent: parsed.text, normalizedContent: parsed.text, pageCount: parsed.total };
    } },
  } });
  await t.mock.module('../../backend/src/worker/services/document-block-detection.service.js', { namedExports: {
    DocumentBlockDetectionService: class { async process() { operations.push('detect:blocks'); return { blockCount: 1, typeCounts: { THEORY: 1 } }; } },
  } });
  await t.mock.module('../../backend/src/worker/services/chunk.service.js', { namedExports: {
    ChunkService: class { async processDocument() {
      operations.push('create:chunks');
      const text = savedText.at(-1)?.rawContent ?? '';
      const repository = await import('../../backend/src/repositories/document-worker.repository.js');
      const result = await repository.saveExtractedChunks([{ content: text }]) as { savedCount: number };
      return { chunkCount: result.savedCount };
    } },
  } });
  await t.mock.module('../../backend/src/worker/services/embedding.service.js', { namedExports: {
    EmbeddingService: class { async processDocument() { operations.push('generate:embeddings'); embeddedDocuments.push(processingDocument.id); operations.push('persist:embedding'); return { chunkCount: 1, batchCount: 1 }; } },
    logDocumentChunkContent() {},
  } });
  await t.mock.module('../../backend/src/worker/services/question-extraction.service.js', { namedExports: {
    QuestionExtractionService: class { async processDocument() { operations.push('extract:questions'); return { questionCount: 0 }; } },
  } });
  await t.mock.module('../../backend/src/worker/services/topic-profile-generation.service.js', { namedExports: {
    TopicProfileGenerationService: class { async processTopic() {} async processSubject() {} },
  } });
  await t.mock.module('../../backend/src/worker/services/flashcard/flashcard-generation.service.js', { namedExports: {
    FlashcardGenerationService: class { async processDocument() { return { status: 'READY' }; } },
  } });

  const { DocumentWorkerService } = await import('../../backend/src/worker/services/document-worker.service.js');
  const worker = new DocumentWorkerService(undefined, undefined, undefined, undefined, undefined, undefined, {
    documentIngestionV3Service: { async processDocument(input: { fileBytes: Uint8Array; originalName: string }) {
      operations.push('docling:parse'); parseInput.push(input); return { parseRunId: 'parse-ocr-1', status: 'COMPLETED', layoutPersisted: true };
    } } as never,
  });

  await worker.process(processingDocument.id);

  assert.deepEqual(parseInput.map((input) => [input.originalName, Buffer.from(input.fileBytes).equals(pdfBytes)]), [['scanned.pdf', true]], 'worker envia os bytes baixados ao parser Docling');
  assert.deepEqual(savedText.map(({ rawContent, pageCount, quality, pages }) => ({ rawContent, pageCount, quality, pages })), [{
    rawContent: `${ocrPage1}\n\n${ocrPage2}`, pageCount: 2, quality: 'GOOD',
    pages: [{ pageNumber: 1, rawContent: ocrPage1 }, { pageNumber: 2, rawContent: ocrPage2 }],
  }], 'OCR do Docling é persistido por página em vez do PDF.js vazio');
  assert.deepEqual(embeddedDocuments, [processingDocument.id], 'embedding é executado após chunks');
  assert.ok(operations.indexOf('docling:parse') < operations.indexOf('extract:text'));
  assert.ok(operations.indexOf('create:chunks') < operations.indexOf('generate:embeddings'));
  assert.equal(savedChunks.length, 1, 'chunk foi persistido no repositório simulado');
  assert.deepEqual(savedChunks[0], [`${ocrPage1}\n\n${ocrPage2}`]);
  const ocrSourceText = savedText[0]!.pages.map((page) => page.rawContent).join('\n\n');
  const ocrChunkText = savedChunks[0]!.join('\n\n');
  assert.equal(ocrChunkText, ocrSourceText, '100% do texto OCR de todas as páginas precisa aparecer nos chunks da base');
  for (const page of savedText[0]!.pages) {
    assert.ok(ocrChunkText.includes(page.rawContent), `página ${page.pageNumber} do OCR não foi indexada integralmente`);
  }
  assert.equal(operations.filter((operation) => operation === 'persist:embedding').length, 1, 'embedding foi persistido pelo serviço simulado');
  assert.ok(operations.includes('complete:GENERATE_CHUNK_EMBEDDINGS'));
  assert.ok(!operations.includes('extract:questions'), 'KNOWLEDGE_BASE não dispara extração de questões');

  source = 'native';
  processingDocument.id = 'knowledge-native';
  processingDocument.originalName = 'native.pdf';
  processingDocument.sizeBytes = 800;
  const nativeStart = savedText.length;
  const nativeParseStart = parseInput.length;
  await worker.process(processingDocument.id);
  assert.equal(parseInput.length, nativeParseStart + 1, 'PDF textual também é enviado ao Docling para classificação');
  assert.equal(savedText.length, nativeStart + 1);
  assert.equal(savedText.at(-1)?.rawContent, nativeText, 'sem layout OCR, texto nativo PDF.js permanece como conteúdo');
  assert.equal(savedText.at(-1)?.quality, 'GOOD', 'PDF textual não fica marcado como NEEDS_OCR');
  assert.equal(savedChunks.length, 2, 'chunk do PDF textual também foi persistido no repositório simulado');
  assert.equal(operations.filter((operation) => operation === 'docling:parse').length, 2);
  assert.equal(operations.filter((operation) => operation === 'pdfjs:extract').length, 2);
  assert.equal(embeddedDocuments.length, 2, 'ambas as extrações de conhecimento seguem para embeddings');
});

test('Docling HTTP real: conteúdo digitalizado e nativo (opcional, sem embeddings)', async (t) => {
  const baseUrl = process.env.DOC_CHUNKER_URL;
  if (!baseUrl) {
    t.skip('Defina DOC_CHUNKER_URL para executar contra o Docling local.');
    return;
  }
  const fixtures = join(process.cwd(), '../tests/document-parser/documentos-professor');
  const scannedPath = join(fixtures, 'pH e pOH.pdf');
  const nativePath = join(fixtures, 'Tabela Periódica.pdf');
  try {
    await Promise.all([access(scannedPath), access(nativePath)]);
  } catch {
    t.skip('Os PDFs locais do professor estão ausentes; copie-os para tests/document-parser/documentos-professor.');
    return;
  }

  const { DocChunkerClient } = await import('../../backend/src/worker/services/doc-chunker/doc-chunker.client.js');
  const client = new DocChunkerClient({ baseUrl, requestTimeoutMs: 600_000 });
  const run = async (path: string, documentId: string) => {
    const bytes = new Uint8Array(await readFile(path));
    return client.chunk({
      documentId, expectedSha256: createHash('sha256').update(bytes).digest('hex'),
      fileName: path.split('/').at(-1)!, mimeType: 'application/pdf', fileBytes: bytes,
    });
  };

  const [scanned, native] = await Promise.all([
    run(scannedPath, 'knowledge-flow-ocr'),
    run(nativePath, 'knowledge-flow-native'),
  ]);
  assert.equal(scanned.status, 'completed');
  assert.equal(native.status, 'completed');
  assert.equal(scanned.engine, 'docling');
  assert.equal(native.engine, 'docling');
  assert.equal(scanned.page_count, 4);
  assert.equal(native.page_count, 1);
  const scannedContent = scanned.chunks.map((chunk) => chunk.raw_text).join('\n');
  const nativeContent = native.chunks.map((chunk) => chunk.raw_text).join('\n');
  assert.match(scannedContent, /pH/i);
  assert.match(scannedContent, /pOH/i);
  assert.ok(scanned.chunks.length > 0);
  const scannedCoveredPages = [...new Set(scanned.chunks.flatMap((chunk) => chunk.pages))].sort((a, b) => a - b);
  assert.deepEqual(scannedCoveredPages, [1, 2, 3, 4], 'a base de conhecimento precisa incluir todas as páginas recuperadas por OCR');
  assert.equal(scanned.chunks.some((chunk) => chunk.raw_text.trim().length === 0), false, 'chunk vazio não conta como conteúdo coberto');
  assert.ok(native.chunks.length > 0);
  assert.match(nativeContent, /elementos|tabela|periódica/i);
  // The parser HTTP contract reports chunks and pages, not the internal OCR
  // classifier. Native-text length vs OCR recovery is the observable contract.
});

test('classificador Python real: PDFs do professor distinguem SCANNED/TEXT e aplicam OCR adaptativo', async (t) => {
  const cwd = process.cwd();
  const repoRoot = cwd.endsWith('/backend') ? join(cwd, '..') : cwd;
  const parserDir = join(repoRoot, 'services/document-parser');
  const python = join(parserDir, '.venv/bin/python');
  const fixtureDir = join(repoRoot, 'tests/document-parser/documentos-professor');
  const scannedPath = join(fixtureDir, 'pH e pOH.pdf');
  const nativePath = join(fixtureDir, 'Tabela Periódica.pdf');
  try {
    await Promise.all([access(python), access(scannedPath), access(nativePath)]);
  } catch {
    t.skip('Python do parser ou PDFs locais do professor ausentes; este caso chama a implementação Python real.');
    return;
  }

  const script = String.raw`
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd() / "scripts"))
import docling_http_service as service
enabled = {}
for label, path in (("scanned", Path(sys.argv[1])), ("native", Path(sys.argv[2]))):
    analysis = service.analyze_pdf_text_layer(path).with_explicit_ocr_option(True)
    enabled[label] = analysis.to_response_payload()
disabled = service.analyze_pdf_text_layer(Path(sys.argv[1])).with_explicit_ocr_option(False)
print(json.dumps({"enabled": enabled, "disabled": disabled.to_response_payload()}))
`;
  const result = spawnSync(python, ['-c', script, scannedPath, nativePath], {
    cwd: parserDir, encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(result.status, 0, `analyze_pdf_text_layer falhou: ${result.stderr}`);
  const analysis = JSON.parse(result.stdout) as {
    enabled: Record<string, { classification: string; pageCount: number; pagesWithText: number; ocrEnabled: boolean; forceBackendText: boolean }>;
    disabled: { classification: string; ocrEnabled: boolean; forceBackendText: boolean };
  };
  assert.equal(analysis.enabled.scanned.classification, 'SCANNED');
  assert.equal(analysis.enabled.scanned.pageCount, 4);
  assert.equal(analysis.enabled.scanned.ocrEnabled, true, 'OCR habilitado deve ser usado para PDF escaneado');
  assert.equal(analysis.enabled.scanned.forceBackendText, false);
  assert.equal(analysis.enabled.native.classification, 'TEXT');
  assert.equal(analysis.enabled.native.pageCount, 1);
  assert.equal(analysis.enabled.native.ocrEnabled, false, 'OCR adaptativo fica desligado quando há texto nativo');
  assert.equal(analysis.enabled.native.forceBackendText, true);
  assert.equal(analysis.disabled.classification, 'SCANNED');
  assert.equal(analysis.disabled.ocrEnabled, false);
  assert.equal(analysis.disabled.forceBackendText, true);
});
