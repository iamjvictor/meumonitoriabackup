# Task 2 review — Credential and secure account-overview assembly

## Verdict

**APPROVED**.

The previously reported blocking issues are resolved: the overview is now wired into the runtime teacher-account module and route, the trusted dashboard URL is propagated, teacher-wrapper rows without a current account fail with `PaymentAccountNotFoundError`, and the repository projection/use case boundary is typed. The credential path remains explicitly fail-closed until a secret-manager-backed resolver is operationally provided, as required by the spec.

The final adjustment also enforces `teacher`/`professor` role access on the overview handler and removes raw provider response data from account-start logs.

## Findings (prioritized)

### Previously reported P0 — resolved

`payments-account.module.ts` now creates the overview provider/use case, injects it into `PaymentAccountController`, and `payment-account.routes.ts` exposes `/teachers/me/payment-account/overview` behind `authMiddleware`.

The runtime module instantiated by `server.ts` is now the one containing this path, so the deliverable is reachable.

`env.ASAAS_DASHBOARD_URL` is now passed directly from trusted configuration when the runtime module is built.

### Previously reported P1 — resolved

In `get-payment-account-overview.use-case.ts`:

```ts
const current = await this.repository.findCurrentByUserId(userId);
const source = current?.currentPaymentAccount ?? current;
if (!source) throw new PaymentAccountNotFoundError();
```

The repository returns a teacher projection (`{ id, currentPaymentAccount }`). If the teacher exists but `currentPaymentAccount` is `null`, `source` becomes the teacher object, so the use case returns an account with undefined `providerAccountId`/`status` rather than throwing `PaymentAccountNotFoundError`. This violates the planned 404 for an unconfigured teacher and can make the DTO shape invalid.

The source selection now distinguishes a teacher wrapper from an account and rejects a null `currentPaymentAccount`; a focused regression test covers this case.

### Previously reported P1 — accepted as designed

The runtime construction still omits `resolveCredential`, so metrics remain null by default. This is explicitly fail-closed and consistent with the spec's prerequisite that no insecure persistence be added. The implementation does not claim that private metrics are available before a secret-manager resolver is configured.

The focused tests prove no provider call and `metrics: null` without a resolver.

### P2 — Repository projection contains `credentialRef`, which is acceptable only as an internal projection

`credentialRef` is selected by `findCurrentByUserId`, but the use case maps an explicit allowlist and does not return it. The focused test also checks for credential-like keys. No plaintext API key was found in the Task 2 persistence change; the Prisma field is a reference string, not an API key. This part is acceptable provided the projection remains internal and is never passed directly to an HTTP response/log.

The repository also selects payment-profile PII, although the overview use case does not copy it. Keep this query boundary private and avoid reusing its raw result in controllers.

### Previously reported P2 — resolved

The use case now uses `PaymentAccountRepositoryRow` rather than `any`, including the nullable wrapper relation.

## Verification

- Focused Task 2 tests: **6 tests passed**, including an existing teacher with `currentPaymentAccount: null`.
- Backend `npm run typecheck`: **passes** with no errors.
- Runtime inspection confirms module construction, authenticated overview route, and `env.ASAAS_DASHBOARD_URL` propagation.
- Overview controller test confirms an authenticated student receives 403.
- The full backend typecheck still has only the known pre-existing `modules/access` test errors (`teacherAvatarUrl`/`teacherBannerUrl`), with no errors in Task 2 files.
- Security review: no API key/credential is included in the returned DTO. The fail-closed credential branch is sound in isolation. The main security/integration risk is bypassing the intended authenticated overview route/module wiring, not secret leakage from this use case.
