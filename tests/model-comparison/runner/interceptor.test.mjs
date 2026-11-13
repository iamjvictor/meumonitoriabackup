import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { installOpenRouterInterceptor as installOpenRouterInterceptorRaw, stageFor, REVIEW_REASONING_MAX_TOKENS, REQUIRED_EMBEDDING_MODEL } from './openrouter-interceptor.mjs';
import { summarizeTelemetry, finalizeSummaryWithTelemetry, finalizeSummaryWithTelemetryFile } from './telemetry-summary.mjs';

const name = 'e2e_economica_qwen30b_deepseek';

function installOpenRouterInterceptor(options) {
  return installOpenRouterInterceptorRaw({ pacingIntervalMs: 0, ...options });
}

test('mapeia schemaName às etapas do teste', () => {
  assert.equal(stageFor({ response_format: { json_schema: { name: 'question_alternatives' } } }), 'alternatives');
  assert.equal(stageFor({ response_format: { json_schema: { name: 'question_quality_review' } } }), 'review');
  assert.equal(stageFor({ response_format: { json_schema: { name: 'question_completion_full' } } }), 'completionFull');
  assert.equal(stageFor({ messages: [{ role: 'user', content: 'Descreva apenas o que é visível nesta figura' }] }), 'visual');
});

test('bloqueia qualquer fetch fora das rotas exatas e permite somente metadata/modelo e storage local', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'model-comparison-network-allowlist-'));
  const oldSupabase = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = 'http://127.0.0.1:56321';
  const seen = [];
  const restore = installOpenRouterInterceptor({
    testName: name, runId: 'network-allowlist-run', outputDir: dir,
    transport: async () => { seen.push('inference'); return Response.json({}); },
    metadataTransport: async (input) => { seen.push(new URL(typeof input === 'string' ? input : input.url).pathname); return Response.json({ ok: true }); },
    localSupabaseTransport: async (input) => { seen.push(new URL(typeof input === 'string' ? input : input.url).pathname); return Response.json({ ok: true }); },
  });
  try {
    await assert.rejects(fetch('https://evil.example/api/v1/chat/completions', { method: 'POST', body: '{}' }), /Fetch bloqueado/u);
    await assert.rejects(fetch('https://openrouter.ai/api/v1/chat/completions/extra', { method: 'POST', body: '{}' }), /Fetch bloqueado/u);
    await assert.rejects(fetch('https://openrouter.ai/api/v1/models/qwen/not-allowlisted/endpoints'), /fora da allowlist/u);
    await assert.rejects(fetch(new Request('https://openrouter.ai/api/v1/models', { method: 'POST' })), /Fetch bloqueado/u);
    await assert.rejects(fetch(new Request('http://127.0.0.1:56321/storage/v1/object/authenticated/document-parser-artifacts/item.png', { method: 'POST' })), /Fetch bloqueado/u);
    await fetch('https://openrouter.ai/api/v1/models');
    await fetch('https://openrouter.ai/api/v1/models/qwen/qwen3-vl-30b-a3b-instruct/endpoints');
    await fetch('http://127.0.0.1:56321/storage/v1/object/authenticated/document-parser-artifacts/sample.png');
    await assert.rejects(fetch('http://127.0.0.1:56321/rest/v1/monitor_documents'), /Fetch bloqueado/u);
  } finally {
    restore();
    if (oldSupabase === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldSupabase;
  }
  assert.deepEqual(seen, ['/api/v1/models','/api/v1/models/qwen/qwen3-vl-30b-a3b-instruct/endpoints','/storage/v1/object/authenticated/document-parser-artifacts/sample.png']);
  await rm(dir,{recursive:true,force:true});
});

test('injeta modelo e provider order sem fallback e grava telemetria sem segredo', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'model-comparison-'));
  const previousPaid = process.env.MODEL_COMPARISON_ALLOW_PAID;
  const previousReady = process.env.MODEL_COMPARISON_READY;
  const previousCatalog = process.env.MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED;
  const providerKey = 'MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2';
  const previousProvider = process.env[providerKey];
  process.env.MODEL_COMPARISON_ALLOW_PAID = '1';
  process.env.MODEL_COMPARISON_READY = '1';
  process.env.MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED = '1';
  process.env[providerKey] = 'catalog-provider-for-test';
  let sent;
  const restore = installOpenRouterInterceptor({
    testName: name, runId: 'fake-run', outputDir: dir,
    resolveProviderMetadata: async () => ({ supported_parameters: ['reasoning', 'response_format', 'structured_outputs'], model_supported_parameters: ['reasoning'] }),
    transport: async (_input, init) => {
      sent = JSON.parse(init.body);
      return Response.json({ provider: 'catalog-provider-for-test', usage: { prompt_tokens: 7, completion_tokens: 3, cost: 0.00042, completion_tokens_details: { reasoning_tokens: 1 } }, choices: [{ message: { content: '{"ok":true}' } }] });
    },
  });
  try {
    await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer secret-that-must-not-log' },
      body: JSON.stringify({ model: 'baseline/model', temperature: 0.35, max_tokens: 1200, reasoning: { effort: 'high' }, response_format: { type: 'json_schema', json_schema: { name: 'question_alternatives' } }, messages: [] }),
    });
  } finally {
    restore();
    if (previousPaid === undefined) delete process.env.MODEL_COMPARISON_ALLOW_PAID; else process.env.MODEL_COMPARISON_ALLOW_PAID = previousPaid;
    if (previousReady === undefined) delete process.env.MODEL_COMPARISON_READY; else process.env.MODEL_COMPARISON_READY = previousReady;
    if (previousCatalog === undefined) delete process.env.MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED; else process.env.MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED = previousCatalog;
    if (previousProvider === undefined) delete process.env[providerKey]; else process.env[providerKey] = previousProvider;
  }
  assert.equal(sent.model, 'deepseek/deepseek-v3.2');
  assert.deepEqual(sent.provider, { order: ['catalog-provider-for-test'], allow_fallbacks: false });
  assert.deepEqual(sent.reasoning, { enabled: false });
  assert.equal(sent.temperature, 0.35);
  assert.equal(sent.max_tokens, 1200);
  const lines = (await readFile(resolve(dir, 'calls.jsonl'), 'utf8')).trim().split('\n');
  const call = JSON.parse(lines[0]);
  assert.equal(call.inputTokens, 7);
  assert.equal(call.outputTokens, 3);
  assert.equal(call.reasoningTokens, 1);
  assert.equal(call.costUsd, 0.00042);
  assert.equal(call.costSource, 'openrouter_usage.cost');
  assert.equal(call.provider, 'catalog-provider-for-test');
  assert.equal(call.requestedProvider, 'catalog-provider-for-test');
  assert.deepEqual(call.reasoningConfig, { status: 'APPLIED', parameter: 'reasoning', sent: { enabled: false } });
  assert.equal(call.requestedTemperature, 0.35);
  assert.equal(call.baselineMaxTokens, 1200);
  assert.equal(call.schemaValidFirstAttempt, 'NAO_VERIFICADO');
  assert.equal(JSON.stringify(call).includes('secret-that-must-not-log'), false);
  await rm(dir, { recursive: true, force: true });
});

