# Asaas Subaccount Flow Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task by task, with TDD red/green evidence.

**Goal:** Make subaccount creation and status webhooks recoverable, then prove the teacher flow without changing production accounts.

**Architecture:** The Asaas HTTP boundary is simulated in deterministic tests; inbox/outbox, database status updates and worker recovery retain their production contracts. A separate opt-in Sandbox journey verifies actual Asaas delivery. Webhook acceptance persists before returning HTTP 200.

**Tech Stack:** Fastify, Prisma/PostgreSQL, BullMQ/Redis, node:test, Playwright, Asaas Sandbox.

**Spec:** `docs/asaas/specs/2026-10-25-asaas-subaccount-webhook-reliability-design.md` and `docs/asaas/specs/2026-10-25-asaas-subaccount-flow-tests-design.md`.

## Global Constraints

- Never send synthetic account approval to production.
- Never log or return Asaas keys, tokens, CPF/CNPJ or full payloads.
- Preserve work already present in the shared worktree; commit only if changes can be isolated safely.
- Keep sandbox calls opt-in and separate from CI.

## Review Focus

- Event first received before local account exists: one inbox record after replay and eventual application.
- Worker dies mid-job: expired lease is recovered without duplicate effects.
- `/accounts` succeeds but webhook sync fails: no second subaccount creation.
- Status notifications arrive out of order: approval does not regress.
- Test runner receives a production URL: abort before network mutation.

---

### Task 1: Inbox identity and durable response

**Files:** `backend/prisma/schema.prisma`, new migration, `backend/src/modules/payments/infrastructure/persistence/prisma-webhook.repository.ts`, HTTP/ingress tests.

- [ ] Add a failing test for duplicate delivery before and after account linkage.
- [ ] Verify it fails because the inbox identity depends on nullable account ID.
- [ ] Add environment/event ID uniqueness and retain the raw account ID.
- [ ] Verify one inbox/outbox event and HTTP 200 for repeats.

### Task 2: Recovery and status application

**Files:** webhook repository, recovery job, process use case, account repository and focused tests.

- [ ] Add failing tests for due `WAITING_CORRELATION`, expired `PROCESSING`, missing account ID and stale status.
- [ ] Verify the failures are behavioral.
- [ ] Implement bounded retry and correct status ordering.
- [ ] Verify focused tests and backend typecheck.

### Task 3: Subaccount creation after partial failure

**Files:** start use case, Asaas provider, account repository, controller and tests.

- [ ] Add failing tests for webhook provisioning failure after `/accounts` and concurrent requests.
- [ ] Persist/reconcile remote creation before any retryable webhook sync.
- [ ] Verify one remote creation and no exposed credential.

### Task 4: Safe test harness and frontend coverage

**Files:** sandbox webhook script and tests, integrated backend test, frontend tests/e2e as needed.

- [ ] Add failing test for production target guard.
- [ ] Add local full-flow test from account creation to persisted webhook status and API query.
- [ ] Add opt-in Sandbox runner and frontend status scenario.
- [ ] Run relevant full suites, lint, typecheck and diff checks.
