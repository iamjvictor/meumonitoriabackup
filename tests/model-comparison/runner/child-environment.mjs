import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const TEST_ENV_ALLOWLIST = new Set([
  'NODE_ENV','MODEL_COMPARISON_TEST','MODEL_COMPARISON_DATABASE_SCHEMA','MODEL_COMPARISON_ALLOW_PAID','MODEL_COMPARISON_REPETITIONS','DATABASE_URL',
  'DOCUMENT_TEXT_SOURCE','DOCUMENT_PARSER_ENABLE_OCR','DOCUMENT_INGESTION_V3_ENABLED','DOCUMENT_VISUAL_ASSETS_ENABLED','DOCUMENT_PARSER_BASE_URL','DOCUMENT_VISUAL_DESCRIPTION_MODEL','CHAT_IMAGE_MODEL','CHAT_IMAGE_INPUT_ENABLED','ENABLE_PAID_STRUCTURED_FALLBACK','QUESTION_COMPLETION_FALLBACK_MODEL',
  'OPENROUTER_EMBEDDING_MODEL','OPENROUTER_EMBEDDING_DIMENSIONS','AI_REASONING_EFFORT','OPENROUTER_QUESTION_MODEL','CHAT_AI_MODEL','CHAT_AI_TEMPERATURE','CHAT_AI_MAX_TOKENS','CHAT_AI_TIMEOUT_MS',
  'QUESTION_EXTRACTION_MODEL','QUESTION_EXTRACTION_TEMPERATURE','QUESTION_EXTRACTION_MAX_TOKENS','QUESTION_SOURCE_RECONSTRUCTION_MODEL','QUESTION_SOURCE_RECONSTRUCTION_TEMPERATURE','QUESTION_SOURCE_RECONSTRUCTION_MAX_TOKENS',
  'QUESTION_CATEGORIZE_MODEL','QUESTION_CATEGORIZE_TEMPERATURE','QUESTION_CATEGORIZE_MAX_TOKENS','TOPIC_PROFILE_MODEL','TOPIC_PROFILE_TEMPERATURE','TOPIC_PROFILE_MAX_TOKENS',
  'QUESTION_COMPLETION_MODEL','QUESTION_COMPLETION_TEMPERATURE','QUESTION_COMPLETION_MAX_TOKENS','QUESTION_ALTERNATIVES_MODEL','QUESTION_ALTERNATIVES_TEMPERATURE','QUESTION_ALTERNATIVES_MAX_TOKENS',
  'QUESTION_ANSWER_MODEL','QUESTION_ANSWER_TEMPERATURE','QUESTION_ANSWER_MAX_TOKENS','QUESTION_EXPLANATION_MODEL','QUESTION_EXPLANATION_TEMPERATURE','QUESTION_EXPLANATION_MAX_TOKENS',
  'QUESTION_QUALITY_REVIEW_MODEL','QUESTION_QUALITY_REVIEW_TEMPERATURE','QUESTION_QUALITY_REVIEW_MAX_TOKENS','DOCUMENT_BLOCK_TOPIC_CLASSIFICATION_MODEL','DOCUMENT_BLOCK_TOPIC_CLASSIFICATION_TEMPERATURE',
  'MODEL_COMPARISON_PROVIDER_QWEN_QWEN3_VL_30B_A3B_INSTRUCT','MODEL_COMPARISON_PROVIDER_QWEN_QWEN3_VL_235B_A22B_INSTRUCT','MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2',
  'MODEL_COMPARISON_PROVIDER_MOONSHOTAI_KIMI_K2_5','MODEL_COMPARISON_PROVIDER_MOONSHOTAI_KIMI_K2_6','MODEL_COMPARISON_PROVIDER_QWEN_QWEN3_EMBEDDING_8B',
]);

function parseSimpleEnv(text) {
  const result = {};
  for (const line of text.split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/u);
    if (!match || line.trimStart().startsWith('#')) continue;
    result[match[1]] = match[2].replace(/^(?:"(.*)"|'(.*)')$/u, (_all, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted);
  }
  return result;
}

