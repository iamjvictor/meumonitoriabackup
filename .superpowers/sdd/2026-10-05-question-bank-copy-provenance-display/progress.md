# SDD ledger — plan: backend/docs/superpowers/plans/2026-10-05-question-bank-copy-provenance-display.md

## Workspace ruling

Ruling: execute in the current shared workspace — the project has separate backend/frontend repositories on `main`, with pending unrelated user changes and untracked spec/plan documents; the user explicitly authorized execution. Limit edits to files named by this plan and preserve all pre-existing work. Cost if wrong: task changes are made in the shared main checkout instead of an isolated branch.

## Pre-flight scan

| Unit | Shared interface/file | Finding | Ruling |
|---|---|---|---|
| Task 1 → Task 2 | `Question.metadata` image/provenance snapshot | Materialization persists source fields; the pure mapper will consume same JSON keys (`imageUrls`, `board`, `examName`, `examYear`, `sourceUrl`). | Clean; preserve these names from the spec. |
| Task 2 → Task 3 | `mapQuestionPracticeProvenance(input)` | Mapper returns top-level `imageUrls` and nullable `provenance`; repository will add these to each unchanged question row. | Clean; keep Prisma out of mapper. |
| Task 3 → Task 4 | Student practice API payload | Backend returns top-level `imageUrls` and `provenance`; frontend consumes optional provenance for backwards compatibility. | Clean; avoid breaking existing nested `questionBankItem` payloads. |
| Task 4 | Installed Next.js 16 image guidance | Local App Router docs confirm remote images need dimensions and allowed remote patterns; existing `OptimizedImage` supplies dimensions and config has wildcard HTTPS host. | Clean; keep existing image component/config. |

## Rulings

- Task 3: replace planned source-text contract test with a behavior test of `StudentQuestionAttemptRepository` using Node's module mock only at the Prisma boundary — source-text checks would not prove the returned payload; the actual repository and mapper remain real. Cost if wrong: the module mock could hide a Prisma integration difference, mitigated by asserting the emitted Prisma selection and running typecheck.
- Task 4: replace the planned source-only provenance title contract with a rendered React header component test — real DOM text behavior gives stronger evidence than grepping JSX. Cost if wrong: the page could fail to wire the tested component; mitigate with a focused page wiring contract alongside the existing image contract.
- Task 3 test runner: skip the Prisma-boundary test when Node module mocking is not enabled, and run it with `--experimental-test-module-mocks` in the focused suite — the repository's broad default discovery does not enable that experimental API. Cost if wrong: generic discovery skips this one repository behavior test; the dedicated focused command runs it (1/1 pass).

## Task status

- Task 1: complete — characterization test passes; copied question retains monitor-scoped source key, bank-item FK and ENEM 2008/image snapshot (1 test file, 1 passed).
- Task 2: complete — mapper tests observed missing module RED, then all five fallback/validation cases passed.
- Task 3: complete — repository behavior test observed missing normalized payload RED, then passed with provenance selection/fallback, unchanged question fields and raw metadata omitted; mapper suite passed.
- Task 4: complete — rendered header tests RED on missing component, then 4/4 passed; page wiring and image contracts passed; frontend typecheck passed.
- Task 5: complete — focused backend tests passed (3 files), backend typecheck passed, frontend component passed (4/4), frontend contracts passed (2/2), frontend typecheck passed. Broad checks: frontend contract suite 32/35 (3 unrelated existing dashboard assertions); frontend Vitest 75/76 (unrelated StudentChatRoute class assertion); backend auto-discovery 317/336 (dist artifacts, standalone test scripts and unrelated suites; focused work tests pass with module-mock flag).

## Final review

- Whole-change reviewer: no Critical or Important findings; ready for integration with one deferred Minor.
- Final reviewer behavior excluded: validating whether external image URLs still resolve and whether source HTML contains images omitted during import; both are explicitly outside spec scope and depend on provider/import data. Ruling: leave those upstream concerns unchanged — cost if wrong: some questions can still lack a visible image when the source URL is dead or extraction never persisted it.
- Final minor (deferred): frontend prefers top-level `imageUrls` whenever present, including `[]`, so a legacy payload with an empty top-level list and populated nested `questionBankItem.imageUrls` will not fall back. The current backend always returns the resolved top-level list; cost is limited to that mixed legacy payload shape.
- Verification after test-runner guard: backend focused suite 3/3 files passed; backend typecheck passed; frontend component 4/4 and contracts 2/2 passed; frontend typecheck passed; whitespace checks passed. Broad backend discovery 317/336 passed (19 unrelated failures in pre-existing billing, weekly-simulation, document-worker and standalone script suites, including stale `dist` copies). Frontend contract suite 32/35 passed (3 unrelated dashboard assertion failures); frontend Vitest suite 75/76 passed (unrelated `StudentChatRoute` class assertion).
