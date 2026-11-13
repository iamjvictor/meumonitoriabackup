# Task 2 brief — Comparative quality and cost report

Leia `specs/model-comparison/spec.md`, `plan.md`, `tasks.md`, `test-plan.md` e `tests/model-comparison/runner/telemetry-summary.mjs`.

## Objetivo

Tornar `tests/model-comparison/comparar_testes.ts` apto a emitir um relatório final útil com o baseline atual Gemini e somente as execuções efetivas de cada um dos quatro testes. Relatórios `executionMode=dry-run`, fakes, ou `pipelineExecuted !== true` nunca entram nos números de qualidade/custo.

## Contrato dos resumos efetivos

Cada `reports/<test>/<runId>/summary.json` terá `{test,runId,pipelineExecuted:true,baseline,rounds}`. Cada rodada `{round,status,questions,calls,metrics,knowledgeBase,chat}`:

- `questions`: `number`, `statement`, `alternatives:[{label,text}]`, `correctAnswer`, `explanation`, `evidence`, `missingFields`, `reviewDecision`, `status`, `sourceBlockId`.
- `calls`: logs normalizados por tentativa com `agent`, `model`, `requestedProvider`, `provider`, `attempt`, `schemaValidFirstAttempt`, `inputTokens`, `outputTokens`, `reasoningTokens`, `latencyMs`, `costUsd`, `outcome`, `error`, `schemaError`.
- `metrics`: `totalDurationMs`, `latencyP50Ms`, `latencyP95Ms`, tokens/custo agregados e status das asserções.
- `knowledgeBase`: `assetCount`, `indexedCount`, `descriptions:[{assetId,pageNumber,description,model,status}]`, prova de hashes/copied chunk vectors e visual expected-elements (`fixture` avaliado quando houver saída).
- `chat`: `questionNumber`, `question`, `answer`, `imageContextPassed`, `visibleDifferenceRecognized`, `status`.
- `baseline` informa metadata de execução existente; o JSON fonte `e2e-results-summary.json` fornece Gemini 2.5 Flash, 10 questões, 90 chamadas structured entre inicial+repetição, 141107 prompt / 57889 completion tokens, mas custo é “Not reported by workers”. Usar `question-origin-snapshot.json` para dados lado a lado.
- `fx`: `{usdBrl,source,date}` só quando o coordenador incluir câmbio documentado.

Se campos estiverem ausentes, mostrar `NAO_VERIFICADO`. A fixture humana segue `SEM_VERDADE_DE_REFERENCIA`; não calcular acurácia docente nem concordância com professor.

## Entregáveis

- `comparativo.md` e `comparativo.csv`: uma linha principal por baseline/teste, com rodadas, questões PENDING_REVIEW, cobertura visual, tokens, custo USD/BRL, custo por questão, p50/p95, total e variação R1/R2.
- Um `comparacao.md` por execução/runId, com questões lado a lado baseline/teste, alternativas, gabarito, explicação, estrutura, evidência visual e chat Q03.
- Não eliminar ou alterar resumos de dry-run existentes.

## Limites

- Modifique somente `tests/model-comparison/comparar_testes.ts` e `tests/model-comparison/comparar_testes.test.ts`; relatório de pacote `specs/model-comparison/task-2-comparator-report.md`.
- Não modificar runner/README/envs, nenhum arquivo `backend/src/**`, banco, Storage ou relatório de inferência.
- Criar testes locais com summaries sintéticos; sem rede, sem leitura de PDFs/PII, sem chamadas de modelos.
- Gabarito sem fixture humano deve continuar explicitamente vazio.

## Verificação esperada

Teste: filtrar dry-run/fakes; baseline aparece como comparação; calcular métricas sem fingir custo quando ausente; comparar variação entre rodadas; ler e expor knowledgeBase/chat visuais; arquivo CSV e Markdown válidos. Reporte status, comandos e lacunas no arquivo de relatório.
