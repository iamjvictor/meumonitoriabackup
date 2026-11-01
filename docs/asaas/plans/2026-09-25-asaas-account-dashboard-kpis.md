# Dashboard da conta Asaas do professor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir na conta do professor um banner Asaas melhorado e quatro KPIs financeiros reais, consultados com segurança pelo backend.

**Architecture:** Criar um provider Asaas isolado para normalizar saldo, recebimentos, pendências e transferências; um serviço/controller autenticado resolve a conta do professor e expõe apenas um DTO seguro. A tela existente consome esse overview, mantém estados de loading/indisponibilidade e abre o painel oficial por uma URL de configuração confiável.

**Tech Stack:** TypeScript, Fastify, Prisma, Node test runner, Next.js/React, Tailwind CSS, cliente HTTP Asaas existente.

**Spec:** `docs/asaas/specs/2026-09-25-asaas-account-dashboard-kpis-design.md`

## Global Constraints

- A credencial Asaas permanece exclusivamente no backend.
- Valores monetários atravessam a API como inteiros em centavos e `currency: "BRL"`.
- O frontend nunca chama o Asaas diretamente.
- Nenhum payload, log ou resposta pode conter API key, token, senha, CPF completo ou dados bancários completos.
- Conta pendente/rejeitada ou Asaas temporariamente indisponível não pode produzir valores fictícios; deve retornar/exibir métricas indisponíveis.
- O professor é resolvido pela sessão autenticada; nenhum `teacherId` vindo do navegador será aceito.
- Sandbox e produção permanecem isolados.

## Review Focus

- Credencial da subconta ausente/expirada: o provider deve falhar de forma normalizada sem vazar segredo; coberto na Task 1.
- Usuário autenticado sem vínculo `Teacher` ou tentando consultar outro professor: deve receber 404/403; coberto na Task 3.
- Conta aprovada sem saldo e conta pendente: zero real é diferente de métrica indisponível; coberto nas Tasks 2 e 4.
- Resposta Asaas parcial ou com valores decimais inesperados: normalizar centavos ou marcar indisponível; coberto na Task 1.
- Recarregamento da tela: não duplicar chamadas nem mostrar KPIs antigos como atuais; coberto na Task 5.

### Task 1: Provider Asaas de métricas financeiras

**Files:**
- Create: `backend/src/modules/payments/infrastructure/providers/asaas/asaas-account-overview.provider.ts`
- Create: `backend/src/modules/payments/__tests__/asaas-account-overview.provider.test.ts`
- Modify: `backend/src/modules/payments/infrastructure/providers/asaas/asaas-http.client.ts` only if the existing client cannot accept a subaccount credential without exposing it
- Modify: `backend/src/config/env.ts` and `.env.example` only if a documented `ASAAS_DASHBOARD_URL` setting is not already available

**Interfaces:**
- Consumes: `AsaasHttpClient`-compatible request client, environment (`sandbox`/`production`), authorized subaccount credential.
- Produces:
```ts
export type AccountOverviewMetrics = {
  availableBalanceCents: number;
  receivedThisMonthCents: number;
  pendingReceivablesCents: number;
  pendingTransfersCount: number;
  currency: 'BRL';
  asOf: string;
};

export type AccountOverviewProviderResult =
  | { kind: 'available'; metrics: AccountOverviewMetrics }
  | { kind: 'unavailable'; reason: 'NOT_READY' | 'PROVIDER_UNAVAILABLE' };

export interface AsaasAccountOverviewProvider {
  getOverview(input: { providerAccountId: string; credential: string; now: Date }): Promise<AccountOverviewProviderResult>;
}
```

- [ ] **Step 1: Write failing provider tests**

Add tests for:

```ts
test('normaliza saldo, recebimentos do mês, pendências e transferências', async () => {
  const result = await provider.getOverview({ providerAccountId: 'acc-1', credential: 'secret', now: new Date('2026-09-25T15:00:00Z') });
  assert.deepEqual(result, { kind: 'available', metrics: {
    availableBalanceCents: 125000,
    receivedThisMonthCents: 278900,
    pendingReceivablesCents: 34900,
    pendingTransfersCount: 1,
    currency: 'BRL',
    asOf: '2026-09-25T15:00:00.000Z',
  }});
});

test('converte timeout/resposta indisponível em resultado controlado', async () => {
  const result = await provider.getOverview({ providerAccountId: 'acc-1', credential: 'secret', now: new Date() });
  assert.deepEqual(result, { kind: 'unavailable', reason: 'PROVIDER_UNAVAILABLE' });
});

test('não registra nem retorna a credencial', async () => {
  await provider.getOverview({ providerAccountId: 'acc-1', credential: 'super-secret', now: new Date() });
  assert.equal(JSON.stringify(capturedLogs).includes('super-secret'), false);
});
```

