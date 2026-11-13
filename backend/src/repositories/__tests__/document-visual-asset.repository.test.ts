import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { DocumentVisualAssetRepository } from '../document-visual-asset.repository.js';

const docId = '7b39ad79-0aa7-4e1e-9f77-96e3d325f46f';
const parseRunId = 'fca6467e-f740-4e45-b452-2c954184985c';
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082', 'hex');
const asset = {
  assetKey: '1'.repeat(32), assetKind: 'FIGURE' as const, sourceItemRef: '#/pictures/0', readingOrder: 4, pageNumber: 2,
  bbox: [1, 2, 30, 40], coordOrigin: 'TOPLEFT', caption: 'Figure', mimeType: 'image/png' as const,
  width: 1, height: 1, sha256: createHash('sha256').update(png).digest('hex'), content: png,
};

function harness(options: { failUpsert?: boolean; failAfterWrite?: boolean } = {}) {
  const rows = new Map<string, Record<string, any>>();
  const objects = new Set<string>();
  const uploads: string[] = [];
  const removals: string[][] = [];
  const dbCalls = { assetFindMany: 0, assetUpsertBatch: 0 };
  let shouldFailUpsert = options.failUpsert ?? false;
  const tx = {
    documentParseRun: { findUnique: async () => ({ id: parseRunId, documentId: docId }) },
    documentVisualAsset: {
      findMany: async (args: any) => {
        dbCalls.assetFindMany++;
        return [...rows.entries()]
          .filter(([key, row]) => (!args.where.sourceKey?.in || args.where.sourceKey.in.includes(key))
            && (!args.where.storagePath?.in || args.where.storagePath.in.includes(row.storagePath)))
          .map(([sourceKey, row]) => ({ ...row, sourceKey }));
      },
    },
    $executeRaw: async (query: any) => {
        dbCalls.assetUpsertBatch++;
        const records = JSON.parse(query.values[0]);
        if (shouldFailUpsert && !options.failAfterWrite) throw new Error('db commit failed');
        let count = 0;
        for (const data of records) {
          const existing = rows.get(data.sourceKey);
          if (existing && existing.checksum !== data.checksum) continue;
          rows.set(data.sourceKey, { ...existing, ...data, id: existing?.id ?? data.id });
          count++;
        }
        if (shouldFailUpsert) throw new Error('db commit acknowledgement failed');
        return { count };
    },
  };
  const database = { $transaction: async (callback: (value: typeof tx) => Promise<any>) => callback(tx) };
  Object.assign(database, { documentVisualAsset: tx.documentVisualAsset });
  const storage = {
    upload: async (path: string) => { uploads.push(path); objects.add(path); return { error: null }; },
    remove: async (paths: string[]) => { removals.push(paths); paths.forEach((path) => objects.delete(path)); return { error: null }; },
  };
  return {
    repository: new DocumentVisualAssetRepository(database as any, storage as any),
    rows, objects, uploads, removals, dbCalls,
    setFail: (value: boolean) => { shouldFailUpsert = value; },
  };
}

test('persists a private asset with a stable source key and returns its database ID', async () => {
  const state = harness();
  const result = await state.repository.persistVisualParseRun({ documentId: docId, parseRunId, docHash: 'a'.repeat(64), assets: [asset] });
  assert.equal(result.parseRunId, parseRunId);
  assert.ok(result.assetIdsByKey[asset.assetKey]);
  assert.equal(state.uploads.length, 1);
  assert.equal([...state.objects][0], `${docId}/${parseRunId}/assets/${asset.assetKey}-${asset.sha256}.png`);
});

test('retry of the same parse run reuses the row and private object', async () => {
  const state = harness();
  const input = { documentId: docId, parseRunId, docHash: 'a'.repeat(64), assets: [asset] };
  const first = await state.repository.persistVisualParseRun(input);
  const retry = await state.repository.persistVisualParseRun(input);
  assert.deepEqual(retry, first);
  assert.equal(state.uploads.length, 1);
});

