# Payments Service — Recebimento com Asaas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o recebimento do MeuMonitor AI como um módulo `payments` autocontido, integrado ao Asaas e preparado para futura extração em `payment-service`.

**Architecture:** O backend continuará como modular monolith nesta fase. `payments/index.ts` será a única API pública; domínio e casos de uso dependerão de ports, enquanto o adapter Asaas, Prisma, HTTP e jobs ficarão na infraestrutura. Eventos financeiros sairão por outbox, permitindo substituir `LocalPaymentsClient` por `HttpPaymentsClient` no futuro.

**Tech Stack:** TypeScript, Fastify, Prisma, PostgreSQL/Supabase, Zod, Asaas API v3, Redis/BullMQ quando necessário e Node Test Runner com `tsx`.

**Spec:** `docs/asaas/specs/2026-09-09-recebimento-asaas-design.md`

## Global Constraints

- Provider externo é Asaas; não adicionar Stripe ou Pagar.me ao novo fluxo.
- `backend/src/modules/payments/index.ts` é a única API pública do módulo.
- Frontend não define preço, desconto, split, status de pagamento ou acesso.
- Valores financeiros são inteiros em centavos no domínio e no banco.
- API keys e `authToken` do Asaas ficam somente em secrets do backend.
- Não persistir dados completos de cartão, CVV, senhas, tokens ou API keys de subconta sem proteção dedicada.
- Checkout, webhook, outbox e ledger são idempotentes; ledger é append-only.
- `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` são estados distintos.
- `student-access`, notificações e analytics reagem a eventos; webhook não atualiza suas tabelas diretamente.
- O primeiro escopo não extrai um processo separado; apenas preserva o contrato de extração.

---

### Task 1: Criar a spec, o mapa de fronteiras e o README do módulo

**Files:**
- Create: `backend/src/modules/payments/README.md`
- Modify: `README.md`
- Reference: `docs/asaas/specs/2026-09-09-recebimento-asaas-design.md`

- [ ] **Step 1: Documentar a fronteira pública** com imports permitidos, imports proibidos, responsabilidade das camadas, tabelas proprietárias e eventos emitidos.
- [ ] **Step 2: Documentar o adapter Asaas** com ambientes, `walletId`, `externalReference`, split sobre valor líquido, `authToken` e eventos suportados.
- [ ] **Step 3: Adicionar no README raiz links para a spec e este plano.**
- [ ] **Step 4: Verificar links e confirmar que não existem adapters, rotas ou variáveis operacionais de Pagar.me/Stripe no novo fluxo.**

### Task 2: Migrar a fronteira de `billing` para `payments`

**Files:**
- Create: `backend/src/modules/payments/index.ts`
- Create: `backend/src/modules/payments/application/dto/create-checkout.dto.ts`
- Create: `backend/src/modules/payments/application/dto/payment-response.dto.ts`
- Create: `backend/src/modules/payments/application/payments-client.ts`
- Modify: `backend/src/routes/index.ts` ou composição equivalente
- Modify: consumidores atuais de `backend/src/modules/billing` e `backend/src/services/student-purchase.service.ts`
- Test: `backend/src/modules/payments/__tests__/payments-boundary.test.ts`

- [ ] **Step 1: Escrever teste de contrato** garantindo que o consumidor importa `PaymentsClient` de `payments` e não acessa subpastas internas.
- [ ] **Step 2: Definir `PaymentsClient`** com `createCheckout`, `getPayment` e `getPaymentAccount`, mantendo DTOs sem tipos do Asaas.
- [ ] **Step 3: Criar `LocalPaymentsClient`** como implementação inicial delegando aos casos de uso locais.
- [ ] **Step 4: Registrar rotas por `payments/index.ts`** e manter um adapter de compatibilidade para as rotas legadas apenas durante a migração.
- [ ] **Step 5: Rodar o teste de fronteira** e confirmar que nenhum novo import aponta para `billing/infrastructure` ou `billing/repositories`.

### Task 3: Modelar domínio, ports e cálculo financeiro

**Files:**
- Create: `backend/src/modules/payments/domain/entities/payment.entity.ts`
- Create: `backend/src/modules/payments/domain/entities/invoice.entity.ts`
- Create: `backend/src/modules/payments/domain/entities/split.entity.ts`
- Create: `backend/src/modules/payments/domain/value-objects/money.ts`
- Create: `backend/src/modules/payments/domain/value-objects/payment-status.ts`
- Create: `backend/src/modules/payments/domain/ports/payment-provider.port.ts`
- Create: `backend/src/modules/payments/domain/ports/payment-repository.port.ts`
- Create: `backend/src/modules/payments/domain/ports/payment-account-repository.port.ts`
- Create: `backend/src/modules/payments/domain/ports/event-publisher.port.ts`
- Test: `backend/src/modules/payments/domain/__tests__/money.test.ts`
- Test: `backend/src/modules/payments/domain/__tests__/split-calculation.test.ts`

