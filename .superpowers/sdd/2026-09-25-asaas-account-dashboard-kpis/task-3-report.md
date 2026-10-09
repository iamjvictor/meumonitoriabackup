# Task 3 — endpoint autenticado do overview

## Implementação

- `PaymentAccountController.overview` valida sessão e papel `teacher`/`professor`.
- Erro conhecido `PaymentAccountNotFoundError` vira `404`.
- Falhas não classificadas do contrato/provider viram `502` com mensagem pública genérica.
- Falhas inesperadas (bugs/banco) não são convertidas em 502 e seguem para o handler global como 500; somente `PaymentAccountOverviewProviderError` é 502.
- Logs estruturados registram evento, IDs, status e duração sem credenciais ou corpo do provedor.
- A rota existente `GET /api/v1/teachers/me/payment-account/overview` e o wiring do módulo foram preservados.
- O fallback 503 permanece explícito quando o controller é criado sem o use case, indicando wiring incompleto.

## Cobertura

Testes cobrem `401`, `403`, `404`, `200` com métricas, `200` com `metrics: null`, `502`, 500 para erro inesperado, rota Fastify real com middleware de autenticação e ausência de segredo na resposta.

## Verificação

```text
node --import tsx --test src/modules/payments/__tests__/payment-account-overview.controller.test.ts
PASS (1 file, 8 tests)

npm run typecheck
PASS
```
