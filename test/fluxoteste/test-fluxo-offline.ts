import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runOfflineChunkFlow } from './run-fluxo-offline.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = resolve(root, 'test/docsTeste/razao-proporcao-e-regra-de-tres.pdf');
const output = resolve(root, 'test/fluxoteste/resultados/razao-proporcao-e-regra-de-tres.md');

test('gera um relatório Markdown simulando o banco, sem depender de banco ou LLM', async () => {
  const report = await runOfflineChunkFlow({ inputPath: fixture, outputPath: output });

  assert.equal(report.document.inputPath, fixture);
  assert.equal(report.document.pageCount, 48);
  assert.ok(report.blocks.total > 0);
  assert.ok(report.chunks.persisted > 0);
  assert.ok(report.chunks.persisted >= report.chunks.questionCount);
  assert.ok(report.discarded.total > 0);
  await access(output);

  const markdown = await readFile(output, 'utf8');
  assert.match(markdown, /Simulação offline do fluxo de ingestão/);
  assert.match(markdown, /document_chunks/);
  assert.match(markdown, /EMBEDDING_PENDING/);
  assert.match(markdown, /Não acessa banco|Nao acessa banco/);
});