test('não presume provedor pedido quando a resposta não informa o provedor real', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'model-comparison-no-provider-'));
  const envBefore = Object.fromEntries(['MODEL_COMPARISON_ALLOW_PAID','MODEL_COMPARISON_READY','MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED', 'MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2'].map((key) => [key, process.env[key]]));
  Object.assign(process.env, { MODEL_COMPARISON_ALLOW_PAID: '1', MODEL_COMPARISON_READY: '1', MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED: '1', MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2: 'requested-provider' });
  const restore = installOpenRouterInterceptor({
    testName: name, runId: 'provider-unknown-run', outputDir: dir,
    resolveProviderMetadata: async () => ({ supported_parameters: ['reasoning', 'response_format', 'structured_outputs'], model_supported_parameters: ['reasoning', 'response_format'] }),
    transport: async () => Response.json({ usage: { prompt_tokens: 2, completion_tokens: 1 }, choices: [] }),
  });
  try {
    await fetch('https://openrouter.ai/api/v1/chat/completions', { method:'POST', body:JSON.stringify({ response_format:{json_schema:{name:'question_answer'}}, messages:[] }) });
  } finally {
    restore();
    for (const [key,value] of Object.entries(envBefore)) value === undefined ? delete process.env[key] : process.env[key]=value;
  }
  const call = JSON.parse((await readFile(resolve(dir, 'calls.jsonl'), 'utf8')).trim());
  assert.equal(call.requestedProvider, 'requested-provider');
  assert.equal(call.provider, 'NAO_VERIFICADO');
  assert.equal(call.jsonSchemaFailureObserved, false);
  assert.equal(call.schemaValidFirstAttempt, 'NAO_VERIFICADO');
  await rm(dir, { recursive:true, force:true });
});

test('revisão cruzada D habilita reasoning e eleva apenas o teto dessa etapa', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'model-comparison-review-d-'));
  const envBefore = Object.fromEntries(['MODEL_COMPARISON_ALLOW_PAID','MODEL_COMPARISON_READY','MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED', 'MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2'].map((key) => [key, process.env[key]]));
  Object.assign(process.env, { MODEL_COMPARISON_ALLOW_PAID: '1', MODEL_COMPARISON_READY: '1', MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED: '1', MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2: 'requested-provider' });
  let sent;
  const restore = installOpenRouterInterceptor({
    testName: 'e2e_revisao_cruzada_qwen_gera_deepseek_revisa', runId: 'review-d-run', outputDir: dir,
    resolveProviderMetadata: async () => ({ supported_parameters: ['reasoning', 'response_format', 'structured_outputs'], model_supported_parameters: ['reasoning'] }),
    transport: async (_input, init) => { sent=JSON.parse(init.body); return Response.json({ usage:{prompt_tokens:4,completion_tokens:2},choices:[] }); },
  });
  try {
    await fetch('https://openrouter.ai/api/v1/chat/completions', { method:'POST', body:JSON.stringify({ response_format:{json_schema:{name:'question_quality_review'}}, temperature:0, max_tokens:1600, messages:[] }) });
  } finally {
    restore();
    for (const [key,value] of Object.entries(envBefore)) value === undefined ? delete process.env[key] : process.env[key]=value;
  }
  assert.deepEqual(sent.reasoning, { enabled:true });
  assert.equal(sent.max_tokens, REVIEW_REASONING_MAX_TOKENS);
  assert.equal(sent.temperature, 0);
  const call=JSON.parse((await readFile(resolve(dir,'calls.jsonl'),'utf8')).trim());
  assert.equal(call.provider,'NAO_VERIFICADO');
  assert.equal(call.baselineMaxTokens,1600);
  assert.equal(call.maxTokens,REVIEW_REASONING_MAX_TOKENS);
  assert.deepEqual(call.reasoningConfig,{status:'APPLIED',parameter:'reasoning',sent:{enabled:true}});
  await rm(dir,{recursive:true,force:true});
});

