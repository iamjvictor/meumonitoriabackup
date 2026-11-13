import { describe, expect, it } from 'vitest';
import { validateQuestionReviewDraft } from '@/modules/teacher/services/question-review-validation';

const completeDraft = {
  prompt: 'Enunciado da questão',
  options: ['A', 'B', 'C', 'D', 'E'].map((letter) => ({ letter, text: `Alternativa ${letter}` })),
  correctAnswer: 'A',
};

describe('validateQuestionReviewDraft', () => {
  it('returns field errors for a blank prompt, empty alternatives and an invalid answer key', () => {
    const errors = validateQuestionReviewDraft({
      ...completeDraft,
      prompt: '   ',
      options: completeDraft.options.map((option) => option.letter === 'C' ? { ...option, text: '' } : option),
      correctAnswer: 'Z',
    });

    expect(errors).not.toBeNull();
    expect(errors?.prompt).toMatch(/enunciado/i);
    expect(errors?.alternatives).toMatch(/alternativas/i);
    expect(errors?.options.C).toMatch(/alternativa C/i);
    expect(errors?.correctAnswer).toMatch(/gabarito|alternativa/i);
  });

  it('reports a missing option label and an answer key that points to an empty option', () => {
    const errors = validateQuestionReviewDraft({
      ...completeDraft,
      options: completeDraft.options.filter((option) => option.letter !== 'E')
        .map((option) => option.letter === 'A' ? { ...option, text: ' ' } : option),
      correctAnswer: 'A',
    });

    expect(errors?.options.E).toMatch(/alternativa E/i);
    expect(errors?.options.A).toMatch(/alternativa A/i);
    expect(errors?.correctAnswer).toMatch(/gabarito|alternativa/i);
  });

  it('accepts a complete question without an explanation', () => {
    expect(validateQuestionReviewDraft(completeDraft)).toBeNull();
  });
});
