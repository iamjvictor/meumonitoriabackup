# Validação — Tela de turmas patrocinadas

## Resultado

| Critério | Cenário verificado | Resultado |
|---|---|---|
| AC-UI-001 | Retorno ao painel e carregamento independente de monitores/histórico | Aprovado |
| AC-UI-002 | Seleção explícita do monitor antes de período e e-mails | Aprovado |
| AC-UI-003 | Erro de histórico mantém compra disponível e permite retry | Aprovado |
| AC-UI-004 | Erros de monitor/cotação, sem monitores, validação de e-mails e estados recuperáveis | Aprovado nos testes de componente |
| AC-UI-005 | Revisão de total, plano, vagas e ausência de split antes do checkout | Aprovado |
| AC-UI-006 | Inclusão individual, normalização, validação e remoção de e-mails | Aprovado |
| AC-UI-007 | Resumo com monitor, período, alunos e total substitui “Como funciona” | Aprovado |
| AC-UI-008 | Histórico lista monitores com/sem lotes, expansível; lote sem vagas mostra estado amigável | Aprovado |
| AC-UI-009 | Edição de lote não pago exige cancelamento anterior, recotação e checkout substituto; disputa de status bloqueia troca | Aprovado em testes unitários do use case/provider; persistência real não exercitada |
| AC-UI-010 | Lote pago/em processamento não permite edição | Aprovado em teste unitário do use case |
| AC-PERSONA-001 | Compra mensal de uma vaga particular para e-mail sem conta, quantity 1 e split vazio | Aprovado em teste unitário de cenário e componente |
| AC-PERSONA-002 | Turma Exatas ENEM com cinco vagas anuais, valor agregado e split vazio | Aprovado em teste unitário de cenário e componente |
| AC-PERSONA-003 | Claim exige e-mail verificado e normaliza a identidade beneficiária | Aprovado em testes do claim use case; fluxo PostgreSQL existente permanece condicionado |
| AC-PERSONA-004 | Turma independente e proteção contra e-mail inválido/duplicado/ativo/cotação antiga | Aprovado em testes unitários de cenário |

## Evidências

- `cd frontend && npm run test:unit -- tests/unit/TeacherSponsoredClassesPage.test.tsx` — 1 arquivo, 8 testes aprovados.
- `cd frontend && npm run typecheck` — aprovado.
- `cd backend && node --import tsx --test src/modules/payments/__tests__/asaas-provider.contract.test.ts src/modules/payments/__tests__/update-sponsored-seat-batch.test.ts src/modules/payments/__tests__/create-sponsored-seat-batch.test.ts` — testes de contrato e use case aprovados, incluindo falha no cancelamento original, confirmação concorrente, substituição condicional e log de checkout órfão.
- `cd backend && node --import tsx --test src/modules/payments/__tests__/sponsored-seat-persona-scenarios.test.ts src/modules/payments/__tests__/claim-sponsored-seats.test.ts` — 8 testes de persona/claim aprovados.
- `cd frontend && npm run test:unit -- tests/unit/TeacherSponsoredClassesPage.test.tsx` — 15 testes aprovados, incluindo persona particular e turma Exatas ENEM.
- `cd backend && npm run test:payments` após adicionar cenários de persona — 230 testes, 196 aprovados, 0 falhas, 34 ignorados por dependência do PostgreSQL isolado.
- `cd backend && npm run typecheck` — aprovado.
- Revisão QA independente da interface: 12/12 testes passaram; cobertura adicional para inclusão/remoção, resumo, accordion, edição pendente e bloqueio de pagos.

Os testes de persona frontend usam serviços simulados; os testes backend validam provider/use case e claim com repositórios simulados. Eles não comprovam captura de pagamento ou concessão de acesso em banco para os novos perfis. A suíte tem um teste de integração existente que faz checkout anual patrocinado → confirmação → claim → entitlement, mas depende da base isolada. Não exercitamos edição em Asaas Sandbox, persistência real em PostgreSQL, worker/webhooks concorrentes ou jornada autenticada em navegador. Os 34 testes de integração do conjunto completo permanecem ignorados sem `mm_asaas_flow_test`. Se o checkout substituto não puder ser cancelado após disputa inesperada de status, o backend registra batch/checkout IDs para reconciliação; a chamada compensatória é best-effort.

## Addendum — método de pagamento (2026-11-01)

| Critério | Evidência do implementador | Estado de QA independente |
|---|---|---|
| AC-PAY-001 — anual Pix/cartão, checkout `DETACHED` | Teste frontend valida payload e seleção; testes backend de criação/provider verificam os métodos e intervalos. | Pendente nesta tarefa; conferir matriz da feature `2026-11-01-sponsored-payment-method-selector-validation.md`. |
| AC-PAY-002 — mensal Pix/cartão, checkout `RECURRENT` mensal | Teste frontend valida payload e seleção; testes backend verificam recorrência mensal e método. | Pendente nesta tarefa; conferir matriz da feature `2026-11-01-sponsored-payment-method-selector-validation.md`. |
| AC-PAY-003 — seleção obrigatória e reset ao mudar plano | Teste de componente cobre botão desabilitado sem seleção e reset anual/mensal. | Pendente nesta tarefa. |
| AC-PAY-004 — resumo/histórico e fallback histórico para cartão | Testes de componente e serviço verificam método salvo e default `CREDIT_CARD` quando lote não tem campo. | Pendente nesta tarefa. |
| AC-PAY-005 — preservar método ao editar lote pendente | Teste de componente apresenta o método salvo; teste backend cobre substituição do checkout com o mesmo método. | Pendente nesta tarefa. |
| AC-PAY-006 — preço e split preservados | Os testes existentes e novos confirmam valor cotado e `splits: []` no fluxo backend. | Pendente nesta tarefa. |

Os testes de frontend usam serviços simulados; não criam cobranças nem provam o comportamento em checkout Asaas real. A nova migração é local e continua pendente de aplicação remota.
