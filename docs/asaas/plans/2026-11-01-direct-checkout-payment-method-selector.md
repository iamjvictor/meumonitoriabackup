# Direct Checkout Payment Method Selector — Implementation Plan

> **For agentic workers:** Execute the two non-overlapping packages below. Preserve all preexisting workspace changes.

**Goal:** Let students select the payment method on the teacher storefront and create the matching Asaas checkout.

**Architecture:** Keep the current hosted checkout and order model. The frontend submits `billingType` with interval; the backend constrains the available payment method and chooses recurring, detached, or installment checkout settings. Monthly PIX access stays tied to a confirmed financial payment event.

**Tech Stack:** Next.js client component, TypeScript/Fastify, Prisma, Asaas Checkout.

**Spec:** [Payment method selector design](../specs/2026-11-01-direct-checkout-payment-method-selector-design.md)

## Global Constraints

- Monthly card is recurring; monthly PIX is a one-off month requiring manual renewal.
- Annual PIX is one-off; annual card supports up to 12 installments.
- Never treat browser redirect or checkout creation as payment confirmation.
- Preserve current price, split, and platform fallback calculations.
- No payment schema migration; no card data or Pix QR data in the application frontend.

## Review Focus

- Monthly PIX creates a detached Pix-only checkout and remains inaccessible until `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`.
- Monthly card remains recurrent and card-only.
- Annual PIX is detached and annual card offers detached/installment with max 12.
- Interval changes reset the required payment choice, and idempotency keys/fingerprints distinguish methods.
- Split eligible and platform fallback behavior remain unchanged.

### Task 1: Backend checkout method contract

**Files:**
- Modify `backend/src/modules/payments/application/commands/create-checkout.use-case.ts`
- Modify `backend/src/modules/payments/http/payments.controller.ts`
- Modify `backend/src/modules/payments/infrastructure/providers/asaas/asaas-checkout.provider.ts` only if the existing provider contract needs adjustment.
- Modify `backend/src/modules/payments/infrastructure/persistence/payment-event.repository.ts` only if code inspection proves current financial events do not grant monthly PIX access.

**Interfaces:** Request accepts interval and `billingType: PIX | CREDIT_CARD`; omission remains `CREDIT_CARD` for compatibility. Provider command gets a single `billingType`; charge types follow AC-003. Preserve monthly/card fingerprint compatibility and include PIX in new idempotency fingerprints.

- [ ] Validate the allowed interval/method combination on the server.
- [ ] Create the correct Asaas checkout command for each combination.
- [ ] Confirm code path correlates monthly PIX payment events to the existing order and activates one month only after financial confirmation.

### Task 2: Storefront payment choice

**Files:**
- Modify `frontend/src/app/(public-teacher)/p/[teacherSlug]/StorefrontClient.tsx`

**Interfaces:** Local `selectedBillingType: PIX | CREDIT_CARD | null`; checkout request sends `billingType` and interval.

- [ ] Add accessible method choices under plan selection, with short recurring/one-time terms.
- [ ] Reset choice when interval changes or a new product is opened.
- [ ] Require method choice before invoking authentication/checkout and include it in client idempotency storage key.

### Task 3: Independent QA

**Files:** QA owns new test files only; do not overlap existing modified tests.

- [ ] Add focused backend contract tests for all four interval/method combinations and webhook confirmation boundary.
- [ ] Add focused storefront UI tests for available choices, reset behavior, CTA gating, and request payload.
- [ ] Run focused tests and report evidence; do not alter production code.
