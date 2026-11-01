export const QUESTION_BANK_MATERIALIZATION_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: true,
  removeOnFail: true,
};

export function questionBankMaterializationJobId(runId: string, generation = 0) {
  return `question-bank-materialization-${runId}-${generation}`;
}
