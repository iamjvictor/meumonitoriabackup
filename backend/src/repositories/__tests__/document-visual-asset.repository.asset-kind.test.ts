import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { DocumentVisualAssetRepository, buildPath } from '../document-visual-asset.repository.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jgXcAAAAASUVORK5CYII=', 'base64');
const sha256 = createHash('sha256').update(png).digest('hex');
const baseAsset = {
  sourceItemRef: '#/pictures/1', readingOrder: 20, pageNumber: 6,
  bbox: [32, 45, 730, 715], coordOrigin: 'BOTTOMLEFT', caption: null,
  mimeType: 'image/png' as const, width: 1, height: 1, sha256, content: png,
};

function createRepository() {
  const creates: Array<Record<string, any>> = [];
  const uploaded: string[] = [];
  const rows = new Map<string, Record<string, any>>();
  const tx = {
    documentParseRun: { async findUnique() { return { id: '123e4567-e89b-12d3-a456-426614174001', documentId: '123e4567-e89b-12d3-a456-426614174000' }; } },
    documentVisualAsset: {
      async findMany(input: any) {
        return [...rows.values()].filter((row) => (!input.where.sourceKey?.in || input.where.sourceKey.in.includes(row.sourceKey)))
          .map((row) => ({ id: row.id, sourceKey: row.sourceKey, checksum: row.checksum, storagePath: row.storagePath }));
      },
    },
    async $executeRaw(query: any) {
      const values = JSON.parse(query.values[0]);
      creates.push(...values);
      for (const value of values) {
        const existing = rows.get(value.sourceKey);
        rows.set(value.sourceKey, { ...existing, ...value, id: existing?.id ?? value.id });
      }
      return values.length;
    },
  };
  const database = { async $transaction<T>(callback: (transaction: any) => Promise<T>) { return callback(tx); } };
  Object.assign(database, { documentVisualAsset: tx.documentVisualAsset });
  const storage = { async upload(path: string) { uploaded.push(path); return { error: null }; }, async remove() { return { error: null }; } };
  return { repository: new DocumentVisualAssetRepository(database as never, storage as never), creates, uploaded };
}

test('persists FIGURE asset type and kind metadata from Docling', async () => {
  const harness = createRepository();
  const asset = { ...baseAsset, assetKey: 'a'.repeat(32), assetKind: 'FIGURE' as const };
  const result = await harness.repository.persistVisualParseRun({
    documentId: '123e4567-e89b-12d3-a456-426614174000', parseRunId: '123e4567-e89b-12d3-a456-426614174001',
    docHash: 'b'.repeat(64), assets: [asset as never],
  });

  assert.match(result.assetIdsByKey[asset.assetKey]!, /^[0-9a-f-]{36}$/i);
  assert.equal(harness.creates[0]!.assetType, 'figure');
  assert.deepEqual(harness.creates[0]!.metadata, {
    sourceItemRef: '#/pictures/1', readingOrder: 20, coordOrigin: 'BOTTOMLEFT', caption: null,
    docHash: 'b'.repeat(64), assetKind: 'FIGURE',
  });
  assert.deepEqual(harness.uploaded, [buildPath('123e4567-e89b-12d3-a456-426614174000', '123e4567-e89b-12d3-a456-426614174001', asset)]);
});

test('persists PAGE assets separately so QUESTIONS can exclude OCR raster pages', async () => {
  const harness = createRepository();
  const asset = { ...baseAsset, assetKey: 'c'.repeat(32), assetKind: 'PAGE' as const, sourceItemRef: '#/pages/6' };
  await harness.repository.persistVisualParseRun({
    documentId: '123e4567-e89b-12d3-a456-426614174000', parseRunId: '123e4567-e89b-12d3-a456-426614174001',
    docHash: 'b'.repeat(64), assets: [asset as never],
  });

  assert.equal(harness.creates[0]!.assetType, 'page');
  assert.equal(harness.creates[0]!.metadata.assetKind, 'PAGE');
  assert.equal(harness.creates[0]!.metadata.sourceItemRef, '#/pages/6');
});