test('conta tentativas por operação e registra falha de schema só quando retry informa a causa', async () => {
  const dir=await mkdtemp(resolve(tmpdir(),'model-comparison-attempts-'));
  const envBefore=Object.fromEntries(['MODEL_COMPARISON_ALLOW_PAID','MODEL_COMPARISON_READY','MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED','MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2'].map((key)=>[key,process.env[key]]));
  Object.assign(process.env,{MODEL_COMPARISON_ALLOW_PAID:'1',MODEL_COMPARISON_READY:'1',MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED:'1',MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2:'requested-provider',MODEL_COMPARISON_REPETITION:'1'});
  const restore=installOpenRouterInterceptor({testName:name,runId:'attempt-run',outputDir:dir,resolveProviderMetadata:async()=>({supported_parameters:['reasoning','response_format','structured_outputs'],model_supported_parameters:['reasoning']}),transport:async()=>Response.json({provider:'requested-provider',usage:{prompt_tokens:1,completion_tokens:1},choices:[{message:{content:'{"alternatives":[]}'}}]})});
  const url='https://openrouter.ai/api/v1/chat/completions';
  const base={response_format:{json_schema:{name:'question_alternatives'}},temperature:.35,max_tokens:1200,messages:[{role:'user',content:'operation-one'}]};
  try {
    await fetch(url,{method:'POST',body:JSON.stringify(base)});
    await fetch(url,{method:'POST',body:JSON.stringify({...base,messages:[...base.messages,{role:'system',content:'A resposta anterior violou o schema local. Corrija estes erros exatos: [{"path":["alternatives",0],"message":"required"}]. Retorne somente JSON valido.'}]})});
    await fetch(url,{method:'POST',body:JSON.stringify({...base,messages:[{role:'user',content:'operation-two'}]})});
  } finally { restore(); for(const [key,value] of Object.entries(envBefore)) value===undefined?delete process.env[key]:process.env[key]=value; }
  const calls=(await readFile(resolve(dir,'calls.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls[0].operationId,calls[1].operationId);
  assert.notEqual(calls[1].operationId,calls[2].operationId);
  assert.deepEqual(calls.map(call=>call.attempt),[1,2,1]);
  assert.equal(calls[0].jsonSchemaFailureObserved,false);
  assert.equal(calls[0].responseJsonValid,true);
  assert.equal(calls[1].jsonSchemaFailureObserved,true);
  assert.equal(calls[1].schemaValidFirstAttempt,false);
  assert.equal(calls[1].schemaError,'[{"path":["alternatives",0],"message":"required"}]');
  assert.equal(calls[1].attemptEvidence,'SCHEMA_RETRY_FEEDBACK');
  assert.equal(calls[2].jsonSchemaFailureObserved,false);
  assert.equal(calls[2].schemaValidFirstAttempt,'NAO_VERIFICADO');
  const summary=summarizeTelemetry(await readFile(resolve(dir,'calls.jsonl'),'utf8'));
  assert.equal(summary.rounds[0].calls[0].schemaValidFirstAttempt,false);
  assert.equal(summary.rounds[0].metricsByAgent.question_alternatives.jsonSchemaValidFirstAttemptRate,'NAO_VERIFICADO');
  await rm(dir,{recursive:true,force:true});
});

test('modelo sem reasoning catalogado recebe parâmetros baseline sem reasoning sintetizado', async () => {
  const dir=await mkdtemp(resolve(tmpdir(),'model-comparison-no-reasoning-'));
  const envBefore=Object.fromEntries(['MODEL_COMPARISON_ALLOW_PAID','MODEL_COMPARISON_READY','MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED','MODEL_COMPARISON_PROVIDER_QWEN_QWEN3_VL_30B_A3B_INSTRUCT'].map((key)=>[key,process.env[key]]));
  Object.assign(process.env,{MODEL_COMPARISON_ALLOW_PAID:'1',MODEL_COMPARISON_READY:'1',MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED:'1',MODEL_COMPARISON_PROVIDER_QWEN_QWEN3_VL_30B_A3B_INSTRUCT:'requested-provider'});
  let sent;
  const restore=installOpenRouterInterceptor({testName:name,runId:'no-reasoning-run',outputDir:dir,resolveProviderMetadata:async()=>({supported_parameters:['response_format','structured_outputs','temperature'],model_supported_parameters:['response_format']}),transport:async(_input,init)=>{sent=JSON.parse(init.body);return Response.json({provider:'requested-provider',choices:[]});}});
  try { await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body:JSON.stringify({response_format:{json_schema:{name:'question_extraction'}},temperature:.1,max_tokens:4000,reasoning:{effort:'low'},messages:[]})}); }
  finally { restore(); for(const [key,value] of Object.entries(envBefore)) value===undefined?delete process.env[key]:process.env[key]=value; }
  assert.equal(Object.hasOwn(sent,'reasoning'),false);
  assert.equal(sent.temperature,.1);
  assert.equal(sent.max_tokens,4000);
  const call=JSON.parse((await readFile(resolve(dir,'calls.jsonl'),'utf8')).trim());
  assert.deepEqual(call.reasoningConfig,{status:'UNSUPPORTED_BY_MODEL',sent:'NAO_VERIFICADO'});
  await rm(dir,{recursive:true,force:true});
});

test('roteia e contabiliza somente embeddings Qwen com provedor fixo', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'model-comparison-embeddings-'));
  const keys = ['MODEL_COMPARISON_ALLOW_PAID', 'MODEL_COMPARISON_READY', 'MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED', 'OPENROUTER_EMBEDDING_MODEL', 'MODEL_COMPARISON_PROVIDER_QWEN_QWEN3_EMBEDDING_8B'];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    MODEL_COMPARISON_ALLOW_PAID: '1', MODEL_COMPARISON_READY: '1', MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED: '1',
    OPENROUTER_EMBEDDING_MODEL: REQUIRED_EMBEDDING_MODEL, MODEL_COMPARISON_PROVIDER_QWEN_QWEN3_EMBEDDING_8B: 'DeepInfra',
    MODEL_COMPARISON_REPETITION: '1',
  });
  let sent;
  const restore = installOpenRouterInterceptor({
    testName: name, runId: 'embedding-test-run', outputDir: dir,
    resolveProviderMetadata: async () => ({ supported_parameters: [], model_supported_parameters: [], model_architecture: { output_modalities: ['embeddings'] } }),
    transport: async (_input, init) => {
      sent = JSON.parse(init.body);
      return Response.json({ provider: 'DeepInfra', usage: { prompt_tokens: 13, total_tokens: 13, cost: 0.00000013 }, data: [{ embedding: [0.1, 0.2], index: 0 }] });
    },
  });
  try {
    await fetch('https://openrouter.ai/api/v1/embeddings', { method: 'POST', headers: { Authorization: 'Bearer never-log-this' }, body: JSON.stringify({ model: REQUIRED_EMBEDDING_MODEL, input: ['private visual description'], dimensions: 2048, encoding_format: 'float' }) });
  } finally {
    restore();
    for (const [key, value] of Object.entries(before)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
  assert.deepEqual(sent.provider, { order: ['DeepInfra'], allow_fallbacks: false });
  assert.equal(sent.model, REQUIRED_EMBEDDING_MODEL);
  const call = JSON.parse((await readFile(resolve(dir, 'calls.jsonl'), 'utf8')).trim());
  assert.equal(call.stage, 'embedding');
  assert.equal(call.inputTokens, 13);
  assert.equal(call.outputTokens, 0);
  assert.equal(call.costUsd, 0.00000013);
  assert.equal(call.provider, 'DeepInfra');
  assert.equal(call.inputCount, 1);
  const telemetry = summarizeTelemetry(JSON.stringify(call));
  assert.equal(telemetry.rounds[0].metrics.inputTokens, 13);
  assert.equal(telemetry.rounds[0].metrics.outputTokens, 0);
  assert.equal(telemetry.rounds[0].metrics.costUsd, 0.00000013);
  assert.equal(telemetry.rounds[0].metrics.jsonValidFirstAttemptRate, 'NOT_APPLICABLE');
  assert.equal(telemetry.rounds[0].metricsByAgent.embedding.jsonSchemaValidFirstAttemptRate, 'NOT_APPLICABLE');
  const log = JSON.stringify(call);
  assert.equal(log.includes('private visual description'), false);
  assert.equal(log.includes('never-log-this'), false);
  await rm(dir, { recursive: true, force: true });
});

