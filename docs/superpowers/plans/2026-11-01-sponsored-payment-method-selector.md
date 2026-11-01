# Forma de pagamento nas turmas patrocinadas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute tasks in order and keep the task scopes disjoint.

**Goal:** Deixar o professor escolher Pix ou cartão na tela e preservar o método escolhido em checkout, lote e edição de pendências.

**Architecture:** A tela apresenta um menu expansível e envia um `billingType` explícito à criação do checkout. A cotação recebe apenas monitor, período e e-mails, sem depender do método escolhido. O backend valida o método, persiste-o no lote, inclui-o na idempotência e usa o método salvo ao substituir um checkout pendente. O provider continua compartilhado, mas recebe apenas o método escolhido.

**Tech Stack:** Next.js/React, TypeScript, Fastify, Prisma/PostgreSQL, Asaas Checkout, Vitest e Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-01-sponsored-payment-method-selector-design.md`

## Global Constraints

- Anual Pix: `DETACHED`. Anual cartão: `DETACHED` e `INSTALLMENT`, com `maxInstallmentCount: 12` (o checkout permite à vista ou parcelar).
- Mensal: Pix ou cartão; ambos `RECURRENT`, ciclo `MONTHLY`.
- Pix mensal gera cobrança mensal para pagamento manual; não é Pix Automático.
- Checkout patrocinado mantém `splits: []`.
- Editar lote anual pendente de cartão mantém o limite de parcelamento de 12 vezes.
- Compras antigas sem método passam a usar `CREDIT_CARD`.
- A migration aditiva foi aplicada ao Supabase configurado após autorização explícita do usuário; `prisma migrate status` confirmou o schema atualizado.

## Review Focus

- Trocar de plano ou método não pode reaproveitar a chave de idempotência de outra combinação — testar chave/fingerprint distintos.
- Editar lote pendente precisa manter a forma original — testar troca de checkout.
- Payload inválido não pode liberar uma combinação de método e período fora da regra — testar validação da API.
- O valor e o split não podem variar com a forma de pagamento — testar ambos os métodos em cada período.
- Migração precisa preservar linhas antigas com default cartão — validar SQL e default Prisma.

---

### Task 1: Contrato de pagamento, persistência e provider

**Files:**
- Modify: `backend/src/modules/payments/domain/ports/payment-provider.port.ts`
- Modify: `backend/src/modules/payments/infrastructure/providers/asaas/asaas-checkout.provider.ts`
- Modify: `backend/src/modules/payments/application/commands/create-sponsored-seat-batch.use-case.ts`
- Modify: `backend/src/modules/payments/http/sponsored-seat.controller.ts`
- Modify: `backend/src/modules/payments/infrastructure/persistence/sponsored-seat-batch.repository.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202611010001_sponsored_seat_billing_type/migration.sql`
- Test: `backend/src/modules/payments/__tests__/create-sponsored-seat-batch.test.ts`
- Test: `backend/src/modules/payments/__tests__/asaas-provider.contract.test.ts`
- Test: `backend/src/modules/payments/__tests__/sponsored-seat.controller.test.ts`
- Test: `backend/src/modules/payments/__tests__/update-sponsored-seat-batch.test.ts`

**Interfaces:**
- Consumes: approved design AC-001–AC-006.
- Produces: quote contract is method-independent; create input requires `billingType: 'PIX' | 'CREDIT_CARD'`; list records include `billingType`; pending updates retain the stored `billingType`; `HostedCheckoutCommand.billingType` narrows Asaas `billingTypes` to exactly one selected value.

- [x] **Step 1: Add failing tests** for the four interval/method payload combinations, invalid method rejection, persistence/list output, method-aware fingerprint/idempotency, and pending update preserving the saved method.
- [x] **Step 2: Run focused tests and confirm failures** with `node --import tsx --test` on the four backend test files above.
- [x] **Step 3: Implement the contract and migration** with Prisma default `CREDIT_CARD`, API validation, repository persistence, method-aware idempotency and checkout payload selection.
- [x] **Step 4: Run focused backend tests and typecheck** with the focused test command and `npm run typecheck` from `backend/`.
- [x] **Step 5: Self-review** the diff and record test output in the task report. A migration foi aplicada após autorização explícita; não houve cobrança real.

### Task 2: Menu de método e experiência de compra

**Files:**
- Modify: `frontend/src/modules/teacher/services/TeacherSponsoredSeatService.ts`
- Modify: `frontend/src/modules/teacher/components/TeacherSponsoredClassesPage.tsx`
- Test: `frontend/tests/unit/TeacherSponsoredClassesPage.test.tsx`
- Test: `frontend/tests/unit/TeacherSponsoredSeatService.test.tsx`
- Modify: `docs/asaas/reference/PAGAMENTOS-E-ASSINATURAS.md`
- Modify: `docs/superpowers/specs/2026-10-27-sponsored-student-seats-and-annual-plan-test-plan.md`
- Modify: `docs/superpowers/specs/2026-10-27-sponsored-student-seats-and-annual-plan-validation.md`

**Interfaces:**
- Consumes: Task 1 API contract and `billingType` on saved batch records.
- Produces: the professor selects a payment method in an expandable menu after selecting the plan; quote/review and checkout actions require a selection; changing interval clears the selection; summary/history show the method; editing a pending batch uses its saved method.

- [x] **Step 1: Add failing component/service tests** for menu expansion, available options for monthly and annual, selection requirement, interval reset, payload forwarding, summary/history, and edit preservation.
- [x] **Step 2: Run focused frontend tests** and confirm they fail for the missing menu/contract.
- [x] **Step 3: Implement the expandable method menu** and pass the selected method through the service without changing quote totals or split behavior.
- [x] **Step 4: Update payment reference and test/validation documents** with the new payment choices and method-specific cases.
- [x] **Step 5: Run focused frontend tests and `npm run typecheck`** from `frontend/`, then self-review the task diff.

### Task 3: Consolidated QA and validation

**Files:**
- Modify: `docs/superpowers/specs/2026-11-01-sponsored-payment-method-selector-validation.md`
- Review: backend and frontend files from Tasks 1–2.

- [x] **Step 1: Revisor QA independently tests** AC-001–AC-006, including all four method/interval combinations and pending-batch edit behavior.
- [x] **Step 2: Reconcile findings**; fix any Critical/Important issue through the owning implementer and obtain a scoped re-review.
- [x] **Step 3: Record commands, results, limitations and the pending remote migration** in the validation matrix.
