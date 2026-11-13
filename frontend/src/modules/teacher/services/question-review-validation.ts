export type QuestionReviewDraft = {
  prompt: string;
  options: Array<{ letter: string; text: string }>;
  correctAnswer: string;
};

export type QuestionReviewValidationErrors = {
  prompt?: string;
  alternatives?: string;
  options: Record<string, string>;
  correctAnswer?: string;
};

const REQUIRED_OPTION_LABELS = ['A', 'B', 'C', 'D', 'E'] as const;

export function validateQuestionReviewDraft(draft: QuestionReviewDraft): QuestionReviewValidationErrors | null {
  const errors: QuestionReviewValidationErrors = { options: {} };

  if (!draft.prompt.trim()) {
    errors.prompt = 'Digite o enunciado da questão.';
  }

  if (draft.options.length !== REQUIRED_OPTION_LABELS.length) {
    errors.alternatives = 'Preencha as cinco alternativas, de A a E.';
  }

  for (const label of REQUIRED_OPTION_LABELS) {
    const matches = draft.options.filter((option) => option.letter === label);
    if (matches.length !== 1 || !matches[0]?.text.trim()) {
      errors.options[label] = `Preencha a alternativa ${label}.`;
      errors.alternatives ??= 'Preencha as cinco alternativas, de A a E.';
    }
  }

  const correctOption = draft.options.find((option) => option.letter === draft.correctAnswer);
  if (!correctOption?.text.trim()) {
    errors.correctAnswer = 'Selecione como gabarito uma alternativa preenchida.';
  }

  return errors.prompt || errors.alternatives || Object.keys(errors.options).length || errors.correctAnswer
    ? errors
    : null;
}

export function getQuestionReviewValidationMessage(errors: QuestionReviewValidationErrors): string {
  return [errors.prompt, errors.alternatives, ...Object.values(errors.options), errors.correctAnswer]
    .filter((message): message is string => Boolean(message))
    .join(' ');
}
