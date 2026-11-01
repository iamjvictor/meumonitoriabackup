# Tasks — checkout direto com fallback da plataforma

## Pacote 1 — regra de split no checkout

- **Critérios:** AC-001, AC-002, AC-003, AC-004.
- **Responsável:** implementador (concluído).
- **Arquivos:** `backend/src/modules/payments/application/commands/create-checkout.use-case.ts`, `backend/src/modules/payments/infrastructure/persistence/payment-checkout.repository.ts`; `backend/src/modules/payments/http/payments.controller.ts` somente para remover o mapeamento de erro obsoleto.
- **Dependências:** nenhuma.
- **Limites:** preservar as mudanças locais existentes; sem frontend, schema ou migration.
- **Verificação esperada:** revisão do diff e cenários mapeados; não executar/adicionar testes nesta solicitação.
- **Resultado:** bloqueio removido; elegibilidade requer aprovação, carteira e percentual positivo; pedidos inelegíveis usam fallback da plataforma; controller não mapeia mais erro de conta como falha do aluno.
