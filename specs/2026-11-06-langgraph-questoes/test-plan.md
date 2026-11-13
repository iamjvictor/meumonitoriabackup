# Plano de testes independente

Todos os cenários estão pendentes. Banco e Storage de testes devem ser locais e isolados; chamadas reais à IA dependem de chave autorizada e nunca imprimem segredos. A validação visual compara PDF e questão exibida, e distingue simulações de serviços reais.

| ID | Critérios | Cenário e resultado esperado |
| --- | --- | --- |
| QA-01 | AC-001, AC-002, AC-011 | Quimica-3: preservar fórmula Q04/Q05 e figuras/âncoras; comparar com PDF e exibição na revisão. |
| QA-02 | AC-003, AC-004, AC-006 | Discursiva gera A–E; alternativas já existentes são preservadas e somente faltantes geradas; correção sustentada por evidência. |
| QA-03 | AC-003, AC-005, AC-006 | Gabarito presente em texto e em imagem, inclusive fora do lote; ausência gera proposta IA com origem correta. |
| QA-04 | AC-003, AC-006 | Faltam ambos: demonstrar sobreposição temporal dos agentes, aguardar ambos e reconciliar gabarito com alternativas finais. |
| QA-05 | AC-006, AC-007 | Imagem faltante, resposta ambígua, letra inválida e menos de cinco alternativas permanecem pendentes com motivo, sem completar artificialmente. |
| QA-06 | AC-007, AC-008 | Repetição concorrente e crash antes/depois de persistir preservam IDs, origens, vínculos e edição humana sem duplicata. |
| QA-07 | AC-008, AC-009 | Documento longo, questão dividida, sobreposição, falha em lote, retry e reinício: cobertura auditável e retomada seletiva. |
| QA-08 | AC-010 | Confirmar modelo específico, esquema estruturado e imagens entregues; erro do provider é observável e não divulga chave. |
| QA-09 | AC-002, AC-007, AC-011 | Simulado Pedro Lucas: 10 questões, enunciados, alternativas, imagens e gabarito confrontados com fonte; registrar divergências por questão. |
| QA-10 | AC-007, AC-010 | Fluxo KNOWLEDGE_BASE e configuração global de IA seguem comportamento anterior; contrato de alternativas preservado. |
