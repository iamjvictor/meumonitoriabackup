# Auth Login Logout Ngrok TDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Garantir login, sessão, logout e troca de conta em frontend publicado por origens HTTPS/ngrok configuráveis.

**Architecture:** O backend mantém cookies HttpOnly como suporte e retorna somente o access token público necessário ao cliente. O frontend mantém um único token de acesso local, injeta Bearer nas requisições e centraliza a limpeza/revogação. A confiança será construída com testes unitários, HTTP, E2E determinístico e smoke opt-in contra URLs reais.

**Tech Stack:** Fastify 5, Supabase Auth, Next.js 16.3, React 19, TypeScript, Node test runner, Vitest e Playwright.

**Spec:** `docs/superpowers/specs/2026-09-24-auth-login-logout-ngrok-tdd-design.md`

## Global Constraints

- O refresh token nunca será retornado no JSON do login.
- CORS nunca usará `*` com credenciais.
- Tokens, senhas e refresh tokens nunca serão registrados.
- O logout limpa o estado local mesmo quando a API falha.
- Toda alteração de comportamento começa com teste falhando.
- O smoke contra ngrok é opt-in e recebe credenciais somente por variáveis de ambiente.

## Review Focus

- Resposta flat versus resposta legada aninhada: cobrir no teste do adaptador de login.
- Requisição sem cookie em origem cross-site: cobrir com Bearer e preflight.
- Logout com falha de rede: cobrir limpeza local no teste do helper.
- Login B sem reload: cobrir substituição do token e identidade no E2E.
- Origem ngrok não configurada: cobrir rejeição CORS.

---

### Task 1: Normalizar o contrato de sessão no frontend

**Files:**
- Create: `frontend/src/shared/auth/login-response.ts`
- Test: `frontend/tests/unit/login-response.test.ts`
- Modify: `frontend/src/modules/student/components/StudentAuthModal.tsx`

**Interfaces:**
- Produces `extractAccessToken(payload: unknown): string | null`.
- Accepts the normative `data.accessToken` shape and the temporary legacy nested shape during migration.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { extractAccessToken } from '@/shared/auth/login-response';

