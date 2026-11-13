import assert from 'node:assert/strict';
import test from 'node:test';
import { DocChunkerClientError } from '../doc-chunker/doc-chunker.client.js';
import { assertQuestionParserPageCoverage, isEligibleDocChunkerFallback, resolveReusableQuestionCoverage, shouldUseDocChunker } from '../document-worker.service.js';

test('fallback automático só aceita falhas de transporte, timeout e respostas do serviço', () => {
  for (const code of ['DOC_CHUNKER_NETWORK_ERROR', 'DOC_CHUNKER_TIMEOUT', 'DOC_CHUNKER_BODY_INTERRUPTED', 'DOC_CHUNKER_INVALID_JSON', 'DOC_CHUNKER_INVALID_CONTRACT']) {
    assert.equal(isEligibleDocChunkerFallback(new DocChunkerClientError(code, 'erro')), true, code);
  }
  assert.equal(isEligibleDocChunkerFallback(new DocChunkerClientError('DOC_CHUNKER_HASH_MISMATCH', 'erro')), false);
  assert.equal(isEligibleDocChunkerFallback(new DocChunkerClientError('OCR_REQUIRED', 'erro')), false);
  assert.equal(isEligibleDocChunkerFallback(new Error('falha desconhecida')), false);
});

test('Doc-chunker só processa KNOWLEDGE_BASE quando fonte está habilitada', () => {
  assert.equal(shouldUseDocChunker('KNOWLEDGE_BASE', 'docling'), true);
  assert.equal(shouldUseDocChunker('KNOWLEDGE_BASE', 'auto'), true);
  assert.equal(shouldUseDocChunker('KNOWLEDGE_BASE', 'pdfjs'), false);
  assert.equal(shouldUseDocChunker('QUESTIONS', 'docling'), true);
  assert.equal(shouldUseDocChunker('QUESTIONS', 'pdfjs'), true);
  assert.equal(shouldUseDocChunker('FLASHCARDS', 'auto'), false);
});

test('QUESTIONS Docling verifica páginas representadas sem bloquear páginas sem evidência de texto', () => {
  const completePages = assertQuestionParserPageCoverage(3, [
    { pages: [1], raw_text: 'texto 1' }, { pages: [2, 3], raw_text: 'texto 2 e 3' },
  ]);
  assert.deepEqual(completePages, {
    coveredPages: 3, pageCount: 3, textCoverage: 'UNVERIFIED',
    pagesWithoutText: [], pagesWithoutTextWithVisualAssets: [], pagesWithoutTextUnclassified: [],
  });
  const sparse = assertQuestionParserPageCoverage(16, [
    { pages: [13], raw_text: 'Rascunho cabeçalho e rodapé' },
    { pages: [16], raw_text: 'Questão e alternativas' },
    { pages: [2], raw_text: '' },
  ], { visualAssetPages: [2] });
  assert.deepEqual(sparse.pagesWithoutText, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15]);
  assert.deepEqual(sparse.pagesWithoutTextWithVisualAssets, [2]);
  assert.deepEqual(sparse.pagesWithoutTextUnclassified, [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15]);
  assert.equal(sparse.textCoverage, 'UNVERIFIED');
  assert.doesNotThrow(() => assertQuestionParserPageCoverage(16, [], { visualAssetPages: [2] }));
  assert.throws(() => assertQuestionParserPageCoverage(1, [{ pages: [2], raw_text: 'fora do documento' }]), /INVALID_PAGE/);
  assert.throws(() => assertQuestionParserPageCoverage(1, [{ pages: [], raw_text: 'sem proveniência' }]), /sem página de origem/);
});

test('status não declara READY quando texto integral de QUESTIONS não foi verificado', async () => {
  const { resolveDocumentStatus } = await import('../document-worker.service.js');
  assert.equal(resolveDocumentStatus([], ['QUESTIONS_TEXT_COVERAGE_UNVERIFIED']), 'PARTIAL_SUCCESS');
});

test('reuso QUESTIONS usa página total e visual assets persistidos no parse run', () => {
  const result = resolveReusableQuestionCoverage({ pageCount: 16, visualAssetPages: [2, 16] }, [
    { pages: [13], text: 'rascunho cabeçalho e rodapé' },
  ]);
  assert.ok(result.coverage);
  assert.equal(result.coverage.pageCount, 16, 'não estima total pelo último chunk (página 13)');
  assert.deepEqual(result.coverage.pagesWithoutTextWithVisualAssets, [2, 16], 'página final visual fica reconhecida como página com figura');
  assert.ok(result.warnings.includes('QUESTIONS_PAGES_WITHOUT_TEXT'));
  assert.ok(result.warnings.includes('QUESTIONS_PAGE_TEXT_UNCLASSIFIED'));
  assert.ok(result.warnings.includes('QUESTIONS_TEXT_COVERAGE_UNVERIFIED'));
});

test('reuso sem referência confiável não deduz pageCount pelos chunks', () => {
  const result = resolveReusableQuestionCoverage(undefined, [{ pages: [13], text: 'texto parcial' }]);
  assert.equal(result.coverage, null);
  assert.deepEqual(result.warnings, ['QUESTIONS_TEXT_COVERAGE_UNVERIFIED', 'QUESTIONS_COVERAGE_REFERENCE_MISSING']);
});
