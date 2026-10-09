# Task 4 review — Frontend service and data-state contract

## APPROVED

No blocking or high/medium-priority findings.

### Review evidence

- `TeacherPaymentOverviewService` calls the documented endpoint with
  `credentials: 'include'` and `cache: 'no-store'`.
- Concurrent calls are deduplicated through `dedupeAsyncRequest`; the shared
  request is cleared on both resolve and reject, so a failed request can be
  retried.
- The response parser accepts only the documented `data.account` and
  `data.metrics` shape, requires BRL and non-negative integer cent values, and
  maps optional fields to `null`. It returns a safe local 502 error rather than
  forwarding an incompatible/raw provider payload.
- The frontend service returns only the selected DTO fields; extra response
  properties (including credential-like properties) are not propagated.
- Helpers format integer cents as BRL, preserve `metrics: null` as
  `Indisponível`, accept only absolute HTTPS dashboard URLs, provide pending /
  rejected status copy, and classify HTTP/network transient failures as
  retryable.
- Focused verification passed: 7/7 tests in
  `tests/unit/payment-account-overview.test.tsx`; frontend `npm run typecheck`
  passed.

The implementation is approved for Task 4. UI rendering and external-link
attributes remain part of Task 5, as specified by the plan.
