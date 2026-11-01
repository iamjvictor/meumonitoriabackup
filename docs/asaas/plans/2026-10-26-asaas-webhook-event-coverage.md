# Asaas Webhook Event Coverage Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement task by task with TDD. Each behavioral change starts with a failing test.

**Goal:** Close event handling gaps across Asaas subaccount status, recurring payments, chargebacks and splits, with deterministic local coverage and an opt-in Sandbox verification.

**Architecture:** Keep durable webhook intake/idempotency and add an explicit event catalog shared by platform and subaccount webhook configuration. Route each supported event to a lifecycle handler that persists provider state without confusing payment, checkout, subscription, split and access states.

**Tech Stack:** TypeScript/Node test runner, Prisma/PostgreSQL, Asaas API v3, existing webhook inbox/outbox and worker.

**Spec:** `docs/asaas/specs/2026-10-26-asaas-webhook-event-coverage-design.md`

## Global Constraints

- Do not mutate remote Asaas configuration or send Sandbox events to production.
- Do not grant access from checkout, charge creation, authorization or split settlement alone.
- Replays and out-of-order delivery must not duplicate financial/access effects.
- Keep webhook credentials, account keys, PII and full payloads out of logs and test artifacts.
- Leave boleto, cash-receipt and dunning events disabled until those payment methods enter product scope.

## Review Focus

- A configured event reaches no handler and waits forever — test every event list entry against dispatcher coverage.
- Late `PAYMENT_CONFIRMED/RECEIVED` after chargeback reversal is mistaken for a duplicate of a final chargeback — integration sequence test.
- A refund-in-progress/denied event is mistaken for a completed refund — integration state-preservation tests.
- Split divergence changes subscription or student access — test the split state independently.
- Commercial annual expiry changes general approval or is not delivered to subaccount webhook — provider/configuration test.

---

### Task 1: Event catalog and dispatch contract

**Files:**
- Create: `backend/src/modules/payments/infrastructure/providers/asaas/asaas-webhook-events.ts`
- Modify: `backend/src/scripts/register-asaas-webhook.ts`
- Modify: `backend/src/scripts/update-asaas-webhook.ts`
- Modify: `backend/src/modules/payments/infrastructure/providers/asaas/asaas-account.provider.ts`
- Modify: `backend/src/modules/payments/application/commands/process-webhook.use-case.ts`
- Create: `backend/src/modules/payments/__tests__/webhook-event-coverage.test.ts`

**Interfaces:**
- Export immutable `ASAAS_PLATFORM_WEBHOOK_EVENTS` and `ASAAS_SUBACCOUNT_WEBHOOK_EVENTS` arrays from the new catalog.
- `ProcessPaymentWebhookUseCase` must call the handler appropriate to each catalogued event, mark the returned application state, and mark unsupported event names `IGNORED`.

- [x] Add failing catalog parity tests: register and update scripts use the same platform event set; account provider uses subaccount status events; required event sets match the spec.
- [x] Add failing dispatcher tests for all configured-but-untreated and new relevant events; assert handler, applied state, and no access path for non-payment events.
- [x] Run focused test and verify failures identify missing events/branches.
- [x] Extract shared event lists and add explicit dispatcher cases.
- [x] Run `node --import tsx --test src/modules/payments/__tests__/webhook-event-coverage.test.ts src/modules/payments/__tests__/process-webhook.test.ts`.

### Task 2: Payment lifecycle and chargeback recovery

**Files:**
- Modify: `backend/src/modules/payments/infrastructure/persistence/payment-event.repository.ts`
- Modify: `backend/src/modules/payments/application/commands/process-webhook.use-case.ts`
- Modify: `backend/src/modules/payments/__tests__/payment-event.database.test.ts`

**Interfaces:**
- Add a repository operation for non-entitling payment lifecycle events with result `{ updatedRows: number; state: string; accessGranted: false }`.
- Keep access-granting `PAYMENT_CONFIRMED/RECEIVED` behavior separate from pending, refused, updated, deleted/restored and dispute-state mutations.

