import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StructuredQuestionExtractionService } from '../../../backend/src/worker/services/structured-question-extraction.service.js';
import { countTokens } from '../../../backend/node_modules/gpt-tokenizer/esm/main.js';
import { aiModels } from '../../../backend/src/config/ai-models.config.js';
import { OpenRouterClient } from '../../../backend/src/worker/client/openrouter.client.js';

async function main() {
  const workspace = dirname(fileURLToPath(import.meta.url));
  const layoutPath = resolve(workspace, 'extraction/docling-run-001/layout.json');
  const outputPath = resolve(workspace, 'CodexQuestions.json');
  const layout = JSON.parse(await readFile(layoutPath, 'utf8')) as {
    pages: Array<{ pageNumber: number; elements: Array<{ externalIndex: number; type: string; text: string | null }> }>;
  };
  const chunks = layout.pages.map((page) => ({
    id: `iff-2010-page-${page.pageNumber}`,
    chunkIndex: page.pageNumber - 1,
    text: page.elements.slice().sort((a, b) => a.externalIndex - b.externalIndex)
      .map((element) => element.text?.trim() ?? '').filter(Boolean).join('\n'),
    pages: [page.pageNumber], status: 'READY',
  })).filter((chunk) => chunk.text.trim().length > 0);

  const saved: Array<Record<string, unknown>> = [];
  const repository = {
    async load() {
      return { id: 'iff-selecao-2010-pages-1-30', teacherId: 'offline-workspace', monitorId: 'offline-workspace',
        subjectId: 'offline-workspace', topicId: null, chunks, images: [] };
    },
    async save(_document: unknown, candidate: Record<string, unknown>) {
      saved.push(candidate);
      return `question-${saved.length.toString().padStart(2, '0')}`;
    },
  };
  const inputTokens = countTokens(chunks.map((chunk) =>
    `[chunkId=${chunk.id} chunkIndex=${chunk.chunkIndex} pages=${chunk.pages.join(',')} ]\n${chunk.text}`,
  ).join('\n\n--- CHUNK ---\n\n'));
  const input = { source: layoutPath, pagesInChunks: chunks.flatMap((chunk) => chunk.pages), chunkCount: chunks.length,
    inputTokens, inputBudget: aiModels.questionExtractionInputMaxTokens,
    outputMaxTokens: aiModels.questionExtractionMaxTokens, imageAssetsAttached: 0 };

  const additionalInstruction = `Leia o documento completo e extraia as questões do caderno Ensino Médio/Técnico Concomitante/Integrado PROEJA. Preserve literalmente o texto extraído. Use apenas alternativas com rótulos impressos A–E; texto sem rótulo, inclusive itens I, II, III, pertence ao enunciado. Cada questão deve ficar entre seu marcador QUESTÃO N e o próximo marcador, sem misturar cadernos nem itens vizinhos.

O cabeçalho identifica o Instituto Federal Fluminense (IFF), Edital nº 14 de 21/09/2009 e Seleção 2010. Preencha institution com IFF e year com 2010 (ano da seleção), não 2009 (ano do edital).

Leia correctAnswer diretamente da tabela textual intitulada GABARITO do caderno Ensino Médio/Técnico Concomitante/Integrado PROEJA, na página física 28. Associe cada número à letra impressa; não resolva as questões para inferir resposta. Ignore integralmente o gabarito da página física 29, identificado como Técnico Subsequente, pois é outro caderno. Se alguma associação do gabarito PROEJA não estiver legível ou explícita, use null. Não invente nem complete alternativas ausentes.`;
  const openRouter = new OpenRouterClient();
  const client = {
    async createStructuredChatCompletion<T>(request: Parameters<OpenRouterClient['createStructuredChatCompletion']>[0]): Promise<T> {
      return openRouter.createStructuredChatCompletion<T>({
        ...request,
        messages: [...request.messages, { role: 'user', content: additionalInstruction }],
      });
    },
  };
  // Keep this sample isolated: do not enable the production LangGraph checkpoint
  // path, which requires the Supabase/Postgres database. The app extraction
  // service itself still performs the structured LLM extraction here.
  const service = new StructuredQuestionExtractionService(client, repository as never, undefined, undefined, undefined, false);
  try {
    const result = await service.processDocument('iff-selecao-2010-pages-1-30');
    const report = {
      extraction: { status: 'COMPLETED', method: 'StructuredQuestionExtractionService do app', model: aiModels.questionExtraction,
        input, additionalInstruction, result },
      source: { file: 'Arquivo Provas Antigas - primeiras 30 páginas.pdf', examBoard: 'IFF', examYear: 2010,
        noticeYear: 2009, questionBooklet: 'Ensino Médio/Técnico Concomitante/Integrado PROEJA',
        answerKeyPagePhysical: 28, excludedAnswerKeyPagePhysical: 29, imagesAttached: false },
      questions: saved,
    };
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ outputPath, ...input, ...result,
      questionNumbers: saved.map((question) => question.number) }, null, 2));
  } catch (error) {
    const failure = error as Error & { code?: string; details?: { statusCode?: number } };
    const report = { extraction: { status: 'FAILED', input, additionalInstruction,
      failure: { name: failure.name, code: failure.code ?? null,
        statusCode: failure.details?.statusCode ?? null, message: failure.message } }, questions: saved };
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    throw error;
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