- [ ] **Step 1: Testar `Money`** para conversão, soma, subtração, arredondamento proibido e rejeição de valores negativos indevidos.
- [ ] **Step 2: Testar split** com seller, plataforma e referral, garantindo que a regra e o valor calculado são congelados no pedido.
- [ ] **Step 3: Implementar entidades e value objects** sem importar Prisma, Fastify ou Asaas.
- [ ] **Step 4: Definir `PaymentProvider`** com customer, cobrança, Pix QR Code, estorno e verificação de webhook.
- [ ] **Step 5: Verificar o contrato** com fake provider e cenários de cobrança PIX, boleto, cartão e `UNDEFINED`.

### Task 4: Criar o schema financeiro proprietário

**Files:**
- Create: `backend/prisma/migrations/20260909000000_create_payments_module/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/modules/payments/infrastructure/persistence/prisma-payment.repository.ts`
- Create: `backend/src/modules/payments/infrastructure/persistence/prisma-payment-account.repository.ts`
- Create: `backend/src/modules/payments/infrastructure/persistence/prisma-ledger.repository.ts`
- Create: `backend/src/modules/payments/infrastructure/persistence/prisma-outbox.repository.ts`
- Create: `backend/src/modules/payments/infrastructure/persistence/prisma-webhook-event.repository.ts`
- Test: `backend/src/modules/payments/infrastructure/persistence/__tests__/payments.repository.test.ts`

- [ ] **Step 1: Criar tabelas** `payment_accounts`, `payment_customers`, `payment_orders`, `payment_order_items`, `payment_splits`, `payment_refunds`, `payment_chargebacks`, `payment_ledger_entries`, `payment_webhook_events`, `payment_outbox_events` e `payment_idempotency_keys`.
- [ ] **Step 2: Adicionar constraints** para `provider_event_id`, escopo/chave de idempotência, valores não negativos, status e referências externas únicas quando presentes.
- [ ] **Step 3: Persistir snapshot financeiro** incluindo `walletId`, regra enviada ao Asaas, `externalReference`, valor bruto, valor líquido observado e estado de cada split.
- [ ] **Step 4: Testar repositórios** para inserção idempotente, append-only do ledger e outbox na mesma transação do pagamento.
- [ ] **Step 5: Gerar cliente Prisma e validar a migration** em banco de teste ou pipeline equivalente.

### Task 5: Implementar adapter Asaas e configuração segura

**Files:**
- Create: `backend/src/modules/payments/infrastructure/providers/asaas/asaas-http.client.ts`
- Create: `backend/src/modules/payments/infrastructure/providers/asaas/asaas-payment.provider.ts`
- Create: `backend/src/modules/payments/infrastructure/providers/asaas/asaas-webhook.adapter.ts`
- Create: `backend/src/modules/payments/infrastructure/providers/asaas/asaas-mapper.ts`
- Modify: `backend/src/config/env.ts`
- Test: `backend/src/modules/payments/infrastructure/providers/asaas/__tests__/asaas-payment.provider.test.ts`
- Test: `backend/src/modules/payments/infrastructure/providers/asaas/__tests__/asaas-webhook.adapter.test.ts`

- [ ] **Step 1: Testar requests** para `POST /v3/customers`, `POST /v3/payments`, Pix QR Code e estorno usando fake HTTP client, sem rede externa.
- [ ] **Step 2: Implementar autenticação** com `access_token`, URL Sandbox/produção e timeout/retry limitado para operações seguras.
- [ ] **Step 3: Implementar cobrança** com `billingType`, `value` decimal derivado de centavos, `dueDate`, `externalReference` e `split` por `walletId`.
- [ ] **Step 4: Implementar mapeamento tolerante** para campos adicionais e estados Asaas, preservando o payload mínimo necessário para auditoria.
- [ ] **Step 5: Implementar verificação de webhook** por `authToken` dedicado, comparação constante e rejeição de token ausente/incorreto.
- [ ] **Step 6: Validar configuração** para impedir produção sem `ASAAS_API_KEY`, `ASAAS_WEBHOOK_AUTH_TOKEN` e URL coerente.

### Task 6: Implementar casos de uso de conta, checkout e consulta

**Files:**
- Create: `backend/src/modules/payments/application/commands/create-payment-account.use-case.ts`
- Create: `backend/src/modules/payments/application/commands/create-checkout.use-case.ts`
- Create: `backend/src/modules/payments/application/queries/get-payment.use-case.ts`
- Create: `backend/src/modules/payments/application/queries/get-payment-account.use-case.ts`
- Create: `backend/src/modules/payments/http/payments.controller.ts`
- Create: `backend/src/modules/payments/http/payments.routes.ts`
- Test: `backend/src/modules/payments/application/__tests__/create-checkout.use-case.test.ts`
- Test: `backend/src/modules/payments/application/__tests__/payment-account.use-case.test.ts`

