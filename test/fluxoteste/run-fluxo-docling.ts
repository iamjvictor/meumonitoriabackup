import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assembleStructuralBlocks,
  type StructuralPage,
} from '../../backend/src/worker/services/document-block-detection.service.js';
import {
  buildEmbeddingContent,
  countChunkTokens,
  getBlockEligibility,
  getChunkEligibility,
  splitBlockContent,
  type BlockForChunking,
} from '../../backend/src/worker/services/chunk.service.js';
import { DocumentIngestionV3Service } from '../../backend/src/worker/services/document-parser/document-ingestion-v3.service.js';
import { MemoryParseRunStore } from '../../backend/src/worker/services/document-parser/document-parse-orchestrator.service.js';
import { MineruParserAdapter } from '../../backend/src/worker/services/document-parser/mineru-parser.adapter.js';
import type { LayoutDocument } from '../../backend/src/worker/services/document-parser/document-parser.types.js';
import { extractPdfPagesWithLayout } from '../../backend/src/worker/services/pdf-layout-extraction.service.js';

type ParserScenario = 'success' | 'http-error' | 'timeout';

export type DoclingFlowOptions = {
  inputPath: string;
  outputPath: string;
  parserScenario?: ParserScenario;
  parserRequestTimeoutMs?: number;
  parseTimeoutMs?: number;
};

export type DoclingFlowReport = {
  document: { inputPath: string; name: string; pageCount: number };
  parser: {
    selected: 'DOCLING' | 'LEGACY';
    fallback: boolean;
    reason: string | null;
    requestedParser: string;
    requestCount: number;
  };
  parse: {
    status: string;
    parseRunId: string;
    layoutPersisted: boolean;
  };
  layout: {
    source: 'DOCLING' | 'LEGACY';
    pageCount: number;
    elementCount: number;
    byCategory: Record<string, number>;
  };
  chunks: {
    persisted: number;
    questionCount: number;
    byType: Record<string, number>;
    discarded: { total: number; byReason: Record<string, number> };
  };
  outputPath: string;
};

type SimulatedChunk = {
  id: string;
  blockId: string;
  blockType: string;
  questionNumber: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  chunkIndex: number;
  tokenCount: number;
  status: 'EMBEDDING_PENDING';
  content: string;
  embeddingContent: string;
};

type ParserRequestRecord = { url: string; method: string; body?: string };

export async function runDoclingHttpFlow(options: DoclingFlowOptions): Promise<DoclingFlowReport> {
  const inputPath = resolve(options.inputPath);
  const outputPath = resolve(options.outputPath);
  const pdfBytes = new Uint8Array(await readFile(inputPath));
  const requests: ParserRequestRecord[] = [];
  const parserScenario = options.parserScenario ?? 'success';
  const parserRequestTimeoutMs = options.parserRequestTimeoutMs ?? (parserScenario === 'timeout' ? 50 : 1_000);
  const parseTimeoutMs = options.parseTimeoutMs ?? (parserScenario === 'timeout' ? 80 : 1_000);
  let persistedLayout: LayoutDocument | null = null;

  const adapter = new MineruParserAdapter({
    baseUrl: 'http://parser.test',
    fetchImpl: createFakeParserFetch(parserScenario, requests),
    requestTimeoutMs: parserRequestTimeoutMs,
  });

  const service = new DocumentIngestionV3Service({
    parser: adapter,
    parseRunStore: new MemoryParseRunStore(),
    buildFileUrl: async () => pathToFileURL(inputPath).href,
    featureEnabled: true,
    parseTimeoutMs,
    maxAttempts: 1,
    parserName: 'DOCLING',
    persistLayoutDocument: async ({ layout }) => {
      persistedLayout = layout;
    },
    updateDocumentParseRun: async () => {},
  });

  const parseResult = await service.processDocument({
    documentId: 'offline-document',
    storagePath: 'offline-document.pdf',
    originalName: basename(inputPath),
    mimeType: 'application/pdf',
    sizeBytes: pdfBytes.byteLength,
    contentHash: await digestSha256(pdfBytes),
    backend: 'pipeline',
    configurationHash: 'fluxo-docling-test',
    parserVersion: '2.122.0',
    modelVersion: 'docling-layout-v1',
    schemaVersion: 'layout-v1',
  });

  const selected = parseResult.status === 'FALLBACK_REQUIRED' ? 'LEGACY' : 'DOCLING';
  const fallback = parseResult.status === 'FALLBACK_REQUIRED';
  const reason = parseResult.fallbackReason ?? null;

  const layoutSource = persistedLayout && !fallback ? 'DOCLING' : 'LEGACY';
  const pages = persistedLayout && !fallback
    ? toStructuralPagesFromLayout(persistedLayout)
    : await readLegacyStructuralPages(pdfBytes);
  const layoutSummary = summarizeLayout(layoutSource, persistedLayout, pages);
  const chunks = buildChunksFromPages(pages, inputPath);

  const markdown = renderMarkdown({
    document: {
      inputPath,
      name: basename(inputPath),
      pageCount: pages.length,
    },
    parser: {
      selected,
      fallback,
      reason,
      requestedParser: extractRequestedParser(requests),
      requestCount: requests.length,
    },
    parse: {
      status: parseResult.status,
      parseRunId: parseResult.parseRunId,
      layoutPersisted: parseResult.layoutPersisted,
    },
    layout: layoutSummary,
    chunks: summarizeChunks(chunks),
    outputPath,
  }, chunks);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, 'utf8');

  return {
    document: {
      inputPath,
      name: basename(inputPath),
      pageCount: pages.length,
    },
    parser: {
      selected,
      fallback,
      reason,
      requestedParser: extractRequestedParser(requests),
      requestCount: requests.length,
    },
    parse: {
      status: parseResult.status,
      parseRunId: parseResult.parseRunId,
      layoutPersisted: parseResult.layoutPersisted,
    },
    layout: layoutSummary,
    chunks: summarizeChunks(chunks),
    outputPath,
  };
}

