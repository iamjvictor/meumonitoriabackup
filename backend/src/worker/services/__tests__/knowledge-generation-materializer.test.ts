import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { loadAndAssembleCheckpoints } from '../knowledge-generation-materializer.service.js';

test('does not accept an otherwise complete batch set with missing final document pages', async () => {
  const documentId = '7af3c4ad-75a4-4dac-8327-becf514b8da4';
  const runId = '91b04432-2e8b-47b6-8acb-e72d52097359';
  const batchKey = 'a'.repeat(64);
  const fileEntries = [
    { path: 'document.json', bytes: Buffer.from('{"schema_name":"DoclingDocument"}') },
    { path: 'document.md', bytes: Buffer.from('# Book') },
    { path: 'layout.json', bytes: Buffer.from(JSON.stringify({
      schemaVersion: 'docling-layout-v1',
      pages: Array.from({ length: 10 }, (_, index) => ({
        pageNumber: index + 1,
        elements: [{ externalIndex: 0, level: null, type: 'TEXT', text: `page-${index + 1}`, bbox: null }],
      })),
    })) },
  ];
  const files = fileEntries.map(({ path, bytes }) => ({
    path, sha256: createHash('sha256').update(bytes).digest('hex'), contentBase64: bytes.toString('base64'),
  }));
  const artifact = Buffer.from(JSON.stringify(files));
  const manifest = {
    schemaVersion: 'knowledge-batch-v1', documentId, runId, contentHash: 'b'.repeat(64), configurationHash: 'c'.repeat(64),
    parserVersion: '2.122.0', pageStart: 1, pageEnd: 10, status: 'COMPLETED', visualAssets: [],
    pages: Array.from({ length: 10 }, (_, index) => ({
      pageNumber: index + 1, status: 'CONVERTED', characterCount: `page-${index + 1}`.length,
      layoutItemCount: 1, imageCount: 0, errors: [],
    })),
    files: files.map(({ path, sha256 }) => ({ path, sha256 })),
  };
  const storage = {
    async upload() { return { error: null }; },
    async download() { return { data: new Blob([artifact]), error: null }; },
  };

  await assert.rejects(loadAndAssembleCheckpoints({
    batches: [{
      id: 'batch-1', pageStart: 1, pageEnd: 10, batchKey, status: 'COMPLETED',
      artifactPath: 'private/checkpoint.json', artifactChecksum: createHash('sha256').update(artifact).digest('hex'), manifest,
    }],
    documentId, runId, pageCount: 11, contentHash: 'b'.repeat(64), configurationHash: 'c'.repeat(64),
    parserVersion: '2.122.0', storage,
  }), /cobertura final não inclui cada página exatamente uma vez/u);
});

test('accepts an immutable checkpoint cloned from a matching tenant-scoped source run', async () => {
  const fixture = makeClonedCheckpointFixture();
  const result = await loadAndAssembleCheckpoints({
    batches: [fixture.targetBatch], documentId: fixture.documentId, runId: fixture.targetRunId,
    teacherId: fixture.teacherId, monitorId: fixture.monitorId, pageCount: 1,
    contentHash: fixture.contentHash, configurationHash: fixture.configurationHash, parserVersion: fixture.parserVersion,
    resolveSourceCheckpoint: async () => ({ run: fixture.sourceRun, batch: fixture.sourceBatch }),
    storage: fixture.storage,
  });
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0]?.page.pageNumber, 1);
});

test('rejects a cloned checkpoint whose source run belongs to another tenant', async () => {
  const fixture = makeClonedCheckpointFixture();
  await assert.rejects(loadAndAssembleCheckpoints({
    batches: [fixture.targetBatch], documentId: fixture.documentId, runId: fixture.targetRunId,
    teacherId: fixture.teacherId, monitorId: fixture.monitorId, pageCount: 1,
    contentHash: fixture.contentHash, configurationHash: fixture.configurationHash, parserVersion: fixture.parserVersion,
    resolveSourceCheckpoint: async () => ({ run: { ...fixture.sourceRun, teacherId: '55555555-5555-4555-8555-555555555555' }, batch: fixture.sourceBatch }),
    storage: fixture.storage,
  }), /tenant ou configuração/u);
});

