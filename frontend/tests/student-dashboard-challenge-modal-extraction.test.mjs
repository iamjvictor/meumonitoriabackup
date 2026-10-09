import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const routeRoot = 'src/app/(student-app)/areadoaluno';
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');

test('daily challenge modal is extracted without losing its original UI contract', () => {
  const component = read(`${routeRoot}/components/DailyChallengeModal.tsx`);
  const page = read(`${routeRoot}/page.tsx`);

  for (const marker of [
    'isChallengeModalOpen',
    'Responda à questão de hoje',
    'Desafio diário',
    'challengeAlternatives',
    'Resposta correta!',
    'Resposta incorreta.',
    'Confirmar resposta',
    'Registrando resposta...',
    'backdrop-blur-md',
    'rounded-[28px]',
  ]) {
    assert.match(component, new RegExp(marker.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')), `missing literal marker ${marker}`);
  }

  for (const prop of [
    'dailyChallenge',
    'challengeResult',
    'challengeAlternatives',
    'selectedChallengeAnswer',
    'isSubmittingChallenge',
    'setSelectedChallengeAnswer',
    'submitChallengeAnswer',
    'onClose',
  ]) {
    assert.match(component, new RegExp(`\\b${prop}\\b`), `missing modal prop ${prop}`);
  }

  assert.match(page, /dynamic\(\s*\(\) => import\(['"]\.\/components\/DailyChallengeModal/);
  assert.match(page, /<DailyChallengeModal\b/);
  assert.match(page, /dailyChallenge=\{dailyChallenge\}/);
  assert.match(page, /challengeResult=\{challengeResult\}/);
  assert.doesNotMatch(page, /\{isChallengeModalOpen && dailyChallenge && \(/);
});