Also cover `PENDING`/`IN_PROGRESS` counting, ignoring `DONE`/`CANCELLED`, zero balance, malformed numeric values and wrong environment.

- [ ] **Step 2: Run provider tests and verify failure**

Run: `node --import tsx --test src/modules/payments/__tests__/asaas-account-overview.provider.test.ts`

Expected: FAIL because the provider contract and implementation do not yet exist.

- [ ] **Step 3: Implement the provider minimally**

Implement separate calls for balance, month-to-date payments, pending charges and transfers. Normalize all monetary fields with one decimal-to-cent helper, use a timeout, pass the configured credential only in the request header, and map transient HTTP/network failures to `{ kind: 'unavailable' }`. Do not log request headers or raw bodies.

- [ ] **Step 4: Run provider tests**

Run the same command. Expected: all provider tests PASS.

### Task 2: Credential and secure account-overview assembly

**Files:**
- Modify: `backend/src/modules/payments/infrastructure/persistence/payment-account.repository.ts`
- Create: `backend/src/modules/payments/application/queries/get-payment-account-overview.use-case.ts`
- Create: `backend/src/modules/payments/__tests__/get-payment-account-overview.use-case.test.ts`
- Modify: `backend/src/modules/payments/payments.module.ts`
- Modify: `backend/src/config/env.ts` and `.env.example` for `ASAAS_DASHBOARD_URL` if absent

**Interfaces:**
- Consumes: `PaymentAccountRepository.findCurrentByUserId`, Task 1 provider.
- Produces:
```ts
export type PaymentAccountOverview = {
  account: {
    id: string;
    providerAccountId: string;
    walletId: string | null;
    status: string;
    generalStatus: string | null;
    onboardingUrl: string | null;
    dashboardUrl: string | null;
  };
  metrics: AccountOverviewMetrics | null;
};

execute(userId: string, now?: Date): Promise<PaymentAccountOverview>;
```

- [ ] **Step 1: Write failing use-case tests**

Cover approved account with metrics, missing account, pending account, provider unavailable, and assertion that the returned object has no credential-like keys.

- [ ] **Step 2: Run use-case tests and verify failure**

Run: `node --import tsx --test src/modules/payments/__tests__/get-payment-account-overview.use-case.test.ts`

Expected: FAIL because the use case is not implemented.

- [ ] **Step 3: Implement secure assembly**

Resolve the account only through `userId`, derive the dashboard URL exclusively from environment configuration, call the provider only when account status is approved and a valid credential strategy exists, and return `metrics: null` for pending/unavailable states. If the existing schema has no secure credential storage, fail closed and document the required operational prerequisite rather than adding plaintext persistence.

- [ ] **Step 4: Wire module dependencies and run tests**

Run the use-case tests and `npm run typecheck` in `backend`. Expected: PASS.

### Task 3: Authenticated HTTP endpoint and contract tests

**Files:**
- Modify: `backend/src/modules/payments/http/payment-account.controller.ts`
- Modify: `backend/src/modules/payments/http/payment-account.routes.ts`
- Modify: `backend/src/modules/payments/payments.module.ts`
- Create or modify: `backend/src/modules/payments/__tests__/payment-account-overview.controller.test.ts`

**Interfaces:**
- Consumes: Task 2 use case.
- Produces: `GET /api/v1/teachers/me/payment-account/overview` with the spec response and normalized statuses.

- [ ] **Step 1: Write failing controller tests**

Cover 401 without session, 403 for a student, 404 for an unconfigured teacher, 200 with metrics, 200 with `metrics: null`, 502 only for unclassified provider contract errors, and ensure no secrets appear in the response.

- [ ] **Step 2: Run controller tests and verify failure**

Run: `node --import tsx --test src/modules/payments/__tests__/payment-account-overview.controller.test.ts`

Expected: FAIL because the route and handler are missing.

- [ ] **Step 3: Implement controller/route**

Use the existing auth middleware, validate teacher role, map known errors to documented HTTP statuses, and return only the overview DTO. Add structured logs with IDs/status/duration, excluding credentials and provider bodies.

- [ ] **Step 4: Run endpoint tests and backend typecheck**

Run the controller test and `npm run typecheck` from `backend`. Expected: PASS.

### Task 4: Frontend service and data-state contract

