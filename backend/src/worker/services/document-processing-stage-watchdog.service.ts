export type ProcessingStageJob = {
  id: string;
  documentId: string;
  attempts: number;
  inputSnapshot: unknown;
};

export type StageWatchdogDependencies = {
  listProcessingJobs: () => Promise<ProcessingStageJob[]>;
  claimStallEvent?: (job: ProcessingStageJob, key: string) => Promise<boolean>;
  emit: (event: Record<string, unknown>) => void;
  now?: () => number;
  graceMs?: number;
};

export class DocumentProcessingStageWatchdog {
  private readonly emitted = new Set<string>();
  private readonly now: () => number;

  constructor(private readonly dependencies: StageWatchdogDependencies) {
    this.now = dependencies.now ?? Date.now;
  }

  async scan() {
    const jobs = await this.dependencies.listProcessingJobs();
    for (const job of jobs) {
      const snapshot = asRecord(job.inputSnapshot);
      const stage = snapshot?.currentStage;
      const requestId = snapshot?.requestId;
      const stageStartedAt = snapshot?.stageStartedAt;
      const timeoutMs = snapshot?.timeoutMs;
      if (typeof stage !== 'string' || typeof stageStartedAt !== 'string' || typeof timeoutMs !== 'number') continue;
      const elapsedMs = this.now() - Date.parse(stageStartedAt);
      if (!Number.isFinite(elapsedMs) || elapsedMs <= timeoutMs + (this.dependencies.graceMs ?? 30_000)) continue;
      const key = `${job.id}:${job.attempts}:${stage}`;
      if (this.emitted.has(key)) continue;
      if (this.dependencies.claimStallEvent && !(await this.dependencies.claimStallEvent(job, key))) {
        this.emitted.add(key);
        continue;
      }
      this.emitted.add(key);
      this.dependencies.emit({
        event: 'document_stage.stalled', timestamp: new Date(this.now()).toISOString(),
        service: 'worker', job_id: job.id, document_id: job.documentId,
        job_attempt: job.attempts, stage, request_id: typeof requestId === 'string' ? requestId : null,
        elapsed_ms: elapsedMs, timeout_ms: timeoutMs,
      });
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
