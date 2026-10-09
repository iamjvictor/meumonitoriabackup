import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(process.cwd(), '..');
const backendRoot = resolve(repoRoot, 'backend');
const packageJsonPath = resolve(backendRoot, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
  scripts?: Record<string, string>;
};

const chunkScriptNames = [
  'test:documents',
  'test:document-chunking-path-contract',
  'test:chunk-quality',
  'test:statement-evidence',
];

for (const name of chunkScriptNames) {
  const command = packageJson.scripts?.[name];
  assert.ok(command, `script ausente: ${name}`);
  assert.match(command, /test\/scripts\/chunks\//, `${name} deve apontar exclusivamente para test/scripts/chunks.`);
  assert.doesNotMatch(command, /src\/scripts\//, `${name} não pode apontar para src/scripts.`);
}

for (const relativePath of [
  'backend/src/scripts/test-document-chunking.ts',
  'backend/src/scripts/test-document-chunking-path-contract.ts',
  'backend/src/scripts/test-chunk-quality.ts',
  'backend/src/scripts/test-question-statement-evidence.ts',
  'test/scripts/test-question-statement-evidence.ts',
]) {
  assert.equal(existsSync(resolve(repoRoot, relativePath)), false, `${relativePath} deve ter sido centralizado em test/scripts/chunks.`);
}

console.log('chunks organization contract: OK');
