# SDD ledger — plan: docs/asaas/plans/2026-09-25-asaas-account-dashboard-kpis.md

## Workspace ruling

Ruling: execute in the current shared workspace — the project is split into independent `backend` and `frontend` git repositories and already contains user-authorized uncommitted payment work; creating a new worktree would omit that active context and risk overwriting the working integration. No push, merge, or destructive cleanup will be performed.

## Pre-flight scan

| Unit | Shared interface/file | Finding | Ruling |
|---|---|---|---|
| Task 1 ↔ Task 2 | Asaas overview provider result | Task 2 consumes the discriminated `{kind}` result produced by Task 1. | Clean; keep provider unaware of HTTP concerns. |
| Task 2 ↔ Task 3 | `PaymentAccountOverview`, use case | Task 3 exposes the exact DTO produced by Task 2. | Clean; controller maps only auth/errors. |
| Task 3 ↔ Task 4 | `GET /api/v1/teachers/me/payment-account/overview` | Task 4 consumes the authenticated endpoint. | Clean; no frontend Asaas calls. |
| Task 4 ↔ Task 5 | `PaymentAccountOverview` and view helpers | Task 5 consumes the parsed DTO and pure formatting helpers. | Clean; keep formatting out of provider. |
| Task 5 ↔ Task 6 | UI and integration contract | Task 6 verifies the final route and documents operational credential constraints. | Clean. |
| Task 1 | Provider tests vs provider implementation | Tests define normalization, outage and secret redaction required by the spec. | Clean. |
| Task 2 | Use-case tests vs secure assembly | Tests require fail-closed behavior if credential strategy is unavailable. | Clean. |
| Task 3 | Controller tests vs route | Tests cover all documented status classes. | Clean. |
| Task 4 | Frontend service tests vs DTO | Tests cover null metrics, URLs and BRL formatting. | Clean. |
| Task 5 | Component tests vs UI | Tests cover loading/error/accessibility/CTA behavior. | Clean. |
| Task 6 | Integration tests vs acceptance | Tests cover tenant isolation and environment isolation. | Clean. |

## Task status

- Task 1: complete — provider, pagination, sanitized errors, environment guard; review APPROVED
- Task 2: complete — secure overview use case, runtime route/wiring, teacher-role guard; review APPROVED
- Task 3: complete — HTTP contract, role/auth/error mapping and route test; review APPROVED
- Task 4: complete — frontend service/DTO validation/helpers with tests; review APPROVED
- Task 5: complete — blue account UI, safe CTA, KPIs and visual-state contract; review APPROVED
- Task 6: complete — integration tests and payment documentation; review APPROVED

## Final review

- Whole-branch review: APPROVED
- Backend typecheck and 5 focused suites: passed
- Frontend typecheck, focused suite and 32-test suite: passed
- Operational note: metrics remain `null` until a secure subaccount credential resolver is provisioned; no unsafe fallback was added.
- Post-review correction: `/professor/conta` now shares `initialAccount` with the panel to avoid duplicate account requests; route/panel contracts remain approved.
