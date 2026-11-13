import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const filePath = resolve(root, 'dbtemp/storage/monitor-documents/Quimica-3.pdf');
const fileBytes = await readFile(filePath);
const expectedSha256 = createHash('sha256').update(fileBytes).digest('hex');
const { DocChunkerV2Client } = await import('../backend/src/worker/services/doc-chunker/doc-chunker-v2.client.ts');
const client = new DocChunkerV2Client({ baseUrl: 'http://127.0.0.1:8080', requestTimeoutMs: 600_000 });
const result = await client.chunkWithAssets({
  documentId: '406fa2b0-db4f-40dd-a1e7-6243c87b02d6', expectedSha256,
  fileName: 'Quimica-3.pdf', mimeType: 'application/pdf', fileBytes,
  requestId: randomUUID(),
});
const relevant = result.chunks.filter((chunk) => chunk.pages.some((page) => [6, 7].includes(page)));
const report = {
  documentId: '406fa2b0-db4f-40dd-a1e7-6243c87b02d6', expectedSha256,
  parserVersion: result.parserVersion, chunkerVersion: result.chunkerVersion,
  pageCount: result.pageCount, chunkCount: result.chunks.length, assetCount: result.assets.length,
  warnings: result.warnings,
  relevantChunks: relevant.map(({ index, pages, text, raw_text, formulaEvidence, inlineFormulaEvidence }) => ({
    index, pages, text, raw_text, formulaEvidence: formulaEvidence ?? [], inlineFormulaEvidence: inlineFormulaEvidence ?? [],
  })),
};
const outputPath = resolve(root, 'dbtemp/artifacts/Quimica-3.parser-no-persistence.json');
await mkdir(resolve(root, 'dbtemp/artifacts'), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...report }, null, 2));
