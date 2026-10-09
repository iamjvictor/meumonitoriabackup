# Task 2 — Credential and secure account-overview assembly

## Implementado

- `GetPaymentAccountOverviewUseCase` resolve a conta exclusivamente por `userId` via `findCurrentByUserId`.
- DTO de saída contém apenas campos de conta permitidos e métricas; `credentialRef`/segredos nunca são retornados.
- `dashboardUrl` é fornecida somente pela configuração confiável `ASAAS_DASHBOARD_URL` (padrão `https://www.asaas.com/login`).
- Contas pendentes e provider indisponível retornam `metrics: null`.
- Sem resolver seguro de credencial, o fluxo falha fechado e não chama o provider.
- `credentialRef` foi incluído na projeção do repositório apenas como referência interna; não há persistência de API key em plaintext.
- Use case/provider/repositório foram expostos no `payments.module`.
- `createPaymentAccountModule` usado pelo `server.ts` agora instancia o overview provider/use case, passa `env.ASAAS_DASHBOARD_URL` e expõe `GET /api/v1/teachers/me/payment-account/overview`.
- Wrapper de teacher sem `currentPaymentAccount` é tratado como conta inexistente (404 no controller).
- Overview exige papel `teacher`/`professor`; alunos autenticados recebem 403.
- Logs de configuração da conta não incluem mais `responseBody` bruto do provider.

## Decisão de segurança

O schema atual não oferece secret manager nem coluna criptografada utilizável para recuperar a credencial da subconta. Não foi adicionada persistência insegura. A operação real depende de injeção de `resolveCredential` backed by secret manager; até lá, métricas permanecem nulas.

## Verificação

- `node --import tsx --test src/modules/payments/__tests__/get-payment-account-overview.use-case.test.ts`: 5 testes aprovados.
- `npm run typecheck`: há falhas preexistentes em `modules/access/__tests__/entitlement.service.test.ts` (`teacherAvatarUrl`/`teacherBannerUrl` ausentes nos tipos), sem relação com esta task.
- Teste adicional cobre wrapper sem conta e mantém explícita a decisão de fail-closed sem resolver seguro.
