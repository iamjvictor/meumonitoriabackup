import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(process.cwd(), '..');
const backendRoot = resolve(repoRoot, 'backend');
const packageJsonPath = resolve(backendRoot, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
  scripts?: Record<string, string>;
};

const command = packageJson.scripts?.['test:question-spans'];
assert.ok(command, 'script ausente: test:question-spans');
assert.match(command, /test\/scripts\/question-spans\//, 'test:question-spans deve apontar exclusivamente para test/scripts/question-spans.');

console.log('question-spans organization contract: OK');