function extractEnvValue(text, name) {
  const prefix = `${name}=`;
  for (const line of text.split(/\r?\n/u)) {
    if (!line.startsWith(prefix)) continue;
    return line.slice(prefix.length).trim().replace(/^(?:"(.*)"|'(.*)')$/u, (_all, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted);
  }
  return undefined;
}

function parseSelectedEnv(text, names) {
  return Object.fromEntries(names.map((name) => [name, extractEnvValue(text, name)]).filter(([, value]) => value !== undefined));
}

function localUrl(value, protocols, label) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${label} ausente ou inválida no Supabase local.`); }
  if (!protocols.includes(parsed.protocol) || !['127.0.0.1','localhost','[::1]'].includes(parsed.hostname)) {
    throw new Error(`${label} recusada: somente endpoint loopback do Supabase dbtemp é permitido.`);
  }
  return parsed.toString();
}

export async function makeChildEnvironment({ root, testName, databaseUrl, runId, round, outputDir, spawn = spawnSync, read = readFile }) {
  const envText = await read(`${root}/backend/.env.test.${testName}`, 'utf8');
  const rawTestEnv = parseSimpleEnv(envText);
  for (const name of Object.keys(rawTestEnv)) {
    if (!TEST_ENV_ALLOWLIST.has(name)) throw new Error(`Variável fora da allowlist no env de teste: ${name}`);
  }
  const baseEnvText = await read(`${root}/backend/.env`, 'utf8');
  const apiKey = extractEnvValue(baseEnvText, 'OPENROUTER_API_KEY');
  if (!apiKey || !apiKey.trim()) throw new Error('OPENROUTER_API_KEY não está configurada no env local.');

  const status = spawn('supabase', ['status','--workdir','dbtemp','--output','env'], { cwd: root, encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 * 1024 });
  if (status.error || status.status !== 0) throw new Error('Não foi possível obter configuração do Supabase dbtemp; detalhes omitidos.');
  const supabase = parseSelectedEnv(status.stdout ?? '', ['API_URL','PUBLISHABLE_KEY','ANON_KEY','SERVICE_ROLE_KEY']);
  const supabaseUrl = localUrl(supabase.API_URL, ['http:','https:'], 'API_URL');
  const storageUrl = localUrl(supabase.API_URL, ['http:','https:'], 'Storage URL');
  const database = localUrl(databaseUrl, ['postgres:','postgresql:'], 'DATABASE_URL');
  const databaseParsed = new URL(database);
  if (databaseParsed.hostname !== '127.0.0.1' || databaseParsed.port !== '56322') throw new Error('DATABASE_URL deve apontar para o banco isolado em 127.0.0.1:56322.');

  const localServiceKey = supabase.SERVICE_ROLE_KEY;
  const localPublishableKey = supabase.PUBLISHABLE_KEY ?? supabase.ANON_KEY;
  if (!localServiceKey || !localPublishableKey) throw new Error('Chaves locais do Supabase não foram fornecidas por `supabase status`.');
  const testEnv = Object.fromEntries(Object.entries(rawTestEnv).filter(([name]) => TEST_ENV_ALLOWLIST.has(name)));
  return {
    ...testEnv,
    NODE_ENV: 'test', DATABASE_URL: database, SUPABASE_URL: supabaseUrl,
    SUPABASE_PUBLISHABLE_KEY: localPublishableKey, SUPABASE_SERVICE_ROLE_KEY: localServiceKey,
    OPENROUTER_API_KEY: apiKey, REDIS_URL: 'redis://127.0.0.1:1',
    DOCUMENT_VISUAL_ASSETS_ENABLED: 'true', DOCUMENT_PARSER_BASE_URL: 'http://127.0.0.1:9',
    ENABLE_PAID_STRUCTURED_FALLBACK: 'false', QUESTION_COMPLETION_FALLBACK_MODEL: '',
    ASAAS_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'), EMAIL_ENABLED: 'false',
    MODEL_COMPARISON_RUN_ID: runId, MODEL_COMPARISON_REPETITION: String(round), MODEL_COMPARISON_OUTPUT_DIR: outputDir,
    MODEL_COMPARISON_ALLOW_PAID: '1',
    // Deliberately don't inherit process.env: backend/.env may point to published services.
  };
}

export { extractEnvValue, localUrl, parseSelectedEnv, parseSimpleEnv };