test('concurrent retries with the same asset key resolve to the same persisted row', async () => {
  const state = harness();
  const input = { documentId: docId, parseRunId, docHash: 'a'.repeat(64), assets: [asset] };
  const [first, second] = await Promise.all([
    state.repository.persistVisualParseRun(input),
    state.repository.persistVisualParseRun(input),
  ]);
  assert.equal(first.assetIdsByKey[asset.assetKey], second.assetIdsByKey[asset.assetKey]);
  assert.equal(state.rows.size, 1);
});

test('rejects an existing source key with a different checksum before uploading', async () => {
  const state = harness();
  state.rows.set(asset.assetKey, {
    id: 'existing-asset-row', checksum: 'f'.repeat(64), storagePath: 'existing/path.png',
  });
  await assert.rejects(state.repository.persistVisualParseRun({
    documentId: docId, parseRunId, docHash: 'a'.repeat(64), assets: [asset],
  }), /A chave do asset já existe com outro hash/);
  assert.equal(state.uploads.length, 0);
});

test('persists 73 visual assets with bounded set-based database queries', async () => {
  const state = harness();
  const assets = Array.from({ length: 73 }, (_, index) => ({
    ...asset, assetKey: index.toString(16).padStart(32, '0'),
  }));
  const result = await state.repository.persistVisualParseRun({
    documentId: docId, parseRunId, docHash: 'a'.repeat(64), assets,
  });

  assert.equal(Object.keys(result.assetIdsByKey).length, 73);
  assert.equal(state.rows.size, 73);
  assert.equal(state.uploads.length, 73);
  assert.deepEqual(state.dbCalls, { assetFindMany: 2, assetUpsertBatch: 1 });
});

test('leaves uploaded objects intact when database persistence fails', async () => {
  const state = harness({ failUpsert: true });
  await assert.rejects(state.repository.persistVisualParseRun({
    documentId: docId, parseRunId, docHash: 'a'.repeat(64), assets: [asset],
  }), /db commit failed/);
  assert.equal(state.objects.size, 1);
  assert.equal(state.removals.length, 0);
});

test('keeps an uploaded object if a row may already reference it after an uncertain commit', async () => {
  const state = harness({ failUpsert: true, failAfterWrite: true });
  await assert.rejects(state.repository.persistVisualParseRun({
    documentId: docId, parseRunId, docHash: 'a'.repeat(64), assets: [asset],
  }), /db commit acknowledgement failed/);
  assert.equal(state.rows.size, 1);
  assert.equal(state.objects.size, 1);
  assert.equal(state.removals.length, 0);
});

test('retry updates mutable asset metadata without changing the stable row ID', async () => {
  const state = harness();
  const original = await state.repository.persistVisualParseRun({
    documentId: docId, parseRunId, docHash: 'a'.repeat(64), assets: [asset],
  });
  const updated = await state.repository.persistVisualParseRun({
    documentId: docId, parseRunId, docHash: 'a'.repeat(64),
    assets: [{ ...asset, pageNumber: 5, readingOrder: 9, caption: 'Updated caption' }],
  });
  const row = state.rows.get(asset.assetKey)!;
  assert.equal(updated.assetIdsByKey[asset.assetKey], original.assetIdsByKey[asset.assetKey]);
  assert.equal(row.pageNumber, 5);
  assert.equal(row.metadata.caption, 'Updated caption');
  assert.equal(state.uploads.length, 1);
});

test('rejects path-like asset keys and bytes with a mismatched SHA before upload', async () => {
  const state = harness();
  await assert.rejects(state.repository.persistVisualParseRun({
    documentId: docId, parseRunId, docHash: 'a'.repeat(64), assets: [{ ...asset, assetKey: '../outside' }],
  }), /Metadados ou bytes/);
  assert.equal(state.uploads.length, 0);
});
