import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(resolve(root, 'backend/package.json'));
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { env } = await import('../backend/src/config/env.ts');
const { DOCUMENT_QUEUE_NAME, closeDocumentQueue } = await import('../backend/src/queues/document.queue.ts');
const { DocumentWorkerService } = await import('../backend/src/worker/services/document-worker.service.ts');
const { createQueueWorkerOptions } = await import('../backend/src/worker/worker-options.ts');
const { markDocumentFailed } = await import('../backend/src/repositories/document-worker.repository.ts');
const { startWorkerHeartbeat } = await import('../backend/src/health/worker-health.ts');
const { prisma } = await import('../backend/src/lib/prisma.ts');
if (process.env.QUESTION_EXTRACTION_LANGGRAPH_ENABLED !== 'true') throw new Error('LangGraph não está habilitado no ambiente.');
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const stopHeartbeat = startWorkerHeartbeat(connection);
const service = new DocumentWorkerService();
const worker = new Worker(DOCUMENT_QUEUE_NAME, (job) => service.process(job.data.documentId, { jobId: job.id, attempt: job.attemptsMade + 1 }), createQueueWorkerOptions(connection, 2));
worker.on('ready', () => console.log('Worker de documentos pronto; LangGraph habilitado.'));
worker.on('completed', (job) => console.log('Documento processado', { jobId: job.id, documentId: job.data.documentId }));
worker.on('failed', (job, error) => {
  console.error('Processamento de documento falhou', { jobId: job?.id, message: error.message });
  if (job && job.attemptsMade >= (job.opts.attempts || 1)) void markDocumentFailed(job.data.documentId, error.message);
});
worker.on('error', (error) => console.error('Erro no worker de documentos', { message: error.message }));
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  stopHeartbeat();
  await worker.close();
  await closeDocumentQueue();
  await connection.quit();
  await prisma.$disconnect();
}
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
