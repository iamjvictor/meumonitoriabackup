# Pagamentos Asaas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidar pagamentos recorrentes, cancelamento, webhooks, repasses e painéis em uma única representação financeira local sincronizada com o Asaas.

**Architecture:** O Asaas é a autoridade externa. `payment_subscriptions`, `payment_subscription_items`, `payment_charges` e `payment_splits` serão a única representação financeira local; `student_*` será projeção de acesso e `billing_*` será retirado do fluxo. O frontend consumirá endpoints autenticados que aplicam autorização por aluno ou professor.

**Tech Stack:** Fastify 5, Prisma 7, PostgreSQL, TypeScript, Asaas, Next 16, React 19, Vitest, Node test runner e Playwright.

**Spec:** `docs/superpowers/specs/2026-09-24-pagamentos-asaas-fonte-unica-design.md`

## Global Constraints

- Asaas permanece como autoridade externa sobre situação e liquidação.
- Toda identidade de assinatura usa `environment + providerSubscriptionId`.
- Nenhuma alteração de assinatura usa `value = 0`.
- Cancelamento mantém acesso até `servicePeriodEnd`.
- Estimado e liquidado devem ser exibidos separadamente.
- Nenhum segredo de Asaas pode chegar ao frontend ou aos logs.
- Todo código novo começa por teste falhando e passa pelo ciclo RED/GREEN.

## Review Focus

- Webhook duplicado ou fora de ordem não pode duplicar cobrança nem revogar acesso indevidamente — coberto na Task 2.
- Cancelamento de item de assinatura com outros itens não pode cancelar a assinatura inteira — coberto na Task 3.
- Aluno ou professor tentando acessar registro de outra pessoa deve receber 403/404 sem vazamento — coberto nas Tasks 3 e 5.
- Conta de professor não aprovada não pode gerar promessa de repasse — coberto na Task 4.
- Sandbox e Production com o mesmo ID externo não podem cruzar dados — coberto na Task 1.

