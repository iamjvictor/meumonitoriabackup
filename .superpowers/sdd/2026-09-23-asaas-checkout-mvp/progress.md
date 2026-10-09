# SDD ledger — plan: docs/superpowers/plans/2026-09-23-asaas-checkout-mvp.md

Pre-flight: Fase 1 será executada no checkout compartilhado porque o repositório raiz não expõe um Git checkout utilizável e o backend/frontend possuem alterações pré-existentes. Nenhuma alteração será removida ou commitada automaticamente.

Ruling: usar migration aditiva no backend/prisma/migrations — o projeto efetivamente configura migrations via backend/prisma.config.ts; não criar migration Supabase paralela.

Ruling: manter billing legado e StudentPurchase intactos — a Fase 1 cria a ponte e o domínio Payment*, sem apagar nem renomear tabelas usadas pelo fluxo simulado.

Ruling: a tabela de conta de recebimento terá histórico por revisão — `teacherId` não será único na tabela inteira; a corrente será apontada por `teachers.current_payment_account_id`.

Ruling: percentuais serão `Decimal(7,4)` em Postgres/Prisma — os percentuais são regras financeiras e o plano exige precisão decimal; valores monetários continuam `Int` em centavos.

Ruling: indicação é uma relação opcional em `TeacherReferral` — `Teacher` não possui percentual de indicação nem indicador default; a porcentagem da relação é copiada para os snapshots no momento da compra.

Task 1: complete — schema, migration aditiva, contratos de snapshot e testes foram criados; as migrations foram aplicadas no Supabase após recuperação de uma execução parcial.

Implementado na Fase 1:
- `backend/prisma/schema.prisma`: preço do monitor, percentuais configuráveis, revisões de conta de recebimento, domínio Payment* e pontes de acesso.
- `backend/prisma/migrations/20260923000100_payments_accounts_pricing_recurring_access_bridge/migration.sql`: migration aditiva com FKs, índices, CHECKs e RLS financeiro.
- `backend/src/modules/payments/domain/contracts.ts`: snapshot imutável de preço/percentuais e fallback de payout.
- `backend/prisma/migrations/20260923000200_normalize_teacher_referrals/migration.sql`: remove a indicação presumida de `teachers` e cria `teacher_referrals` com percentual e proteção contra autoindicação.
- testes de schema/snapshot e pasta de persistência reservada para a Fase 2.

Verificações concluídas:
- `npm run prisma:validate` passou.
- `npm run prisma:generate` passou.
- `npm run typecheck` passou.
- testes novos de schema/snapshot passaram.
- testes existentes de billing e student-access passaram.

Pendências explícitas para a continuação:
- validar constraints/RLS com PostgreSQL real;
- implementar trigger/contexto de auditoria e proteção de snapshots na camada transacional.

Task 2: in_progress — módulo de pagamentos e adapter do checkout hospedado Asaas.

Implementado até aqui:
- `backend/src/modules/payments/domain/ports/payment-provider.port.ts`: contrato interno de checkout hospedado e splits.
- `backend/src/modules/payments/infrastructure/providers/asaas/asaas-http.client.ts`: cliente HTTP com timeout, autenticação, User-Agent e erros sanitizados.
- `backend/src/modules/payments/infrastructure/providers/asaas/asaas-checkout.provider.ts`: checkout Asaas de cartão recorrente mensal, valor em reais derivado de centavos, callback e split.
- `backend/src/modules/payments/application/payments-client.ts` e `payments.module.ts`: fronteira/composição do módulo.
- configuração `PAYMENTS_PROVIDER`, `ASAAS_ENV`, `ASAAS_API_KEY` e parâmetros relacionados no `env.ts`/`.env.example`.
- testes HTTP e de contrato do adapter.

Verificações da Fase 2 até aqui:
- testes de pagamentos/schema/snapshot passaram.
- typecheck passou.
- `git diff --check` passou.

Ainda não exposto: endpoint público de checkout, integração com pedido real, webhook, criação de conta do professor e worker. Esses itens permanecem nas fases seguintes.

Task 3: complete_locally — webhook durável antes da primeira venda.

Implementado:
- endpoint `POST /api/v1/payments/webhooks/asaas` sem `authMiddleware` de usuário;
- autenticação por `asaas-access-token` com comparação em tempo constante;
- inbox `payment_webhook_events` com deduplicação e persistência transacional;
- `payment_outbox_events` criado na mesma transação do ingresso;
- fila BullMQ para processamento assíncrono;
- lease/CAS para impedir processamento concorrente e permitir retomada;
- estados `WAITING_CORRELATION`, `IGNORED` e `FAILED`;
- job de recuperação de eventos persistidos que não chegaram à fila;
- worker de webhooks separado do worker de documentos.

Verificações da Fase 3:
- testes de token ausente/incorreto, replay, payload inválido e persistência passaram;
- testes do adapter Asaas, schema, billing legado e student-access passaram;
- `npm run typecheck` passou.

Pendente para homologação externa:
- configurar `ASAAS_WEBHOOK_AUTH_TOKEN` e `ASAAS_WEBHOOK_URL` reais;
- registrar o webhook no Sandbox e receber um evento real;
- completar os consumidores financeiros de checkout/pagamento nas Fases 5 e 6.

Task 4: complete_locally — configuração da conta de recebimento e elegibilidade de criação/publicação.

Implementado:
- adapter `POST /v3/accounts` do Asaas com payload cadastral e descarte seguro da `apiKey` retornada;
- endpoints autenticados `GET/POST /api/v1/teachers/me/payment-account` e `GET /status`;
- persistência de `providerAccountId`, `walletId`, revisão, status, onboarding e timestamps;
- sincronização de eventos `ACCOUNT_STATUS_*` para aprovação, rejeição e suspensão;
- bloqueio de publicação quando não há conta elegível;
- bloqueio de criação de novos produtos quando não há conta elegível;
- dispensa administrativa restrita em `PATCH /api/v1/monitors/:monitorId/publication-exception`;
- monitor já publicado permanece vendendo quando a conta fica suspensa;
- painel do professor para iniciar o cadastro e acompanhar o status, sem exibir credenciais.

Verificações da Fase 4:
- testes do adapter de subconta e elegibilidade passaram;
- regressão de pagamentos, billing legado e student-access passou;
- backend `typecheck` passou;
- frontend `typecheck` passou;
- build frontend gerou `BUILD_ID` após compilação e páginas estáticas.

Pendente para homologação externa:
- confirmar no Sandbox que a conta-pai está habilitada para criação de subcontas/BaaS;
- executar uma criação real com dados de teste e confirmar eventos de aprovação;
- configurar o token/URL público do webhook e testar o ciclo completo de status.
