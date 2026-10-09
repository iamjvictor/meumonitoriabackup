import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleStructuralBlocks, type StructuralPage } from '../../backend/src/worker/services/document-block-detection.service.js';
import {
  buildEmbeddingContent,
  countChunkTokens,
  getBlockEligibility,
  getChunkEligibility,
  splitBlockContent,
  type BlockForChunking,
} from '../../backend/src/worker/services/chunk.service.js';
import { extractPdfPagesWithLayout } from '../../backend/src/worker/services/pdf-layout-extraction.service.js';

export type OfflineFlowOptions = { inputPath: string; outputPath: string };

export type OfflineFlowReport = {
  document: { inputPath: string; name: string; pageCount: number };
  blocks: { total: number; eligible: number; rejected: number; byType: Record<string, number> };
  chunks: { persisted: number; questionCount: number; byType: Record<string, number> };
  discarded: { total: number; byReason: Record<string, number> };
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

export async function runOfflineChunkFlow(options: OfflineFlowOptions): Promise<OfflineFlowReport> {
  const inputPath = resolve(options.inputPath);
  const outputPath = resolve(options.outputPath);
  const pages = await extractPdfPagesWithLayout(new Uint8Array(await readFile(inputPath)));
  const structuralPages: StructuralPage[] = pages.map((page) => ({
    pageNumber: page.num,
    rawContent: page.text,
    normalizedContent: page.text,
  }));
  const blocks = assembleStructuralBlocks('offline-document', 'offline-text', structuralPages);
  const byType: Record<string, number> = {};
  const discardedByReason: Record<string, number> = {};
  const chunks: SimulatedChunk[] = [];
  let rejectedBlocks = 0;

  for (const block of blocks) {
    byType[block.type] = (byType[block.type] ?? 0) + 1;
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
      rejectedBlocks += 1;
      discardedByReason[blockEligibility.reason] = (discardedByReason[blockEligibility.reason] ?? 0) + 1;
      continue;
    }
    const slices = splitBlockContent(block.normalizedContent, block.type);
    for (const [chunkIndex, slice] of slices.entries()) {
      const chunkEligibility = getChunkEligibility(slice, chunkBlock);
      if (!chunkEligibility.eligible) {
        discardedByReason[chunkEligibility.reason] = (discardedByReason[chunkEligibility.reason] ?? 0) + 1;
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

  const report: OfflineFlowReport = {
    document: { inputPath, name: basename(inputPath), pageCount: pages.length },
    blocks: {
      total: blocks.length,
      eligible: blocks.length - rejectedBlocks,
      rejected: rejectedBlocks,
      byType,
    },
    chunks: {
      persisted: chunks.length,
      questionCount: chunks.filter((chunk) => chunk.blockType === 'QUESTION').length,
      byType: chunks.reduce<Record<string, number>>((counts, chunk) => {
        counts[chunk.blockType] = (counts[chunk.blockType] ?? 0) + 1;
        return counts;
      }, {}),
    },
    discarded: { total: Object.values(discardedByReason).reduce((sum, value) => sum + value, 0), byReason: discardedByReason },
    outputPath,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderMarkdown(report, chunks), 'utf8');
  return report;
}

function renderMarkdown(report: OfflineFlowReport, chunks: SimulatedChunk[]) {
  const lines = [
    '# Simulação offline do fluxo de ingestão',
    '',
    '> Não acessa banco, Storage ou LLM. O arquivo simula os registros que seriam persistidos e o contexto preparado para a IA.',
    '',
    `- Documento: \`${report.document.name}\``,
    `- Caminho: \`${report.document.inputPath}\``,
    `- Páginas extraídas: **${report.document.pageCount}**`,
    `- Blocos detectados: **${report.blocks.total}** (${report.blocks.eligible} elegíveis, ${report.blocks.rejected} rejeitados)`,
    `- Chunks simulados: **${report.chunks.persisted}**`,
    `- Chunks de questão: **${report.chunks.questionCount}**`,
    `- Status dos chunks: \`EMBEDDING_PENDING\``,
    '',
    '## Registros simulados',
    '',
    '### document',
    '',
    '| campo | valor |',
    '| --- | --- |',
    `| id | offline-document |`,
    `| originalName | ${report.document.name} |`,
    `| pageCount | ${report.document.pageCount} |`,
    '| persistence | simulada neste Markdown |',
    '',
    '### document_blocks',
    '',
    '| tipo | quantidade |',
    '| --- | ---: |',
    ...Object.entries(report.blocks.byType).sort(([a], [b]) => a.localeCompare(b)).map(([type, count]) => `| ${type} | ${count} |`),
    '',
    '### descartes',
    '',
    '| motivo | quantidade |',
    '| --- | ---: |',
    ...Object.entries(report.discarded.byReason).sort(([a], [b]) => a.localeCompare(b)).map(([reason, count]) => `| ${reason} | ${count} |`),
    '',
    '### document_chunks',
    '',
    '| id | block | tipo | questão | páginas | índice | tokens | status | conteúdo |',
    '| --- | --- | --- | --- | --- | ---: | ---: | --- | --- |',
    ...chunks.map((chunk) => `| ${chunk.id} | ${chunk.blockId} | ${chunk.blockType} | ${chunk.questionNumber ?? '-'} | ${chunk.pageStart ?? '-'}-${chunk.pageEnd ?? '-'} | ${chunk.chunkIndex} | ${chunk.tokenCount} | ${chunk.status} | ${escapeCell(chunk.content)} |`),
    '',
    '## Contexto preparado para a IA',
    '',
    'Cada chunk abaixo contém o texto original em `content` e o texto enriquecido que seria enviado para embedding/recuperação em `embeddingContent`.',
    '',
  ];
  for (const chunk of chunks) {
    lines.push(`### ${chunk.id}`, '', '```text', chunk.embeddingContent, '```', '');
  }
  return `${lines.join('\n')}\n`;
}

function escapeCell(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void (async () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const inputPath = resolve(process.argv[2] ?? `${root}/test/docsTeste/razao-proporcao-e-regra-de-tres.pdf`);
    const outputPath = resolve(process.argv[3] ?? `${root}/test/fluxoteste/resultados/razao-proporcao-e-regra-de-tres.md`);
    const report = await runOfflineChunkFlow({ inputPath, outputPath });
    console.log(JSON.stringify(report, null, 2));
  })();
}
