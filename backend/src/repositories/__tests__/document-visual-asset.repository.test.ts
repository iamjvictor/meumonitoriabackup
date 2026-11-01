import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { DocumentVisualAssetRepository } from '../document-visual-asset.repository.js';

const docId = '7b39ad79-0aa7-4e1e-9f77-96e3d325f46f';
const parseRunId = 'fca6467e-f740-4e45-b452-2c954184985c';
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082', 'hex');
const asset = {
  assetKey: '1'.repeat(32), sourceItemRef: '#/pictures/0', readingOrder: 4, pageNumber: 2,
  bbox: [1, 2, 30, 40], coordOrigin: 'TOPLEFT', caption: 'Figure', mimeType: 'image/png' as const,
  width: 1, height: 1, sha256: createHash('sha256').update(png).digest('hex'), content: png,
};

function harness(options: { failUpsert?: boolean } = {}) {
  const rows = new Map<string, { id: string; checksum: string; storagePath: string }>();
  const objects = new Set<string>();
  const uploads: string[] = [];
  const removals: string[][] = [];
  let shouldFailUpsert = options.failUpsert ?? false;
  const tx = {
    documentParseRun: { findUnique: async () => ({ id: parseRunId, documentId: docId }) },
    documentVisualAsset: {
      findUnique: async (args: any) => rows.get(args.where.documentId_parseRunId_sourceKey.sourceKey) ?? null,
      upsert: async (args: any) => {
        if (shouldFailUpsert) throw new Error('db commit failed');
        const key = args.where.documentId_parseRunId_sourceKey.sourceKey;
        const existing = rows.get(key);
        if (existing) return existing;
        const row = { id: args.create.id, checksum: args.create.checksum, storagePath: args.create.storagePath };
        rows.set(key, row);
        return row;
      },
    },
  };
  const database = { $transaction: async (callback: (value: typeof tx) => Promise<any>) => callback(tx) };
  const storage = {
    upload: async (path: string) => { uploads.push(path); objects.add(path); return { error: null }; },
    remove: async (paths: string[]) => { removals.push(paths); paths.forEach((path) => objects.delete(path)); return { error: null }; },
  };
  return {
    repository: new DocumentVisualAssetRepository(database as any, storage as any),
    rows, objects, uploads, removals,
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

test('removes uploaded objects when database persistence fails', async () => {
  const state = harness({ failUpsert: true });
  await assert.rejects(state.repository.persistVisualParseRun({
    documentId: docId, parseRunId, docHash: 'a'.repeat(64), assets: [asset],
  }), /db commit failed/);
  assert.equal(state.objects.size, 0);
  assert.equal(state.removals.length, 1);
});

test('rejects path-like asset keys and bytes with a mismatched SHA before upload', async () => {
  const state = harness();
  await assert.rejects(state.repository.persistVisualParseRun({
    documentId: docId, parseRunId, docHash: 'a'.repeat(64), assets: [{ ...asset, assetKey: '../outside' }],
  }), /Metadados ou bytes/);
  assert.equal(state.uploads.length, 0);
});