test('estima embedding apenas pelo custo dos tokens de entrada quando usage.cost está ausente', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'model-comparison-embedding-estimate-'));
  const keys = ['MODEL_COMPARISON_ALLOW_PAID', 'MODEL_COMPARISON_READY', 'MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED', 'OPENROUTER_EMBEDDING_MODEL', 'MODEL_COMPARISON_PROVIDER_QWEN_QWEN3_EMBEDDING_8B'];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    MODEL_COMPARISON_ALLOW_PAID: '1', MODEL_COMPARISON_READY: '1', MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED: '1',
    OPENROUTER_EMBEDDING_MODEL: REQUIRED_EMBEDDING_MODEL, MODEL_COMPARISON_PROVIDER_QWEN_QWEN3_EMBEDDING_8B: 'DeepInfra',
  });
  const restore = installOpenRouterInterceptor({
    testName: name, runId: 'embedding-estimate-run', outputDir: dir,
    resolveProviderMetadata: async () => ({ supported_parameters: [], model_supported_parameters: [], model_architecture: { output_modalities: ['embeddings'] }, pricing: { prompt: '0.00000001', completion: '0' } }),
    transport: async () => Response.json({ provider: 'DeepInfra', usage: { prompt_tokens: 23, total_tokens: 23 }, data: [{ embedding: [0.1], index: 0 }] }),
  });
  try {
    await fetch('https://openrouter.ai/api/v1/embeddings', { method: 'POST', body: JSON.stringify({ model: REQUIRED_EMBEDDING_MODEL, input: ['hidden'], dimensions: 2048 }) });
  } finally {
    restore();
    for (const [key, value] of Object.entries(before)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
  const call = JSON.parse((await readFile(resolve(dir, 'calls.jsonl'), 'utf8')).trim());
  assert.equal(call.inputTokens, 23);
  assert.equal(call.costUsd, 0.00000023);
  assert.equal(call.costSource, 'estimated_from_pinned_endpoint_price');
  await rm(dir, { recursive: true, force: true });
});

test('valida JSON contra o schema do request e registra campo e valor sem serializar objetos como [Object]', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'model-comparison-schema-validation-'));
  const keys = ['MODEL_COMPARISON_ALLOW_PAID','MODEL_COMPARISON_READY','MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED','MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2'];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env,{MODEL_COMPARISON_ALLOW_PAID:'1',MODEL_COMPARISON_READY:'1',MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED:'1',MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2:'DeepInfra'});
  const restore = installOpenRouterInterceptor({
    testName:name,runId:'schema-validation-run',outputDir:dir,
    resolveProviderMetadata:async()=>({supported_parameters:['structured_outputs'],model_supported_parameters:[]}),
    transport:async()=>Response.json({provider:'DeepInfra',usage:{prompt_tokens:2,completion_tokens:1},choices:[{message:{content:'{"correctAnswer":"Z"}'}}]}),
  });
  try {
    await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body:JSON.stringify({
      response_format:{type:'json_schema',json_schema:{name:'question_answer',schema:{type:'object',required:['correctAnswer'],properties:{correctAnswer:{type:'string',enum:['A','B','C','D','E']}}}}},messages:[],
    })});
  } finally { restore(); for(const [key,value] of Object.entries(before)) value===undefined?delete process.env[key]:process.env[key]=value; }
  const call=JSON.parse((await readFile(resolve(dir,'calls.jsonl'),'utf8')).trim());
  assert.equal(call.responseJsonValid,true);
  assert.equal(call.schemaValidFirstAttempt,false);
  assert.equal(call.jsonSchemaFailureObserved,true);
  assert.equal(call.schemaValidationMethod,'request_json_schema_ajv');
  assert.equal(call.schemaError[0].path,'/correctAnswer');
  assert.deepEqual(call.schemaError[0].value,{type:'string',chars:1,value:'Z'});
  assert.equal(JSON.stringify(call).includes('[Object]'),false);
  await rm(dir,{recursive:true,force:true});
});