function createFakeParserFetch(scenario: ParserScenario, requests: ParserRequestRecord[]): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    requests.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
    });

    if (url.endsWith('/v1/parse') && scenario === 'http-error') {
      return new Response(JSON.stringify({ error: 'parser unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.endsWith('/v1/parse') && scenario === 'timeout') {
      return new Promise<Response>((_resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new DOMException('Parser timeout', 'AbortError'));
        }, 1_000);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Parser timeout', 'AbortError'));
        }, { once: true });
      });
    }

    if (url.endsWith('/v1/parse')) {
      return new Response(JSON.stringify({
        parseRunId: 'docling-run-1',
        status: 'COMPLETED',
        statusUrl: 'http://parser.test/v1/parse/docling-run-1',
        resultUrl: 'http://parser.test/v1/parse/docling-run-1/result',
        idempotencyKey: 'offline-document:docling-layout-v1',
      }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.endsWith('/result')) {
      return new Response(JSON.stringify(makeRawLayoutDocument()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  };
}

function makeRawLayoutDocument() {
  return {
    schemaVersion: 'docling-layout-v1',
    documentId: 'offline-document',
    parseRunId: 'docling-run-1',
    parser: {
      name: 'DOCLING',
      version: '2.122.0',
      backend: 'pipeline',
      modelVersion: 'docling-layout-v1',
      configurationHash: 'fluxo-docling-test',
    },
    pages: [
      {
        pageNumber: 0,
        width: 200,
        height: 100,
        elements: [
          {
            externalIndex: 0,
            type: 'text',
            text: 'Regra de três',
            normalizedText: 'Regra de três',
            bbox: [10, 10, 180, 40],
            assetIds: [],
            parserMetadata: { source: 'docling' },
          },
          {
            externalIndex: 1,
            type: 'text',
            text: 'Se 3 cadernos custam R$ 18, quanto custam 5? Use a regra de três para justificar o resultado em uma explicação completa, com pelo menos uma frase adicional, para que o fluxo oficial consiga montar chunks úteis para a IA depois.',
            normalizedText: 'Se 3 cadernos custam R$ 18, quanto custam 5? Use a regra de três para justificar o resultado em uma explicação completa, com pelo menos uma frase adicional, para que o fluxo oficial consiga montar chunks úteis para a IA depois.',
            bbox: [10, 50, 190, 90],
            assetIds: [],
            parserMetadata: { source: 'docling' },
          },
        ],
      },
    ],
    assets: [],
    warnings: [],
  };
}

async function readLegacyStructuralPages(pdfBytes: Uint8Array): Promise<StructuralPage[]> {
  const pages = await extractPdfPagesWithLayout(pdfBytes);
  return pages.map((page) => ({
    pageNumber: page.num,
    rawContent: page.text,
    normalizedContent: page.text,
  }));
}

function toStructuralPagesFromLayout(layout: LayoutDocument): StructuralPage[] {
  return layout.pages.map((page) => {
    const content = page.elements
      .map((element) => element.normalizedText ?? element.rawText ?? '')
      .filter(Boolean)
      .join('\n');

    return {
      pageNumber: page.pageNumber,
      rawContent: content,
      normalizedContent: content,
    };
  });
}

function summarizeLayout(source: 'DOCLING' | 'LEGACY', layout: LayoutDocument | null, pages: StructuralPage[]) {
  const byCategory: Record<string, number> = {};
  let elementCount = 0;

  if (layout) {
    for (const page of layout.pages) {
      for (const element of page.elements) {
        byCategory[element.category] = (byCategory[element.category] ?? 0) + 1;
        elementCount += 1;
      }
    }
  } else {
    const fallbackPageCount = pages.length;
    byCategory.TEXT = fallbackPageCount;
    elementCount = fallbackPageCount;
  }

  return {
    source,
    pageCount: pages.length,
    elementCount,
    byCategory,
  };
}

function buildChunksFromPages(pages: StructuralPage[], inputPath: string): SimulatedChunk[] {
  const blocks = assembleStructuralBlocks('offline-document', 'offline-text', pages);
  const chunks: SimulatedChunk[] = [];

  for (const block of blocks) {
    const chunkBlock: BlockForChunking = {
      id: `block-${block.blockIndex + 1}`,
      blockIndex: block.blockIndex,
      type: block.type,
      title: block.title ?? null,
      normalizedContent: block.normalizedContent,
      isComplete: block.isComplete ?? true,
      incompleteReason: block.incompleteReason ?? null,
      sectionPath: block.sectionPath,
      questionNumber: block.questionNumber ?? null,
      institution: block.institution ?? null,
      examYear: block.examYear ?? null,
      pageStart: block.pageStart ?? null,
      pageEnd: block.pageEnd ?? null,
      topicLinks: [],
    };

    const blockEligibility = getBlockEligibility(chunkBlock);
    if (!blockEligibility.eligible) {
      continue;
    }

    const slices = splitBlockContent(block.normalizedContent, block.type);
    for (const [chunkIndex, slice] of slices.entries()) {
      const chunkEligibility = getChunkEligibility(slice, chunkBlock);
      if (!chunkEligibility.eligible) {
        continue;
      }
      chunks.push({
        id: `chunk-${chunks.length + 1}`,
        blockId: chunkBlock.id,
        blockType: block.type,
        questionNumber: block.questionNumber ?? null,
        pageStart: block.pageStart ?? null,
        pageEnd: block.pageEnd ?? null,
        chunkIndex,
        tokenCount: countChunkTokens(slice.content),
        status: 'EMBEDDING_PENDING',
        content: slice.content,
        embeddingContent: buildEmbeddingContent(chunkBlock, slice.content, {
          documentTitle: basename(inputPath),
          subjectName: null,
        }),
      });
    }
  }

  return chunks;
}

function summarizeChunks(chunks: SimulatedChunk[]) {
  return {
    persisted: chunks.length,
    questionCount: chunks.filter((chunk) => chunk.blockType === 'QUESTION').length,
    byType: chunks.reduce<Record<string, number>>((counts, chunk) => {
      counts[chunk.blockType] = (counts[chunk.blockType] ?? 0) + 1;
      return counts;
    }, {}),
    discarded: { total: 0, byReason: {} as Record<string, number> },
  };
}

function renderMarkdown(
  report: Omit<DoclingFlowReport, 'outputPath'> & { outputPath: string },
  chunks: SimulatedChunk[],
) {
  const lines = [
    '# Fluxo oficial de ingestão com Docling HTTP',
    '',
    '> Integração de teste sem LLM e sem banco real. O relatório simula parse, layout e chunks.',
    '',
    '## parse',
    '',
    `- status: \`${report.parse.status}\``,
    `- parseRunId: \`${report.parse.parseRunId}\``,
    `- parser selecionado: **${report.parser.selected}**`,
    `- fallback legado: **${report.parser.fallback ? 'sim' : 'não'}**`,
    `- motivo do fallback: \`${report.parser.reason ?? '-'}\``,
    `- parser requisitado: \`${report.parser.requestedParser}\``,
    `- requisições ao parser: **${report.parser.requestCount}**`,
    '',
    '## layout',
    '',
    `- origem: **${report.layout.source}**`,
    `- páginas: **${report.layout.pageCount}**`,
    `- elementos: **${report.layout.elementCount}**`,
    '',
    '| categoria | quantidade |',
    '| --- | ---: |',
    ...Object.entries(report.layout.byCategory)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, count]) => `| ${category} | ${count} |`),
    '',
    '## chunks',
    '',
    `- chunks persistidos: **${report.chunks.persisted}**`,
    `- chunks de questão: **${report.chunks.questionCount}**`,
    '',
    '| id | bloco | tipo | questão | páginas | índice | tokens | status | conteúdo |',
    '| --- | --- | --- | --- | --- | ---: | ---: | --- | --- |',
    ...chunks.map((chunk) => `| ${chunk.id} | ${chunk.blockId} | ${chunk.blockType} | ${chunk.questionNumber ?? '-'} | ${chunk.pageStart ?? '-'}-${chunk.pageEnd ?? '-'} | ${chunk.chunkIndex} | ${chunk.tokenCount} | ${chunk.status} | ${escapeCell(chunk.content)} |`),
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function escapeCell(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function extractRequestedParser(requests: ParserRequestRecord[]) {
  const body = requests.find((request) => request.method === 'POST' && request.url.endsWith('/v1/parse'))?.body ?? '';
  const match = body.match(/"parser":"([^"]+)"/);
  return match?.[1] ?? 'UNKNOWN';
}

async function digestSha256(bytes: Uint8Array) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(bytes).digest('hex');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void (async () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const inputPath = resolve(process.argv[2] ?? `${root}/test/docsTeste/razao-proporcao-e-regra-de-tres.pdf`);
    const outputPath = resolve(process.argv[3] ?? `${root}/test/fluxoteste/resultados/razao-proporcao-e-regra-de-tres-docling.md`);
    const report = await runDoclingHttpFlow({ inputPath, outputPath });
    console.log(JSON.stringify(report, null, 2));
  })();
}
