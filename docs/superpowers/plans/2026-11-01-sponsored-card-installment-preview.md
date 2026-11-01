# Sponsored Card Installment Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an estimated annual card installment amount and correctly distinguish a failed checkout attempt from one still in progress.

**Architecture:** The teacher UI derives an estimate from the existing server quote and displays it only for ANNUAL + CREDIT_CARD. The create use case uses the persisted batch status to return a distinct safe error for an earlier failed attempt; it never silently retries Asaas.

**Tech Stack:** Next.js/React, TypeScript, Fastify, Prisma, Vitest and Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-01-sponsored-card-installment-preview-design.md`

## Global Constraints

- Do not create or cancel any real checkout, payment, or Asaas configuration.
- Do not change or delete the production batch created by the user's prior click.
- Preserve existing idempotency protections; no automatic provider retry after an ambiguous failure.
- Show installment amount as an estimate only; Asaas checkout remains authoritative.

## Review Focus

- Non-divisible cent totals must format the average estimate to two decimals.
- Changing from annual card to Pix or monthly must remove installment copy.
- A persisted failed attempt must not be reported as an active checkout or call the provider again.
- A genuinely pending attempt must remain blocked from duplicate creation.
- A prior successful checkout must still return its saved URL.

---

### Task 1: Independent regression tests

**Files:**
- Create: `frontend/tests/unit/TeacherSponsoredClassesInstallmentPreview.test.tsx`
- Create: `backend/src/modules/payments/__tests__/create-sponsored-seat-batch.failed-idempotency.test.ts`

**Interfaces:**
- Frontend uses existing `TeacherSponsoredSeatService.quoteSponsoredBatch` contract and page behavior.
- Backend uses the existing repository contract `findBatchByIdempotency` and provider spy.

- [ ] Write tests for AC-001/002: annual card displays estimate; Pix and monthly do not.
- [ ] Write tests for AC-003/004: failed attempt reports distinct error without provider call; pending remains blocked; successful URL is reused.
- [ ] Run both new files and confirm failures are the expected missing behavior.

### Task 2: Implement display and failed-state classification

**Files:**
- Modify: `frontend/src/modules/teacher/components/TeacherSponsoredClassesPage.tsx`
- Modify: `backend/src/modules/payments/application/commands/create-sponsored-seat-batch.use-case.ts`
- Modify: `backend/src/modules/payments/http/sponsored-seat.controller.ts`

**Interfaces:**
- Backend repository result for existing batch already includes `status`, `checkoutUrl`, and fingerprint.
- Add a distinct `CHECKOUT_CREATION_FAILED` public error; retain `CHECKOUT_PENDING` for in-flight records.

- [ ] Use the existing quote total to render the annual-card estimate as `money(totalAmountCents / 12)` in review and side summary, with explicit “estimativa” wording.
- [ ] Render no installment estimate for Pix or monthly plans.
- [ ] Branch on stored batch status before treating a missing checkout URL as in progress; failed state returns its own message and does not call provider.
- [ ] Run the new regression tests and the existing focused page/create/controller tests.

### Task 3: QA and validation

**Files:**
- Update: `docs/superpowers/specs/2026-11-01-sponsored-card-installment-preview-validation.md`

- [ ] Revisor QA runs independent tests and focused related suites.
- [ ] Confirm typechecks and no provider/network call in failed-idempotency test.
- [ ] Record the production log limitation and that the already-failed batch was not mutated or retried.