test('recusa embedding de outro modelo antes da rede', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'model-comparison-embedding-block-'));
  const keys = ['MODEL_COMPARISON_ALLOW_PAID', 'MODEL_COMPARISON_READY', 'MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED', 'OPENROUTER_EMBEDDING_MODEL', 'MODEL_COMPARISON_PROVIDER_QWEN_QWEN3_EMBEDDING_8B'];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    MODEL_COMPARISON_ALLOW_PAID: '1', MODEL_COMPARISON_READY: '1', MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED: '1',
    OPENROUTER_EMBEDDING_MODEL: REQUIRED_EMBEDDING_MODEL, MODEL_COMPARISON_PROVIDER_QWEN_QWEN3_EMBEDDING_8B: 'DeepInfra',
  });
  let called = false;
  const restore = installOpenRouterInterceptor({ testName: name, runId: 'embed-block-run', outputDir: dir, transport: async () => { called = true; return Response.json({}); } });
  try {
    await assert.rejects(fetch('https://openrouter.ai/api/v1/embeddings', { method: 'POST', body: JSON.stringify({ model: 'other/embedding', input: ['x'], dimensions: 2048 }) }), /Embedding model bloqueado/u);
  } finally {
    restore();
    for (const [key, value] of Object.entries(before)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
  assert.equal(called, false);
  const call = JSON.parse((await readFile(resolve(dir, 'calls.jsonl'), 'utf8')).trim());
  assert.equal(call.outcome, 'BLOCKED_EMBEDDING_MODEL_MISMATCH');
  await rm(dir, { recursive: true, force: true });
});

test('bloqueia etapa quando provider endpoint não anuncia structured outputs', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'model-comparison-unsupported-schema-'));
  const envBefore = Object.fromEntries(['MODEL_COMPARISON_ALLOW_PAID','MODEL_COMPARISON_READY','MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED', 'MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2'].map((key) => [key, process.env[key]]));
  Object.assign(process.env, { MODEL_COMPARISON_ALLOW_PAID: '1', MODEL_COMPARISON_READY: '1', MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED: '1', MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2: 'requested-provider' });
  let transportCalled=false;
  const restore=installOpenRouterInterceptor({testName:name,runId:'unsupported-schema-run',outputDir:dir,resolveProviderMetadata:async()=>({supported_parameters:['temperature'],model_supported_parameters:['response_format']}),transport:async()=>{transportCalled=true;return Response.json({});}});
  try { await assert.rejects(fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body:JSON.stringify({response_format:{json_schema:{name:'question_answer'}},messages:[]})}),/structured_outputs/); }
  finally { restore(); for(const [key,value] of Object.entries(envBefore)) value===undefined?delete process.env[key]:process.env[key]=value; }
  assert.equal(transportCalled,false);
  const call=JSON.parse((await readFile(resolve(dir,'calls.jsonl'),'utf8')).trim());
  assert.equal(call.outcome,'BLOCKED_JSON_SCHEMA_UNSUPPORTED');
  await rm(dir,{recursive:true,force:true});
});

test('marca JSON inválido observado e não inventa custo/token sem usage.cost', async () => {
  const dir=await mkdtemp(resolve(tmpdir(),'model-comparison-invalid-json-'));
  const envBefore=Object.fromEntries(['MODEL_COMPARISON_ALLOW_PAID','MODEL_COMPARISON_READY','MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED','MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2'].map((key)=>[key,process.env[key]]));
  Object.assign(process.env,{MODEL_COMPARISON_ALLOW_PAID:'1',MODEL_COMPARISON_READY:'1',MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED:'1',MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2:'requested-provider',MODEL_COMPARISON_REPETITION:'2'});
  const restore=installOpenRouterInterceptor({testName:name,runId:'invalid-json-run',outputDir:dir,resolveProviderMetadata:async()=>({supported_parameters:['reasoning','structured_outputs'],model_supported_parameters:['reasoning']}),transport:async()=>Response.json({provider:'requested-provider',usage:{prompt_tokens:5,completion_tokens:2},choices:[{message:{content:'{ invalid json'}}]})});
  try { await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body:JSON.stringify({response_format:{json_schema:{name:'question_answer'}},messages:[]})}); }
  finally { restore(); for(const [key,value] of Object.entries(envBefore)) value===undefined?delete process.env[key]:process.env[key]=value; }
  const line=(await readFile(resolve(dir,'calls.jsonl'),'utf8')).trim();
  const call=JSON.parse(line);
  assert.equal(call.responseJsonValid,false);
  assert.equal(call.schemaValidFirstAttempt,false);
  assert.ok(call.jsonError!=='NAO_VERIFICADO');
  assert.equal(call.costUsd,'NAO_VERIFICADO');
  assert.equal(call.costSource,'NAO_VERIFICADO');
  assert.equal(call.reasoningTokens,'NAO_VERIFICADO');
  const summary=summarizeTelemetry(line);
  assert.equal(summary.rounds[0].round,'2');
  assert.equal(summary.rounds[0].calls[0].costUsd,'NAO_VERIFICADO');
  assert.equal(summary.rounds[0].metricsByAgent.question_answer.costUsd,'NAO_VERIFICADO');
  await rm(dir,{recursive:true,force:true});
});

