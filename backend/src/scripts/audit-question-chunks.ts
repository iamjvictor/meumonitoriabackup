/** Audit the QUESTIONS ingestion path up to chunk creation, without writes or AI calls. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { countChunkTokens, getBlockEligibility, getChunkEligibility, splitBlockContent, type BlockForChunking } from '../worker/services/chunk.service.js';
import { assembleStructuralBlocks } from '../worker/services/document-block-detection.service.js';
import { extractPdfPagesWithLayout } from '../worker/services/pdf-layout-extraction.service.js';
import { MineruParserAdapter } from '../worker/services/document-parser/mineru-parser.adapter.js';
import { evaluateQuestionCandidatePromotion, extractQuestionsFromBlocks } from '../worker/services/question-extraction.service.js';
import { findRepeatedPageLines, TextNormalizationService } from '../worker/services/text-normalization.service.js';

type AuditedChunk = {
  index: number;
  blockIndex: number;
  content: string;
  tokens: number;
  charStart: number;
  charEnd: number;
};

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Uso: node --import tsx src/scripts/audit-question-chunks.ts <arquivo.pdf> [saida.json]');
  const expectedNumbersArgument = process.argv.find((argument) => argument.startsWith('--expect-numbers='));
  const expectedNumbers = expectedNumbersArgument
    ? expectedNumbersArgument.slice('--expect-numbers='.length).split(',').map((value) => value.trim()).filter(Boolean)
    : [];
  const expectedCountArgument = process.argv.find((argument) => argument.startsWith('--expect-count='));
  const expectedCount = expectedCountArgument ? Number(expectedCountArgument.slice('--expect-count='.length)) : null;
  if (expectedCount !== null && (!Number.isInteger(expectedCount) || expectedCount < 0)) {
    throw new Error('--expect-count exige um inteiro não negativo.');
  }
  const strict = process.argv.includes('--strict');
  const sourceArgument = process.argv.find((argument) => argument.startsWith('--source='));
  const requestedSource = sourceArgument?.slice('--source='.length) ?? 'auto';
  if (!['auto', 'pdfjs', 'docling'].includes(requestedSource)) throw new Error('--source precisa ser auto, pdfjs ou docling.');
  const parserUrlArgument = process.argv.find((argument) => argument.startsWith('--parser-url='));
  const parserUrl = parserUrlArgument?.slice('--parser-url='.length) ?? process.env.DOCUMENT_PARSER_BASE_URL;
  const inputPath = resolve(input);
  const outputPath = resolve(process.argv[3] ?? `${inputPath}.question-chunks.json`);
  const pdf = new Uint8Array(await readFile(inputPath));
  // PDF.js can transfer/detach its input ArrayBuffer. Keep the upload bytes
  // intact for the Docling HTTP request in scanned/mixed cases.
  const nativePages = await extractPdfPagesWithLayout(pdf.slice());
  const pagesNeedingOcr = nativePages.filter((page) => page.text.replace(/\s+/gu, ' ').trim().length < 80).map((page) => page.num);
  const useDocling = requestedSource === 'docling' || (requestedSource === 'auto' && pagesNeedingOcr.length > 0);
  let extractedPages = nativePages;
  if (useDocling) {
    if (!parserUrl) throw new Error(`OCR/layout Docling necessário nas páginas ${pagesNeedingOcr.join(', ') || 'selecionadas'}; informe --parser-url=<URL>.`);
    const adapter = new MineruParserAdapter({ baseUrl: parserUrl, requestTimeoutMs: 600_000 });
    const parsed = await adapter.parse({
      documentId: randomUUID(), fileUrl: '', fileBytes: pdf, fileName: inputPath.split('/').at(-1) ?? 'document.pdf',
      originalName: inputPath.split('/').at(-1) ?? 'document.pdf', mimeType: 'application/pdf',
      contentHash: createHash('sha256').update(pdf).digest('hex'), parser: 'DOCLING',
      backend: 'pipeline', configurationHash: 'question-parser-audit-v1',
    });
    const layout = parsed.result ?? await adapter.getResult(parsed.parseRunId, parsed.resultUrl);
    const layoutPages = new Map(layout.pages.map((page) => [page.pageNumber, page]));
    extractedPages = nativePages.map((page) => {
      const layoutPage = layoutPages.get(page.num);
      return {
        ...page,
        text: layoutPage?.elements
          .filter((element) => element.category !== 'HEADER' && element.category !== 'FOOTER' && element.category !== 'PAGE_NUMBER')
          .sort((left, right) => left.readingOrder - right.readingOrder)
          .map((element) => element.normalizedText ?? element.rawText ?? '')
          .filter(Boolean).join('\n') ?? '',
      };
    });
  }
  const normalizer = new TextNormalizationService();
  const repeatedPageLines = findRepeatedPageLines(extractedPages.map((page) => page.text));
  const pages = extractedPages.map((page) => ({
    pageNumber: page.num,
    rawContent: page.text,
    normalizedContent: normalizer.normalize(page.text, { repeatedPageLines }).normalizedContent,
  }));
  const blocks = assembleStructuralBlocks('audit-document', 'audit-text', pages);
  const chunks: AuditedChunk[] = [];
  const blockAudit = blocks.map((block) => {
    const inputBlock: BlockForChunking = {
      ...block,
      id: `audit-block-${block.blockIndex}`,
      isComplete: block.isComplete ?? true,
      incompleteReason: block.incompleteReason ?? null,
      questionNumber: block.questionNumber ?? null,
      title: block.title ?? null,
      institution: block.institution ?? null,
      examYear: block.examYear ?? null,
      pageStart: block.pageStart ?? null,
      pageEnd: block.pageEnd ?? null,
      topicLinks: [],
    };
    const blockEligibility = getBlockEligibility(inputBlock);
    const decisions: Array<{ reason: string | null; chars: number; tokens: number }> = [];
    if (blockEligibility.eligible) {
      for (const slice of splitBlockContent(block.normalizedContent, block.type)) {
        const eligibility = getChunkEligibility(slice, inputBlock);
        decisions.push({ reason: eligibility.eligible ? null : eligibility.reason, chars: slice.content.length, tokens: countChunkTokens(slice.content) });
        if (eligibility.eligible) chunks.push({
          index: chunks.length,
          blockIndex: block.blockIndex,
          content: slice.content,
          tokens: countChunkTokens(slice.content),
          charStart: slice.charStart,
          charEnd: slice.charEnd,
        });
      }
    }
    const savedChunks = chunks.filter((chunk) => chunk.blockIndex === block.blockIndex);
    return {
      blockIndex: block.blockIndex,
      type: block.type,
      questionNumber: block.questionNumber,
      pageStart: block.pageStart,
      pageEnd: block.pageEnd,
      status: block.status,
      incompleteReason: block.incompleteReason,
      content: block.normalizedContent,
      chars: block.normalizedContent.length,
      tokens: countChunkTokens(block.normalizedContent),
      blockSkipReason: blockEligibility.eligible ? null : blockEligibility.reason,
      chunkDecisions: decisions,
      chunkIndexes: savedChunks.map((chunk) => chunk.index),
      chunkCoverageExact: savedChunks.length === 1 && savedChunks[0]!.content === block.normalizedContent.trim(),
    };
  });
  const questionBlocks = blockAudit.filter((block) => block.type === 'QUESTION');
  const candidates = extractQuestionsFromBlocks(
    blocks.map((block) => ({ ...block, id: `audit-block-${block.blockIndex}`, topicLinks: [] })) as unknown as Parameters<typeof extractQuestionsFromBlocks>[0],
    chunks.map((chunk) => ({
      id: `audit-chunk-${chunk.index}`, documentId: 'audit-document', chunkIndex: chunk.index,
      blockId: `audit-block-${chunk.blockIndex}`, content: chunk.content,
    })) as Parameters<typeof extractQuestionsFromBlocks>[1],
  );
  const candidateReadiness = candidates.map((candidate) => {
    const sourceChunks = chunks.filter((chunk) => candidate.sourceChunkIndexes.includes(chunk.index)).map((chunk) => {
      const sourceBlock = blocks.find((block) => block.blockIndex === chunk.blockIndex);
      return {
        id: `audit-chunk-${chunk.index}`,
        documentId: 'audit-document',
        chunkIndex: chunk.index,
        blockId: `audit-block-${chunk.blockIndex}`,
        content: chunk.content,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        block: { pageStart: sourceBlock?.pageStart ?? null, pageEnd: sourceBlock?.pageEnd ?? null },
        pageHasImages: false,
      };
    });
    const decision = evaluateQuestionCandidatePromotion({ candidate, sourceChunks });
    return {
      questionNumber: candidate.questionNumber,
      candidateStatus: decision.candidateStatus,
      completionBlocked: decision.completionBlocked,
      processingState: decision.sourceStructure.processingState,
      promotionReasons: decision.promotionReasons,
      statementEvidence: decision.statementEvidence,
    };
  });
  const falseStarts = questionBlocks.filter((block) => block.questionNumber === '00' || block.questionNumber === '0');
  const missingNumbers = expectedNumbers.filter((number) => !questionBlocks.some((block) => (
    block.questionNumber === number && block.chunkIndexes.length > 0
  )));
  const missingCandidateNumbers = expectedNumbers.filter((number) => !candidates.some((candidate) => candidate.questionNumber === number));
  const report = {
    inputPath,
    generatedAt: new Date().toISOString(),
    textSource: useDocling ? 'docling' : 'pdfjs',
    pagesNeedingOcr,
    summary: {
      pages: pages.length,
      blocks: blocks.length,
      questionBlocks: questionBlocks.length,
      questionBlocksWithChunks: questionBlocks.filter((block) => block.chunkIndexes.length > 0).length,
      questionBlocksWithoutChunks: questionBlocks.filter((block) => block.chunkIndexes.length === 0).length,
      questionBlocksWithoutExactCoverage: questionBlocks.filter((block) => block.chunkIndexes.length > 0 && !block.chunkCoverageExact).length,
      deterministicCandidates: candidates.length,
      questionBlocksWithoutCandidate: questionBlocks.filter((block) => !candidates.some((candidate) => candidate.sourceBlockId === `audit-block-${block.blockIndex}`)).length,
      falseQuestionStarts: falseStarts.length,
      expectedCount,
      expectedNumbers,
      missingNumbers,
      missingCandidateNumbers,
      chunks: chunks.length,
    },
    pages: extractedPages.map((page) => ({ page: page.num, chars: page.text.length, normalizedChars: pages[page.num - 1]?.normalizedContent.length ?? 0, columns: page.columns, hasImages: page.hasImages })),
    questionBlocks: questionBlocks.map((block) => ({
      ...block,
      deterministicCandidateCount: candidates.filter((candidate) => candidate.sourceBlockId === `audit-block-${block.blockIndex}`).length,
    })),
    candidates: candidates.map((candidate) => ({
      questionNumber: candidate.questionNumber, sourceBlockId: candidate.sourceBlockId,
      statement: candidate.text, alternatives: candidate.alternatives,
      sourceChunkIndexes: candidate.sourceChunkIndexes,
    })),
    candidateReadiness,
    otherBlocks: blockAudit.filter((block) => block.type !== 'QUESTION'),
    chunks,
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ outputPath, ...report.summary }, null, 2));
  for (const block of questionBlocks) {
    console.log(JSON.stringify({ questionNumber: block.questionNumber, blockIndex: block.blockIndex, pages: [block.pageStart, block.pageEnd], chars: block.chars, tokens: block.tokens, chunkIndexes: block.chunkIndexes, blockSkipReason: block.blockSkipReason, chunkDecisions: block.chunkDecisions, incompleteReason: block.incompleteReason, start: block.content.slice(0, 100), end: block.content.slice(-100) }));
  }
  if ((expectedCount !== null && questionBlocks.filter((block) => block.chunkIndexes.length > 0).length !== expectedCount)
    || missingNumbers.length > 0
    || (strict && (falseStarts.length > 0 || questionBlocks.some((block) => block.chunkIndexes.length === 0)))) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
