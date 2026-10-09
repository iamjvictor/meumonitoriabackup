import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const routeRoot = 'src/app/(student-app)/areadoaluno';
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');

test('daily challenge extraction preserves the original section and connects it to the page', () => {
  const component = read(`${routeRoot}/components/DashboardChallengeSection.tsx`);
  const page = read(`${routeRoot}/page.tsx`);

  for (const marker of [
    'dailyChallenges',
    'challenge.id',
    'Desafio Diário',
    'Responda ao seu desafio diário',
    'Seu desafio diário está disponível',
    'onOpenChallenge',
    'Target',
    'pointer-events-none absolute -right-10 -top-12',
    'rounded-[28px]',
    'bg-[#0F2942]',
  ]) {
    assert.match(component, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing literal marker ${marker}`);
  }

  assert.match(component, /onClick=\{\(\) => onOpenChallenge\(challenge\)\}/);
  assert.match(page, /import \{ DashboardChallengeSection \} from ['"]\.\/components\/DashboardChallengeSection['"]/);
  assert.match(page, /<DashboardChallengeSection\b/);
  assert.match(page, /dailyChallenges=\{dailyChallenges\}/);
  assert.match(page, /onOpenChallenge=\{openChallengeModal\}/);
  assert.doesNotMatch(page, /dailyChallenges\.map\(\(challenge\) =>/);
});
