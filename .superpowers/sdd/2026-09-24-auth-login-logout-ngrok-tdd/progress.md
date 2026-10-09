# SDD ledger — plan: docs/superpowers/plans/2026-09-24-auth-login-logout-ngrok-tdd.md

Pre-flight: Task 1 produces `extractAccessToken(payload)` consumed by `StudentAuthModal`; Task 2 consumes the persisted token through `SessionAuthInterceptor`; Task 5 consumes both contracts in the browser flow.

Task 1: Ruling: Vitest discovers `tests/unit/**/*.test.tsx`, not `.test.ts`; the login response test uses `.test.tsx` to execute under the repository's existing configuration.

Task 1: complete — `login-response.test.tsx` RED then GREEN; login/signup now use `extractAccessToken`.
Task 2: complete — bearer/session contract tests and frontend typecheck pass.
Task 3: complete — client logout clears state on backend failure; existing backend logout/cookie tests pass.
Task 4: complete — configured CORS origins pass and unconfigured public ngrok origins are rejected, including in development.
Task 5: partial — same-tab auth event wiring is implemented and unit-tested; deterministic browser UI flow remains to be exercised in an environment with the frontend server available.
Task 6: complete — configurable ngrok smoke spec added; missing credentials produce an explicit skip.
Task 7: verified — backend auth tests/typecheck/lint pass; frontend auth tests/typecheck and changed-file lint pass. Full frontend unit suite has two unrelated pre-existing ranking failures and global lint has unrelated existing errors.
