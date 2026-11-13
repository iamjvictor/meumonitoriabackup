# Pacotes e atribuições

| Pacote | Objetivo e critérios | Responsabilidade | Dependências e verificações |
|---|---|---|---|
| T1 | Opções das filas, AC-001–009/014 | Implementador: arquivos T1 de `plan.md` | Baseline; testes de opções, typecheck. |
| T2 | Heartbeat, AC-010–014 | Implementador: arquivos T2 | Após T1 por sobreposição em env, worker e docs; testes de heartbeat, typecheck. |
| T3 | Cache local, AC-015–021 | Implementador: arquivos T3 | Pode ser independente de T1, sem editar arquivos de T1/T2; testes de cache e serviço. |
| T4 | Revisão e cenários independentes, AC-002–005/007–008/011/017–024 | `revisor_qa`: somente arquivos QA e documentação T4 | Planejar a partir da spec; executar após T1–T3 e registrar evidências ou lacunas. |

No máximo dois implementadores ativos; sem sobreposição de arquivos. O arquiteto acompanha, resolve integrações e preserva alterações preexistentes. Os comandos detalhados estão em `plan.md`. Nenhum pacote autoriza deploy, merge ou commit.