test('registra resposta 2xx não JSON sem conteúdo e classifica NON_JSON_SUCCESS', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'model-comparison-non-json-success-'));
  const keys = ['MODEL_COMPARISON_ALLOW_PAID','MODEL_COMPARISON_READY','MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED','MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2'];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { MODEL_COMPARISON_ALLOW_PAID: '1', MODEL_COMPARISON_READY: '1', MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED: '1', MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2: 'requested-provider' });
  const privateBody = 'private provider response body must never be logged';
  const restore = installOpenRouterInterceptor({
    testName: name, runId: 'non-json-response-run', outputDir: dir,
    resolveProviderMetadata: async () => ({ supported_parameters: ['structured_outputs'], model_supported_parameters: [] }),
    transport: async () => new Response(privateBody, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
  });
  try { await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ response_format: { json_schema: { name: 'question_answer' } }, messages: [] }) }); }
  finally { restore(); for (const [key, value] of Object.entries(before)) value === undefined ? delete process.env[key] : process.env[key] = value; }
  const call = JSON.parse((await readFile(resolve(dir, 'calls.jsonl'), 'utf8')).trim());
  assert.equal(call.httpStatus, 200);
  assert.equal(call.responseContentType, 'text/html');
  assert.equal(call.outcome, 'NON_JSON_SUCCESS');
  assert.equal(call.error, 'NON_JSON_SUCCESS_STATUS_200');
  assert.equal(call.payloadShape.isJsonObject, false);
  assert.equal(call.payloadShape.hasUsage, 'NAO_VERIFICADO');
  assert.equal(JSON.stringify(call).includes(privateBody), false);
  await rm(dir, { recursive: true, force: true });
});

test('registra JSON 2xx sem envelope de completion como MALFORMED_SUCCESS_RESPONSE', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'model-comparison-malformed-success-'));
  const keys = ['MODEL_COMPARISON_ALLOW_PAID','MODEL_COMPARISON_READY','MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED','MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2'];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { MODEL_COMPARISON_ALLOW_PAID: '1', MODEL_COMPARISON_READY: '1', MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED: '1', MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2: 'requested-provider' });
  const restore = installOpenRouterInterceptor({
    testName: name, runId: 'malformed-response-run', outputDir: dir,
    resolveProviderMetadata: async () => ({ supported_parameters: ['structured_outputs'], model_supported_parameters: [] }),
    transport: async () => Response.json({ provider: 'requested-provider', usage: { prompt_tokens: 8, completion_tokens: 0 }, privateMarker: 'must not be logged' }),
  });
  try { await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ response_format: { json_schema: { name: 'question_answer' } }, messages: [] }) }); }
  finally { restore(); for (const [key, value] of Object.entries(before)) value === undefined ? delete process.env[key] : process.env[key] = value; }
  const call = JSON.parse((await readFile(resolve(dir, 'calls.jsonl'), 'utf8')).trim());
  assert.equal(call.httpStatus, 200);
  assert.equal(call.responseContentType, 'application/json');
  assert.equal(call.outcome, 'MALFORMED_SUCCESS_RESPONSE');
  assert.equal(call.error, 'MALFORMED_SUCCESS_RESPONSE_STATUS_200');
  assert.deepEqual(call.payloadShape, { isJsonObject: true, hasUsage: true, hasProvider: true, hasChoices: false, hasFirstChoiceMessage: false, messageContentType: 'missing', hasData: false, dataCount: 'NAO_VERIFICADO', firstDataEmbeddingType: 'missing' });
  assert.equal(call.inputTokens, 8);
  assert.equal(JSON.stringify(call).includes('must not be logged'), false);
  await rm(dir, { recursive: true, force: true });
});