- [x] Add failing DB tests for created charge, capture refusal, deletion/restoration, update, refund-in-progress/denied/partial, chargeback dispute and reversal sequence.
- [x] Run each test against an isolated PostgreSQL database and verify failures are behavioral.
- [x] Persist lifecycle states idempotently; do not grant access from `PAYMENT_CREATED` or capture refusal.
- [x] Model chargeback as reversible while the dispute/reversal is pending; only a later provider confirmation/receipt restores the correlated entitlement. Keep final refund terminal.
- [x] Verify lifecycle sequence tests, existing payment database tests and full `npm run test:payments`.

### Task 3: Split event lifecycle

**Files:**
- Modify: `backend/src/modules/payments/infrastructure/persistence/payment-event.repository.ts`
- Modify: `backend/prisma/schema.prisma` if a separate subscription split state needs persistence
- Create migration only if schema changes are approved by the implementation evidence.
- Modify: `backend/src/modules/payments/__tests__/payment-event.database.test.ts`

- [x] Add failing tests for split cancellation, divergence block/end, and subscription split disabled/block/end; verify student enrollment is unchanged.
- [x] Implement charge split state transitions and a separate subscription split state; do not overload subscription financial status or access status.
- [x] Run split DB tests, migration validation if needed, and Prisma validation.

### Task 4: Annual commercial confirmation for subaccounts

**Files:**
- Modify: `backend/src/modules/payments/infrastructure/providers/asaas/asaas-account.provider.ts`
- Modify: `backend/src/modules/payments/infrastructure/providers/asaas/asaas-account-status.mapper.ts` only if tests expose a missing mapping
- Modify: `backend/src/modules/payments/__tests__/asaas-account.provider.test.ts`
- Modify: `backend/src/modules/payments/__tests__/asaas-account-status.mapper.test.ts`
- Modify: `backend/src/modules/payments/__tests__/subaccount-webhook.database.test.ts`

- [x] Add failing tests for `ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRING_SOON` and `_EXPIRED` in the subaccount webhook event list and status projection.
- [x] Verify commercial expiry updates only the commercial dimension and creates/retains an operational renewal state while general approval remains unchanged.
- [x] Run account provider, mapper and subaccount DB tests.

### Task 5: End-to-end regression and Sandbox gate

**Files:**
- Modify: `backend/src/modules/payments/__tests__/webhook-ingress.test.ts`
- Modify: `backend/src/modules/payments/__tests__/webhook-recovery.test.ts`
- Add opt-in Sandbox runner only if a separate homologation URL and credentials are provided.

- [x] Add/reuse ingress-to-worker regression for duplicates, late correlation, retry and out-of-order events.
- [x] Run backend typecheck, focused lint, Prisma validation and complete payment suite with isolated PostgreSQL; queue delivery is mocked in the ingress integration tests.
- [ ] Run opt-in Sandbox journey against homologation; record sanitized event IDs and verify inbox-to-panel result.
- [x] Confirm no test or script calls the production host and no remote configuration mutation occurred.

## Completion review

- Every event in each shared array has a dispatcher branch and test.
- Configured platform and subaccount lists are intentionally distinct and have tests.
- All local tests pass; any Sandbox test not run remains explicitly marked pending.
- Production readiness is not claimed before homologation delivery and deployment validation.

## Execution result

- The payment suite passes **186/186** with the disposable PostgreSQL database using the repository command `npm run test:payments`; `test:payments` uses `--test-concurrency=1` because the default parallel Node test runner produced a worker deserialization error while the same suite passed serially.
- `npm run typecheck`, focused ESLint, `npx prisma validate` and `git diff --check` pass.
- The Asaas Sandbox journey remains pending; no remote webhook was changed and no synthetic event was sent.
