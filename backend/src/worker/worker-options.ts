export const WORKER_DRAIN_DELAY_SECONDS = 300;
export const PAYMENT_WORKER_STALLED_INTERVAL_MS = 5 * 60_000;
export const DEFAULT_WORKER_STALLED_INTERVAL_MS = 10 * 60_000;

export type QueueKind = 'documents' | 'weeklySimulation' | 'paymentWebhook' | 'questionBankMaterialization';

export function createQueueWorkerOptions<T>(connection: T, concurrency: number, queueKind: QueueKind) {
  return {
    connection,
    concurrency,
    drainDelay: WORKER_DRAIN_DELAY_SECONDS,
    stalledInterval: queueKind === 'paymentWebhook'
      ? PAYMENT_WORKER_STALLED_INTERVAL_MS
      : DEFAULT_WORKER_STALLED_INTERVAL_MS,
  };
}
