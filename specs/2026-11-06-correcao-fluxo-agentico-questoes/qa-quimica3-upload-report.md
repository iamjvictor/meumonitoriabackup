# QA ponta a ponta — upload local Química-3

Data: 07/11/2026. Upload novo pelo endpoint local, com professor/monitor/documento novos, banco `dbtemp` em `127.0.0.1:56322`, Redis exclusivo em `127.0.0.1:56379` e Docling local. O arquivo usado foi `dbtemp/storage/monitor-documents/Quimica-3.pdf`. Nenhum documento anterior foi reprocessado.

## Execução

- Upload `POST /api/v1/monitors/:monitorId/documents`: HTTP 201; `documentId=1eb0267e-67cb-4af2-b89e-ad81b498fa2d`.
- Parser produziu 13 chunks; todos os 13 receberam embedding.
- Persistiu 10 questões. O documento terminou `PARTIAL_SUCCESS`, com avisos `QUESTIONS_TEXT_COVERAGE_UNVERIFIED`, `QUESTIONS_PAGES_WITHOUT_TEXT` e `QUESTIONS_PAGE_TEXT_UNCLASSIFIED`.
- As 10 questões ficaram `PENDING_REVIEW` e `needsReview=true`.
- Todas têm cinco alternativas A–E; 6/10 têm gabarito AI_GENERATED e 4/10 não têm gabarito.

| Questão de extração | Alternativas | Gabarito persistido | Pendência principal | Figura vinculada |
|---:|---:|---|---|---|
| 01 | 5 | A — AI_GENERATED | `ANSWER_CONTEXT_INSUFFICIENT` | página 15 |
| 02 | 5 | A — AI_GENERATED | `ANSWER_CONTEXT_INSUFFICIENT` | — |
| 03 | 5 | ausente | `ANSWER_AGENT_FAILED` | página 5 |
| 04 | 5 | ausente | discursiva; `optionsUsable=false`, revisão docente necessária | — |
| 05 | 5 | A — AI_GENERATED | `ANSWER_CONTEXT_INSUFFICIENT` | — |
| 06 | 5 | ausente | discursiva; opções geradas sem validação da fonte | — |
| 07 | 5 | ausente | discursiva; `optionsUsable=false` | página 9 (2 assets) |
| 08 | 5 | A — AI_GENERATED | `ANSWER_CONTEXT_INSUFFICIENT`; número da questão ausente | — |
| 09 | 5 | A — AI_GENERATED | `ANSWER_CONTEXT_INSUFFICIENT` | — |
| 10 | 5 | A — AI_GENERATED | permanece em revisão humana | — |

As letras AI_GENERATED são propostas a revisar, não gabaritos oficiais. As quatro respostas ausentes vieram de uma falha do agente de gabarito (Q03) e de opções que o agente declarou não utilizáveis em questões discursivas (Q04, Q06 e Q07). A questão extraída na posição 8 não reteve número original.

## Imagens e fórmulas

O Docling armazenou 20 assets, todos com `assetType='figure'`; nenhum veio como `page`. Quatro relações de figura foram persistidas em três questões: Q02 → página 5, Q07 → página 9 (dois assets), Q01 → página 15. Os outros 16 assets não têm relação direta com uma questão persistida neste resultado. O teste confirma persistência e associação no banco; não executou a interface local para verificar renderização visual.

Q04 manteve a questão discursiva sobre decomposição do H₂O₂ e recebeu cinco opções geradas; por não haver alternativas fonte, o sistema sinalizou que não conseguiu validá-las como opções utilizáveis e não gerou gabarito. A questão permanece pendente para o professor.

## Tokens, tempo e custo

- Duração total do upload/processamento: aproximadamente **36 min 30 s**.
- Chamadas estruturadas: 20; soma de duração informada pelo cliente: 1.966.553 ms.
- Tokens estruturados: 192.571 prompt + 441.173 completion = **633.744 tokens**, incluindo 422.956 reasoning tokens.
- Embeddings: 28 chamadas, 9.867 prompt tokens.
- **Custo USD: desconhecido.** A resposta/logs não continham preço por chamada; não interpretei a ausência como custo zero.
- Duas respostas chegaram ao teto do provedor: `finishReason='length'`, `responseChars=0`, `completionTokens=131072` e `reasoningTokens=131072`. Uma correção respondeu após 5,4 s; a chamada de gabarito levou 907,9 s até truncar e a tentativa corretiva subsequente concluiu o fluxo. Os agentes estavam com `maxTokens='provider_default'` e `timeoutMs='none'`; o limite de 131.072 foi do provedor.

## Replay e isolamento

Depois do upload houve replay terminal do checkpoint já concluído: `llmCalls=0`, 10 questões preservadas, identidade (IDs/hash) estável e mesma contagem de relações de fonte. Não foi enviado um segundo upload para este documento.

API, worker e harness iniciados por este teste encerraram normalmente após o resultado. DB `dbtemp`, Docling e Redis dedicado permaneceram ativos; não encerrei serviços compartilhados ou de outros ambientes. A execução começou antes da correção que removeu o timeout do extrator; a chamada inicial de `document_questions` registrou `timeoutMs=180000`. Portanto este upload não valida a alteração posterior de timeout do extrator. As chamadas dos agentes de alternativas/gabarito já registraram `timeoutMs='none'`.

## Artefatos

- Dados completos das 10 questões, alternativas e relações de figuras: [report.json](../../tests/document-parser/local-agentic/artifacts/2026-11-07T14-12-46-019Z-d61f3599/report.json).
- Logs sanitizados da API e worker: [api-worker.sanitized.log](../../tests/document-parser/local-agentic/artifacts/2026-11-07T14-12-46-019Z-d61f3599/api-worker.sanitized.log).
