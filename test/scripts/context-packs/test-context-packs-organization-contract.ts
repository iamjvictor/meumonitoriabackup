import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(process.cwd(), '..');
const backendRoot = resolve(repoRoot, 'backend');
const packageJsonPath = resolve(backendRoot, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
  scripts?: Record<string, string>;
};

for (const name of [
  'test:question-context-packs',
]) {
  const command = packageJson.scripts?.[name];
  assert.ok(command, `script ausente: ${name}`);
  assert.match(command, /test\/scripts\/context-packs\//, `${name} deve apontar exclusivamente para test/scripts/context-packs.`);
}

console.log('context-packs organization contract: OK');
