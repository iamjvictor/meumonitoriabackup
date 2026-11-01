import { normalizeQuestionBankSelection } from './question-bank-selection.service.js';
import { QuestionBankMaterializationService, type MaterializationProgress } from './question-bank-materialization.service.js';
import { MonitorRepository } from '../../../repositories/monitor.repository.js';

type RunStatus = 'QUEUED' | 'PROCESSING' | 'RETRYING' | 'COMPLETED' | 'COMPLETED_WITH_WARNINGS' | 'FAILED';
type Work = {
  id: string;
  status: RunStatus;
  monitor: {
    id: string;
    teacherId: string;
    subjects: Array<{
      id: string;
      name: string;
      topics: Array<{
        id: string;
        name: string;
        questionBankSelections: Array<{
          monitorSubtopicId: string | null;
          monitorSubsubtopicId: string | null;
          examType: string;
          board: string | null;
          subtopic: string | null;
          subsubtopic: string | null;
        }>;
      }>;
    }>;
  };
};

export type QuestionBankMaterializationWorkerRepository = {
  findQuestionBankMaterializationWork(runId: string): Promise<Work | null>;
  markQuestionBankMaterializationProcessing(runId: string): Promise<{ count: number }>;
  updateQuestionBankMaterializationProgress(runId: string, progress: MaterializationProgress): Promise<unknown>;
  finishQuestionBankMaterialization(runId: string, data: {
    status: 'COMPLETED' | 'COMPLETED_WITH_WARNINGS' | 'FAILED';
    processed?: number; created?: number; updated?: number; skipped?: number; failed?: number; errorMessage?: string | null;
  }): Promise<unknown>;
  markQuestionBankMaterializationRetrying(runId: string, errorMessage: string): Promise<unknown>;
};

export class QuestionBankMaterializationWorkerService {
  constructor(
    private readonly repository: QuestionBankMaterializationWorkerRepository = new MonitorRepository(),
    private readonly materializer: QuestionBankMaterializationService = new QuestionBankMaterializationService(),
  ) {}

  async process(runId: string, attemptsMade: number, maxAttempts: number) {
    const run = await this.repository.findQuestionBankMaterializationWork(runId);
    if (!run || ['COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED'].includes(run.status)) return;

    const claimed = await this.repository.markQuestionBankMaterializationProcessing(runId);
    if (claimed.count !== 1) return;

    const selections = run.monitor.subjects.flatMap((subject) => subject.topics.flatMap((topic) => topic.questionBankSelections.map((selection) => {
      const [topicName] = topic.name.split(' > ');
      return {
        monitorTopicId: topic.id,
        monitorSubjectId: subject.id,
        monitorSubtopicId: selection.monitorSubtopicId,
        monitorSubsubtopicId: selection.monitorSubsubtopicId,
        selection: normalizeQuestionBankSelection({
          subject: subject.name,
          topic: topicName ?? topic.name,
          examType: selection.examType,
          board: selection.board,
          subtopic: selection.subtopic,
          subsubtopic: selection.subsubtopic,
        }),
      };
    })));

    try {
      const result = await this.materializer.materialize({
        teacherId: run.monitor.teacherId,
        monitorId: run.monitor.id,
        selections,
      }, async (progress) => { await this.repository.updateQuestionBankMaterializationProgress(runId, progress); });
      const failed = result.failures.filter(({ reason }) => reason.startsWith('QUESTION_MATERIALIZATION_FAILED')).length;
      const status = result.failures.length > 0 ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED';
      await this.repository.finishQuestionBankMaterialization(runId, {
        status,
        processed: result.processed,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped - failed,
        failed,
        errorMessage: result.failures.length ? `${result.failures.length} questão(ões) não foram importadas.` : null,
      });
      return { status, processed: result.processed };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attemptsMade < maxAttempts) await this.repository.markQuestionBankMaterializationRetrying(runId, message);
      else await this.repository.finishQuestionBankMaterialization(runId, { status: 'FAILED', errorMessage: message });
      throw error;
    }
  }
}
