# Validation — checkout direto com fallback da plataforma

| Critério | Tarefa | Cenário QA | Resultado |
|---|---|---|---|
| AC-001 | Pacote 1 | Conta ausente, pendente, sem carteira ou percentual zero | Revisão estática confirmou que o checkout prossegue com `splits: []`; sem teste automatizado |
| AC-002 | Pacote 1 | Conta aprovada com carteira e percentual positivo | Revisão estática confirmou split preservado; sem teste automatizado |
| AC-003 | Pacote 1 | Snapshot `NONE`, carteira nula e percentual zero | Revisão estática confirmou snapshots e cálculo de repasse zero no webhook/painel; sem teste automatizado |
| AC-004 | Pacote 1 | Proteções existentes preservadas | Revisão estática sem achado; não confirmado por execução de teste |

Revisão independente: nenhum achado de produção. Lacunas: os testes preexistentes ainda esperam `TEACHER_PAYOUT_UNAVAILABLE` e não foram atualizados/executados; não há confirmação de integração com o Asaas para o payload com `splits: []`. Não foram adicionados nem executados testes nesta solicitação.
