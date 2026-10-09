import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');

test('tsconfig declara aliases públicos dos módulos frontend', () => {
  const tsconfig = JSON.parse(read('tsconfig.json'));
  const paths = tsconfig.compilerOptions.paths;
  for (const alias of ['@/modules/*', '@/shared/*', '@/styles/*', '@/types/*']) {
    assert.ok(paths[alias], `alias ausente: ${alias}`);
  }
});

test('eslint configura barreiras de import entre aluno e professor', () => {
  const config = read('eslint.config.mjs');
  assert.match(config, /no-restricted-imports/);
  assert.match(config, /modules\/teacher/);
  assert.match(config, /modules\/student/);
});

test('eslint mantém regras arquiteturais como erro e dívida legada como warning', () => {
  const config = read('eslint.config.mjs');
  assert.match(config, /"no-restricted-imports": \["error"/);
  assert.match(config, /"@typescript-eslint\/no-explicit-any": "warn"/);
});

test('módulos possuem documentação e barrels públicos', () => {
  for (const moduleName of ['student', 'teacher', 'marketing', 'public-teacher']) {
    assert.ok(read(`src/modules/${moduleName}/README.md`).length > 200, `${moduleName} sem documentação suficiente`);
    assert.ok(read(`src/modules/${moduleName}/index.ts`).length > 0, `${moduleName} sem barrel público`);
  }
});

test('convenções de nomenclatura estão documentadas', () => {
  const docs = `${read('src/modules/student/README.md')}\n${read('src/modules/teacher/README.md')}`;
  assert.match(docs, /PascalCase/);
  assert.match(docs, /camelCase/);
  assert.match(docs, /use[A-Z]/);
  assert.match(docs, /Service/);
});