test('rejects cloned checkpoint path or checksum that differs from its source batch', async () => {
  const fixture = makeClonedCheckpointFixture();
  await assert.rejects(loadAndAssembleCheckpoints({
    batches: [{ ...fixture.targetBatch, artifactPath: `${fixture.targetBatch.artifactPath}.other` }],
    documentId: fixture.documentId, runId: fixture.targetRunId, teacherId: fixture.teacherId, monitorId: fixture.monitorId,
    pageCount: 1, contentHash: fixture.contentHash, configurationHash: fixture.configurationHash, parserVersion: fixture.parserVersion,
    resolveSourceCheckpoint: async () => ({ run: fixture.sourceRun, batch: fixture.sourceBatch }), storage: fixture.storage,
  }), /Caminho do checkpoint/u);
  await assert.rejects(loadAndAssembleCheckpoints({
    batches: [{ ...fixture.targetBatch, artifactChecksum: '0'.repeat(64) }],
    documentId: fixture.documentId, runId: fixture.targetRunId, teacherId: fixture.teacherId, monitorId: fixture.monitorId,
    pageCount: 1, contentHash: fixture.contentHash, configurationHash: fixture.configurationHash, parserVersion: fixture.parserVersion,
    resolveSourceCheckpoint: async () => ({ run: fixture.sourceRun, batch: fixture.sourceBatch }), storage: fixture.storage,
  }), /diverge do lote concluído/u);
});

function makeClonedCheckpointFixture() {
  const teacherId = '11111111-1111-4111-8111-111111111111';
  const monitorId = '22222222-2222-4222-8222-222222222222';
  const documentId = '33333333-3333-4333-8333-333333333333';
  const sourceRunId = '44444444-4444-4444-8444-444444444444';
  const targetRunId = '55555555-5555-4555-8555-555555555555';
  const batchKey = 'a'.repeat(64);
  const contentHash = 'b'.repeat(64);
  const configurationHash = 'c'.repeat(64);
  const parserVersion = 'docling-2.122.0';
  const fileEntries = [
    { path: 'document.json', bytes: Buffer.from('{"schema_name":"DoclingDocument"}') },
    { path: 'document.md', bytes: Buffer.from('page') },
    { path: 'layout.json', bytes: Buffer.from(JSON.stringify({
      schemaVersion: 'docling-layout-v1',
      pages: [{ pageNumber: 1, elements: [{ externalIndex: 0, level: null, type: 'TEXT', text: 'A página do checkpoint.' }] }],
    })) },
  ];
  const entries = fileEntries.map(({ path, bytes }) => ({
    path, sha256: createHash('sha256').update(bytes).digest('hex'), contentBase64: bytes.toString('base64'),
  }));
  const artifact = Buffer.from(JSON.stringify(entries));
  const manifest = {
    schemaVersion: 'knowledge-batch-v1', documentId, runId: sourceRunId, contentHash, configurationHash,
    parserVersion, pageStart: 1, pageEnd: 1, status: 'COMPLETED', visualAssets: [],
    pages: [{ pageNumber: 1, status: 'CONVERTED', characterCount: 23, layoutItemCount: 1, imageCount: 0, errors: [] }],
    files: entries.map(({ path, sha256 }) => ({ path, sha256 })),
  };
  const artifactPath = `knowledge-batches/${teacherId}/${documentId}/${sourceRunId}/${batchKey}.json`;
  const sourceBatch = {
    id: '66666666-6666-4666-8666-666666666666', runId: sourceRunId,
    pageStart: 1, pageEnd: 1, batchKey, status: 'COMPLETED', artifactPath,
    artifactChecksum: createHash('sha256').update(artifact).digest('hex'), manifest,
  };
  const targetBatch = { ...sourceBatch, id: '77777777-7777-4777-8777-777777777777', runId: targetRunId, checkpointSourceRunId: sourceRunId };
  return {
    teacherId, monitorId, documentId, sourceRunId, targetRunId, batchKey, contentHash, configurationHash, parserVersion,
    sourceRun: { id: sourceRunId, documentId, teacherId, monitorId, contentHash, configurationHash, parserVersion, pageCount: 1 },
    sourceBatch, targetBatch,
    storage: { async upload() { return { error: null }; }, async download() { return { data: new Blob([artifact]), error: null }; } },
  };
}
