import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DashboardStudyActions } from '../../src/modules/student/components/dashboard/DashboardStudyActions';
import { DashboardDailyChallenges } from '../../src/modules/student/components/dashboard/DashboardDailyChallenges';
import { DailyChallengeModal } from '../../src/app/(student-app)/areadoaluno/components/DailyChallengeModal';
import { FlashcardReviewModal } from '../../src/app/(student-app)/areadoaluno/components/FlashcardReviewModal';

vi.mock('../../src/modules/student/hooks/useDailyChallenges', () => ({
  useDailyChallenges: () => ({ dailyChallenges: [], loading: false }),
}));

describe('student critical states', () => {
  it('renders dashboard study actions with accessible navigation targets', () => {
    render(<DashboardStudyActions />);

    expect(screen.getByRole('heading', { name: 'O que você quer fazer?' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Praticar Questões/i })).toHaveAttribute('href', '/areadoaluno/pratica');
    expect(screen.getByRole('link', { name: /Flashcards/i })).toBeVisible();
  });

  it('keeps the daily challenge dashboard empty when the API returns no challenges', () => {
    render(<DashboardDailyChallenges />);

    expect(screen.queryByText('Desafio Diário')).not.toBeInTheDocument();
  });

  it('supports selecting and confirming a daily challenge answer', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    const setSelection = vi.fn();
    const props = {
      isChallengeModalOpen: true,
      dailyChallenge: { id: 'challenge-1', question: { text: 'Quanto é 2 + 2?', alternatives: [] } },
      challengeResult: null,
      challengeAlternatives: [{ label: 'A', text: '3' }, { label: 'B', text: '4' }],
      isSubmittingChallenge: false,
      setSelectedChallengeAnswer: setSelection,
      submitChallengeAnswer: submit,
      onClose: vi.fn(),
    };
    render(
      <DailyChallengeModal
        {...props}
        selectedChallengeAnswer={null}
      />,
    );

    expect(screen.getByRole('button', { name: /Confirmar resposta/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /B.*4/i }));
    expect(setSelection).toHaveBeenCalledWith('B');
  });

  it('shows loading, flips a flashcard, and exposes review actions', async () => {
    const user = userEvent.setup();
    const setFlipped = vi.fn();
    const review = vi.fn();
    const { rerender } = render(
      <FlashcardReviewModal
        isFlashcardModalOpen
        currentFlashcard={null}
        isLoadingFlashcard
        isFlipped={false}
        setIsFlipped={setFlipped}
        hasReviewedCard={false}
        isSubmittingReview={false}
        handleNextFlashcard={vi.fn()}
        handleReviewFlashcard={review}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Buscando flashcard...')).toBeVisible();

    rerender(
      <FlashcardReviewModal
        isFlashcardModalOpen
        currentFlashcard={{ subject: 'Matemática', question: '2 + 2?', answer: '4' }}
        isLoadingFlashcard={false}
        isFlipped={false}
        setIsFlipped={setFlipped}
        hasReviewedCard={false}
        isSubmittingReview={false}
        handleNextFlashcard={vi.fn()}
        handleReviewFlashcard={review}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Virar para Ver Resposta/i }));
    expect(setFlipped).toHaveBeenCalledWith(true);
  });
});
