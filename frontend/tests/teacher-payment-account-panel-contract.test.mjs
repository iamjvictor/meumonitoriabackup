import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/modules/teacher/components/TeacherPaymentAccountPanel.tsx');
const source = fs.readFileSync(file, 'utf8');

test('Task 5 mantém contrato visual e estados seguros da conta Asaas', () => {
  assert.match(source, /bg-amber-600/, 'conta pendente deve usar estado âmbar');
  assert.match(source, /text-white/, 'estado da conta deve manter contraste com texto branco');
  assert.match(source, /Abrir painel Asaas/);
  assert.match(source, /target="_blank"\s+rel="noreferrer"/);
  assert.match(source, /getDashboardUrl\(account\.onboardingUrl\)/, 'onboarding URL deve ser validada');
  for (const label of ['Saldo disponível', 'Recebido neste mês', 'A receber', 'Transferências pendentes']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /Prazo estimado: 2 dias úteis/);
  assert.match(source, /Indisponível/);
  assert.match(source, /animate-pulse/);
  assert.match(source, /statusOverview\.label/);
  assert.match(source, /status === 'REJECTED'/);
  assert.match(source, /Aguardando aprovação/);
  assert.match(source, /Tentar novamente/);
  assert.match(source, /isRetryablePaymentOverviewError\(reason\)/);
});
