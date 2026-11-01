import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma } from '../lib/prisma.js';
import { normalizeGranQuestion } from '../modules/question-bank/providers/gran/gran.adapter.js';
import { GranQuestionClient, GRAN_DEFAULT_FILTERS, type GranQuestionPage } from '../modules/question-bank/providers/gran/gran.client.js';
import { PrismaQuestionBankPersistence, type QuestionBankItemDelegate } from '../modules/question-bank/repositories/prisma-question-bank.persistence.js';

const persist = process.argv.includes('--persist');
if (persist && process.argv.includes('--dry-run')) throw new Error('Use --persist ou --dry-run.');
const token = process.env.GRAN_API_TOKEN;
const clientId = process.env.GRAN_CLIENT_ID;
if (!token || !clientId) throw new Error('Informe GRAN_API_TOKEN e GRAN_CLIENT_ID no ambiente da execução. Não é necessário salvar credenciais em arquivos.');
const pageSize = numberOption('--page-size', 100);
const intervalMs = numberOption('--interval-ms', 300_000);
const expectedTotal = numberOption('--expected-total', 3196);
const maxPages = numberOption('--max-pages', Number.MAX_SAFE_INTEGER);
const cacheDir = resolve(process.env.GRAN_CACHE_DIR ?? `.cache/gran-${pageSize}`);
const log = (event: Record<string, unknown>) => console.log(JSON.stringify({ time: new Date().toISOString(), ...event }));
const client = new GranQuestionClient({ token, clientId, minIntervalMs: intervalMs, timeoutMs: numberOption('--timeout-ms', 180_000), onEvent: log });
const persistence = new PrismaQuestionBankPersistence(prisma.questionBankItem as unknown as QuestionBankItemDelegate);

async function main() {
  await mkdir(cacheDir, { recursive: true, mode: 0o700 });
  const config = JSON.stringify({ filters: GRAN_DEFAULT_FILTERS, pageSize, expectedTotal });
  const configPath = resolve(cacheDir, 'config.json');
  const priorConfig = await optionalRead(configPath);
  if (priorConfig !== undefined && priorConfig !== config) throw new Error('Cache de outra configuração. Use outro GRAN_CACHE_DIR.');
  await atomicWrite(configPath, config);
  const seen = new Set<string>();
  const failures: { page: number; id: string; reason: string }[] = [];
  let pages = 1;
  let duplicates = 0;
  let created = 0;
  let updated = 0;
  for (let page = 1; page <= pages && page <= maxPages; page++) {
    const pageFile = resolve(cacheDir, `page-${page}.json`);
    const cached = await optionalRead(pageFile);
    const payload: GranQuestionPage = cached === undefined ? await client.listQuestions(page, pageSize) : JSON.parse(cached);
    const data = payload.data;
    if (payload.message?.slug !== 'OK' || !data || data.page !== page || data.perPage !== pageSize || !Array.isArray(data.rows) || !Number.isInteger(data.pages) || !data.pages || data.total !== expectedTotal) {
      throw new Error(`Página ${page} diverge da configuração: confira total (${data?.total}), tamanho e paginação antes de prosseguir.`);
    }
    pages = data.pages;
    if (data.rows.length === 0) throw new Error(`Página ${page} vazia antes de concluir a coleta.`);
    if (cached === undefined) await atomicWrite(pageFile, JSON.stringify(payload));
    log({ event: 'gran_page_loaded', page, pages, source: cached === undefined ? 'api' : 'cache', rows: data.rows.length });
    for (const row of data.rows) {
      const id = String(row.id);
      if (seen.has(id)) { duplicates++; continue; }
      seen.add(id);
      let item;
      try { item = normalizeGranQuestion(row); }
      catch (error) {
        const failure = { page, id, reason: error instanceof Error ? error.message : String(error) };
        failures.push(failure);
        log({ event: 'gran_invalid_question', ...failure });
        continue;
      }
      // Database errors stop the run. Cached pages permit safe, idempotent replay.
      if (persist) {
        const result = await persistence.upsert(item);
        if (result.created) created++; else updated++;
      }
    }
    await atomicWrite(resolve(cacheDir, 'failures.json'), JSON.stringify(failures, null, 2));
    log({ event: 'gran_page_complete', mode: persist ? 'persist' : 'dry-run', page, pages, unique: seen.size, created, updated, invalid: failures.length });
  }
  let saved = 0;
  if (persist) {
    const ids = [...seen];
    for (let offset = 0; offset < ids.length; offset += 500) {
      saved += await prisma.questionBankItem.count({ where: { provider: 'GRAN', providerQuestionId: { in: ids.slice(offset, offset + 500) } } });
    }
  }
  const complete = maxPages >= pages && seen.size === expectedTotal && failures.length === 0 && (!persist || saved === expectedTotal);
  const report = { event: 'gran_finished', mode: persist ? 'persist' : 'dry-run', complete, expectedTotal, unique: seen.size, saved, created, updated, duplicates, invalid: failures.length, pages };
  await atomicWrite(resolve(cacheDir, 'report.json'), JSON.stringify(report, null, 2));
  log(report);
  if (!complete && maxPages >= pages) throw new Error('Importação incompleta. Consulte report.json e failures.json no cache.');
}

async function optionalRead(path: string): Promise<string | undefined> {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
async function atomicWrite(path: string, value: string) {
  await writeFile(`${path}.tmp`, value, { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}
function numberOption(name: string, fallback: number) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  const index = process.argv.indexOf(name);
  if (!inline && index < 0) return fallback;
  const value = Number(inline ? inline.slice(name.length + 1) : process.argv[index + 1]);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} deve ser inteiro positivo.`);
  return value;
}
try { await main(); }
catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
