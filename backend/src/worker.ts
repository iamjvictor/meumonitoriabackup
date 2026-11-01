import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { DOCUMENT_QUEUE_NAME, type DocumentJob } from './queues/document.queue.js';
import { markDocumentFailed } from './repositories/document-worker.repository.js';
import { DocumentWorkerService } from './worker/services/document-worker.service.js';
import { startDailyChallengeScheduler } from './modules/daily_challgens/services/daily-challenge-scheduler.service.js';
import { WEEKLY_SIMULATION_QUEUE_NAME, type WeeklySimulationJob } from './queues/weekly-simulation.queue.js';
import { WeeklySimulationWorkerService } from './modules/weekly-simulations/services/weekly-simulation-worker.service.js';
import { PAYMENT_WEBHOOK_QUEUE_NAME, paymentWebhookQueueConnection, type PaymentWebhookJob } from './modules/payments/jobs/payment-webhook.queue.js';
import { PrismaPaymentWebhookRepository } from './modules/payments/infrastructure/persistence/prisma-webhook.repository.js';
import { ProcessPaymentWebhookUseCase } from './modules/payments/application/commands/process-webhook.use-case.js';
import { PaymentWebhookRecoveryJob } from './modules/payments/jobs/payment-recovery.job.js';
import { PaymentAccountRepository } from './modules/payments/infrastructure/persistence/payment-account.repository.js';
import { PaymentEventRepository } from './modules/payments/infrastructure/persistence/payment-event.repository.js';
import { startWorkerHeartbeat } from './health/worker-health.js';
import { loadQuestionGenerationEnumState } from './worker/services/worker-database-bootstrap.js';
import { createQueueWorkerOptions } from './worker/worker-options.js';
import { QUESTION_BANK_MATERIALIZATION_QUEUE_NAME, questionBankMaterializationQueueConnection, type QuestionBankMaterializationJob, closeQuestionBankMaterializationQueue } from './queues/question-bank-materialization.queue.js';
import { QuestionBankMaterializationWorkerService } from './modules/question-bank/services/question-bank-materialization-worker.service.js';
import { QuestionBankMaterializationRecoveryService } from './modules/question-bank/services/question-bank-materialization-recovery.service.js';
import { claimDocumentProcessingStallEvent, listProcessingJobsForStageWatchdog } from './repositories/document-processing-job.repository.js';
import { DocumentProcessingStageWatchdog } from './worker/services/document-processing-stage-watchdog.service.js';
import { createPaymentAccountModule } from './modules/payments/payments-account.module.js';
import { ChatImageCleanupService } from './modules/chat/services/chat-image-cleanup.service.js';

const questionGenerationEnumState = await loadQuestionGenerationEnumState(() => prisma.$queryRaw<Array<{ hasCorrection: boolean; hasNormalization: boolean }>>`
  SELECT EXISTS (
    SELECT 1
    FROM pg_enum enum_value
    JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
    WHERE enum_type.typname = 'QuestionAiGenerationType'
      AND enum_value.enumlabel = 'CORRECTION'
  ) AS "hasCorrection",
  EXISTS (
    SELECT 1
    FROM pg_enum enum_value
    JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
    WHERE enum_type.typname = 'QuestionAiGenerationType'
      AND enum_value.enumlabel = 'NORMALIZATION'
  ) AS "hasNormalization"
`);

if (!questionGenerationEnumState?.hasCorrection || !questionGenerationEnumState.hasNormalization) {
  throw new Error('Migration obrigatoria ausente: QuestionAiGenerationType.CORRECTION/NORMALIZATION. Execute npx prisma migrate deploy antes de iniciar o worker.');
}

const redisConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const stopWorkerHeartbeat = startWorkerHeartbeat(redisConnection);
const workerService = new DocumentWorkerService();
const chatImageCleanup = new ChatImageCleanupService();
const cleanExpiredChatImages = () => {
  void chatImageCleanup.deleteExpired().catch((error) => console.error('Falha na limpeza de imagens temporárias do chat', {
    event: 'chat.image_attachments_cleanup_failed', errorType: error instanceof Error ? error.name : 'UnknownError',
  }));
};
const chatImageCleanupTimer = setInterval(cleanExpiredChatImages, 60 * 60 * 1000);
cleanExpiredChatImages();
const documentStageWatchdog = new DocumentProcessingStageWatchdog({
  listProcessingJobs: listProcessingJobsForStageWatchdog,
  claimStallEvent: claimDocumentProcessingStallEvent,
  emit: (event) => console.warn('Etapa de processamento sem evento terminal', event),
});
const documentStageWatchdogTimer = setInterval(() => {
  void documentStageWatchdog.scan().catch((error) => console.error('Falha no watchdog de etapas de documentos', {
    event: 'document_stage.watchdog_failed', error: error instanceof Error ? error.message : 'unknown',
  }));
}, 30_000);
const dailyChallengeScheduler = startDailyChallengeScheduler();
const weeklySimulationWorkerService = new WeeklySimulationWorkerService();
const paymentWebhookRepository = new PrismaPaymentWebhookRepository(env.ASAAS_ENV.toUpperCase());
const paymentWebhookRecovery = new PaymentWebhookRecoveryJob(paymentWebhookRepository);
const paymentAccountRepository = new PaymentAccountRepository();
const paymentEventRepository = new PaymentEventRepository();
const processPaymentWebhookWithAccounts = new ProcessPaymentWebhookUseCase(paymentWebhookRepository, paymentAccountRepository, paymentEventRepository);
const paymentAccountWebhookSyncRecovery = createPaymentAccountModule().syncAccountWebhook;
const recoverPaymentAccountWebhooks = () => {
  void paymentAccountRepository.markStaleSubaccountCreations().catch((error) => {
    console.error('Falha ao verificar criações de subconta incompletas', {
      event: 'payments.asaas_subaccount_creation_recovery_failed',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
  });
  void paymentAccountWebhookSyncRecovery.recoverPending(env.ASAAS_ENV.toUpperCase()).catch((error) => {
    console.error('Falha ao consultar sincronizações pendentes de webhook das subcontas', {
      event: 'payments.asaas_subaccount_webhook_sync_recovery_failed',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
  });
};
const paymentAccountWebhookSyncTimer = setInterval(recoverPaymentAccountWebhooks, 60_000);
recoverPaymentAccountWebhooks();
const questionBankMaterializationWorkerService = new QuestionBankMaterializationWorkerService();
const questionBankMaterializationRecovery = new QuestionBankMaterializationRecoveryService();
const recoverQuestionBankMaterializations = () => {
  void questionBankMaterializationRecovery.recover().catch((error) => {
    console.error('Falha ao consultar materializações pendentes', {
      event: 'question_bank.materialization_recovery_failed',
      error: error instanceof Error ? error.message : String(error),
    });
  });
};
const recoverPaymentWebhooks = () => {
  void paymentWebhookRecovery.run().catch((error) => {
    console.error('Falha ao consultar webhooks pendentes de recuperação', {
      event: 'payments.webhook_recovery_job_failed',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
  });
};
const paymentWebhookRecoveryTimer = setInterval(recoverPaymentWebhooks, 60_000);
recoverPaymentWebhooks();
const questionBankMaterializationRecoveryTimer = setInterval(recoverQuestionBankMaterializations, 30_000);
recoverQuestionBankMaterializations();

const worker = new Worker<DocumentJob>(
  DOCUMENT_QUEUE_NAME,
  async (job) => workerService.process(job.data.documentId, {
    jobId: job.id,
    attempt: job.attemptsMade + 1,
  }),
  createQueueWorkerOptions(redisConnection, 2),
);

const weeklySimulationWorker = new Worker<WeeklySimulationJob>(
  WEEKLY_SIMULATION_QUEUE_NAME,
  async (job) => weeklySimulationWorkerService.process(job.data.simulationId),
  createQueueWorkerOptions(redisConnection, 2),
);

const paymentWebhookWorker = new Worker<PaymentWebhookJob>(
  PAYMENT_WEBHOOK_QUEUE_NAME,
  async (job) => processPaymentWebhookWithAccounts.execute(job.data.eventId),
  createQueueWorkerOptions(paymentWebhookQueueConnection, 4),
);

const questionBankMaterializationWorker = new Worker<QuestionBankMaterializationJob>(
  QUESTION_BANK_MATERIALIZATION_QUEUE_NAME,
  async (job) => questionBankMaterializationWorkerService.process(
    job.data.runId,
    job.attemptsMade + 1,
    job.opts.attempts ?? 3,
  ),
  createQueueWorkerOptions(questionBankMaterializationQueueConnection, 2),
);

weeklySimulationWorker.on('active', (job) => console.info('[weekly-simulation]', { event: 'weekly_simulation.worker_job_active', jobId: job.id, simulationId: job.data.simulationId }));
weeklySimulationWorker.on('stalled', (jobId) => console.warn('[weekly-simulation]', { event: 'weekly_simulation.worker_job_stalled', jobId }));

worker.on('ready', () => {
  console.log('Worker de documentos conectado ao Redis', {
    event: 'monitor.document_worker_ready',
    queue: DOCUMENT_QUEUE_NAME,
    concurrency: 2,
  });
});

worker.on('completed', (job) => {
  console.log('Job de documento concluido', {
    event: 'monitor.document_job_completed',
    jobId: job.id,
    documentId: job.data.documentId,
  });
});

worker.on('failed', (job, error) => {
  console.log('Job de documento falhou', {
    event: 'monitor.document_job_failed',
    jobId: job?.id,
    documentId: job?.data.documentId,
    attemptsMade: job?.attemptsMade,
    error,
  });

  if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
    void markDocumentFailed(job.data.documentId, error.message);
  }
});

worker.on('error', (error) => {
  console.log('Erro no worker de documentos', { event: 'monitor.document_worker_error', error });
});

weeklySimulationWorker.on('ready', () => {
  console.log('Worker de simulados semanais conectado ao Redis', { event: 'monitor.weekly_simulation_worker_ready', queue: WEEKLY_SIMULATION_QUEUE_NAME, concurrency: 2 });
});

weeklySimulationWorker.on('completed', (job) => {
  console.log('Job de simulado semanal concluído', { event: 'monitor.weekly_simulation_job_completed', jobId: job.id, simulationId: job.data.simulationId });
});

weeklySimulationWorker.on('failed', (job, error) => {
  console.log('Job de simulado semanal falhou', { event: 'monitor.weekly_simulation_job_failed', jobId: job?.id, simulationId: job?.data.simulationId, attemptsMade: job?.attemptsMade, error: error.message });
});

weeklySimulationWorker.on('error', (error) => {
  console.log('Erro no worker de simulados semanais', { event: 'monitor.weekly_simulation_worker_error', error: error.message });
});

paymentWebhookWorker.on('ready', () => console.log('Worker de webhooks de pagamentos conectado ao Redis', { event: 'payments.webhook_worker_ready', queue: PAYMENT_WEBHOOK_QUEUE_NAME }));
paymentWebhookWorker.on('active', (job) => console.log('Job de webhook Asaas iniciado', { event: 'payments.webhook_job_active', jobId: job.id, eventId: job.data.eventId }));
paymentWebhookWorker.on('completed', (job, result) => console.log('Job de webhook Asaas concluído', { event: 'payments.webhook_job_completed', jobId: job.id, eventId: job.data.eventId, result }));
paymentWebhookWorker.on('failed', (job, error) => console.error('Falha no processamento de webhook de pagamento', { event: 'payments.webhook_job_failed', jobId: job?.id, eventId: job?.data.eventId, errorType: error.name }));

questionBankMaterializationWorker.on('active', (job) => console.info('Importação do acervo iniciada', { event: 'question_bank.materialization_worker_started', jobId: job.id, runId: job.data.runId, attemptsMade: job.attemptsMade }));
questionBankMaterializationWorker.on('completed', (job, result) => console.info('Importação do acervo finalizada', { event: 'question_bank.materialization_worker_completed', jobId: job.id, runId: job.data.runId, result }));
questionBankMaterializationWorker.on('failed', (job, error) => console.error('Falha na tentativa de importação do acervo', { event: 'question_bank.materialization_worker_failed', jobId: job?.id, runId: job?.data.runId, attemptsMade: job?.attemptsMade, error: error.message }));

const shutdown = async (signal: string) => {
  console.log('Encerramento do worker solicitado', { event: 'monitor.document_worker_shutdown', signal });
  stopWorkerHeartbeat();
  dailyChallengeScheduler.stop();
  clearInterval(paymentWebhookRecoveryTimer);
  clearInterval(paymentAccountWebhookSyncTimer);
  clearInterval(questionBankMaterializationRecoveryTimer);
  clearInterval(documentStageWatchdogTimer);
  clearInterval(chatImageCleanupTimer);
  await worker.close();
  await weeklySimulationWorker.close();
  await paymentWebhookWorker.close();
  await questionBankMaterializationWorker.close();
  await closeQuestionBankMaterializationQueue();
  await redisConnection.quit();
  await prisma.$disconnect();
  process.exit(0);
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
