# Validação — campos obrigatórios ao editar questões

| Critério | Tarefa | Cenário | Resultado |
|---|---|---|---|
| AC-005 | Task 2 + QA | Validação visual bloqueia envio inválido | Passou: campos têm `aria-invalid`/mensagem inline após tentativa; helper/service bloqueiam conteúdo inválido antes de `fetch`. |
| AC-006 | Task 1 + QA | API rejeita conteúdo incompleto | Passou: repository verifica estado efetivo em edições e aprovações; retorno é mapeado para 422 específico. |
| AC-007 | Task 1/2 + QA | Explicação ausente ou vazia aceita | Passou: repositório aprova com explicação ausente, null ou vazia; frontend ignora explicação na validação. |
| AC-008 | Task 1/2 + QA | Atualização válida e ação somente status preservadas | Passou: testes confirmam atualização válida e payload somente de status. |

Comandos executados:

- `cd backend && node --experimental-test-module-mocks --import tsx --test src/controllers/__tests__/content-review.controller.errors.test.ts src/repositories/__tests__/content-review.required-fields.test.ts src/repositories/__tests__/content-review.question-scope.test.ts` — PASS (3 arquivos, 0 falhas).
- `cd backend && npm run typecheck` — PASS.
- `cd frontend && npx vitest run tests/unit/QuestionReviewValidation.test.tsx tests/unit/MonitorQuestionsReviewValidation.test.tsx` — PASS (2 arquivos, 6 testes). Vite emitiu aviso existente sobre `configLoader: native` e `vitest.config.ts` CommonJS/ESM.
- `cd frontend && npm run typecheck` — PASS.

RED observado antes da implementação: backend sem checagem de prompt aceitou texto composto por espaços; controller retornou 500 para o código de domínio não mapeado. Frontend não renderizava `aria-invalid` e a atualização com texto vazio chegava a `fetch`.

Revisão QA independente concluída, sem achados bloqueantes. A conexão entre tentativa de salvar e sinalizador visual foi revisada no código; componente coberto com sinalizador ativado e bloqueio de rede coberto pelo teste do serviço.
