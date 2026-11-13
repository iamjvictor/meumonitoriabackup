import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { DocumentVisualAssetRepository, type IncomingVisualAsset } from '../document-visual-asset.repository.js';

const documentId = '7b39ad79-0aa7-4e1e-9f77-96e3d325f46f';
const parseRunId = 'fca6467e-f740-4e45-b452-2c954184985c';
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082', 'hex');
const checksum = createHash('sha256').update(png).digest('hex');
type PersistedRow = { id: string; documentId: string; parseRunId: string; sourceKey: string; storagePath: string; checksum: string };

function assets73(): IncomingVisualAsset[] {
  return Array.from({ length: 73 }, (_, index) => ({
    assetKey: index.toString(16).padStart(32, '0'),
    assetKind: index % 4 === 0 ? 'PAGE' as const : 'FIGURE' as const,
    sourceItemRef: index % 4 === 0 ? `#/pages/${index + 1}` : `#/pictures/${index}`,
    readingOrder: index * 3,
    pageNumber: Math.floor(index / 4) + 1,
    bbox: [index, index + 1, index + 20, index + 40],
    coordOrigin: index % 2 === 0 ? 'TOPLEFT' : 'BOTTOMLEFT',
    caption: index % 3 === 0 ? `caption-${index}` : null,
    mimeType: 'image/png' as const,
    width: 1,
    height: 1,
    sha256: checksum,
    content: png,
  }));
}

function makeHarness() {
  type Row = {
    id: string; documentId: string; parseRunId: string; sourceKey: string;
    pageNumber: number; assetType: string; storagePath: string; mimeType: string;
    width: number; height: number; bbox: number[]; checksum: string; metadata: Record<string, unknown>;
  };
  const rows = new Map<string, Row>();
  const objects = new Map<string, Buffer>();
  const writes: Array<Array<Record<string, unknown>>> = [];
  let findManyCalls = 0;
  let findUniqueCalls = 0;
  const visualAssets = {
    findMany: async (args: any) => {
      findManyCalls++;
      const requestedKeys = args.where.sourceKey?.in as string[] | undefined;
      const requestedPaths = args.where.storagePath?.in as string[] | undefined;
      return [...rows.values()].filter((row) =>
        (!requestedKeys || requestedKeys.includes(row.sourceKey))
        && (!requestedPaths || requestedPaths.includes(row.storagePath))
        && (!args.where.documentId || row.documentId === args.where.documentId)
        && (!args.where.parseRunId || row.parseRunId === args.where.parseRunId));
    },
  };
  const tx = {
    documentParseRun: {
      findUnique: async () => { findUniqueCalls++; return { id: parseRunId, documentId }; },
    },
    documentVisualAsset: visualAssets,
    $executeRaw: async (query: { values: unknown[] }) => {
      const records = JSON.parse(String(query.values[0])) as Row[];
      writes.push(records);
      let count = 0;
      for (const row of records) {
        const existing = rows.get(row.sourceKey);
        if (existing && existing.checksum !== row.checksum) continue;
        rows.set(row.sourceKey, { ...existing, ...row, id: existing?.id ?? row.id });
        count++;
      }
      return count;
    },
  };
  let transactionCount = 0;
  const database = {
    documentVisualAsset: visualAssets,
    $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => {
      transactionCount++;
      return callback(tx);
    },
  };
  const storage = {
    upload: async (path: string, content: Buffer, options: { contentType: string; upsert: boolean }) => {
      assert.equal(options.contentType, 'image/png');
      assert.equal(options.upsert, true);
      objects.set(path, Buffer.from(content));
      return { error: null };
    },
    remove: async (paths: string[]) => {
      paths.forEach((path) => objects.delete(path));
      return { error: null };
    },
  };
  return {
    repository: new DocumentVisualAssetRepository(database as never, storage as never),
    rows, objects, writes,
    stats: () => ({ findManyCalls, findUniqueCalls, transactionCount }),
  };
}

test('persists all 73 visual assets with set-based database writes and stable retry results', async () => {
  const harness = makeHarness();
  const input = { documentId, parseRunId, docHash: 'a'.repeat(64), assets: assets73() };

  const first = await harness.repository.persistVisualParseRun(input);

  assert.equal(first.parseRunId, parseRunId);
  assert.equal(Object.keys(first.assetIdsByKey).length, 73);
  assert.equal(new Set(Object.values(first.assetIdsByKey)).size, 73);
  assert.equal(harness.rows.size, 73);
  assert.equal(harness.objects.size, 73);
  assert.deepEqual(harness.stats(), { findManyCalls: 2, findUniqueCalls: 2, transactionCount: 2 });
  assert.equal(harness.writes.length, 1, '73 records should use one set-based DB write, not 73 upserts');
  assert.equal(harness.writes[0]?.length, 73);

  for (const [index, asset] of input.assets.entries()) {
    const row = harness.rows.get(asset.assetKey);
    assert.ok(row, `asset ${index} has no row`);
    assert.equal(row.id, first.assetIdsByKey[asset.assetKey]);
    assert.equal(row.documentId, documentId);
    assert.equal(row.parseRunId, parseRunId);
    assert.equal(row.checksum, asset.sha256);
    assert.equal(row.pageNumber, asset.pageNumber);
    assert.equal(row.assetType, asset.assetKind.toLowerCase());
    assert.equal(row.metadata.assetKind, asset.assetKind);
    assert.equal(row.metadata.sourceItemRef, asset.sourceItemRef);
    assert.equal(row.metadata.readingOrder, asset.readingOrder);
    assert.deepEqual(row.bbox, asset.bbox);
    assert.deepEqual(harness.objects.get(row.storagePath), png);
  }

  const retry = await harness.repository.persistVisualParseRun(input);
  assert.deepEqual(retry, first);
  assert.equal(harness.rows.size, 73);
  assert.equal(harness.objects.size, 73);
  assert.equal(harness.writes.length, 2, 'retry should batch-update rows without uploading assets again');
  assert.equal(harness.objects.size, 73);
});