**Files:**
- Create: `frontend/src/modules/teacher/services/TeacherPaymentOverviewService.ts`
- Create: `frontend/src/modules/teacher/utils/payment-account-overview.ts`
- Create: `frontend/tests/unit/payment-account-overview.test.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/teachers/me/payment-account/overview`.
- Produces:
```ts
export type PaymentAccountOverview = {
  account: { status: string; generalStatus: string | null; onboardingUrl: string | null; dashboardUrl: string | null; providerAccountId: string; walletId: string | null };
  metrics: { availableBalanceCents: number; receivedThisMonthCents: number; pendingReceivablesCents: number; pendingTransfersCount: number; currency: 'BRL'; asOf: string } | null;
};
```

- [ ] **Step 1: Write failing frontend tests**

Test BRL cent formatting, `metrics: null` mapping to “Indisponível”, valid/invalid dashboard URL handling, pending/rejected status copy, and retryable error state.

- [ ] **Step 2: Run tests and verify failure**

Run: `node --import tsx --test tests/unit/payment-account-overview.test.tsx`

Expected: FAIL because the service/helpers do not exist.

- [ ] **Step 3: Implement service and pure view helpers**

Use `credentials: 'include'`, deduplicate concurrent requests with the existing async-request deduper, parse only the documented DTO, and format cents at the view boundary.

- [ ] **Step 4: Run frontend unit test and typecheck**

Run the test and `npm run typecheck` from `frontend`. Expected: PASS.

### Task 5: Professor account UI

**Files:**
- Modify: `frontend/src/modules/teacher/components/TeacherPaymentAccountPanel.tsx`
- Modify: `frontend/src/modules/teacher/components/TeacherDashboardOverview.tsx` only if the panel needs a new overview prop or refresh callback at its current mount point.
- Modify: `frontend/src/modules/teacher/services/TeacherPaymentAccountService.ts` only if shared account loading is the correct seam.
- Modify: `frontend/tests/frontend-contracts.test.mjs` or add a focused extraction/contract test if the route is covered there.

**Interfaces:**
- Consumes: Task 4 service and `PaymentAccountOverview` type.
- Produces: blue banner, safe Asaas CTA, four real KPIs and explicit loading/unavailable/error states.

- [ ] **Step 1: Write failing component/contract tests**

Cover skeleton, approved account CTA with `target="_blank"` and `rel="noreferrer"`, absent URL without broken link, four KPI labels, null metrics as “Indisponível”, pending/rejected states, retry action, and responsive accessible contrast.

- [ ] **Step 2: Run focused frontend tests and verify failure**

Run the focused test command selected by the existing frontend test conventions. Expected: FAIL before the UI changes.

- [ ] **Step 3: Implement the visual update**

Replace the green hero treatment with a blue identity banner, keep copy utility-focused, add the CTA, render KPI states without hardcoded money, and preserve existing account details below. Do not add a withdrawal button in this scope.

- [ ] **Step 4: Run frontend tests and typecheck**

Run the focused test, existing `npm test`, and `npm run typecheck`. Expected: all PASS.

### Task 6: End-to-end contract verification and documentation

**Files:**
- Modify: `docs/asaas/specs/2026-09-25-asaas-account-dashboard-kpis-design.md` only if implementation decisions materially change the approved contract.
- Create: `backend/src/modules/payments/__tests__/payment-account-overview.integration.test.ts` using fake provider and repository boundaries, if no existing integration harness covers the route.
- Modify: `docs/asaas/reference/PAGAMENTOS-E-ASSINATURAS.md` to document the credential prerequisite, endpoint and non-goals.

- [ ] **Step 1: Add integration tests**

Verify approved account + fake Asaas returns four KPIs, provider outage returns usable `metrics: null`, sandbox/production are isolated, and a second teacher cannot access the first teacher’s account.

- [ ] **Step 2: Run the complete verification set**

Run:

```bash
cd backend && npm run typecheck
cd backend && node --import tsx --test src/modules/payments/__tests__/asaas-account-overview.provider.test.ts src/modules/payments/__tests__/get-payment-account-overview.use-case.test.ts src/modules/payments/__tests__/payment-account-overview.controller.test.ts src/modules/payments/__tests__/payment-account-overview.integration.test.ts
cd frontend && npm run typecheck
cd frontend && npm test
```

Expected: all commands pass, with no secret-like values in captured logs or response snapshots.

- [ ] **Step 3: Manual smoke checklist**

Validate in sandbox with an approved teacher account, pending account, and provider outage simulation: banner contrast, CTA destination, KPI freshness timestamp, no duplicate requests, and no API key in browser network responses.
