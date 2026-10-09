import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runDoclingHttpFlow } from './run-fluxo-docling.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = resolve(root, 'test/docsTeste/razao-proporcao-e-regra-de-tres.pdf');
const successOutput = resolve(root, 'test/fluxoteste/resultados/razao-proporcao-e-regra-de-tres-docling.md');
const errorOutput = resolve(root, 'test/fluxoteste/resultados/razao-proporcao-e-regra-de-tres-docling-error.md');
const timeoutOutput = resolve(root, 'test/fluxoteste/resultados/razao-proporcao-e-regra-de-tres-docling-timeout.md');

test('o fluxo oficial escolhe Docling quando a feature flag está ativa', async () => {
  const report = await runDoclingHttpFlow({
    inputPath: fixture,
    outputPath: successOutput,
    parserScenario: 'success',
  });

  assert.equal(report.document.inputPath, fixture);
  assert.equal(report.parser.selected, 'DOCLING');
  assert.equal(report.parser.fallback, false);
  assert.equal(report.parser.requestedParser, 'DOCLING');
  assert.match(report.parser.requestCount.toString(), /^[1-9]\d*$/);
  await access(successOutput);

  const markdown = await readFile(successOutput, 'utf8');
  assert.match(markdown, /## parse/i);
  assert.match(markdown, /## layout/i);
  assert.match(markdown, /## chunks/i);
  assert.match(markdown, /parser selecionado: \*\*DOCLING\*\*/i);
});

test('o fluxo oficial cai para o legado quando o parser responde erro', async () => {
  const report = await runDoclingHttpFlow({
    inputPath: fixture,
    outputPath: errorOutput,
    parserScenario: 'http-error',
  });

  assert.equal(report.parser.selected, 'LEGACY');
  assert.equal(report.parser.fallback, true);
  assert.equal(report.parse.status, 'FALLBACK_REQUIRED');
  await access(errorOutput);

  const markdown = await readFile(errorOutput, 'utf8');
  assert.match(markdown, /fallback legado: \*\*sim\*\*/i);
  assert.match(markdown, /## parse/i);
  assert.match(markdown, /## layout/i);
  assert.match(markdown, /## chunks/i);
});

test('o fluxo oficial cai para o legado quando o parser excede o timeout', async () => {
  const report = await runDoclingHttpFlow({
    inputPath: fixture,
    outputPath: timeoutOutput,
    parserScenario: 'timeout',
    parserRequestTimeoutMs: 25,
    parseTimeoutMs: 50,
  });

  assert.equal(report.parser.selected, 'LEGACY');
  assert.equal(report.parser.fallback, true);
  assert.equal(report.parse.status, 'FALLBACK_REQUIRED');
  await access(timeoutOutput);

  const markdown = await readFile(timeoutOutput, 'utf8');
  assert.match(markdown, /fallback legado: \*\*sim\*\*/i);
  assert.match(markdown, /## parse/i);
  assert.match(markdown, /## layout/i);
  assert.match(markdown, /## chunks/i);
});
