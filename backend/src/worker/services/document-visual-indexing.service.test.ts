import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentVisualIndexingService } from './document-visual-indexing.service.js';

test('descreve conteúdo visual sem inferir informação ausente e indexa texto recuperável', async () => {
  const calls: string[] = [];
  let saved: unknown;
  const service = new DocumentVisualIndexingService({
    assets: {
      async findForIndexing() { return { id: 'asset-1', documentId: 'doc-1', pageNumber: 3, mimeType: 'image/png', bytes: Buffer.from('png') }; },
      async saveIndex(_id, input) { saved = input; },
    },
    vision: { async describe() { return { description: 'Gráfico de temperatura por tempo. Eixo x: tempo (s); eixo y: temperatura (°C). A curva aumenta até 80 °C. Não há escala legível após 10 s.', model: 'vision-test', version: 'visual-v1' }; } },
    embeddings: { async createEmbeddings(input) { calls.push(input[0]!); return [[0.1, 0.2]]; } },
  });

  const result = await service.describeAndIndexAsset('asset-1');

  assert.equal(result.descriptionStatus, 'READY');
  assert.equal(result.visualChunkId, 'asset-1');
  assert.match(calls[0]!, /eixo x: tempo/i);
  assert.match(calls[0]!, /Não há escala legível/);
  assert.deepEqual((saved as { embedding: number[] }).embedding, [0.1, 0.2]);
  assert.equal((saved as { model: string }).model, 'vision-test');
});

test('preserva incerteza, marca falha retryable e completa o reindexamento na repetição', async () => {
  const saved: Array<{ status: string; description?: string }> = [];
  let attempts = 0;
  const service = new DocumentVisualIndexingService({
    assets: {
      async findForIndexing() { return { id: 'asset-2', documentId: 'doc-1', pageNumber: 5, mimeType: 'image/png', bytes: Buffer.from('png') }; },
      async saveIndex(_id, input) { saved.push(input); },
    },
    vision: { async describe() {
      attempts += 1;
      if (attempts === 1) throw new Error('provider unavailable');
      return { description: 'A legenda é parcialmente ilegível; não é possível confirmar o valor final.', model: 'vision-test', version: 'visual-v1' };
    } },
    embeddings: { async createEmbeddings() { return [[0.3, 0.4]]; } },
  });

  await assert.rejects(service.describeAndIndexAsset('asset-2'), /provider unavailable/);
  assert.equal(saved[0]?.status, 'FAILED_RETRYABLE');
  const retry = await service.describeAndIndexAsset('asset-2');
  assert.equal(retry.descriptionStatus, 'READY');
  assert.match(saved[1]?.description ?? '', /não é possível confirmar/);
  assert.equal(saved[1]?.status, 'READY');
});
