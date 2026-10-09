import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/app/(teacher)/professor/conta/page.tsx');
const source = fs.readFileSync(file, 'utf8');

test('rota real de conta usa o painel Asaas atualizado e preserva dados cadastrais', () => {
  assert.match(source, /import \{ TeacherPaymentAccountPanel \}/);
  assert.match(source, /<TeacherPaymentAccountPanel teacher=\{teacher\}/);
  assert.match(source, /initialAccount=\{account\}/);
  assert.match(source, /Dados enviados para o Asaas/);
  assert.match(source, /paymentProfile/);
  assert.doesNotMatch(source, /bg-\[#132E20\] p-6 text-white shadow-xl/);
});