test('classifica HTTP não-2xx como falha e disponibiliza retry por operação', async () => {
  const dir=await mkdtemp(resolve(tmpdir(),'model-comparison-http-error-'));
  const envBefore=Object.fromEntries(['MODEL_COMPARISON_ALLOW_PAID','MODEL_COMPARISON_READY','MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED','MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2','MODEL_COMPARISON_REPETITION'].map((key)=>[key,process.env[key]]));
  Object.assign(process.env,{MODEL_COMPARISON_ALLOW_PAID:'1',MODEL_COMPARISON_READY:'1',MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED:'1',MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2:'requested-provider',MODEL_COMPARISON_REPETITION:'1'});
  const restore=installOpenRouterInterceptor({testName:name,runId:'http-error-run',outputDir:dir,resolveProviderMetadata:async()=>({supported_parameters:['reasoning','structured_outputs'],model_supported_parameters:['reasoning']}),transport:async()=>Response.json({error:{message:'temporary provider outage'}},{status:503})});
  const req={method:'POST',body:JSON.stringify({response_format:{json_schema:{name:'question_answer'}},messages:[{role:'user',content:'same-operation'}]})};
  try {
    await assert.rejects(fetch('https://openrouter.ai/api/v1/chat/completions',req),/HTTP 503/);
    await fetch('https://openrouter.ai/api/v1/chat/completions',req);
  } catch(error) {
    // The fake transport intentionally returns the same error both times; both calls must be logged.
    if (!(error instanceof Error) || !/HTTP 503/.test(error.message)) throw error;
  } finally { restore(); for(const [key,value] of Object.entries(envBefore)) value===undefined?delete process.env[key]:process.env[key]=value; }
  const calls=(await readFile(resolve(dir,'calls.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls.length,2);
  assert.equal(calls[0].outcome,'HTTP_ERROR');
  assert.equal(calls[0].error,'HTTP_ERROR_STATUS_503');
  assert.equal(calls[0].operationId,calls[1].operationId);
  assert.deepEqual(calls.map(call=>call.attempt),[1,2]);
  assert.equal(calls[1].attemptEvidence,'REPEATED_REQUEST_AFTER_RETRYABLE_FAILURE_INFERRED');
  await rm(dir,{recursive:true,force:true});
});

test('pacing por provider registra espera e Retry-After numérico sem repetir a chamada', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'model-comparison-provider-pacing-'));
  const keys = ['MODEL_COMPARISON_ALLOW_PAID','MODEL_COMPARISON_READY','MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED','MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2','MODEL_COMPARISON_REPETITION'];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { MODEL_COMPARISON_ALLOW_PAID: '1', MODEL_COMPARISON_READY: '1', MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED: '1', MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2: 'requested-provider', MODEL_COMPARISON_REPETITION: '1' });
  const sleepCalls = [];
  let transportCalls = 0;
  const restore = installOpenRouterInterceptor({
    testName: name, runId: 'provider-pacing-run', outputDir: dir,
    pacingIntervalMs: 10_000, sleepFn: async (ms) => { sleepCalls.push(ms); },
    resolveProviderMetadata: async () => ({ supported_parameters: ['structured_outputs'], model_supported_parameters: [] }),
    transport: async () => {
      transportCalls += 1;
      if (transportCalls === 1) return Response.json({ provider: 'requested-provider', usage: { prompt_tokens: 1, completion_tokens: 1 }, choices: [{ message: { content: '{"answer":"first"}' } }] });
      return Response.json({ error: { message: 'private rate limit details' } }, { status: 429, headers: { 'retry-after': '12' } });
    },
  });
  try {
    const request = (content) => fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ response_format: { json_schema: { name: 'question_answer' } }, messages: [{ role: 'user', content }] }) });
    await request('operation one');
    await assert.rejects(request('operation two'), /HTTP 429/u);
  } finally { restore(); for (const [key, value] of Object.entries(before)) value === undefined ? delete process.env[key] : process.env[key] = value; }
  const calls = (await readFile(resolve(dir, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(transportCalls, 2);
  assert.deepEqual(calls.map((call) => call.outcome), ['SUCCESS', 'HTTP_ERROR']);
  assert.equal(calls[0].rateLimitPacingMs, 0);
  assert.ok(calls[1].rateLimitPacingMs >= 9_900 && calls[1].rateLimitPacingMs <= 10_000);
  assert.deepEqual(sleepCalls, [calls[1].rateLimitPacingMs]);
  assert.equal(calls[1].retryAfterSeconds, 12);
  assert.equal(calls[1].error, 'HTTP_ERROR_STATUS_429');
  assert.equal(JSON.stringify(calls).includes('private rate limit details'), false);
  const telemetry = summarizeTelemetry(calls.map((call) => JSON.stringify(call)).join('\n'));
  assert.equal(telemetry.rounds[0].metrics.rateLimitPacingMsTotal, calls[0].rateLimitPacingMs + calls[1].rateLimitPacingMs);
  assert.equal(telemetry.rateLimitPacingMsTotal, calls[0].rateLimitPacingMs + calls[1].rateLimitPacingMs);
  assert.equal(telemetry.rounds[0].calls[1].rateLimitPacingMs, calls[1].rateLimitPacingMs);
  await rm(dir, { recursive: true, force: true });
});

test('bloqueia reasoning-model curto quando o endpoint não confirma controle para desligá-lo', async () => {
  const dir=await mkdtemp(resolve(tmpdir(),'model-comparison-reasoning-block-'));
  const envBefore=Object.fromEntries(['MODEL_COMPARISON_ALLOW_PAID','MODEL_COMPARISON_READY','MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED','MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2'].map((key)=>[key,process.env[key]]));
  Object.assign(process.env,{MODEL_COMPARISON_ALLOW_PAID:'1',MODEL_COMPARISON_READY:'1',MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED:'1',MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2:'requested-provider'});
  let transportCalled=false;
  const restore=installOpenRouterInterceptor({testName:name,runId:'reasoning-control-block-run',outputDir:dir,resolveProviderMetadata:async()=>({supported_parameters:['structured_outputs','reasoning_effort'],model_supported_parameters:['reasoning','response_format']}),transport:async()=>{transportCalled=true;return Response.json({});}});
  try { await assert.rejects(fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body:JSON.stringify({response_format:{json_schema:{name:'question_answer'}},messages:[]})}),/não anuncia controle de reasoning/); }
  finally { restore(); for(const [key,value] of Object.entries(envBefore)) value===undefined?delete process.env[key]:process.env[key]=value; }
  assert.equal(transportCalled,false);
  const call=JSON.parse((await readFile(resolve(dir,'calls.jsonl'),'utf8')).trim());
  assert.equal(call.outcome,'BLOCKED_REASONING_CONTROL_UNSUPPORTED');
  await rm(dir,{recursive:true,force:true});
});

test('usa reasoning_effort somente quando modelo e endpoint anunciam o mesmo parâmetro', async () => {
  const dir=await mkdtemp(resolve(tmpdir(),'model-comparison-reasoning-effort-'));
  const envBefore=Object.fromEntries(['MODEL_COMPARISON_ALLOW_PAID','MODEL_COMPARISON_READY','MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED','MODEL_COMPARISON_PROVIDER_MOONSHOTAI_KIMI_K2_5'].map((key)=>[key,process.env[key]]));
  Object.assign(process.env,{MODEL_COMPARISON_ALLOW_PAID:'1',MODEL_COMPARISON_READY:'1',MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED:'1',MODEL_COMPARISON_PROVIDER_MOONSHOTAI_KIMI_K2_5:'requested-provider'});
  let sent;
  const restore=installOpenRouterInterceptor({testName:'e2e_qualidade_kimi_gera_qwen_revisa',runId:'reasoning-effort-run',outputDir:dir,resolveProviderMetadata:async()=>({supported_parameters:['structured_outputs','reasoning_effort'],model_supported_parameters:['response_format','reasoning_effort']}),transport:async(_input,init)=>{sent=JSON.parse(init.body);return Response.json({provider:'requested-provider',choices:[]});}});
  try { await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body:JSON.stringify({response_format:{json_schema:{name:'question_alternatives'}},temperature:.35,max_tokens:1200,reasoning:{effort:'high'},messages:[]})}); }
  finally { restore(); for(const [key,value] of Object.entries(envBefore)) value===undefined?delete process.env[key]:process.env[key]=value; }
  assert.equal(sent.reasoning_effort,'none');
  assert.equal(Object.hasOwn(sent,'reasoning'),false);
  assert.equal(sent.temperature,.35);
  assert.equal(sent.max_tokens,1200);
  const call=JSON.parse((await readFile(resolve(dir,'calls.jsonl'),'utf8')).trim());
  assert.deepEqual(call.reasoningConfig,{status:'APPLIED',parameter:'reasoning_effort',sent:'none'});
  await rm(dir,{recursive:true,force:true});
});

