# Relatório independente de QA — retry LangGraph

Data: 07/11/2026. Escopo: retomada após checkpoint, preservação da identidade da questão, idempotência e upload local autenticado. Não alterei código de produção, schema público nem critérios de aceite.

## Resultado por critério

| Critério | Resultado | Evidência |
|---|---|---|
| AC-001 — sequência de upload e persistência | **Parcial** | Upload autenticado recebeu HTTP 201; o worker local baixou o arquivo, Docling processou 16 páginas, 13 chunks receberam embeddings, o grafo executou e persistiu 10 questões. O documento terminou `PARTIAL_SUCCESS` com avisos de cobertura de texto. |
| AC-011 — checkpoint, retry e não duplicação | **Passou nos cenários testados** | Teste de falha simulada na gravação fez o retry reutilizar o candidato original sem nova chamada de extração nem nova execução do grafo. PostgreSQL isolado sobreviveu ao reinício de processo. No upload real, replay terminal em outro processo teve `llmCalls=0`, preservou os 10 IDs/hashes de questão e 12 vínculos de fonte. |
| AC-013 — corpus completo | **Não coberto por este QA** | A execução real usou apenas Química-3. Não executei IFF nem Pedro Lucas nesta rodada. |

## Comandos executados

- Em `backend/`: `node --import tsx --test src/worker/services/__tests__/structured-question-extraction.checkpoint-retry.local.qa.test.ts` — **1/1 passou**.
- Em `backend/`: `node --import tsx --test src/repositories/__tests__/question.repository.structured-retry-idempotency.test.ts` — **1/1 passou**.
- Em `backend/`: `RUN_QUESTION_GRAPH_POSTGRES_QA=1 QUESTION_GRAPH_QA_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:56322/postgres' node --import tsx --test src/worker/services/question-graph/__tests__/postgres-checkpoint.local.qa.test.ts` — **1/1 passou**. O teste criou e removeu somente um schema randômico `qgraph_qa_*` no `dbtemp` local.
- `node --check tests/document-parser/local-agentic/qa-upload-retry.mjs` e `node --check tests/document-parser/local-agentic/qa-checkpoint-replay.mjs` — **passaram**.
- Upload e processamento local: `node --import ./backend/node_modules/tsx/dist/loader.mjs tests/document-parser/local-agentic/qa-upload-retry.mjs` — a API aceitou o upload e o worker concluiu. O harness terminou com erro próprio depois de processar por uma referência removida (`firstIdentity`); corrigi o harness, mas não repeti a chamada de modelo paga. Executei então o replay independente abaixo.
- Replay local: `node --import ./backend/node_modules/tsx/dist/loader.mjs tests/document-parser/local-agentic/qa-checkpoint-replay.mjs tests/document-parser/local-agentic/artifacts/2026-11-07T13-48-28-287Z-08de44d5/report.json` — **passou**, `llmCalls=0`, 10 questões e 12 vínculos mantidos, 407 ms.
- `git diff --check` nos artefatos QA — **sem problemas**.

## Achados

### P1 — saída real ainda incompleta para o critério global de questões

**Evidência:** [report.json](../../tests/document-parser/local-agentic/artifacts/2026-11-07T13-48-28-287Z-08de44d5/report.json), campo `runs[0]`; replay confirmado em [checkpoint-replay.json](../../tests/document-parser/local-agentic/artifacts/2026-11-07T13-48-28-287Z-08de44d5/checkpoint-replay.json).

**Reprodução:** subir API/worker pelo launcher `tests/document-parser/local-agentic/start-local.mjs` com DB `dbtemp`, Redis dedicado em `56379` e schema `question_graph_local_test`; executar o upload autenticado de `dbtemp/storage/monitor-documents/Quimica-3.pdf` pela rota `POST /api/v1/monitors/:monitorId/documents`.

**Resultado observado:** HTTP 201; worker `PARTIAL_SUCCESS` com avisos `QUESTIONS_TEXT_COVERAGE_UNVERIFIED`, `QUESTIONS_PAGES_WITHOUT_TEXT` e `QUESTIONS_PAGE_TEXT_UNCLASSIFIED`; 10 questões persistidas e as 10 em `PENDING_REVIEW`; 6 de 10 sem alternativas e **2 de 10 com gabarito AI_GENERATED** (8 sem gabarito). O retry conservou corretamente esse estado incompleto. A causa funcional das lacunas não foi isolada nesta tarefa de QA de retry; encaminhar ao arquiteto para investigação dos nós/agentes.

### P3 — harness de upload teve falha pós-processamento

A primeira execução do harness concluiu upload e processamento, mas terminou com `firstIdentity is not defined` ao preparar a comparação. A variável foi restaurada e o harness passa `node --check`; não repeti o upload para evitar chamadas pagas duplicadas. O resultado foi validado pelo relatório produzido antes dessa falha e pelo teste independente de replay. O erro não veio do backend.

## Revisão do retry

O serviço consulta o checkpoint antes de chamar o extrator e reconstrói os candidatos a partir de `originalSnapshot`: [structured-question-extraction.service.ts](../../backend/src/worker/services/structured-question-extraction.service.ts#L485). O teste de regressão simula uma falha de persistência depois de checkpoint terminal e confere que não se repete extração/grafo e que a questão continua pendente: [structured-question-extraction.checkpoint-retry.local.qa.test.ts](../../backend/src/worker/services/__tests__/structured-question-extraction.checkpoint-retry.local.qa.test.ts#L13). O fingerprint usado na identidade da execução inclui o conteúdo dos chunks e as referências/imagens; a configuração do checkpoint também valida documento, execução e versão.

Os testes PostgreSQL usaram exclusivamente `127.0.0.1:56322/postgres`. Para a execução real, `question_graph_local_test` foi criado no `dbtemp` somente após confirmar que o schema não existia. API e worker encerraram ao final. O Redis dedicado `meumonitor-agentic-redis` em `127.0.0.1:56379` e esse schema permanecem disponíveis para teste local. O banco público de desenvolvimento/remoto e migrations Prisma não foram usados.

Os logs preservados estão em [api-worker.sanitized.log](../../tests/document-parser/local-agentic/artifacts/2026-11-07T13-48-28-287Z-08de44d5/api-worker.sanitized.log). A varredura dos artefatos não encontrou padrões de chave OpenRouter, bearer/JWT ou URL de conexão.
