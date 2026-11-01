# Validação — forma de pagamento nas turmas patrocinadas

| Critério | Evidência | Resultado |
|---|---|---|
| AC-001 | `create-sponsored-seat-batch.test.ts` cobre anual PIX com `DETACHED` e anual cartão com `DETACHED` + `INSTALLMENT`, máximo 12; edição pendente preserva o payload. UI informa à vista ou até 12x no cartão. | Testes focados aprovados; sem checkout Asaas real pós-mudança |
| AC-002 | `create-sponsored-seat-batch.test.ts` cobre mensal PIX/cartão com `RECURRENT`/`MONTHLY`; provider recebe somente o método escolhido. | Contrato aprovado em testes/mock; migration aplicada, sem checkout real pós-migration |
| AC-003 | Testes da página verificam menu expansível, seleção obrigatória, reset ao trocar período; QA inspecionou reset de monitor e estados `aria-expanded`/seleção no componente. | Aprovado por testes automatizados e revisão de código; browser autenticado indisponível |
| AC-004 | Teste backend verifica `splits: []`; cotação recebe apenas monitor/período/e-mails e comparação das combinações confirma preço igual para mesmo período/quantidade, sem depender de forma de pagamento. Checkout anual Pix mantém o preço anual-base, sem desconto Pix adicional. | Lógica aprovada por testes/mock; sem checkout real |
| AC-005 | Testes backend verificam método no checkout, conflito/reuso da chave de idempotência e preservação de PIX em edição pendente; frontend confere payload e retry. Após migration, Prisma Client consultou `billingType` sem erro. | Schema compatível; checkout real pós-migration pendente |
| AC-006 | Testes verificam fallback legado e migration default cartão. Após migration, metadata confirma coluna `NOT NULL` com default `'CREDIT_CARD'`. | Aprovado no schema e testes |
| Regression local de cotação | Novo teste envia exatamente monitor/período/e-mails sem método e é aceito pelo controller; a criação sem `billingType` continua rejeitada. Teste do serviço confirma body de cotação. | Aprovado: controller 6/6, serviço 7/7; ambos typechecks aprovados |

## Execução QA

- Backend focado: 31 aprovados, 1 ignorado intencionalmente, 0 falhas.
- Frontend focado após correção QA: 27 aprovados, 0 falhas.
- Typechecks backend e frontend: aprovados.
- Nenhuma cobrança real foi criada. A migration foi aplicada ao Supabase configurado após autorização explícita do usuário; `prisma migrate status` confirmou o schema atualizado.
- Follow-up após erro do professor: cotação controller 6/6, serviço de cotação 7/7; exibição/retentativa de erro na página 21/21; frontend e backend typecheck aprovados.
- QA operacional inicial identificou migration pendente; após autorização do usuário, a migration `202611010001_sponsored_seat_billing_type` foi aplicada. `prisma migrate status` confirmou schema atualizado; Prisma Client consultou `billingType` sem erro.
- Pós-migration: backend focado controller + create-batch 13/13 aprovados. Sem sessão autenticada ou checkout real, resposta do Asaas não foi validada.
- Parcelamento anual cartão: backend criação/provider/edição 21/21; frontend página 21/21. Payload usa `maxInstallmentCount: 12` somente para anual cartão. Webhook anual: regressões de `PAYMENT_CREATED`, `PAYMENT_OVERDUE` via `applySubscriptionEvent`, confirmação de parcela após vencimento e `CHECKOUT_PAID` repetido após `PAST_DUE` foram adicionadas em `payment-event.database.test.ts`; a cobertura DB ficou skipped porque `PAYMENTS_TEST_DATABASE_URL` não está configurada para `mm_asaas_flow_test`. O classificador unitário executou e passou; typecheck backend passou. Nenhuma cobrança real foi criada.
- QA follow-up de preço/cotação: backend 22/22 e frontend 22/22 aprovados. Foram removidos o desconto Pix adicional de 10% e o método de pagamento do contrato/body de cotação; o preço anual-base foi preservado. Nesta revalidação, `node --import tsx --test src/modules/payments/__tests__/create-sponsored-seat-batch.test.ts src/modules/payments/__tests__/sponsored-seat.controller.test.ts` aprovou 14/14; `npm run test:unit -- --reporter=dot tests/unit/TeacherSponsoredClassesPage.test.tsx tests/unit/TeacherSponsoredSeatService.test.tsx` aprovou 29/29; `npm run typecheck` passou em backend e frontend.
- Webhook no teste focado: 25 testes unitários/backend passaram e 25 cenários de banco foram skipped porque não há variáveis para o banco isolado `mm_asaas_flow_test`. Não foi executado teste contra Supabase.

## Limitações conhecidas

- A migration `202611010001_sponsored_seat_billing_type` já foi aplicada ao Supabase configurado após autorização explícita do usuário; `prisma migrate status` confirmou o schema atualizado.
- Não executar cobranças em produção.
- Não havia navegador ou sessão autenticada disponível no ambiente CUA; interações de UI e API foram validadas por testes automatizados com mocks, sem provar a criação de checkout real Asaas.
- A migration `202611010001_sponsored_seat_billing_type` foi aplicada ao Supabase configurado com autorização explícita do usuário. Os testes deste follow-up não se conectaram ao Supabase e nenhuma cobrança foi criada.
- **Resultado geral:** o bloqueio de schema foi removido. A confirmação de criação de checkout real permanece pendente; não foi feito teste ponta a ponta com Asaas.