### Task 1: Modelo financeiro canônico e migração

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_payment_source_of_truth/migration.sql`
- Create: `backend/src/modules/payments/application/services/payment-state.service.ts`
- Create: `backend/src/modules/payments/application/services/__tests__/payment-state.service.test.ts`
- Create: `backend/src/modules/payments/scripts/backfill-legacy-subscriptions.ts`

**Interfaces:**
- Produces `PaymentFinancialState` transitions and an idempotent legacy backfill.
- Consumes existing `PaymentSubscription`, `PaymentSubscriptionItem`, `PaymentCharge`, `PaymentSplit` models.

- [ ] Write failing tests for state transition, environment isolation and idempotent backfill.
- [ ] Run the focused tests and confirm RED.
- [ ] Add only the fields/indexes required for cancel-at-period-end, source event, sync timestamp and split reconciliation.
- [ ] Implement the transition service and backfill script.
- [ ] Run focused tests, Prisma validation and backend typecheck.

### Task 2: Webhook idempotency and financial synchronization

**Files:**
- Modify: `backend/src/modules/payments/application/commands/process-webhook.use-case.ts`
- Modify: `backend/src/modules/payments/infrastructure/persistence/payment-event.repository.ts`
- Modify: `backend/src/modules/payments/infrastructure/http/payment.routes.ts`
- Create/modify: `backend/src/modules/payments/application/commands/__tests__/process-webhook.use-case.test.ts`

**Interfaces:**
- Consumes `PaymentFinancialState` from Task 1.
- Produces idempotent handling for payment confirmation, subscription update/delete, overdue, refund and chargeback events.

- [ ] Add failing tests for duplicate event, `SUBSCRIPTION_DELETED`, period preservation and exact subscription correlation.
- [ ] Run tests and confirm RED.
- [ ] Implement event claim/processing and projection updates in a transaction.
- [ ] Persist expected and provider-reported split records without duplicating rows.
- [ ] Run focused payment tests and full backend typecheck.

### Task 3: Student subscription listing and individual cancellation

**Files:**
- Modify: `backend/src/modules/billing/services/subscription.service.ts`
- Modify: `backend/src/modules/billing/routes/billing.routes.ts`
- Modify: `backend/src/modules/billing/controllers/subscription.controller.ts`
- Create/modify: `backend/src/modules/billing/services/__tests__/subscription.service.test.ts`
- Modify: `frontend/src/modules/student/services/subscription.service.ts`
- Modify: `frontend/src/modules/student/components/SubscriptionList.tsx`
- Create/modify: `frontend/tests/subscription-cancellation.test.mjs`

**Interfaces:**
- Consumes canonical `payment_*` data and Asaas provider methods.
- Produces `DELETE /api/v1/student/subscriptions/:subscriptionId/items/:monitorId` returning `endsAt`.

- [ ] Add failing tests for last-item DELETE, multi-item update, ownership, idempotency and access through the paid period.
- [ ] Run tests and confirm RED.
- [ ] Implement cancellation against the internal payment subscription ID, never a client-supplied provider ID.
- [ ] Point student listing/history to `payment_*` and keep legacy rows only through the backfill projection.
- [ ] Run backend and frontend focused tests.

### Task 4: Teacher payout API and reconciliation

**Files:**
- Create: `backend/src/modules/payments/application/queries/teacher-subscription.query.ts`
- Create: `backend/src/modules/payments/application/queries/teacher-payout.query.ts`
- Modify: `backend/src/modules/payments/infrastructure/http/payment.routes.ts`
- Create: `backend/src/modules/payments/application/queries/__tests__/teacher-payout.query.test.ts`
- Modify: `backend/src/modules/payments/infrastructure/persistence/payment-event.repository.ts`

**Interfaces:**
- Produces `GET /api/v1/teachers/me/students/subscriptions` and `GET /api/v1/teachers/me/payouts/summary`.
- Returns gross, percentage snapshot, expected teacher cents, settled teacher cents, split status and service period.

- [ ] Add failing tests for teacher isolation, approved-account split, fallback account and settled-vs-estimated values.
- [ ] Run tests and confirm RED.
- [ ] Implement queries scoped by authenticated teacher and persist split reconciliation from webhook data.
- [ ] Run focused tests and backend typecheck.

### Task 5: Teacher dashboard and Asaas receiving-account link

**Files:**
- Modify: `frontend/src/modules/teacher/components/TeacherDashboardOverview.tsx`
- Modify: `frontend/src/modules/teacher/components/TeacherPaymentAccountPanel.tsx`
- Create: `frontend/src/modules/teacher/services/teacher-payout.service.ts`
- Create/modify: `frontend/src/modules/teacher/__tests__/TeacherDashboardOverview.test.tsx`
- Create/modify: `frontend/src/modules/teacher/__tests__/TeacherPaymentAccountPanel.test.tsx`

**Interfaces:**
- Consumes Task 4 APIs and existing payment-account APIs.
- Displays active/cancel-pending students, estimated payout, settled payout and onboarding/account link.

- [ ] Add failing component tests for values and account link fallback.
- [ ] Run Vitest and confirm RED.
- [ ] Implement data loading, loading/error states and labels distinguishing estimated from received.
- [ ] Run frontend unit tests, lint and typecheck.

### Task 6: End-to-end and Sandbox contract validation

**Files:**
- Create: `frontend/tests/e2e/asaas-subscription-lifecycle.spec.ts`
- Create: `backend/src/modules/payments/__tests__/payment-lifecycle.integration.test.ts`
- Modify: `backend/package.json`
- Modify: `frontend/package.json`
- Modify: `.env.example` files if required

**Interfaces:**
- Consumes all previous task APIs and environment variables.
- Produces repeatable login → subscribe → approve → teacher payout → cancel → webhook → second-account isolation coverage.

- [ ] Write failing lifecycle tests using deterministic provider/database fakes.
- [ ] Run them and confirm RED for missing behavior.
- [ ] Implement only test harness adapters and fixtures required by the real flow.
- [ ] Run backend tests, frontend unit tests, frontend E2E, Prisma validation, lint, typecheck and production builds.
- [ ] Record Sandbox verification commands and results without committing secrets.

## Final verification

Run from the repository root:

```bash
cd backend && npm run prisma:validate && npm run typecheck && npm test
cd ../frontend && npm run typecheck && npm run lint && npm run test:unit
```

Then run the targeted lifecycle E2E against the configured Sandbox URLs. No deploy claim is allowed without fresh output showing zero failures and a confirmed Asaas subscription cancellation.
