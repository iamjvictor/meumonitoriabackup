# Plano de testes independente — rascunho

QA deve revisar este plano a partir da especificação antes da execução.

| Cenário | Critérios | Método e resultado esperado |
|---|---|---|
| Configuração por fila e valores inválidos | AC-001, 006, 009 | Unitário: defaults corretos; override aplica; valores inválidos impedem início. |
| Job imediato e adiado | AC-002, 003, 023 | Redis isolado: acorda em até 5 s; job adiado não antecipa e inicia até 5 s após prazo em ambiente local sem carga. |
| Queda de conexão | AC-004, 023 | Redis isolado: restaurar serviço e verificar execução em até 30 s. |
| Job travado e pagamento repetido | AC-007, 008, 023 | Derrubar worker, recuperar com intervalos reduzidos; testar efeito único em sandbox isolado. |
| Heartbeat e endpoint | AC-010–014 | Relógio controlado, ausência e erro Redis; contrato HTTP inalterado. |
| Cache local | AC-015–021 | Testar hit, miss, TTL, LRU, slugs, invalidação durante consulta, dois processos simulados e Redis indisponível. |
| Baseline e medição | AC-005, 013, 022 | Registrar comandos, carga, réplicas e janelas; dados ausentes são lacunas. |
| Reversão | AC-014, 024 | Verificar parâmetros anteriores, ausência de exclusão de dados e etapas documentadas. |

Teste de rede externo e teste de pagamento sandbox só são executados com infraestrutura própria e acesso disponível. Não usar dados nem filas de produção.
