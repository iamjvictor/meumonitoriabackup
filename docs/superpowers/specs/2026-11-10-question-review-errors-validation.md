# Validação — erros na revisão de questões

| Critério | Tarefa | Cenário | Resultado |
|---|---|---|---|
| AC-001 | Task 1 + Task 2 | Payload inválido aponta campo e motivo | Passou: teste reproduziu 422 genérico antes da implementação; agora nomeia o campo. |
| AC-002 | Task 1 + Task 2 | Requisitos para aprovação e topic/subject fora do monitor | Passou: erros esperados retornam 422 específico; consultas limitam matéria/tópico ao monitor; nenhuma atualização quando referência é inválida. |
| AC-003 | Task 1 + Task 2 | Erro inesperado gera log diagnóstico seguro e 500 genérico | Passou: causa técnica e IDs aparecem no log do servidor; resposta não inclui detalhe interno nem enunciado. Caso de `Error('toString')` também reproduziu falha antes do ajuste e agora segue 500 genérico. |
| AC-004 | Task 1 + Task 2 | 404 e atualização bem sucedida preservam contrato | Passou: testes confirmam 404 e resposta `{ data }` com status 200. |

Comandos executados:

- `cd backend && node --experimental-test-module-mocks --import tsx --test src/controllers/__tests__/content-review.controller.errors.test.ts src/repositories/__tests__/content-review.question-scope.test.ts` — PASS (2 arquivos, 0 falhas).
- `cd backend && npm run typecheck` — PASS.

QA independente revisou controller e repositório e encontrou uma chave herdada de prototype (`toString`) que poderia virar erro 422 inválido. O teste foi executado em RED (`422 !== 500`) e o mapeamento agora usa `Object.hasOwn`. Também foi coberto o caso combinado de tópico local e matéria externa; ambos são validados antes da atualização.

Lacuna TDD: os testes de escopo de matéria/tópico (incluindo o caso combinado) foram executados após a implementação já ter chegado ao repositório compartilhado; não foi observado RED para esses cenários. Os testes confirmam a filtragem por monitor e ausência de atualização em referências inválidas.
