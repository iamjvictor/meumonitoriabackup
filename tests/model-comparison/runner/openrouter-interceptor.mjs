import { appendFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { TESTS } from './config.mjs';

const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
const embeddingsEndpoint = 'https://openrouter.ai/api/v1/embeddings';
const OPENROUTER_ORIGIN = 'https://openrouter.ai';
export const REQUIRED_EMBEDDING_MODEL = 'qwen/qwen3-embedding-8b';
export const DEFAULT_PROVIDER_PACING_MS = 10_000;
const modelsEndpoint = 'https://openrouter.ai/api/v1/models/';
const originalFetch = globalThis.fetch.bind(globalThis);
const REVIEW_REASONING_TEST = 'e2e_revisao_cruzada_qwen_gera_deepseek_revisa';
export const REVIEW_REASONING_MAX_TOKENS = 2400;

const capabilitiesCache = new Map();
const require = createRequire(new URL('../../../backend/package.json', import.meta.url));
const AjvModule = require('ajv');
const Ajv = AjvModule.default ?? AjvModule;
const schemaValidator = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });

function schemaErrorDetails(errors, parsedValue) {
  return (errors ?? []).map((error) => {
    const segments = String(error.instancePath ?? '').split('/').slice(1).map((segment) => segment.replaceAll('~1','/').replaceAll('~0','~'));
    const value = segments.reduce((current, segment) => current != null && Object.hasOwn(Object(current), segment) ? current[segment] : undefined, parsedValue);
    const valueDetails = typeof value === 'string'
      ? { type: 'string', chars: value.length, ...(error.keyword === 'enum' || error.keyword === 'const' ? { value: value.slice(0, 80) } : {}) }
      : typeof value === 'number' || typeof value === 'boolean' || value === null
        ? { type: value === null ? 'null' : typeof value, value }
        : Array.isArray(value) ? { type: 'array', length: value.length }
          : value && typeof value === 'object' ? { type: 'object', propertyCount: Object.keys(value).length } : { type: typeof value };
    return { path: error.instancePath || '/', keyword: error.keyword, message: error.message, params: error.params, value: valueDetails };
  });
}

async function fetchProviderMetadata(model, requestedProvider) {
  const cacheKey = `${model}:${requestedProvider}`;
  if (!capabilitiesCache.has(cacheKey)) {
    capabilitiesCache.set(cacheKey, (async () => {
      const [endpointResponse, modelsResponse] = await Promise.all([
        originalFetch(`${modelsEndpoint}${model}/endpoints`, { signal: AbortSignal.timeout(15000) }),
        originalFetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(15000) }),
      ]);
      if (!endpointResponse.ok || !modelsResponse.ok) throw new Error(`Catálogo de endpoints/modelos indisponível para ${model}.`);
      const [endpointPayload, modelsPayload] = await Promise.all([endpointResponse.json(), modelsResponse.json()]);
      const endpointInfo = endpointPayload.data?.endpoints?.find((item) => item.provider_name?.toLowerCase() === requestedProvider.toLowerCase());
      if (!endpointInfo) throw new Error(`Provedor solicitado não aparece no catálogo de endpoints de ${model}.`);
      const modelInfo = modelsPayload.data?.find((item) => item.id === model);
      const endpointModel = endpointPayload.data;
      if (!modelInfo?.supported_parameters && model !== REQUIRED_EMBEDDING_MODEL) throw new Error(`Metadados de capabilities ausentes para ${model}.`);
      return {
        ...endpointInfo,
        model_supported_parameters: modelInfo?.supported_parameters ?? [],
        model_architecture: modelInfo?.architecture ?? endpointModel?.architecture,
      };
    })());
  }
  return capabilitiesCache.get(cacheKey);
}

function canonicalOperationMessages(messages) {
  return (messages ?? []).filter((message) => {
    const content = typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? '');
    return !content.includes('A resposta anterior violou o schema local. Corrija estes erros exatos:');
  });
}

function observedSchemaRetry(messages) {
  for (const message of messages ?? []) {
    const content = typeof message?.content === 'string' ? message.content : '';
    const match = content.match(/A resposta anterior violou o schema local\. Corrija estes erros exatos: (.+?)\. Retorne somente JSON valido\./su);
    if (match) return match[1];
  }
  return null;
}

function makeOperationFingerprint(stage, agent, messages) {
  const stableInput = JSON.stringify({ stage, agent, messages: canonicalOperationMessages(messages) });
  return createHash('sha256').update(stableInput).digest('hex').slice(0, 20);
}

