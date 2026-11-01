import assert from 'node:assert/strict';
import test from 'node:test';
import { DocChunkerClientError } from '../doc-chunker/doc-chunker.client.js';
import { isEligibleDocChunkerFallback, shouldUseDocChunker } from '../document-worker.service.js';

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
  assert.equal(shouldUseDocChunker('QUESTIONS', 'docling'), false);
  assert.equal(shouldUseDocChunker('FLASHCARDS', 'auto'), false);
});