test('updates existing metadata when the same parse run and asset checksum are reprocessed', async () => {
  const harness = makeHarness();
  const original = assets73()[0]!;
  await harness.repository.persistVisualParseRun({ documentId, parseRunId, docHash: 'a'.repeat(64), assets: [original] });

  const revised: IncomingVisualAsset = {
    ...original,
    assetKind: original.assetKind === 'PAGE' ? 'FIGURE' : 'PAGE',
    sourceItemRef: '#/pages/revised-location',
    readingOrder: 900,
    pageNumber: original.pageNumber + 7,
    bbox: [100, 200, 300, 400],
    coordOrigin: 'BOTTOMLEFT',
    caption: 'revised caption',
  };
  await harness.repository.persistVisualParseRun({ documentId, parseRunId, docHash: 'a'.repeat(64), assets: [revised] });

  const row = harness.rows.get(revised.assetKey);
  assert.ok(row);
  assert.equal(row.pageNumber, revised.pageNumber);
  assert.equal(row.assetType, revised.assetKind.toLowerCase());
  assert.equal(row.metadata.assetKind, revised.assetKind);
  assert.equal(row.metadata.sourceItemRef, revised.sourceItemRef);
  assert.equal(row.metadata.readingOrder, revised.readingOrder);
  assert.equal(row.metadata.caption, revised.caption);
  assert.deepEqual(row.bbox, revised.bbox);
});

test('cleanup of one failed concurrent persistence does not remove another caller’s eventual asset object', async () => {
  const path = `${documentId}/${parseRunId}/assets/${assets73()[0]!.assetKey}-${checksum}.png`;
  const objects = new Set<string>();
  const rows = new Map<string, PersistedRow>();
  const secondUploadStarted = deferred();
  const cleanupCompleted = deferred();
  let uploadCount = 0;
  let batchWriteCount = 0;

  const tx = {
    documentParseRun: { findUnique: async () => ({ id: parseRunId, documentId }) },
    documentVisualAsset: {
      findMany: async (args: any) => [...rows.values()].filter((row) =>
        (!args.where.sourceKey?.in || args.where.sourceKey.in.includes(row.sourceKey))
        && (!args.where.storagePath?.in || args.where.storagePath.in.includes(row.storagePath))),
    },
    $executeRaw: async (query: { values: unknown[] }) => {
      batchWriteCount++;
      const records = JSON.parse(String(query.values[0])) as PersistedRow[];
      if (batchWriteCount === 1) throw new Error('first commit failed');
      for (const record of records) rows.set(record.sourceKey, record);
      return records.length;
    },
  };
  const database = {
    documentVisualAsset: tx.documentVisualAsset,
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  };
  const storage = {
    upload: async (uploadPath: string) => {
      uploadCount++;
      objects.add(uploadPath);
      if (uploadCount === 1) await secondUploadStarted.promise;
      else {
        secondUploadStarted.resolve();
        await cleanupCompleted.promise;
      }
      return { error: null };
    },
    remove: async (paths: string[]) => {
      paths.forEach((item) => objects.delete(item));
      cleanupCompleted.resolve();
      return { error: null };
    },
  };
  const repository = new DocumentVisualAssetRepository(database as never, storage as never);
  const input = { documentId, parseRunId, docHash: 'a'.repeat(64), assets: [assets73()[0]!] };

  const first = repository.persistVisualParseRun(input).then(
    () => { cleanupCompleted.resolve(); return { status: 'fulfilled' as const }; },
    () => { cleanupCompleted.resolve(); return { status: 'rejected' as const }; },
  );
  while (uploadCount < 1) await new Promise((resolve) => setImmediate(resolve));
  const second = repository.persistVisualParseRun(input);
  const outcomes = await Promise.allSettled([first, second]);

  assert.equal(outcomes[0]?.status, 'fulfilled');
  assert.equal(outcomes[0]?.value.status, 'rejected');
  assert.equal(outcomes[1]?.status, 'fulfilled');
  assert.equal(rows.size, 1);
  assert.ok(objects.has(path), 'a successful DB row must still have its shared storage object');
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