function redactSecret(value) {
  let safe = String(value);
  const secrets = [process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_API_KEY?.trim()].filter(Boolean);
  for (const secret of secrets) safe = safe.split(secret).join('[REDACTED]');
  return safe.replace(/Bearer\s+[^\s,;]+/giu, 'Bearer [REDACTED]');
}

function safeContentType(response) {
  const value = response.headers?.get?.('content-type');
  return typeof value === 'string' ? value.split(';', 1)[0].trim().slice(0, 80) || 'NAO_VERIFICADO' : 'NAO_VERIFICADO';
}

function contentValueType(value) {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function responsePayloadShape(payload) {
  const isObject = payload !== null && typeof payload === 'object' && !Array.isArray(payload);
  const choices = isObject && Array.isArray(payload.choices) ? payload.choices : null;
  const firstChoice = choices?.[0];
  const message = firstChoice && typeof firstChoice === 'object' ? firstChoice.message : undefined;
  const data = isObject && Array.isArray(payload.data) ? payload.data : null;
  const firstData = data?.[0];
  return {
    isJsonObject: isObject,
    hasUsage: isObject && payload.usage !== null && typeof payload.usage === 'object',
    hasProvider: isObject && typeof payload.provider === 'string' && payload.provider.length > 0,
    hasChoices: choices !== null,
    hasFirstChoiceMessage: message !== null && typeof message === 'object',
    messageContentType: message && typeof message === 'object' ? contentValueType(message.content) : 'missing',
    hasData: data !== null,
    dataCount: data?.length ?? 'NAO_VERIFICADO',
    firstDataEmbeddingType: firstData && typeof firstData === 'object' ? contentValueType(firstData.embedding) : 'missing',
  };
}

function chatResponseIsMalformed(shape) {
  return !shape.isJsonObject || !shape.hasChoices || !shape.hasFirstChoiceMessage || !['string', 'array'].includes(shape.messageContentType);
}

function embeddingResponseIsMalformed(shape) {
  return !shape.isJsonObject || !shape.hasData || shape.dataCount < 1 || !['array', 'string'].includes(shape.firstDataEmbeddingType);
}

function safeErrorClass(error) {
  const name = error && typeof error === 'object' && typeof error.name === 'string' ? error.name : 'Error';
  return name.replace(/[^A-Za-z0-9_-]/gu, '').slice(0, 40) || 'Error';
}

function createProviderPacer({ intervalMs, sleepFn }) {
  const nextStartByProvider = new Map();
  return async (provider) => {
    const key = String(provider).toLowerCase();
    const now = Date.now();
    const nextStart = nextStartByProvider.get(key) ?? now;
    const waitMs = Math.max(0, nextStart - now);
    const scheduledStart = now + waitMs;
    nextStartByProvider.set(key, scheduledStart + intervalMs);
    if (waitMs > 0) await sleepFn(waitMs);
    return waitMs;
  };
}

function numericRetryAfter(response) {
  const raw = response.headers?.get?.('retry-after');
  if (raw == null || raw.trim() === '') return 'NAO_VERIFICADO';
  const seconds = Number(raw.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : 'NAO_VERIFICADO';
}

export function stageFor(body) {
  const schema = String(body?.response_format?.json_schema?.name ?? '').toLowerCase();
  const content = JSON.stringify(body?.messages ?? []).toLowerCase();
  if (content.includes('descreva apenas o que é visível') || content.includes('descreva a figura')) return 'visual';
  if (schema === 'question_extraction') return 'extraction';
  if (schema === 'question_alternatives') return 'alternatives';
  if (schema === 'question_answer') return 'answer';
  if (schema === 'question_explanation') return 'explanation';
  if (schema === 'question_quality_review') return 'review';
  if (schema === 'question_completion_full') return 'completionFull';
  if (schema === 'question_quality_normalization' || schema === 'question_correction') return 'normalize';
  if (['question_boundary', 'question_source_reconstruction', 'question_category', 'topic_profile', 'document_block_topic_classification'].includes(schema)) return 'extraction';
  if (content.includes('data:image') || content.includes('image_url')) return 'chatImage';
  return null;
}

export function installOpenRouterInterceptor({ testName, runId, outputDir, transport = originalFetch, metadataTransport = originalFetch, localSupabaseTransport = originalFetch, resolveProviderMetadata = fetchProviderMetadata, pacingIntervalMs = DEFAULT_PROVIDER_PACING_MS, sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const models = TESTS[testName];
  if (!models) throw new Error(`Teste desconhecido: ${testName}`);
  const operationAttempts = new Map();
  const paceProvider = createProviderPacer({ intervalMs: pacingIntervalMs, sleepFn });
  let requestSequence = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const parsedUrl = new URL(url);
    const requestMethod = typeof input === 'object' && input !== null && 'method' in input ? input.method : undefined;
    const method = String(init.method ?? requestMethod ?? 'GET').toUpperCase();
    const isExactEndpoint = (expected, expectedMethod) => parsedUrl.origin === OPENROUTER_ORIGIN && parsedUrl.pathname === new URL(expected).pathname && parsedUrl.search === '' && parsedUrl.hash === '' && method === expectedMethod;
    if (isExactEndpoint(embeddingsEndpoint, 'POST')) {
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
      const model = body.model;
      const providerKey = 'MODEL_COMPARISON_PROVIDER_QWEN_QWEN3_EMBEDDING_8B';
      const provider = process.env[providerKey];
      const providerConfig = provider ? { order: [provider], allow_fallbacks: false } : null;
      const inputCount = Array.isArray(body.input) ? body.input.length : typeof body.input === 'string' ? 1 : 0;
      const embeddingInputs = Array.isArray(body.input) ? body.input : [body.input];
      const embeddingPurpose = embeddingInputs.length > 0 && embeddingInputs.every((value) => typeof value === 'string' && value.startsWith('Figura do documento '))
        ? 'visual_asset_description' : 'question_or_other_embedding';
      const operationId = `embedding-${++requestSequence}`;
      const event = {
        runId, test: testName, repetition: process.env.MODEL_COMPARISON_REPETITION ?? null,
        operationId, attemptEvidence: 'NEW_OPERATION', stage: 'embedding', agent: 'embedding',
        embeddingPurpose,
        model: model ?? 'NAO_VERIFICADO', requestedProvider: provider ?? 'UNRESOLVED', provider: 'NAO_VERIFICADO',
        httpStatus: 'NAO_VERIFICADO', responseContentType: 'NAO_VERIFICADO',
        rateLimitPacingMs: 0, retryAfterSeconds: 'NAO_VERIFICADO',
        payloadShape: { isJsonObject: 'NAO_VERIFICADO', hasUsage: 'NAO_VERIFICADO', hasProvider: 'NAO_VERIFICADO', hasChoices: 'NAO_VERIFICADO', hasFirstChoiceMessage: 'NAO_VERIFICADO', messageContentType: 'NAO_VERIFICADO', hasData: 'NAO_VERIFICADO', dataCount: 'NAO_VERIFICADO', firstDataEmbeddingType: 'NAO_VERIFICADO' },
        attempt: 1, startedAt: new Date().toISOString(), inputCount,
        inputTokens: 'NAO_VERIFICADO', outputTokens: 0, reasoningTokens: 0,
        latencyMs: 'NAO_VERIFICADO', schemaValidFirstAttempt: 'NOT_APPLICABLE',
        jsonSchemaFailureObserved: false, schemaError: 'NOT_APPLICABLE',
        costUsd: 'NAO_VERIFICADO', costSource: 'NAO_VERIFICADO',
        requestedTemperature: 'NOT_APPLICABLE', baselineMaxTokens: 'NOT_APPLICABLE', maxTokens: 'NOT_APPLICABLE',
        responseJsonValid: 'NOT_APPLICABLE', jsonError: 'NOT_APPLICABLE', reasoningConfig: { status: 'NOT_APPLICABLE', sent: null },
      };
      const record = async (outcome, error) => {
        await mkdir(outputDir, { recursive: true });
        await appendFile(resolve(outputDir, 'calls.jsonl'), `${JSON.stringify({ ...event, outcome, ...(error ? { error: redactSecret(error) } : {}) })}\n`, { mode: 0o600 });
      };
      if (model !== REQUIRED_EMBEDDING_MODEL || model !== models.embedding) {
        await record('BLOCKED_EMBEDDING_MODEL_MISMATCH');
        throw new Error(`Embedding model bloqueado: exige ${REQUIRED_EMBEDDING_MODEL}.`);
      }
      if (process.env.OPENROUTER_EMBEDDING_MODEL !== REQUIRED_EMBEDDING_MODEL || Number(body.dimensions) !== 2048 || inputCount === 0) {
        await record('BLOCKED_EMBEDDING_CONFIGURATION');
        throw new Error('Embedding bloqueado: modelo, dimensões 2048 ou entrada vazios/incompatíveis.');
      }
      if (process.env.MODEL_COMPARISON_ALLOW_PAID !== '1' || process.env.MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED !== '1' || process.env.MODEL_COMPARISON_READY !== '1') {
        await record('BLOCKED_EMBEDDING_PREREQUISITE');
        throw new Error('Embedding pago bloqueado: preflight, isolamento e autorização local precisam estar ativos.');
      }
      if (!providerConfig) {
        await record('BLOCKED_PROVIDER_UNRESOLVED');
        throw new Error(`Provedor não configurado para ${REQUIRED_EMBEDDING_MODEL}.`);
      }
      let providerMetadata;
      try {
        providerMetadata = await resolveProviderMetadata(model, provider);
      } catch (error) {
        await record('BLOCKED_ENDPOINT_CAPABILITY', error instanceof Error ? error.message : 'falha no preflight do endpoint');
        throw error;
      }
      const modalities = providerMetadata.model_architecture?.output_modalities;
      if (Array.isArray(modalities) && !modalities.some((modality) => /embedding/iu.test(modality))) {
        await record('BLOCKED_EMBEDDING_CAPABILITY');
        throw new Error(`O catálogo não anuncia saída de embedding para ${model}.`);
      }
      body.provider = providerConfig;
      event.rateLimitPacingMs = await paceProvider(provider);
      const started = Date.now();
      let response;
      try {
        response = await transport(input, { ...init, body: JSON.stringify(body) });
      } catch (error) {
        event.latencyMs = Date.now() - started;
        await record('NETWORK_ERROR', `NETWORK_ERROR_${safeErrorClass(error)}`);
        throw error;
      }
      event.latencyMs = Date.now() - started;
      event.httpStatus = response.status;
      event.responseContentType = safeContentType(response);
      event.retryAfterSeconds = numericRetryAfter(response);
      let jsonParsed = false;
      try {
        const payload = await response.clone().json();
        jsonParsed = true;
        event.payloadShape = responsePayloadShape(payload);
        event.inputTokens = payload?.usage?.prompt_tokens ?? payload?.usage?.total_tokens ?? 'NAO_VERIFICADO';
        event.provider = typeof payload?.provider === 'string' && payload.provider.length > 0 ? payload.provider : 'NAO_VERIFICADO';
        if (typeof payload?.usage?.cost === 'number' && Number.isFinite(payload.usage.cost)) {
          event.costUsd = payload.usage.cost;
          event.costSource = 'openrouter_usage.cost';
        } else {
          const promptRate = Number(providerMetadata.pricing?.prompt);
          if (typeof event.inputTokens === 'number' && Number.isFinite(promptRate)) {
            event.costUsd = Number((event.inputTokens * promptRate).toFixed(12));
            event.costSource = 'estimated_from_pinned_endpoint_price';
          }
        }
        event.embeddingCount = Array.isArray(payload?.data) ? payload.data.length : 'NAO_VERIFICADO';
        if (!response.ok) {
          event.outcome = 'HTTP_ERROR';
          event.error = `HTTP_ERROR_STATUS_${response.status}`;
        } else if (event.provider !== 'NAO_VERIFICADO' && event.provider.toLowerCase() !== provider.toLowerCase()) {
          event.outcome = 'UNEXPECTED_PROVIDER';
          event.error = `UNEXPECTED_PROVIDER_STATUS_${response.status}`;
        } else if (embeddingResponseIsMalformed(event.payloadShape)) {
          event.outcome = 'MALFORMED_SUCCESS_RESPONSE';
          event.error = `MALFORMED_SUCCESS_RESPONSE_STATUS_${response.status}`;
        } else {
          event.outcome = 'SUCCESS';
        }
      } catch {
        if (!response.ok) { event.outcome = 'HTTP_ERROR'; event.error = `HTTP_ERROR_STATUS_${response.status}`; }
        else if (jsonParsed) {
          event.outcome = 'MALFORMED_SUCCESS_RESPONSE';
          event.error = `MALFORMED_SUCCESS_RESPONSE_STATUS_${response.status}`;
        } else {
          event.outcome = 'NON_JSON_SUCCESS';
          event.error = `NON_JSON_SUCCESS_STATUS_${response.status}`;
          event.payloadShape = { ...event.payloadShape, isJsonObject: false };
        }
      }
      await mkdir(outputDir, { recursive: true });
      await appendFile(resolve(outputDir, 'calls.jsonl'), `${JSON.stringify(event)}\n`, { mode: 0o600 });
      if (event.outcome === 'HTTP_ERROR') throw new Error(`OpenRouter embeddings retornou HTTP ${response.status}; falha registrada.`);
      if (event.outcome === 'UNEXPECTED_PROVIDER') throw new Error('Provedor efetivo dos embeddings difere do solicitado.');
      return response;
    }
    if (isExactEndpoint(endpoint, 'POST')) {
      // Continue below with the only permitted inference route.
    } else if (parsedUrl.origin === OPENROUTER_ORIGIN && method === 'GET' && parsedUrl.search === '' && parsedUrl.hash === '') {
      const isModelsCatalog = parsedUrl.pathname === '/api/v1/models';
      const endpointMatch = parsedUrl.pathname.match(/^\/api\/v1\/models\/([^/]+\/[^/]+)\/endpoints$/u);
      const requestedModel = endpointMatch ? decodeURIComponent(endpointMatch[1]) : null;
      const allowedModels = new Set([...Object.values(models), REQUIRED_EMBEDDING_MODEL]);
      if (isModelsCatalog || (requestedModel && allowedModels.has(requestedModel))) return metadataTransport(input, init);
      throw new Error('Fetch bloqueado pelo runner: rota GET do OpenRouter fora da allowlist de metadados.');
    } else {
      const configuredSupabase = process.env.SUPABASE_URL;
      let supabaseOrigin = null;
      try {
        const supabaseUrl = new URL(configuredSupabase ?? '');
        if (['127.0.0.1','localhost','[::1]'].includes(supabaseUrl.hostname)) supabaseOrigin = supabaseUrl.origin;
      } catch { /* supabase env absent: deny all Supabase traffic */ }
      if (supabaseOrigin && parsedUrl.origin === supabaseOrigin && method === 'GET' && parsedUrl.pathname.startsWith('/storage/v1/object/')) return localSupabaseTransport(input, init);
      throw new Error('Fetch bloqueado pelo runner: somente inferência OpenRouter exata, metadados allowlisted ou Storage Supabase local são permitidos.');
    }
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
    const stage = stageFor(body);
    const model = stage ? models[stage] : body.model;
    const providerKey = model ? `MODEL_COMPARISON_PROVIDER_${model.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}` : '';
    const provider = providerKey ? process.env[providerKey] : undefined;
    const providerConfig = provider ? { order: [provider], allow_fallbacks: false } : null;
    const agent = body.response_format?.json_schema?.name ?? null;
    const fingerprint = makeOperationFingerprint(stage, agent, body.messages);
    const attemptKey = `${process.env.MODEL_COMPARISON_REPETITION ?? 'unspecified'}:${fingerprint}`;
    const previousOperation = operationAttempts.get(attemptKey);
    const rawSchemaRetryError = observedSchemaRetry(body.messages);
    const isRetry = rawSchemaRetryError !== null || previousOperation?.retryable === true;
    const opId = isRetry && previousOperation ? previousOperation.operationId : `${fingerprint}-${++requestSequence}`;
    const attempt = isRetry && previousOperation ? previousOperation.attempt + 1 : 1;
    const retrySchemaError = rawSchemaRetryError === null ? null : redactSecret(rawSchemaRetryError);
    const attemptEvidence = rawSchemaRetryError !== null
      ? previousOperation ? 'SCHEMA_RETRY_FEEDBACK' : 'SCHEMA_RETRY_FEEDBACK_PRIOR_CALL_UNOBSERVED'
      : isRetry ? 'REPEATED_REQUEST_AFTER_RETRYABLE_FAILURE_INFERRED' : 'NEW_OPERATION';
    operationAttempts.set(attemptKey, { operationId: opId, attempt, retryable: false });
    const event = {
      runId, test: testName, repetition: process.env.MODEL_COMPARISON_REPETITION ?? null,
      operationId: opId, attemptEvidence, stage: stage ?? 'UNMAPPED', agent,
      model, requestedProvider: provider ?? 'UNRESOLVED', provider: 'NAO_VERIFICADO', attempt,
      httpStatus: 'NAO_VERIFICADO', responseContentType: 'NAO_VERIFICADO',
      rateLimitPacingMs: 0, retryAfterSeconds: 'NAO_VERIFICADO',
      payloadShape: { isJsonObject: 'NAO_VERIFICADO', hasUsage: 'NAO_VERIFICADO', hasProvider: 'NAO_VERIFICADO', hasChoices: 'NAO_VERIFICADO', hasFirstChoiceMessage: 'NAO_VERIFICADO', messageContentType: 'NAO_VERIFICADO', hasData: 'NAO_VERIFICADO', dataCount: 'NAO_VERIFICADO', firstDataEmbeddingType: 'NAO_VERIFICADO' },
      startedAt: new Date().toISOString(), inputTokens: 'NAO_VERIFICADO', outputTokens: 'NAO_VERIFICADO',
      reasoningTokens: 'NAO_VERIFICADO', latencyMs: 'NAO_VERIFICADO', schemaValidFirstAttempt: isRetry ? false : 'NAO_VERIFICADO',
      jsonSchemaFailureObserved: retrySchemaError !== null, schemaError: retrySchemaError ?? 'NAO_VERIFICADO',
      costUsd: 'NAO_VERIFICADO', costSource: 'NAO_VERIFICADO',
      requestedTemperature: body.temperature ?? 'NAO_VERIFICADO',
      baselineMaxTokens: body.max_tokens ?? body.max_completion_tokens ?? 'NAO_VERIFICADO',
      maxTokens: body.max_tokens ?? body.max_completion_tokens ?? 'NAO_VERIFICADO',
      responseJsonValid: 'NAO_VERIFICADO', jsonError: 'NAO_VERIFICADO',
      reasoningConfig: { status: 'NAO_VERIFICADO', sent: null },
    };
    if (!stage || !model) {
      await mkdir(outputDir, { recursive: true });
      await appendFile(resolve(outputDir, 'calls.jsonl'), `${JSON.stringify({ ...event, outcome: 'BLOCKED_UNMAPPED_STAGE' })}\n`, { mode: 0o600 });
      throw new Error(`Etapa OpenRouter sem mapeamento explícito (${event.agent ?? 'schemaName ausente'}); chamada bloqueada.`);
    }
    if (process.env.MODEL_COMPARISON_ALLOW_PAID !== '1') {
      await mkdir(outputDir, { recursive: true });
      await appendFile(resolve(outputDir, 'calls.jsonl'), `${JSON.stringify({ ...event, outcome: 'BLOCKED_DRY_RUN' })}\n`, { mode: 0o600 });
      throw new Error('Chamada paga bloqueada: dry-run é padrão; revisão do resumo e autorização explícita ainda são necessárias.');
    }
    if (process.env.MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED !== '1' || process.env.MODEL_COMPARISON_READY !== '1') {
      await mkdir(outputDir, { recursive: true });
      await appendFile(resolve(outputDir, 'calls.jsonl'), `${JSON.stringify({ ...event, outcome: 'BLOCKED_RUN_PREREQUISITE' })}\n`, { mode: 0o600 });
      throw new Error('Chamada paga bloqueada: catálogo de endpoints/provedores, privacidade, import baseline e isolamento precisam ser confirmados antes da execução.');
    }
    if (!providerConfig) {
      await mkdir(outputDir, { recursive: true });
      await appendFile(resolve(outputDir, 'calls.jsonl'), `${JSON.stringify({ ...event, outcome: 'BLOCKED_PROVIDER_UNRESOLVED' })}\n`, { mode: 0o600 });
      throw new Error(`Provedor não configurado para ${model}; chamada paga bloqueada.`);
    }
    let providerMetadata;
    try {
      providerMetadata = await resolveProviderMetadata(model, provider);
    } catch (error) {
      event.endpointCapabilityError = error instanceof Error ? error.message : 'falha ao consultar catálogo de endpoint';
      await mkdir(outputDir, { recursive: true });
      await appendFile(resolve(outputDir, 'calls.jsonl'), `${JSON.stringify({ ...event, outcome: 'BLOCKED_ENDPOINT_CAPABILITY' })}\n`, { mode: 0o600 });
      throw error;
    }
    const supported = new Set(providerMetadata.supported_parameters ?? []);
    if (!Array.isArray(providerMetadata.model_supported_parameters)) {
      event.endpointCapabilityError = 'Metadados de capabilities do modelo ausentes; reasoning não pode ser configurado com segurança.';
      await mkdir(outputDir, { recursive: true });
      await appendFile(resolve(outputDir, 'calls.jsonl'), `${JSON.stringify({ ...event, outcome: 'BLOCKED_MODEL_CAPABILITY_UNKNOWN' })}\n`, { mode: 0o600 });
      throw new Error(event.endpointCapabilityError);
    }
    const modelSupported = new Set(providerMetadata.model_supported_parameters ?? []);
    if (!supported.has('structured_outputs')) {
      event.endpointCapabilityError = 'Provedor não anuncia structured_outputs para JSON Schema no catálogo.';
      await mkdir(outputDir, { recursive: true });
      await appendFile(resolve(outputDir, 'calls.jsonl'), `${JSON.stringify({ ...event, outcome: 'BLOCKED_JSON_SCHEMA_UNSUPPORTED' })}\n`, { mode: 0o600 });
      throw new Error(event.endpointCapabilityError);
    }
    const isCrossReview = testName === REVIEW_REASONING_TEST && stage === 'review';
    const modelUsesReasoning = modelSupported.has('reasoning') || modelSupported.has('reasoning_effort');
    const reasoningParameter = ['reasoning', 'reasoning_effort'].find((parameter) => modelSupported.has(parameter) && supported.has(parameter));
    const reasoningSupported = reasoningParameter !== undefined;
    if (modelUsesReasoning && !reasoningSupported) {
      event.endpointCapabilityError = 'O modelo anuncia reasoning, mas o endpoint selecionado não anuncia controle de reasoning; não é possível garantir a configuração pedida.';
      await mkdir(outputDir, { recursive: true });
      await appendFile(resolve(outputDir, 'calls.jsonl'), `${JSON.stringify({ ...event, outcome: 'BLOCKED_REASONING_CONTROL_UNSUPPORTED' })}\n`, { mode: 0o600 });
      throw new Error(event.endpointCapabilityError);
    }
    if (isCrossReview && !reasoningSupported) {
      event.endpointCapabilityError = 'O endpoint não anuncia parâmetro de reasoning necessário para a revisão cruzada.';
      await mkdir(outputDir, { recursive: true });
      await appendFile(resolve(outputDir, 'calls.jsonl'), `${JSON.stringify({ ...event, outcome: 'BLOCKED_REASONING_UNSUPPORTED' })}\n`, { mode: 0o600 });
      throw new Error(event.endpointCapabilityError);
    }
    body.model = model;
    body.provider = providerConfig;
    delete body.reasoning;
    delete body.reasoning_effort;
    delete body.include_reasoning;
    if (reasoningSupported) {
      if (reasoningParameter === 'reasoning') {
        body.reasoning = { enabled: isCrossReview };
        event.reasoningConfig = { status: 'APPLIED', parameter: 'reasoning', sent: body.reasoning };
      } else {
        body.reasoning_effort = isCrossReview ? 'high' : 'none';
        event.reasoningConfig = { status: 'APPLIED', parameter: 'reasoning_effort', sent: body.reasoning_effort };
      }
    } else {
      event.reasoningConfig = { status: 'UNSUPPORTED_BY_MODEL', sent: 'NAO_VERIFICADO' };
    }
    if (isCrossReview) {
      body.max_tokens = REVIEW_REASONING_MAX_TOKENS;
      delete body.max_completion_tokens;
      event.maxTokens = REVIEW_REASONING_MAX_TOKENS;
    }
    event.rateLimitPacingMs = await paceProvider(provider);
    const started = Date.now();
    let response;
    try {
      response = await transport(input, { ...init, body: JSON.stringify(body) });
    } catch (error) {
      event.latencyMs = Date.now() - started;
      event.outcome = 'NETWORK_ERROR';
      event.error = `NETWORK_ERROR_${safeErrorClass(error)}`;
      operationAttempts.set(attemptKey, { operationId: opId, attempt, retryable: true });
      await mkdir(outputDir, { recursive: true });
      await appendFile(resolve(outputDir, 'calls.jsonl'), `${JSON.stringify(event)}\n`, { mode: 0o600 });
      throw error;
    }
    event.latencyMs = Date.now() - started;
    event.httpStatus = response.status;
    event.responseContentType = safeContentType(response);
    event.retryAfterSeconds = numericRetryAfter(response);
    let jsonParsed = false;
    try {
      const payload = await response.clone().json();
      jsonParsed = true;
      event.payloadShape = responsePayloadShape(payload);
      event.inputTokens = payload?.usage?.prompt_tokens ?? 'NAO_VERIFICADO';
      event.outputTokens = payload?.usage?.completion_tokens ?? 'NAO_VERIFICADO';
      event.reasoningTokens = payload?.usage?.completion_tokens_details?.reasoning_tokens ?? 'NAO_VERIFICADO';
      if (typeof payload?.usage?.cost === 'number' && Number.isFinite(payload.usage.cost)) {
        event.costUsd = payload.usage.cost;
        event.costSource = 'openrouter_usage.cost';
      } else {
        const promptRate = Number(providerMetadata.pricing?.prompt);
        const completionRate = Number(providerMetadata.pricing?.completion);
        if (typeof event.inputTokens === 'number' && typeof event.outputTokens === 'number' && Number.isFinite(promptRate) && Number.isFinite(completionRate)) {
          event.costUsd = Number((event.inputTokens * promptRate + event.outputTokens * completionRate).toFixed(12));
          event.costSource = 'estimated_from_pinned_endpoint_price';
        }
      }
      event.provider = typeof payload?.provider === 'string' && payload.provider.length > 0 ? payload.provider : 'NAO_VERIFICADO';
      const responseContent = payload?.choices?.[0]?.message?.content;
      if (body.response_format?.json_schema && typeof responseContent === 'string') {
        let parsed;
        try {
          parsed = JSON.parse(responseContent);
          event.responseJsonValid = true;
        } catch {
          event.responseJsonValid = false;
          event.schemaValidFirstAttempt = attempt === 1 ? false : event.schemaValidFirstAttempt;
          event.jsonError = 'INVALID_JSON_CONTENT';
          operationAttempts.set(attemptKey, { operationId: opId, attempt, retryable: true });
        }
        const schema = body.response_format.json_schema.schema;
        if (event.responseJsonValid === true && schema && typeof schema === 'object') {
          try {
            const schemaValid = schemaValidator.validate(schema, parsed);
            event.schemaValidationMethod = 'request_json_schema_ajv';
            event.schemaValidFirstAttempt = attempt === 1 ? schemaValid : (schemaValid ? event.schemaValidFirstAttempt : false);
            event.jsonSchemaFailureObserved = !schemaValid;
            event.schemaError = schemaValid ? null : schemaErrorDetails(schemaValidator.errors, parsed);
            if (!schemaValid) operationAttempts.set(attemptKey, { operationId: opId, attempt, retryable: true });
          } catch {
            event.schemaValidationMethod = 'NAO_VERIFICADO';
            event.schemaValidationError = 'Schema JSON do request não foi compilado pelo validador local.';
          }
        }
      }
      if (!response.ok) {
        event.outcome = 'HTTP_ERROR';
        event.error = `HTTP_ERROR_STATUS_${response.status}`;
        operationAttempts.set(attemptKey, { operationId: opId, attempt, retryable: true });
      } else if (event.responseJsonValid === false) {
        operationAttempts.set(attemptKey, { operationId: opId, attempt, retryable: true });
      }
      if (response.ok && event.provider !== 'NAO_VERIFICADO' && event.provider.toLowerCase() !== provider.toLowerCase()) event.outcome = 'UNEXPECTED_PROVIDER';
      else if (response.ok && chatResponseIsMalformed(event.payloadShape)) {
        event.outcome = 'MALFORMED_SUCCESS_RESPONSE';
        event.error = `MALFORMED_SUCCESS_RESPONSE_STATUS_${response.status}`;
      } else if (response.ok) event.outcome = 'SUCCESS';
    } catch {
      if (!response.ok) {
        event.outcome = 'HTTP_ERROR';
        event.error = `HTTP_ERROR_STATUS_${response.status}`;
        operationAttempts.set(attemptKey, { operationId: opId, attempt, retryable: true });
      } else if (jsonParsed) {
        event.outcome = 'MALFORMED_SUCCESS_RESPONSE';
        event.error = `MALFORMED_SUCCESS_RESPONSE_STATUS_${response.status}`;
      } else {
        event.outcome = 'NON_JSON_SUCCESS';
        event.error = `NON_JSON_SUCCESS_STATUS_${response.status}`;
        event.payloadShape = { ...event.payloadShape, isJsonObject: false };
      }
    }
    await mkdir(outputDir, { recursive: true });
    await appendFile(resolve(outputDir, 'calls.jsonl'), `${JSON.stringify(event)}\n`, { mode: 0o600 });
    if (event.outcome === 'HTTP_ERROR') throw new Error(`OpenRouter retornou HTTP ${response.status}; chamada registrada como falha.`);
    if (event.outcome === 'UNEXPECTED_PROVIDER') throw new Error('Provedor efetivamente usado difere do provedor solicitado; resposta não aceita pela comparação.');
    return response;
  };
  return () => { globalThis.fetch = originalFetch; };
}

