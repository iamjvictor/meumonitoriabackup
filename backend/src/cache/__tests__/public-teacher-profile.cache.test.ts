import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicTeacherProfileCache, PUBLIC_TEACHER_PROFILE_CACHE_MAX_ENTRIES, PUBLIC_TEACHER_PROFILE_CACHE_TTL_MS } from '../public-teacher-profile.cache.js';

test('guarda perfil localmente e expira por TTL', async () => {
  let now = 100;
  const cache = new PublicTeacherProfileCache(() => now);
  const profile = { pageSlug: 'joao-professor', fullName: 'João Professor', monitors: [] };
  await cache.set(profile.pageSlug, profile);
  assert.deepEqual(await cache.get(profile.pageSlug), profile);
  now += PUBLIC_TEACHER_PROFILE_CACHE_TTL_MS;
  assert.equal(await cache.get(profile.pageSlug), null);
});

test('invalida o perfil público pelo slug', async () => {
  const cache = new PublicTeacherProfileCache();
  await cache.set('joao-professor', { pageSlug: 'joao-professor' });
  await cache.invalidate('joao-professor');
  assert.equal(await cache.get('joao-professor'), null);
});

test('não permite que consulta anterior à invalidação repovoe entrada antiga', async () => {
  const cache = new PublicTeacherProfileCache();
  const generation = cache.generation('slug');
  await cache.invalidate('slug');
  await cache.set('slug', { version: 'stale' }, generation);
  assert.equal(await cache.get('slug'), null);
});

test('expulsa a entrada menos usada quando excede a capacidade', async () => {
  const cache = new PublicTeacherProfileCache(Date.now, 60_000, 2);
  await cache.set('a', 1); await cache.set('b', 2); await cache.get('a'); await cache.set('c', 3);
  assert.equal(await cache.get('b'), null);
  assert.equal(await cache.get('a'), 1);
  assert.equal(PUBLIC_TEACHER_PROFILE_CACHE_MAX_ENTRIES, 1_000);
});
