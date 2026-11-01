# Test plan — checkout direto com fallback da plataforma

## Cenários por critério

- **AC-001 — fallback de split:** conta ausente, pendente/não aprovada, carteira ausente e percentual zero devem chegar à criação do checkout com `splits: []`.
- **AC-002 — split existente:** conta aprovada, com carteira e percentual positivo mantém o split do professor.
- **AC-003 — snapshots:** casos inelegíveis persistem `splitPolicy = NONE`, carteira nula, percentual zero e nenhum valor esperado de repasse ao professor.
- **AC-004 — demais proteções:** papel incorreto, monitor não publicado, preço inválido e chave de idempotência reutilizada continuam sendo tratados como antes.

## Execução

Os cenários são registrados para QA independente. Por instrução de execução desta tarefa, não serão adicionados nem executados testes agora; resultado permanece como lacuna de validação automatizada.
