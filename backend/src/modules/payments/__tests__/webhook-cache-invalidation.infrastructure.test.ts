import assert from 'node:assert/strict';
import test from 'node:test';
import { RedisEntitlementCache, type EntitlementCacheClient } from '../../access/infrastructure/redis-entitlement-cache.js';

test('invalidateOrThrow propaga falha do Redis para permitir retry do webhook', async () => {
  const redisError = new Error('redis unavailable');
  const calls: string[] = [];
  const redis: EntitlementCacheClient = {
    async get() { return null; },
    async set() { return undefined; },
    async del(key) { calls.push(key); throw redisError; },
  };
  const cache = new RedisEntitlementCache(redis, 'SANDBOX');

  await assert.rejects(cache.invalidateOrThrow('student_42'), (error) => error === redisError);
  assert.deepEqual(calls, ['entitlement:v1:sandbox:student_42']);
});
