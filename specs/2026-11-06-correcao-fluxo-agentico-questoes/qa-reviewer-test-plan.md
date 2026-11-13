# QA independente — revisor e integração dos agentes

## Base

Esta matriz deriva da spec `spec.md`, principalmente AC-006 (fragmentos e deduplicação), AC-007 (alternativas A–E), AC-008 (resposta proposta com pendências), AC-010 (terminal com alertas), AC-011 (retomada/idempotência) e da política de até duas rodadas de conteúdo por candidato. A revisão cobre o estado do grafo, roteamento e integração com `candidate-validation`; não comprova persistência/checkpoint durável nem interface.

## Casos independentes

| Caso | Entrada/estímulo | Resultado esperado |
|---|---|---|
| QA-R1 | URL/legenda isolada e opções vazias | Não chama agentes; mantém pendência de fragmento; terminal não `ready`. |
| QA-R2 | Dois itens duplicados no mesmo segmento, com referência comum; mesmo número em segmentos distintos | Marcar duplicata/ambiguidade, não gerar conteúdo para item ambíguo e não fundir provas distintas. |
| QA-R3 | Falha do agente de alternativas ou gabarito | Encerrar sem loop e com `completed_with_issues`; nenhum campo parcial pode ser apresentado como resolvido. |
| QA-R4 | Resultado de alternativa permanece incompleto após nó | Revisor roteia uma segunda rodada conforme limite de duas; depois termina com issue. |
| QA-R5 | Questões independentes com gaps de tipos distintos | Cada candidateId recebe o agente pertinente; resultado não é aplicado ao vizinho nem deixa candidato ignorado sem issue. |
| QA-R6 | Resposta falha ou low confidence | Pendência de conteúdo deve impedir estado `ready`/`completed`; status público continua `PENDING_REVIEW`. |
| QA-R7 | Uma questão completa e outra bloqueada | Saída individual e status de execução não podem confundir conclusão parcial com documento completo. |
| QA-R8 | Resultado do agente para versão de alternativas anterior | Resultado antigo não pode satisfazer o revisor para a versão corrente. |

## Execução

Executar somente o novo `reviewer.qa.test.ts` com Node test + tsx. Cada caso usa cliente/context provider determinísticos; não depende de OpenRouter ou banco. Registrar casos não implementáveis pelo contrato atual como lacunas, sem relaxar expectativas.
