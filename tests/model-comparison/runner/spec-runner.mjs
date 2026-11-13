import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runTest } from './execute-pipeline.mjs';

export async function runDrySpec(testName) {
  const preflightPath = process.env.MODEL_COMPARISON_PREFLIGHT_PATH;
  if (!preflightPath) throw new Error('Defina MODEL_COMPARISON_PREFLIGHT_PATH após rodar provider-preflight.mjs uma vez.');
  const preflight = JSON.parse(await readFile(resolve(preflightPath), 'utf8'));
  const runId = `dry-${Date.now().toString(36)}-${randomUUID().slice(0, 12)}`;
  return runTest({
    testName, runId, execute: false,
    adapters: { preflightData: preflight },
  });
}