test('bloqueia chamadas pagas por padrão antes de usar transporte', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'model-comparison-block-'));
  const previousPaid = process.env.MODEL_COMPARISON_ALLOW_PAID;
  delete process.env.MODEL_COMPARISON_ALLOW_PAID;
  let transportCalled = false;
  const restore = installOpenRouterInterceptor({ testName: name, runId: 'blocked-run', outputDir: dir, transport: async () => { transportCalled = true; return Response.json({}); } });
  try {
    await assert.rejects(fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'x', response_format: { json_schema: { name: 'question_answer' } }, messages: [] }) }), /Chamada paga bloqueada/);
  } finally {
    restore();
    if (previousPaid !== undefined) process.env.MODEL_COMPARISON_ALLOW_PAID = previousPaid;
  }
  assert.equal(transportCalled, false);
  const call = JSON.parse((await readFile(resolve(dir, 'calls.jsonl'), 'utf8')).trim());
  assert.equal(call.outcome, 'BLOCKED_DRY_RUN');
  await rm(dir, { recursive: true, force: true });
});

test('bloqueia schema desconhecido em vez de repassar modelo silenciosamente', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'model-comparison-unmapped-'));
  let transportCalled = false;
  const restore = installOpenRouterInterceptor({ testName: name, runId: 'unmapped-run', outputDir: dir, transport: async () => { transportCalled = true; return Response.json({}); } });
  try {
    await assert.rejects(fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'baseline/model', messages: [] }) }), /sem mapeamento explícito/);
  } finally { restore(); }
  assert.equal(transportCalled, false);
  const call = JSON.parse((await readFile(resolve(dir, 'calls.jsonl'), 'utf8')).trim());
  assert.equal(call.outcome, 'BLOCKED_UNMAPPED_STAGE');
  await rm(dir, { recursive: true, force: true });
});

test('registra provedor diferente do solicitado e interrompe a resposta', async () => {
  const dir=await mkdtemp(resolve(tmpdir(),'model-comparison-provider-mismatch-'));
  const envBefore=Object.fromEntries(['MODEL_COMPARISON_ALLOW_PAID','MODEL_COMPARISON_READY','MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED','MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2'].map((key)=>[key,process.env[key]]));
  Object.assign(process.env,{MODEL_COMPARISON_ALLOW_PAID:'1',MODEL_COMPARISON_READY:'1',MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED:'1',MODEL_COMPARISON_PROVIDER_DEEPSEEK_DEEPSEEK_V3_2:'requested-provider'});
  const restore=installOpenRouterInterceptor({testName:name,runId:'provider-mismatch-run',outputDir:dir,resolveProviderMetadata:async()=>({supported_parameters:['reasoning','response_format','structured_outputs'],model_supported_parameters:['reasoning']}),transport:async()=>Response.json({provider:'different-provider',choices:[]})});
  try { await assert.rejects(fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body:JSON.stringify({response_format:{json_schema:{name:'question_answer'}},messages:[]})}),/difere do provedor solicitado/); }
  finally { restore(); for(const [key,value] of Object.entries(envBefore)) value===undefined?delete process.env[key]:process.env[key]=value; }
  const call=JSON.parse((await readFile(resolve(dir,'calls.jsonl'),'utf8')).trim());
  assert.equal(call.requestedProvider,'requested-provider');
  assert.equal(call.provider,'different-provider');
  assert.equal(call.outcome,'UNEXPECTED_PROVIDER');
  await rm(dir,{recursive:true,force:true});
});

test('agregador integra calls no summary por rodada e não chama bloqueios de execução', () => {
  const dryRun={rounds:[{round:1,status:'NAO_VERIFICADO',questions:[],calls:[],metrics:{status:'NAO_VERIFICADO'}},{round:2,status:'NAO_VERIFICADO',questions:[],calls:[],metrics:{status:'NAO_VERIFICADO'}}]};
  const blocked=JSON.stringify({repetition:'1',stage:'answer',agent:'question_answer',attempt:1,outcome:'BLOCKED_DRY_RUN',provider:'NAO_VERIFICADO',inputTokens:'NAO_VERIFICADO'});
  const finalized=finalizeSummaryWithTelemetry(dryRun,blocked);
  assert.equal(finalized.callTelemetry.status,'ONLY_BLOCKED_CALLS');
  assert.equal(finalized.rounds[0].telemetryStatus,'ONLY_BLOCKED_CALLS');
  assert.equal(finalized.rounds[0].calls.length,1);
  assert.equal(finalized.rounds[1].status,'NAO_VERIFICADO');
});

test('finalizador lê JSONL de execução pelo caminho e deixa log ausente explicitamente bloqueado', async () => {
  const dir=await mkdtemp(resolve(tmpdir(),'model-comparison-finalize-file-'));
  const log=resolve(dir,'calls.jsonl');
  const call=JSON.stringify({repetition:'1',operationId:'op-a',stage:'answer',agent:'question_answer',attempt:1,outcome:'HTTP_ERROR',provider:'NAO_VERIFICADO',inputTokens:'NAO_VERIFICADO',latencyMs:44,costUsd:'NAO_VERIFICADO'});
  await import('node:fs/promises').then(({writeFile})=>writeFile(log,`${call}\n`));
  const base={rounds:[{round:1,status:'NAO_VERIFICADO',questions:[],calls:[],metrics:{status:'NAO_VERIFICADO'}}]};
  const fromFile=await finalizeSummaryWithTelemetryFile(base,log);
  assert.equal(fromFile.callTelemetry.apiCallsSent,1);
  assert.equal(fromFile.rounds[0].calls[0].outcome,'HTTP_ERROR');
  const missing=await finalizeSummaryWithTelemetryFile(base,resolve(dir,'missing.jsonl'));
  assert.equal(missing.callTelemetry.status,'CALL_LOG_UNAVAILABLE');
  await rm(dir,{recursive:true,force:true});
});
