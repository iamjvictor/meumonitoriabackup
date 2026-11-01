import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { aiModels } from '../config/ai-models.config.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { DocumentRepository } from '../repositories/document.repository.js';
import { KnowledgeRetrievalService } from '../services/knowledge-retrieval.service.js';
import { ChatRagService } from '../modules/chat/rag/services/chat-rag.service.js';
import { KnowledgeRetrievalChatProvider } from '../modules/chat/rag/providers/knowledge-retrieval-chat.provider.js';
import { OpenRouterChatGateway } from '../modules/chat/providers/openrouter-chat.gateway.js';
import { OpenRouterClient } from '../worker/client/openrouter.client.js';
import { DocumentWorkerService } from '../worker/services/document-worker.service.js';

type Args = { file?: string; monitorId?: string; subjectId?: string; question?: string; existingDocumentId?: string; confirmLive: boolean; allowProduction: boolean };
const TEST_PDF_PATH = resolve('../test/mineru-spike/razao-proporcao-sample-pages.pdf');

function parseArgs(argv: string[]): Args {
  const args: Args = { confirmLive: false, allowProduction: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--confirm-live-upload') args.confirmLive = true;
    else if (value === '--allow-production') args.allowProduction = true;
    else if (value && ['--file', '--monitor-id', '--subject-id', '--question', '--existing-document-id'].includes(value)) {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) throw new Error(`Informe um valor após ${value}.`);
      if (value === '--file') args.file = next;
      if (value === '--monitor-id') args.monitorId = next;
      if (value === '--subject-id') args.subjectId = next;
      if (value === '--question') args.question = next;
      if (value === '--existing-document-id') args.existingDocumentId = next;
      index += 1;
    } else if (value === '--help' || value === '-h') {
      console.log(`PDF de teste configurado no script: ${TEST_PDF_PATH}\n\nUso:\n  npm run test:knowledge-upload-rag -- --monitor-id <uuid> --subject-id <uuid> --question <pergunta> --confirm-live-upload [--allow-production] [--existing-document-id <uuid>]\n\nO comando faz upload real, processa/gera embeddings e chama o serviço de IA. O documento permanece salvo. Em NODE_ENV=production, --allow-production também é obrigatório.`);
      process.exit(0);
    } else throw new Error(`Argumento desconhecido: ${value}`);
  }
  return args;
}

