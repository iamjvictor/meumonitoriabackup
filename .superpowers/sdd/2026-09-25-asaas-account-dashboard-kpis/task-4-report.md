# Task 4 — Frontend service e contrato de estado

## Implementado

- `TeacherPaymentOverviewService` consulta `GET /api/v1/teachers/me/payment-account/overview` com `credentials: 'include'` e `cache: 'no-store'`.
- Requisições concorrentes são deduplicadas com `dedupeAsyncRequest`; falhas limpam o estado para permitir retry.
- O parser aceita somente o DTO documentado, normaliza campos opcionais e rejeita respostas incompatíveis com erro `502` local, sem repassar payload bruto.
- Helpers puros para formatação BRL a partir de centavos, métricas indisponíveis, validação de URL HTTPS do painel, cópia de status pendente/rejeitado e classificação de erros retryable.
- Nenhuma credencial ou dado sensível é aceito/enviado pelo serviço.

## TDD e verificação

- Teste inicialmente executado em estado RED por módulos ausentes.
- `npm run test:unit -- --run tests/unit/payment-account-overview.test.tsx` — 7 testes passando.
- `npm run test:unit` — 21 arquivos / 56 testes passando.
- `npm test` — 31 testes passando.
- `npm run typecheck` — passando.

## Observações

Os avisos do Vitest sobre `configLoader: 'native'` já vêm da configuração existente e não impedem os testes. A UI principal não foi alterada nesta tarefa.
