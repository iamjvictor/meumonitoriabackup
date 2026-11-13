#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL_IDS = [
  'qwen/qwen3-vl-30b-a3b-instruct',
  'qwen/qwen3-vl-235b-a22b-instruct',
  'deepseek/deepseek-v3.2',
  'moonshotai/kimi-k2.5',
  'moonshotai/kimi-k2.6',
  'qwen/qwen3-embedding-8b',
];
const EMBEDDING_MODEL_ID = 'qwen/qwen3-embedding-8b';
const MODELS_API = 'https://openrouter.ai/api/v1/models';
const ENDPOINTS_API = 'https://openrouter.ai/api/v1/models/{id}/endpoints';
const POLICY_URL = 'https://openrouter.ai/privacy';
const NV = 'NAO_VERIFICADO';

function cli(argv) {
  const opts = { out: 'provider-preflight.json' };
  for (let i=0;i<argv.length;i++) {
    const key=argv[i]; if (!key.startsWith('--')) continue;
    if (!argv[i+1] || argv[i+1].startsWith('--')) throw new Error(`Valor ausente para ${key}`);
    opts[key.slice(2)]=argv[++i];
  }
  return opts;
}

async function fetchJson(url) {
  const response=await fetch(url,{headers:{'User-Agent':'MeuMonitorAI-test-preflight/1.0'}});
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
  return response.json();
}

export function providerInfo(endpoint) {
  const params=endpoint.supported_parameters ?? [];
  return {
    name:endpoint.provider_name ?? NV,
    pricingUsdPerToken:{input:endpoint.pricing?.prompt ?? NV,output:endpoint.pricing?.completion ?? NV,cachedInput:endpoint.pricing?.input_cache_read ?? NV},
    structuredOutputs:params.includes('structured_outputs'),
    responseFormat:params.includes('response_format'),
    supportedParameters:params,
    retention:{status:NV,reason:'OpenRouter informa que as práticas de retenção variam por provedor; o endpoint público de modelos não declara a política específica deste provedor.',source:POLICY_URL},
  };
}

export function calculateBudget(modelResults, budget) {
  if (!budget) return {status:NV,reason:'Informe --budget-config com provedor fixado, chamadas máximas, tokens máximos de entrada e saída por chamada. Sem isso não há limite total verificável.'};
  const items=Array.isArray(budget.calls)?budget.calls:[];
  if (!items.length) return {status:NV,reason:'budget-config sem itens calls.'};
  let total=0; const details=[];
  for (const item of items) {
    const model=modelResults.find(m=>m.id===item.model);
    const provider=model?.providers.find(p=>p.name===item.provider);
    if (!model || !provider || !Number.isFinite(item.maxCalls) || !Number.isFinite(item.maxInputTokens) || !Number.isFinite(item.maxOutputTokens) || typeof provider.pricingUsdPerToken.input!=='string' || provider.pricingUsdPerToken.input===NV || typeof provider.pricingUsdPerToken.output!=='string' || provider.pricingUsdPerToken.output===NV) {
      details.push({...item,status:NV,reason:'ID/provedor, cardinalidade, limites de tokens ou tarifa não verificáveis.'}); continue;
    }
    const cost=item.maxCalls*(item.maxInputTokens*Number(provider.pricingUsdPerToken.input)+item.maxOutputTokens*Number(provider.pricingUsdPerToken.output));
    total+=cost; details.push({...item,estimatedMaxUsd:Number(cost.toFixed(8)),status:'ESTIMADO_COM_LIMITES_EXPLICITOS'});
  }
  if (details.some(d=>d.status===NV)) return {status:NV,reason:'Há chamadas cujo orçamento não pôde ser limitado; total máximo não é verificável.',details};
  return {status:'ESTIMADO_COM_LIMITES_EXPLICITOS',totalUsd:Number(total.toFixed(8)),details};
}

export async function runPreflight({out='provider-preflight.json',budgetConfig}={}) {
  const catalog=await fetchJson(MODELS_API);
  const catalogById=new Map((catalog.data??[]).map(x=>[x.id,x]));
  const catalogIds=new Set(catalogById.keys());
  const models=[];
  for (const id of MODEL_IDS) {
    if (!catalogIds.has(id) && id !== EMBEDDING_MODEL_ID) { models.push({id,exists:false,status:'ID_NAO_ENCONTRADO',alternatives:[]}); continue; }
    const payload=await fetchJson(ENDPOINTS_API.replace('{id}',id));
    const model=payload.data;
    const endpoints=model.endpoints??[];
    const endpointArchitecture = model.architecture ?? {};
    const exists = catalogIds.has(id) || (id === EMBEDDING_MODEL_ID && endpoints.length > 0 && endpointArchitecture.modality === 'text->embeddings');
    models.push({id,exists,status:exists?'CATALOG_ENDPOINT_CONFIRMED':'ID_NAO_ENCONTRADO',name:model.name??NV,taskType:id===EMBEDDING_MODEL_ID?'embedding':'chat',modalities:{input:endpointArchitecture.input_modalities??[],output:endpointArchitecture.output_modalities??[]},imageInput:(endpointArchitecture.input_modalities??[]).includes('image'),modelSupportedParameters:catalogById.get(id)?.supported_parameters??[],contextLength:model.context_length??NV,structuredOutputProviders:endpoints.filter(e=>(e.supported_parameters??[]).includes('structured_outputs')).map(e=>e.provider_name),providers:endpoints.map(providerInfo),source:`${ENDPOINTS_API.replace('{id}',id)}`});
  }
  let budget=null;
  if (budgetConfig) budget=JSON.parse(await readFile(budgetConfig,'utf8'));
  const result={generatedAt:new Date().toISOString(),source:{catalog:MODELS_API,endpoints:ENDPOINTS_API,openRouterPrivacy:POLICY_URL},inferenceCallsMade:false,models,budget:calculateBudget(models,budget),retentionSummary:{status:NV,reason:'A política geral do OpenRouter descreve retenção própria e declara práticas distintas por provedor. Nenhuma política específica de retenção foi confirmada por endpoint nesta consulta.',source:POLICY_URL}};
  const target=path.resolve(out); await mkdir(path.dirname(target),{recursive:true}); await writeFile(target,JSON.stringify(result,null,2)+'\n');
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const opts=cli(process.argv.slice(2));
  runPreflight({out:opts.out,budgetConfig:opts['budget-config']}).then(result=>{
    console.log(JSON.stringify({output:path.resolve(opts.out),inferenceCallsMade:result.inferenceCallsMade,budget:result.budget,models:result.models.map(m=>({id:m.id,exists:m.exists,imageInput:m.imageInput,providers:m.providers?.length,structuredOutputProviders:m.structuredOutputProviders}))},null,2));
  }).catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
}
