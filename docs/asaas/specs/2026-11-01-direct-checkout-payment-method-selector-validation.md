# Validation — forma de pagamento no checkout do aluno

| Critério | Pacote | Cenário | Resultado |
|---|---|---|---|
| AC-001 | Pacote 2 | Exige método e limpa seleção ao trocar intervalo | **Aprovado** — QA independente: teste de tela passou (3/3). |
| AC-002 | Pacote 2 | Opções corretas por plano | **Aprovado** — QA independente confirmou métodos mensal/anual visíveis e seleção obrigatória. |
| AC-003 | Pacote 1 | Quatro combinações geram tipos de checkout corretos | **Aprovado** — teste backend focado passou (3/3), incluindo as quatro configurações e rejeição de método inválido. |
| AC-004 | Pacotes 1/3 | Confirmação financeira e acesso mensal/anual | **Parcial** — typecheck passou; teste de duplicidade sequencial e concorrente criado, mas pulado com segurança sem banco dedicado `mm_asaas_flow_test`. A correção usa período persistido e advisory transaction lock. |
| AC-005 | Pacotes 1/2 | Idempotência e split/fallback preservados | **Aprovado por testes focados e revisão** — frontend separa chaves por intervalo/método; backend preserva fingerprints legados de cartão, distingue Pix e mantém split elegível/fallback sem split. |

## Evidências

- `frontend/`: `npm run typecheck` — passou.
- `frontend/`: `npx vitest run tests/unit/TeacherStorefrontPaymentMethod.test.tsx` — passou, 3 testes.
- `backend/`: `node --import tsx src/modules/payments/__tests__/create-checkout-payment-method.test.ts` — passou, 3 testes; sem chamadas reais ao Asaas.
- `backend/`: `npm run typecheck` — passou após a proteção contra eventos concorrentes.
- `backend/`: teste `monthly-payment-charge-period.test.ts` — ambos cenários foram ignorados porque `PAYMENTS_TEST_DATABASE_URL` e `DATABASE_URL` não apontam para um banco dedicado seguro; a regressão não foi exercitada contra PostgreSQL.
- Revisão independente do frontend: sem achados em AC-001, AC-002 e chave frontend de AC-005.
- Revisão independente do backend: lock estável por ambiente+pagamento antes da leitura; `$queryRaw` usado para `SELECT`; estados terminais e eventos atrasados mantêm suas guardas.
- Revisão independente dos critérios de tela: sem achados em AC-001, AC-002 e AC-005 frontend. Testes backend cobrem contratos, fingerprints e split/fallback.
- Verificação da rota local `http://127.0.0.1:3000/p/juarezdamatematica`: não foi possível visualizar a tela neste ambiente porque não havia servidor escutando na porta 3000.

Registrar comandos, saída dos testes focados, revisão independente e qualquer lacuna de sandbox após implementação.