describe('extractAccessToken', () => {
  it('reads the normative flat token', () => {
    expect(extractAccessToken({ data: { accessToken: 'token-a' } })).toBe('token-a');
  });

  it('does not expose refresh tokens as access tokens', () => {
    expect(extractAccessToken({ data: { refreshToken: 'refresh-a' } })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/login-response.test.ts`

Expected: FAIL because `login-response.ts` and `extractAccessToken` do not exist.

- [ ] **Step 3: Write minimal implementation**

Implement the function with runtime object checks and flat-first precedence, then replace duplicated login/signup extraction in `StudentAuthModal` with it.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/login-response.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/auth/login-response.ts frontend/src/modules/student/components/StudentAuthModal.tsx frontend/tests/unit/login-response.test.ts
git commit -m "test(auth): normalize login access token contract"
```

### Task 2: Garantir o interceptor Bearer e a transição de token

**Files:**
- Test: `frontend/tests/unit/session-access-token.test.tsx`
- Modify: `frontend/src/shared/context/SessionAuthInterceptor.tsx`

**Interfaces:**
- `withStoredAccessToken(init, token)` remains the pure header builder.
- The installed interceptor reads `localStorage` at request time, not only at mount time.

- [ ] **Step 1: Write the failing tests**

Add cases for an explicit Authorization header, token B replacing token A, and `/api/v1/session` receiving the current token.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/session-access-token.test.tsx`

Expected: FAIL on the missing current-token/session assertions.

- [ ] **Step 3: Write minimal implementation**

Adjust only the interceptor/header helper needed to satisfy the cases; preserve ngrok bypass behavior and do not log token values.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/session-access-token.test.tsx && node --import ./tests/frontend-contracts.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/context/SessionAuthInterceptor.tsx frontend/tests/unit/session-access-token.test.tsx
git commit -m "test(auth): cover bearer token transitions"
```

### Task 3: Tornar logout idempotente e verificável

**Files:**
- Test: `frontend/tests/unit/client-session.test.ts`
- Modify: `frontend/src/shared/auth/client-session.ts`
- Test: `backend/src/routes/__tests__/auth.routes.test.ts`
- Modify: `backend/src/routes/auth.routes.ts`

**Interfaces:**
- `clearClientSession(): void` removes all client auth keys.
- `revokeClientSession(apiUrl: string): Promise<void>` always clears local state.
- Backend logout returns 204 and emits deletion cookies for both names.

- [ ] **Step 1: Write the failing tests**

Test success and rejected fetch paths for `revokeClientSession`; test that backend logout clears access and refresh cookies and remains successful without credentials.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/client-session.test.ts`; then `cd backend && node --import tsx --test src/routes/__tests__/auth.routes.test.ts`

Expected: FAIL on the missing behavioral assertions or route harness.

- [ ] **Step 3: Write minimal implementation**

Use the existing centralized helper, make cookie deletion options match the emitted path/domain policy, and keep logout public/idempotent.

- [ ] **Step 4: Run test to verify it passes**

Run both commands again and run `cd frontend && npm run typecheck`; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/auth/client-session.ts backend/src/routes/auth.routes.ts frontend/tests/unit/client-session.test.ts backend/src/routes/__tests__/auth.routes.test.ts
git commit -m "test(auth): make logout idempotent and observable"
```

### Task 4: Validar CORS para origens configuráveis

**Files:**
- Test: `backend/src/config/__tests__/cors.test.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/server.ts`

**Interfaces:**
- `corsOrigins` contains normalized configured origins.
- Allowed requests return the matching `Access-Control-Allow-Origin` and credentials headers.
- Unconfigured origins are rejected.

- [ ] **Step 1: Write the failing tests**

Add tests for two configured HTTPS origins, trailing-slash normalization, Authorization in preflight, and rejection of an unconfigured ngrok hostname.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --import tsx --test src/config/__tests__/cors.test.ts`

Expected: FAIL for the new origin/header behavior.

- [ ] **Step 3: Write minimal implementation**

Keep the configuration-driven allowlist, use exact origin reflection, and include the headers required by the frontend interceptor.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --import tsx --test src/config/__tests__/cors.test.ts && npm run typecheck && npm run lint -- --quiet`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/config/env.ts backend/src/server.ts backend/src/config/__tests__/cors.test.ts
git commit -m "test(auth): enforce configured cross-origin session access"
```

### Task 5: Cobrir o fluxo real A → logout → B no browser

**Files:**
- Create: `frontend/tests/e2e/auth-flow.spec.ts`
- Modify: `frontend/playwright.config.ts` only if shared setup needs a named project/env.

**Interfaces:**
- The deterministic E2E intercepts API responses but observes real browser storage and request headers.
- The test uses two fixtures with distinct user ids and tokens.

- [ ] **Step 1: Write the failing test**

Create a Playwright test that performs login A, asserts session A request has `Bearer token-a`, clicks logout, asserts the next session request has no Authorization and returns 401, logs in B without reload, and asserts only `token-b` and user B are present.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx playwright test tests/e2e/auth-flow.spec.ts --project=chromium`

Expected: FAIL until the UI wiring and session refresh event are complete.

- [ ] **Step 3: Write minimal implementation**

Add a single auth-state change notification or explicit session refresh callback so login and logout update the currently mounted storefront/student context without relying on a same-tab `storage` event.

- [ ] **Step 4: Run test to verify it passes**

Run the same Playwright command and `cd frontend && npm run test:unit`; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/e2e/auth-flow.spec.ts frontend/src/modules/student frontend/src/app/'(public-teacher)'/p/'[teacherSlug]'
git commit -m "test(auth): cover browser account switching flow"
```

### Task 6: Adicionar smoke opt-in contra ngrok

**Files:**
- Create: `frontend/tests/e2e/auth-ngrok.smoke.spec.ts`
- Modify: `frontend/playwright.config.ts` if needed to register a smoke project.
- Create: `docs/superpowers/specs/2026-09-24-auth-login-logout-ngrok-smoke.md` only if operational runbook details exceed the main spec.

**Interfaces:**
- Test skips with an explicit message unless all `AUTH_SMOKE_*` variables exist.
- Test never prints credential values or response tokens.

- [ ] **Step 1: Write the failing test**

Define the real-origin test with the six variables from the spec and assertions for login 200, session identity, logout 204, session 401, login B 200 and session identity B.

- [ ] **Step 2: Run test to verify it fails safely**

Run: `cd frontend && npx playwright test tests/e2e/auth-ngrok.smoke.spec.ts --project=chromium`

Expected: explicit skip when variables are absent; failure with a diagnostic request/status when variables are present and deployment is incorrect.

- [ ] **Step 3: Write minimal implementation**

Add environment-driven URLs/credentials and request assertions without hardcoding the current ngrok domains.

- [ ] **Step 4: Run test to verify it passes**

Run with configured variables: `cd frontend && npx playwright test tests/e2e/auth-ngrok.smoke.spec.ts --project=chromium`

Expected: PASS against the configured public frontend/API.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/e2e/auth-ngrok.smoke.spec.ts frontend/playwright.config.ts docs/superpowers/specs
git commit -m "test(auth): add configurable ngrok smoke flow"
```

### Task 7: Verificação final e documentação operacional

**Files:**
- Modify: `docs/superpowers/specs/2026-09-24-auth-login-logout-ngrok-tdd-design.md` if implementation reveals a contract correction.

- [ ] **Step 1: Run frontend checks**

Run: `cd frontend && node --import ./tests/frontend-contracts.test.mjs && npm run test:unit && npm run typecheck && npm run lint`

- [ ] **Step 2: Run backend auth checks**

Run: `cd backend && node --import tsx --test src/controllers/__tests__/login.controller.test.ts src/controllers/__tests__/auth.controller.test.ts src/controllers/__tests__/session-cookie-options.test.ts src/config/__tests__/cors.test.ts src/routes/__tests__/auth.routes.test.ts && npm run typecheck && npm run lint -- --quiet`

- [ ] **Step 3: Run deterministic E2E**

Run: `cd frontend && npx playwright test tests/e2e/auth-flow.spec.ts --project=chromium`

- [ ] **Step 4: Run smoke only when configured**

Run: `cd frontend && npx playwright test tests/e2e/auth-ngrok.smoke.spec.ts --project=chromium`

- [ ] **Step 5: Review evidence**

Confirm that logs contain no secrets, the A/B sequence is green, and any unrelated pre-existing failures are reported separately.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs docs/superpowers/plans frontend/tests backend/src
git commit -m "test(auth): guarantee login logout and account switching"
```
