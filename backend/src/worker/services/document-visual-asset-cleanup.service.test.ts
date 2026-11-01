import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentVisualAssetCleanupService } from './document-visual-asset-cleanup.service.js';

test('cleanup deletes DB rows only after private object removal succeeds', async () => {
  const deleted: unknown[] = [];
  const removed: string[][] = [];
  const database = { documentVisualAsset: {
    findMany: async () => [{ id: 'asset-1', storagePath: 'doc/run/a.png' }, { id: 'asset-2', storagePath: 'doc/run/b.png' }],
    deleteMany: async (args: unknown) => { deleted.push(args); return { count: 1 }; },
  } };
  const storage = { remove: async (paths: string[]) => {
    removed.push(paths);
    return { error: paths[0] === 'doc/run/b.png' ? new Error('storage unavailable') : null };
  } };
  const result = await new DocumentVisualAssetCleanupService(database as any, storage as any)
    .cleanupParseRun('document-1', 'parse-1');
  assert.deepEqual(result, { removedCount: 1, retainedCount: 1 });
  assert.equal(deleted.length, 1);
  assert.deepEqual(removed, [['doc/run/a.png'], ['doc/run/b.png']]);
});
