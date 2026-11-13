import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDrySpec } from '../../../tests/model-comparison/runner/spec-runner.mjs';

test('e2e_economica_qwen30b_deepseek — executor dry-run, sem inference', { skip: !process.env.MODEL_COMPARISON_PREFLIGHT_PATH }, async () => {
  const summary = await runDrySpec('e2e_economica_qwen30b_deepseek');
  assert.equal(summary.executionMode, 'dry-run');
  assert.equal(summary.pipelineExecuted, false);
  assert.equal(summary.paidCallsMade, 0);
  assert.equal(summary.visual.visualEmbeddingCallsExpected, 31);
});
