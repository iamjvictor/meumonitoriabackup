# Sponsored Student Seats and Annual Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let teachers buy monthly or annual access seats for students by email, add a sponsored-classes panel, and offer a direct annual plan on teacher storefronts.

**Architecture:** Keep existing direct student purchases and their split policy intact. Add sponsored batches/seats as a separate payment channel sharing the Asaas provider, webhook inbox, idempotency, and audit infrastructure; project claimed seat access into the existing student access contracts. Extend the direct checkout with an annual detached option and preserve price, duration, channel, and split policy snapshots for webhook processing.

**Tech Stack:** TypeScript, Fastify, Prisma/PostgreSQL, Asaas Checkout API, Next.js App Router, React, Vitest/node:test.

**Spec:** `docs/superpowers/specs/2026-10-27-sponsored-student-seats-and-annual-plan-design.md`

## Global Constraints

- Sponsored checkout is charged to the teacher and always sends an empty split list.
- Direct student checkout keeps the current teacher split policy.
- Monthly sponsored batches are independent recurring subscriptions; annual batches are detached, one-off purchases with 12 months of service.
- Annual prices are platform managed and unset annual offers cannot be purchased.
- Only a verified authenticated account whose normalized email matches a paid seat can claim access.
- Never create synthetic student/auth accounts for unregistered beneficiary emails.
- Checkout return URLs do not prove payment; process only authenticated, correlated provider events.
- Duplicate/out-of-order events must not duplicate payment, access periods, or seats.
- Keep provider environment and test data isolated; do not send synthetic events to production.

## Review Focus

- A submitted batch containing invalid, duplicate, already-active, or already-paid emails must fail before provider checkout; pin with service validation tests.
- A verified email claim racing with another claim must create at most one active seat; pin with database uniqueness/transaction tests.
- A detached checkout may send both `CHECKOUT_PAID` and a financial event; pin with webhook idempotency tests proving one service period and no duplicate split.
- A monthly recurring sponsored checkout must stay split-free on retries and renewals; pin with provider contract and payment-event tests.
- A failed provider call or local persistence after remote checkout must be recoverable without charging twice; pin with checkout creation/reconciliation tests.

---

## Code Map

- `backend/prisma/schema.prisma` and a new migration: annual monitor price, direct order plan/channel snapshots, sponsored batch and seat persistence.
- `backend/src/modules/payments/domain/ports/payment-provider.port.ts` and `infrastructure/providers/asaas/asaas-checkout.provider.ts`: explicit recurring/detached checkout contract and unit/contract coverage.
- `backend/src/modules/payments/application/commands/`: direct annual checkout, sponsored batch checkout, seat claiming, and provider-event behavior.
- `backend/src/modules/payments/infrastructure/persistence/`: transactional repositories and webhook correlation, reusing existing event inbox/outbox.
- `backend/src/modules/payments/http/` and `payments.module.ts`: authenticated routes/controllers for teacher batches, student annual checkout, claims, and cancellation.
- `backend/src/modules/access/` and student access projections: make claimed sponsored seats readable by current guards/content access.
- `frontend/src/app/(teacher)/professor/turmas/` and `frontend/src/modules/teacher/`: new teacher panel and API service; add dashboard navigation entry.
- `frontend/src/app/(public-teacher)/p/[teacherSlug]/`: annual product data and monthly/annual choice.
- Existing payments and teacher frontend tests plus new unit/integration tests named in tasks below.

