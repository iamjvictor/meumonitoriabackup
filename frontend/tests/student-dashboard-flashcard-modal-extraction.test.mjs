import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const routeRoot = 'src/app/(student-app)/areadoaluno';
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');

test('flashcard modal is extracted with the original UI contract and page connection', () => {
  const page = read(`${routeRoot}/page.tsx`);
  const modal = read(`${routeRoot}/components/FlashcardReviewModal.tsx`);

  assert.match(page, /FlashcardReviewModal/);
  assert.doesNotMatch(page, /\{isFlashcardModalOpen && \(/);

  for (const prop of [
    'isFlashcardModalOpen', 'currentFlashcard', 'isLoadingFlashcard', 'isFlipped',
    'setIsFlipped', 'hasReviewedCard', 'isSubmittingReview', 'handleNextFlashcard',
    'handleReviewFlashcard', 'onClose', 'onAskAi',
  ]) {
    assert.match(modal, new RegExp(`\\b${prop}\\b`), `missing modal prop/behavior ${prop}`);
  }

  for (const marker of [
    'Revisão Rápida', 'Buscando flashcard...', 'Nenhum flashcard disponível',
    'Virar para Ver Resposta', 'Gerar Próximo Flashcard', 'Como foi sua lembrança?',
    'Não lembrei', 'Foi difícil', 'Lembrei', 'Dominado', 'AGAIN', 'HARD', 'GOOD', 'EASY',
    'Tirar dúvida com IA', 'Flashcard',
  ]) {
    assert.ok(modal.includes(marker), `missing UI marker ${marker}`);
  }

  const reviewedBranch = modal.split('hasReviewedCard ?')[1]?.split(' : ')[0] ?? '';
  assert.match(reviewedBranch, /onAskAi && currentFlashcard\?\.id[\s\S]*Tirar dúvida com IA/, 'AI question button must be rendered after the review state is completed');

  for (const className of [
    'backdrop-blur-md', 'animate-fade-in', 'max-w-lg sm:max-w-xl md:max-w-2xl lg:max-w-3xl',
    'rounded-[28px]', '[perspective:1000px]', '[transform-style:preserve-3d]',
    'grid grid-cols-2 gap-2 sm:grid-cols-4',
  ]) {
    assert.ok(modal.includes(className), `missing original class ${className}`);
  }
});
