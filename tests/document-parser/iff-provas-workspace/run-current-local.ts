import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StructuredQuestionExtractionService } from '../../../backend/src/worker/services/structured-question-extraction.service.js';
import { countTokens } from '../../../backend/node_modules/gpt-tokenizer/esm/main.js';
import { aiModels } from '../../../backend/src/config/ai-models.config.js';
import { OpenRouterClient } from '../../../backend/src/worker/client/openrouter.client.js';

async function main() {

  const workspace = dirname(fileURLToPath(import.meta.url));
  const layoutPath = resolve(workspace, '../../..', 'dbtemp/artifacts/iff-full-current/docling/layout.json');
  const outputPath = resolve(workspace, '../../..', 'dbtemp/artifacts/iff-full-current/extraction.json');
  const layout = JSON.parse(await readFile(layoutPath, 'utf8')) as {
    pages: Array<{ pageNumber: number; elements: Array<{ externalIndex: number; type: string; text: string | null }> }>;
  };
  const chunks = layout.pages
    .map((page) => ({
      id: `iff-2010-page-${page.pageNumber}`,
      chunkIndex: page.pageNumber - 1,
      text: page.elements
        .slice()
        .sort((a, b) => a.externalIndex - b.externalIndex)
        .map((element) => element.text?.trim() ?? '')
        .filter(Boolean)
        .join('\n'),
      pages: [page.pageNumber],
      status: 'READY',
    }))
    .filter((chunk) => chunk.text.trim().length > 0);

  const saved: Array<Record<string, unknown>> = [];
  const repository = {
    async load() {
      return {
        id: 'iff-selecao-2010-pages-1-30',
        teacherId: 'offline-workspace',
        monitorId: 'offline-workspace',
        subjectId: 'offline-workspace',
        topicId: null,
        chunks,
        images: [],
      };
    },
    async save(_document: unknown, candidate: Record<string, unknown>) {
      saved.push(candidate);
      return `question-${saved.length.toString().padStart(2, '0')}`;
    },
  };

  const inputTokens = countTokens(chunks.map((chunk) => `[chunkId=${chunk.id} chunkIndex=${chunk.chunkIndex} pages=${chunk.pages.join(',')} ]\n${chunk.text}`).join('\n\n--- CHUNK ---\n\n'));
  const input = {
      source: layoutPath,
      pagesInChunks: chunks.flatMap((chunk) => chunk.pages),
      chunkCount: chunks.length,
      inputTokens,
      inputBudget: aiModels.questionExtractionInputMaxTokens,
      outputMaxTokens: aiModels.questionExtractionMaxTokens,
      imageAssetsAttached: 0,
    };
  const additionalInstruction = '';
  const openRouter = new OpenRouterClient();
  const client = { createStructuredChatCompletion(request: any) { return openRouter.createStructuredChatCompletion({ ...request, maxTokens: null, timeoutMs: null }); } }; 
  const service = new StructuredQuestionExtractionService(client, repository as never);
  try {
    const result = await service.processDocument('iff-selecao-2010-pages-1-30');
    const report = { status: 'COMPLETED', input, additionalInstruction, result, questions: saved };
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ outputPath, ...input, ...result, questionNumbers: saved.map((question) => question.number) }, null, 2));
  } catch (error) {
    const failure = error as Error & { code?: string; details?: { statusCode?: number } };
    const report = { status: 'FAILED', input, additionalInstruction, failure: { name: failure.name, code: failure.code ?? null, statusCode: failure.details?.statusCode ?? null, message: failure.message }, questions: saved };
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    throw error;
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
