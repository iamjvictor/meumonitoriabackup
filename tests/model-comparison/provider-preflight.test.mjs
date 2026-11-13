import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudget, providerInfo } from './provider-preflight.mjs';

test('provider data does not claim retention when the API has no provider policy field', () => {
  const provider=providerInfo({provider_name:'Example',supported_parameters:['structured_outputs'],pricing:{prompt:'0.000001',completion:'0.000002'}});
  assert.equal(provider.structuredOutputs,true);
  assert.equal(provider.retention.status,'NAO_VERIFICADO');
});

test('budget remains unverified if limits or pinned provider price are missing', () => {
  const result=calculateBudget([{id:'model',providers:[]}],null);
  assert.equal(result.status,'NAO_VERIFICADO');
});

test('budget calculation requires explicit finite limits and provider rates', () => {
  const models=[{id:'model',providers:[{name:'provider',pricingUsdPerToken:{input:'0.000001',output:'0.000002'}}]}];
  const result=calculateBudget(models,{calls:[{model:'model',provider:'provider',maxCalls:2,maxInputTokens:100,maxOutputTokens:50}]});
  assert.equal(result.status,'ESTIMADO_COM_LIMITES_EXPLICITOS');
  assert.equal(result.totalUsd,0.0004);
});
