import { MonitorRepository } from '../../../repositories/monitor.repository.js';

type RecoverableRun = { id: string; attempts: number };
type RecoveryRepository = { findRecoverableQuestionBankMaterializationRuns(): Promise<RecoverableRun[]> };
type Enqueuer = { enqueue(runId: string, generation?: number): Promise<unknown> };

export class QuestionBankMaterializationRecoveryService {
  constructor(
    private readonly repository: RecoveryRepository = new MonitorRepository(),
    private readonly enqueuer: Enqueuer = {
      async enqueue(runId, generation) {
        const { enqueueQuestionBankMaterialization } = await import('../../../queues/question-bank-materialization.queue.js');
        return enqueueQuestionBankMaterialization(runId, generation);
      },
    },
  ) {}

  async recover() {
    const runs = await this.repository.findRecoverableQuestionBankMaterializationRuns();
    let enqueued = 0;
    for (const run of runs) {
      try {
        await this.enqueuer.enqueue(run.id, Math.floor(run.attempts / 3));
        enqueued += 1;
      } catch (error) {
        console.error('Não foi possível recuperar execução de materialização', {
          event: 'question_bank.materialization_recovery_enqueue_failed',
          runId: run.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { found: runs.length, enqueued };
  }
}
