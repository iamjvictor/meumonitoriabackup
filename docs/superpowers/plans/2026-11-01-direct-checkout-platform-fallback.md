# Direct Checkout Platform Fallback Implementation Plan

> **For agentic workers:** Implement the single bounded task below and preserve all preexisting workspace changes.

**Goal:** Allow student direct checkouts without an eligible teacher payout account, with no teacher split and platform fallback snapshots.

**Architecture:** Keep the current checkout and webhook flow. Compute payout eligibility from approval, wallet presence, and positive teacher percentage; use the existing empty-splits provider contract when ineligible.

**Tech Stack:** TypeScript, Prisma, Asaas checkout adapter.

**Spec:** [2026-11-01 direct checkout platform fallback](../specs/2026-11-01-direct-checkout-platform-fallback-design.md)

## Global Constraints

- Preserve the gross checkout amount and all unrelated payment behavior.
- Do not add schema changes, migrations, or frontend changes.
- Preserve preexisting edits in the checkout module and tests.
- Do not run or add tests in this task.

## Review Focus

- Missing account, pending account, missing wallet, zero teacher percentage: checkout proceeds without split.
- Approved account with wallet and positive percentage: existing split remains.
- Fallback order snapshots must not report teacher payout eligibility or expected teacher amount.

### Task 1: Direct checkout payout fallback

**Files:**
- Modify `backend/src/modules/payments/application/commands/create-checkout.use-case.ts`
- Modify `backend/src/modules/payments/infrastructure/persistence/payment-checkout.repository.ts`
- Modify `backend/src/modules/payments/http/payments.controller.ts` only to remove obsolete payout-unavailable mapping if the error class is removed.

**Interfaces:** Keep the existing `CreateCheckoutUseCase` and repository contracts. Ineligible payout returns `{ walletId: null, percentage: '0.0000' }` and provider input uses `splits: []`.

- [ ] Remove the pre-checkout payout exception so it cannot prevent creation of a valid student checkout.
- [ ] Align repository snapshots with full payout eligibility (approved, wallet present, positive percentage); use `splitPolicy: 'NONE'` and zero teacher percentage otherwise.
- [ ] Remove the now-unreachable payout-unavailable error mapping/class if no longer used.
- [ ] Inspect the focused diff for AC-001–AC-004 without running tests.
