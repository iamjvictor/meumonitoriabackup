# Task 5 review — final

## Status: APPROVED

The follow-up changes address the prior findings, add the requested focused source-contract coverage, and pass the already-loaded account into the panel on `/professor/conta`, removing the duplicate account fetch while retaining the legacy detail sections.

### Verified

- Navy banner and white copy have strong contrast; responsive layout uses stacked mobile/four-column desktop KPI grids.
- Four KPI values are sourced from the overview DTO and formatted at the view boundary; no fabricated monetary values are used. `metrics: null` maps to `Indisponível`.
- Initial account loading and overview loading skeletons exist; timestamp uses `metrics.asOf`; a retry action exists.
- Dashboard and onboarding CTAs are HTTPS-only, use `target="_blank"` and `rel="noreferrer"`.
- Overview requests use the deduper and the focused service test asserts one concurrent fetch.
- No API key or secret is present in the panel; no withdrawal action was added.
- Retryability is derived from the actual caught error; retry is shown only for transient failures.
- The real route imports and renders the updated panel while retaining the existing status and submitted-profile sections; the new route contract passes.
- The route passes `initialAccount={account}`, and the panel skips its account fetch when that prop is supplied; focused route and panel contracts pass.

### Verification evidence

The focused overview tests cover formatting, URL helper, status copy, retryability, deduplication, and retry-after-rejection. `tests/teacher-payment-account-panel-contract.test.mjs` covers banner, CTA attributes/URL validation, KPI labels, skeleton, unavailable/status and retry markers. `tests/teacher-account-route-contract.test.mjs` and the panel contract both passed during this review.