## Task 1: Persist annual offer and payment intent snapshots

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202610270004_sponsored_student_seats_annual_plan/migration.sql`
- Test: `backend/src/modules/payments/__tests__/payments-schema.integration.test.ts`

**Interfaces:** Annual price is computed as monthly price × 12 × 0.8 in the backend (no annual-price database column); direct `PaymentOrder` must persist `channel`, `billingInterval`, `serviceMonths`, and `splitPolicy`; sponsored batch/seat entities must persist payer, monitor, environment, normalized email, plan, gross/platform amount snapshots, status, provider IDs, access window, and optional linked `Student`.

- [x] Write database integration tests for backend-derived annual price snapshots, persisted direct annual snapshots, multiple beneficiaries on one sponsored batch, normalized email uniqueness per batch, and multiple independent batches for the same monitor.
- [x] Run the targeted integration test and confirm it fails for missing schema/models.
- [x] Add the schema and migration with foreign keys/indexes and uniqueness preventing duplicate email per batch and duplicate provider correlation per environment.
- [x] Generate Prisma client and run the targeted database test; confirm all schema assertions pass.

## Task 2: Generalize Asaas checkout contract and create sponsored checkout use case

**Files:**
- Modify: `backend/src/modules/payments/domain/ports/payment-provider.port.ts`
- Modify: `backend/src/modules/payments/infrastructure/providers/asaas/asaas-checkout.provider.ts`
- Modify: `backend/src/modules/payments/application/commands/create-checkout.use-case.ts`
- Create: `backend/src/modules/payments/application/commands/create-sponsored-seat-batch.use-case.ts`
- Modify: `backend/src/modules/payments/__tests__/asaas-provider.contract.test.ts`
- Create: `backend/src/modules/payments/__tests__/create-sponsored-seat-batch.test.ts`

**Interfaces:** Extend `HostedCheckoutCommand` with explicit `chargeType: 'RECURRENT' | 'DETACHED'`, optional `cycle`, `items`, and `quantity`; add `CreateSponsoredSeatBatchUseCase.execute(teacherUserId, { monitorId, interval, beneficiaryEmails, idempotencyKey, returnBaseUrl })` returning batch ID, amount, checkout URL, and expiry.

- [x] Add failing provider contract assertions: monthly direct sends `RECURRENT/MONTHLY` with eligible split; annual direct sends `DETACHED` with eligible split; monthly and annual sponsored send empty `splits` and correct service interval/quantity total.
- [x] Add failing use-case tests for server-calculated complement of teacher percentage, explicit annual-price requirement, own published monitor authorization, email normalization/deduplication, overlap rejection, and idempotent retry.
- [x] Implement provider payload variation and the sponsored batch use case with persisted snapshots and idempotency fingerprint over monitor, interval, and sorted normalized emails.
- [x] Run provider and use-case tests; confirm all pass.

## Task 3: Add sponsored checkout and batch management API

**Files:**
- Modify: `backend/src/modules/payments/http/payments.routes.ts`
- Create: `backend/src/modules/payments/http/sponsored-seat.controller.ts`
- Modify: `backend/src/modules/payments/payments.module.ts`
- Create: `backend/src/modules/payments/__tests__/sponsored-seat.controller.test.ts`

**Interfaces:** `POST /payments/teacher-sponsored-batches` accepts `{ monitorId, interval, beneficiaryEmails }` and requires `Idempotency-Key`; `GET /teachers/me/sponsored-batches` returns only batches belonging to the authenticated teacher; `POST /teachers/me/sponsored-batches/:batchId/cancel` schedules whole monthly batch cancellation at period end. Student role cannot call teacher routes.

- [x] Add failing controller tests for teacher-only role, schema errors, missing idempotency key, foreign batch access, successful batch response, and annual cancellation rejection.
- [x] Register controller/use cases with authenticated routes and map domain errors to existing public error format.
- [x] Run the controller tests and existing payment route/controller tests.

## Task 4: Extend direct checkout to monthly and annual plans

**Files:**
- Modify: `backend/src/modules/payments/http/payments.controller.ts`
- Modify: `backend/src/modules/payments/application/commands/create-checkout.use-case.ts`
- Modify: `backend/src/modules/payments/infrastructure/persistence/payment-checkout.repository.ts`
- Modify: `backend/src/modules/payments/__tests__/create-checkout.test.ts`

**Interfaces:** Checkout body becomes `{ monitorId, interval: 'MONTHLY' | 'ANNUAL' }`; omitted interval remains backward-compatible `MONTHLY`. Annual is computed as monthly price × 12 less 20%, persists 12 months and `DETACHED` split policy, and uses its own idempotency fingerprint.

- [x] Add failing tests that default requests remain monthly, annual without price is rejected, and annual snapshots preserve exact price, duration, and split policy.
- [x] Implement direct annual intent creation without changing current monthly behavior.
- [x] Run checkout tests and relevant repository tests.

## Task 5: Process checkout and payment events idempotently by channel and duration

**Files:**
- Modify: `backend/src/modules/payments/application/commands/process-webhook.use-case.ts`
- Modify: `backend/src/modules/payments/infrastructure/persistence/payment-event.repository.ts`
- Test: `backend/src/modules/payments/__tests__/payment-event.database.test.ts`
- Modify: `backend/src/modules/payments/__tests__/process-webhook.test.ts`
- Modify: `backend/src/modules/payments/__tests__/webhook-event-coverage.test.ts`

**Interfaces:** Provider event application resolves the local checkout/batch by environment and provider checkout ID or external reference. The event repository applies `CHECKOUT_PAID` only to detached checkouts; financial confirmation and checkout confirmation share an idempotent paid transition. Access length is read from the persisted order/seat snapshot; sponsored transitions never create teacher `PaymentSplit` rows.

- [x] Add failing database tests for annual direct `CHECKOUT_PAID` granting 12 months with split, sponsored annual activating all seats without split, duplicate/complementary events granting once, and recurring checkout-paid alone not activating monthly access.
- [x] Implement channel-aware correlation and transaction-safe state transitions using the shared webhook event inbox.
- [x] Add tests for cancel/expire non-activation, monthly renewal/overdue behavior, refund/chargeback revocation, and retry after temporarily missing correlation.
- [x] Run payment-event database, webhook, and event-coverage suites.

## Task 6: Claim paid seats and project access into existing guards

**Files:**
- Modify: `backend/src/middleware/auth.middleware.ts`
- Create: `backend/src/modules/payments/application/commands/claim-sponsored-seats.use-case.ts`
- Modify: `backend/src/modules/payments/http/sponsored-seat.controller.ts`
- Modify: `backend/src/modules/access/infrastructure/payment-entitlement.repository.ts`
- Modify: `backend/src/modules/student-access/student-access.repository.ts`
- Create: `backend/src/modules/payments/__tests__/claim-sponsored-seats.test.ts`
- Test: relevant access repository integration tests.

**Interfaces:** Authenticated identity carries `emailVerified`; `POST /student/sponsored-seats/claim` associates all paid unclaimed seats whose normalized email matches the verified auth email. Claim creates the existing `StudentSubscription`/`StudentEnrollment` projection and records student ID atomically.

- [x] Add failing tests for unverified account denial, mismatched email no-op, multiple seat claim, already claimed seat idempotency, and race-safe uniqueness.
- [x] Implement verified identity propagation, claim transaction, and access projection used by existing guards.
- [x] Run claim tests and access repository integration tests.

## Task 7: Build teacher sponsored classes page

**Files:**
- Create: `frontend/src/app/(teacher)/professor/turmas/page.tsx`
- Create: `frontend/src/modules/teacher/components/TeacherSponsoredClassesPage.tsx`
- Create: `frontend/src/modules/teacher/services/TeacherSponsoredSeatService.ts`
- Modify: `frontend/src/modules/teacher/components/TeacherDashboardOverview.tsx`
- Test: `frontend/tests/unit/TeacherSponsoredClassesPage.test.tsx`
- Test: `frontend/tests/unit/TeacherSponsoredSeatService.test.ts`

**Interfaces:** Service functions `listSponsoredBatches()`, `createSponsoredBatch(input)`, and `cancelSponsoredBatch(batchId)` call the API with authenticated credentials and idempotency key. The page groups batches by monitor and shows batch status, plan/period, seat emails, and add-students review with computed server quote, error states, and redirect to hosted checkout.

- [x] Add failing component/service tests for email normalization and duplicate indication, review totals, pending/unclaimed/active/expired states, API errors, successful redirect, and dashboard link.
- [x] Implement the route, page, service, and navigation entry using teacher frontend patterns.
- [x] Run targeted frontend tests and `npm run typecheck` in `frontend`.

## Task 8: Offer annual plan in public teacher storefront

**Files:**
- Modify: `frontend/src/app/(public-teacher)/p/[teacherSlug]/page.tsx`
- Modify: `frontend/src/app/(public-teacher)/p/[teacherSlug]/StorefrontClient.tsx`
- Test: `frontend/tests/unit/TeacherStorefrontAnnualPlan.test.tsx`

**Interfaces:** Public monitor DTO includes backend-computed `annualPriceCents`; storefront presents annual when a valid monthly price exists and sends `{ monitorId, interval: 'ANNUAL' }` to existing checkout API. Monthly default and split are unchanged.

- [x] Add failing tests for annual visibility only when configured, monthly/annual selection payloads, and annual provider error display.
- [x] Propagate annual price from public profile response and implement plan selection.
- [x] Run storefront tests and frontend typecheck.

## Task 9: End-to-end API and documentation review

**Files:**
- Create: `backend/src/modules/payments/__tests__/sponsored-seat-flow.integration.test.ts`
- Modify: `docs/asaas/` index and flow documentation as needed.

- [x] Add integration coverage spanning teacher batch request, fake Asaas checkout response, webhook confirmation, seat claim, and existing access check; assert no provider network call is made.
- [x] Add direct annual integration coverage with split and 12-month service; assert duplicate events do not extend twice.
- [x] Run targeted backend payments tests, relevant frontend tests, Prisma migration validation, and typechecks.
- [x] Update Asaas flow docs with plan intervals, sponsored channel policy, webhook events, and new environment/configuration needs; do not document secret values.

## Plan self-review

- Spec sections are mapped: teacher panel (Task 7), public annual purchase (Task 8), data model/idempotency (Tasks 1–2), API and authorization (Tasks 3–4), shared webhook lifecycle (Task 5), verified claims/access (Task 6), errors and retries (Tasks 2–5, 7), sandbox isolation/no production synthetic events (Tasks 5 and 9), tests/docs (Task 9).
- Existing `StudentSubscription` and `StudentEnrollment` each enforce unique `(studentId, monitorId)`. The implementation must renew/extend the existing projection instead of inserting duplicate projections when a student already has access; Task 6 tests should pin this renewal edge case.
- Existing order/subscription models require a `Student`. Sponsored payer is a teacher, so sponsored batches remain first-class payment records rather than fabricating a student-owned `PaymentOrder`; shared provider/webhook correlation is by explicit batch metadata and environment.
- Exact event payload variants from Asaas must be confirmed against existing event DTOs during Task 5; unknown or uncorrelated events remain in recoverable inbox state and must not grant access.