function required(value: string | undefined, flag: string) {
  if (!value?.trim()) throw new Error(`Argumento obrigatório ausente: ${flag}`);
  return value.trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.confirmLive) throw new Error('Upload real bloqueado. Inclua --confirm-live-upload para confirmar persistência e chamadas pagas de IA.');
  if (env.NODE_ENV === 'production' && !args.allowProduction) throw new Error('NODE_ENV=production. Revise o destino e inclua --allow-production para autorizar a execução nesse ambiente.');

  const filePath = args.file ? resolve(args.file) : TEST_PDF_PATH;
  const monitorId = required(args.monitorId, '--monitor-id');
  const subjectId = required(args.subjectId, '--subject-id');
  const question = required(args.question, '--question');
  const fileBuffer = await readFile(filePath);
  if (fileBuffer.length > 5 * 1024 * 1024) throw new Error(`Arquivo excede o limite de 5 MB (${fileBuffer.length} bytes).`);
  if (fileBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('O arquivo informado não parece ser um PDF.');

  const monitor = await prisma.monitor.findFirst({
    where: { id: monitorId, subjects: { some: { id: subjectId } } },
    select: {
      id: true, name: true, status: true,
      teacher: { select: { id: true, userId: true } },
      subjects: { where: { id: subjectId }, select: { id: true, name: true } },
    },
  });
  if (!monitor || monitor.subjects.length === 0) throw new Error('Monitor/matéria não encontrados ou não relacionados.');
  const subject = monitor.subjects[0]!;

  let documentId: string;
  console.log('Destino validado', {
    environment: env.NODE_ENV,
    monitor: monitor.name,
    monitorId: monitor.id,
    monitorStatus: monitor.status,
    subject: subject.name,
    subjectId,
    file: filePath,
    fileBytes: fileBuffer.length,
    question,
    willPersistDocument: true,
    willCallPaidAi: true,
    existingDocumentId: args.existingDocumentId ?? null,
  });

  if (args.existingDocumentId) {
    const existing = await prisma.monitorDocument.findFirst({
      where: { id: args.existingDocumentId, monitorId, subjectId, tag: 'KNOWLEDGE_BASE' },
      select: { id: true, status: true },
    });
    if (!existing) throw new Error('Documento existente não encontrado neste monitor/matéria como base de conhecimento.');
    documentId = existing.id;
    console.log('Reutilizando documento já enviado', { documentId, previousStatus: existing.status });
  } else {
    const uploadStartedAt = Date.now();
    const uploaded = await new DocumentRepository().save(monitor.teacher.userId, monitor.id, {
      subjectId,
      tag: 'knowledge',
    }, {
      buffer: fileBuffer,
      originalName: filePath.split(/[\\/]/).at(-1) ?? 'knowledge.pdf',
      mimeType: 'application/pdf',
      sizeBytes: fileBuffer.length,
    });
    if (uploaded.kind !== 'CREATED') throw new Error('Upload recusado: escopo de monitor/matéria não autorizado para o professor.');
    documentId = uploaded.document.id;
    console.log('Upload concluído', { documentId, status: uploaded.document.status, elapsedMs: Date.now() - uploadStartedAt });
  }

  const processingStartedAt = Date.now();
  const processingResult = await new DocumentWorkerService().process(documentId);
  const persisted = await prisma.monitorDocument.findUnique({
    where: { id: documentId },
    select: { status: true, errorMessage: true, topicId: true, _count: { select: { chunks: true, blocks: true } } },
  });
  console.log('Processamento concluído', {
    workerResult: processingResult,
    status: persisted?.status,
    errorMessage: persisted?.errorMessage,
    topicId: persisted?.topicId,
    chunkCount: persisted?._count.chunks,
    blockCount: persisted?._count.blocks,
    elapsedMs: Date.now() - processingStartedAt,
  });
  if (!persisted || !['READY', 'PARTIAL_SUCCESS'].includes(persisted.status) || persisted._count.chunks === 0) {
    throw new Error('Documento não ficou pronto com chunks; interrompendo antes da chamada de geração do chat.');
  }

  const client = new OpenRouterClient();
  const rag = new ChatRagService(new KnowledgeRetrievalChatProvider(client, new KnowledgeRetrievalService()));
  const ragStartedAt = Date.now();
  const enriched = await rag.enrich({
    message: question,
    history: [],
    questionContext: null,
    studentId: monitor.teacher.userId,
    teacherId: monitor.teacher.id,
    monitorId: monitor.id,
    subjectId,
    topicId: null,
  });
  console.log('RAG concluído', {
    retrievalQuery: enriched.result.retrievalQuery,
    used: enriched.result.used,
    citationCount: enriched.result.citations.length,
    citations: enriched.result.citations.map(({ documentId, pageStart, pageEnd, score, content }) => ({
      documentId, pageStart, pageEnd, score, excerpt: content.slice(0, 360),
    })),
    contextChars: enriched.context.length,
    elapsedMs: Date.now() - ragStartedAt,
  });
  if (!enriched.result.used || enriched.result.citations.length === 0) throw new Error('RAG não recuperou evidências; interrompendo antes da geração da resposta.');

  const generationStartedAt = Date.now();
  const gateway = new OpenRouterChatGateway(client, undefined, {
    model: aiModels.chat,
    maxTokens: aiModels.chatMaxTokens,
    temperature: aiModels.chatTemperature,
    timeoutMs: aiModels.chatTimeoutMs,
  });
  const response = await gateway.generate({
    message: question,
    history: [],
    questionContext: null,
    ragContext: enriched.context,
    monitorId: monitor.id,
    subjectId,
  });
  console.log('Resposta gerada', { model: aiModels.chat, elapsedMs: Date.now() - generationStartedAt, response: response.content });
  console.log('Teste finalizado. O documento permanece salvo para inspeção na interface.', { documentId });
}

main()
  .catch((error: unknown) => {
    console.error('Falha no teste de upload + RAG:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
