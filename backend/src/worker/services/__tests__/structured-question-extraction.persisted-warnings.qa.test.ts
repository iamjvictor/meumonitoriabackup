import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { extractPdfPagesWithLayout } from '../pdf-layout-extraction.service.js';
import { buildFullDocumentTextChunks } from '../full-document-text-chunker.js';
import { TextNormalizationService } from '../text-normalization.service.js';

test('a captura real do Pedro Lucas chega a saveQuestion com avisos de Q07 e uma chamada', async (t) => {
  Object.assign(process.env, {
    NODE_ENV: 'test', SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'qa-publishable', SUPABASE_SERVICE_ROLE_KEY: 'qa-service-role',
    DATABASE_URL: 'postgresql://qa:qa@127.0.0.1:5432/qa', REDIS_URL: 'redis://127.0.0.1:6379',
    OPENROUTER_EMBEDDING_MODEL: 'openrouter/qa-embedding', OPENROUTER_QUESTION_MODEL: 'openrouter/qa-chat',
    ASAAS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'), PAYMENTS_PROVIDER: 'SIMULATED',
    DOCUMENT_TEXT_SOURCE: 'pdfjs', DOCUMENT_VISUAL_ASSETS_ENABLED: 'false',
  });

  const root = resolve(process.cwd(), '..');
  const capture = JSON.parse(await readFile(resolve(root, 'tests/document-parser/results/pedro-lucas-final-correction-2026-11-05.json'), 'utf8')) as {
    rawStructuredOutputBeforeReconciliation: { questions: Array<Record<string, any>> };
  };
  const pdfBytes = new Uint8Array(await readFile(resolve(root, 'tests/document-parser/documentos-professor/Simulado Pedro Lucas.pdf')));
  const pages = await extractPdfPagesWithLayout(pdfBytes);
  const normalizer = new TextNormalizationService();
  const chunks = buildFullDocumentTextChunks(pages.map((page) => ({
    num: page.num, text: normalizer.normalize(page.text).normalizedContent,
  }))).chunks.map((chunk, index) => ({
    id: `qa-pedro-${index}`, chunkIndex: index, content: chunk.text, pages: chunk.pages,
    status: 'READY', visualAssets: chunk.pages.includes(4) ? [{ visualAsset: {
      id: 'qa-pedro-page4-render', pageNumber: 4, storagePath: 'qa/page4.png', mimeType: 'image/png',
      bbox: [0, 0, 851, 1200], metadata: { readingOrder: 0, sourceItemRef: 'local-page-render-4' },
    } }] : [],
  }));
  const documentRow = { id: 'qa-pedro-lucas-local', teacherId: 'qa-teacher', monitorId: 'qa-monitor', subjectId: 'qa-subject', topicId: null, chunks };
  const savedQuestions: Array<Record<string, any>> = [];
  let llmCalls = 0;
  let visualAssociations = 0;

  await t.mock.module('../../../lib/prisma.js', { namedExports: {
    prisma: {
      monitorDocument: { async findUnique() { return documentRow; } },
      questionVisualAsset: { async createMany({ data }: { data: unknown[] }) { visualAssociations += data.length; return { count: data.length }; } },
    },
  } });
  await t.mock.module('../../../repositories/question.repository.js', { namedExports: {
    async saveQuestion(input: Record<string, any>) { savedQuestions.push(input); return { id: `qa-question-${savedQuestions.length}` }; },
  } });

  const { StructuredQuestionExtractionService } = await import('../structured-question-extraction.service.js');
  const service = new StructuredQuestionExtractionService({
    async createStructuredChatCompletion() { llmCalls += 1; return capture.rawStructuredOutputBeforeReconciliation; },
  } as never, undefined, 100000, async () => ({ dataUrl: 'data:image/png;base64,cG5n', error: false }));
  const result = await service.processDocument(documentRow.id);

  const q07 = savedQuestions.find((question) => question.metadata.questionNumber === '07');
  assert.ok(q07, 'Q07 chega à fronteira de persistência');
  assert.match(q07.text, /75 g\/mol$/u, 'o token órfão não contamina o enunciado persistido');
  assert.equal(q07.alternatives.find((alternative: { label: string }) => alternative.label === 'A')?.text, '3 × 10 17');
  assert.ok(q07.metadata.sourceIntegrityWarnings.some((warning: { code: string; token?: string }) =>
    warning.code === 'ORPHANED_NUMERIC_TOKEN_BEFORE_ALTERNATIVES' && warning.token === '17'));
  assert.ok(q07.metadata.sourceIntegrityWarnings.some((warning: { code: string; alternativeLabel?: string }) =>
    warning.code === 'SCIENTIFIC_EXPONENT_FORMAT_UNVERIFIED' && warning.alternativeLabel === 'A'));
  assert.equal(savedQuestions.length, 10);
  assert.equal(visualAssociations, 2, 'Q07 e Q08 persistem a associação visual citada pelo retorno capturado');
  assert.equal(llmCalls, 1);
  assert.equal(result.llmCalls, 1);
});
