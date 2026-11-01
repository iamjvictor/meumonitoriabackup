import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { QUESTION_BANK_MATERIALIZATION_JOB_OPTIONS, questionBankMaterializationJobId } from './question-bank-materialization.queue-options.js';

export const QUESTION_BANK_MATERIALIZATION_QUEUE_NAME = 'monitor-question-bank-materialization';
export type QuestionBankMaterializationJob = { runId: string };

export const questionBankMaterializationQueueConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
export const questionBankMaterializationQueue = new Queue<QuestionBankMaterializationJob>(QUESTION_BANK_MATERIALIZATION_QUEUE_NAME, {
  connection: questionBankMaterializationQueueConnection,
  defaultJobOptions: QUESTION_BANK_MATERIALIZATION_JOB_OPTIONS,
});

export async function enqueueQuestionBankMaterialization(runId: string, generation = 0) {
  return questionBankMaterializationQueue.add('materialize', { runId }, {
    jobId: questionBankMaterializationJobId(runId, generation),
    ...QUESTION_BANK_MATERIALIZATION_JOB_OPTIONS,
  });
}

export async function closeQuestionBankMaterializationQueue() {
  await questionBankMaterializationQueue.close();
  await questionBankMaterializationQueueConnection.quit();
}
