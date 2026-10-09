import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('não mantém as telas de checkout simulado', () => {
  for (const relativePath of [
    'src/app/(student-app)/checkout/page.tsx',
    'src/app/(student-app)/checkout/simulado/page.tsx',
    'src/app/(student-app)/areadoaluno/checkout/page.tsx',
  ]) {
    assert.equal(fs.existsSync(path.join(frontendRoot, relativePath)), false, relativePath);
  }
});

test('não mantém links de checkout simulado no frontend', () => {
  const sourceFiles = [
    'src/app/(student-app)/areadoaluno/planos/page.tsx',
    'tests/e2e/smoke.spec.ts',
    'tests/e2e/critical-flows.spec.ts',
    'tests/unit/StudentFlowStates.test.tsx',
  ];

  for (const relativePath of sourceFiles) {
    const source = fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8');
    assert.doesNotMatch(source, /checkout\/simulado|\/checkout(?=['"`])/u, relativePath);
  }
});