- [ ] **Step 1: Testar idempotência** para duas requisições iguais e para reutilização da mesma chave por outro usuário.
- [ ] **Step 2: Implementar conta de pagamento** persistindo `providerAccountId`, `walletId` e status retornados pelo Asaas, sem aprovar localmente uma conta pendente.
- [ ] **Step 3: Implementar checkout** recebendo IDs/intenção, obtendo dados por contratos públicos, calculando preço e split no backend e criando `PENDING` antes da chamada externa.
- [ ] **Step 4: Tratar falha após criação externa** com reconciliação por `externalReference` antes de permitir nova cobrança.
- [ ] **Step 5: Retornar apenas dados seguros** como `paymentId`, status, valor, método, `invoiceUrl`, Pix payload/QR Code e expiração quando aplicável.
- [ ] **Step 6: Registrar rotas** autenticadas para conta, checkout e consulta, com contratos Zod e respostas padronizadas.

### Task 7: Implementar webhook, outbox, ledger e reconciliação

**Files:**
- Create: `backend/src/modules/payments/application/commands/process-webhook.use-case.ts`
- Create: `backend/src/modules/payments/application/commands/refund-payment.use-case.ts`
- Create: `backend/src/modules/payments/domain/events/payment-confirmed.event.ts`
- Create: `backend/src/modules/payments/domain/events/payment-received.event.ts`
- Create: `backend/src/modules/payments/domain/events/payment-failed.event.ts`
- Create: `backend/src/modules/payments/domain/events/payment-refunded.event.ts`
- Create: `backend/src/modules/payments/domain/events/payment-chargeback.event.ts`
- Create: `backend/src/modules/payments/http/webhook.controller.ts`
- Create: `backend/src/modules/payments/jobs/process-payment-outbox.job.ts`
- Create: `backend/src/modules/payments/jobs/reconcile-payments.job.ts`
- Create: `backend/src/modules/payments/infrastructure/events/payments-event.publisher.ts`
- Test: `backend/src/modules/payments/application/__tests__/process-webhook.use-case.test.ts`
- Test: `backend/src/modules/payments/application/__tests__/refund-payment.use-case.test.ts`

- [ ] **Step 1: Testar webhook duplicado** garantindo uma única transição, um único lançamento e um único evento interno.
- [ ] **Step 2: Testar ordem inesperada** (`RECEIVED` antes de `CONFIRMED`), eventos desconhecidos, campos extras e falhas reprocessáveis.
- [ ] **Step 3: Implementar persistência/ack rápido** no controller e processamento transacional no use case/worker.
- [ ] **Step 4: Mapear** `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, falhas, overdue, refunds, chargebacks, `PAYMENT_SPLIT_DONE` e divergências de split.
- [ ] **Step 5: Implementar ledger append-only** para cobrança, taxa, split, recebimento, estorno e chargeback.
- [ ] **Step 6: Implementar outbox** na mesma transação do estado financeiro e publicar eventos com retry e deduplicação.
- [ ] **Step 7: Implementar reconciliação** consultando cobranças por `externalReference`/ID e corrigindo somente por nova transição ou lançamento.

### Task 8: Migrar consumidores e validar extração futura

**Files:**
- Modify: `backend/src/routes/student-purchase.routes.ts`
- Modify: `backend/src/controllers/student-purchase.controller.ts`
- Modify: `backend/src/services/student-purchase.service.ts`
- Modify: `backend/src/modules/student-access/**`
- Modify: `backend/src/modules/billing/**` para adapter/depreciação
- Create: `backend/src/modules/payments/infrastructure/local-payments.client.ts`
- Create: `backend/src/modules/payments/infrastructure/http-payments.client.ts`
- Test: `backend/src/modules/payments/__tests__/payments-client-contract.test.ts`
- Test: `backend/src/modules/student-access/__tests__/payment-events.test.ts`

- [ ] **Step 1: Migrar compras** para `PaymentsClient`, removendo dependência direta de repositories/services internos de billing.
- [ ] **Step 2: Consumir `payments.payment.received`** no módulo de acesso através de handler idempotente, sem atualizar o acesso no webhook.
- [ ] **Step 3: Manter `student_subscriptions` como projeção** somente no consumidor de eventos, com regras de acesso separadas do pagamento.
- [ ] **Step 4: Implementar `HttpPaymentsClient`** com o mesmo contrato do cliente local, sem ativá-lo em produção nesta etapa.
- [ ] **Step 5: Rodar verificação de dependências** com regra que proíba imports para subpastas internas de `payments`.
- [ ] **Step 6: Validar Sandbox** com PIX, boleto, cartão, webhook duplicado, estorno parcial, split de dois wallets e recuperação após falha.

## Verificação final

- `npm test` ou o comando de testes equivalente do backend.
- Testes unitários do módulo `payments`.
- Testes de integração de migration/repositórios.
- `git diff --check` quando o repositório estiver disponível.
- Auditoria de imports proibidos e secrets em logs.
- Checklist manual do fluxo: criar conta, criar checkout, pagar, receber webhook, liquidar split, estornar e reconciliar.
