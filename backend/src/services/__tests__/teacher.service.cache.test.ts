import assert from 'node:assert/strict';
import test from 'node:test';
import { TeacherService } from '../teacher.service.js';
import { PublicTeacherProfileCache } from '../../cache/public-teacher-profile.cache.js';

const profile = { pageSlug: 'joao-professor', fullName: 'João Professor', monitors: [] };

test('retorna o perfil público do cache sem consultar o repositório', async () => {
  let repositoryCalls = 0;
  const cache = new PublicTeacherProfileCache();
  await cache.set(profile.pageSlug, profile);
  const service = new TeacherService({
    async findPublicBySlug() { repositoryCalls += 1; return profile; },
  } as any, cache);

  const result = await service.findPublicProfile(profile.pageSlug);

  assert.deepEqual(result, profile);
  assert.equal(repositoryCalls, 0);
});

test('consulta o repositório e preenche o cache quando há miss', async () => {
  let repositoryCalls = 0;
  const cache = new PublicTeacherProfileCache();
  const service = new TeacherService({
    async findPublicBySlug() { repositoryCalls += 1; return profile; },
  } as any, cache);

  const result = await service.findPublicProfile(profile.pageSlug);

  assert.deepEqual(result, profile);
  assert.equal(repositoryCalls, 1);
  assert.deepEqual(await cache.get(profile.pageSlug), profile);
});

test('fornece no perfil público o preço anual calculado com 20% de desconto', async () => {
  const profileWithMonitor = { ...profile, monitors: [{ id: 'monitor-1', priceCents: 5990 }] };
  const service = new TeacherService({ async findPublicBySlug() { return profileWithMonitor; } } as any);
  const result = await service.findPublicProfile(profile.pageSlug) as typeof profileWithMonitor & { monitors: Array<{ annualPriceCents: number }> };
  assert.equal(result.monitors[0]?.annualPriceCents, 57504);
});
