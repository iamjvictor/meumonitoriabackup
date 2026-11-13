# Validação independente

## Resultado por critério

| Critério | Evidência | Resultado |
|---|---|---|
| AC-001 | `document-worker.doc-chunker.integration.test.ts` roda o worker com a flag ativa e verifica os estágios `docling_chunk_received` e `docling_chunk_persisted`, `raw_text="texto"` em `text` (conteúdo armazenado) e `text="contexto"` em `embeddingText`, páginas `[1]`, índice `0` e ID persistido `chunk-1`. | Passou (1/1) |
| AC-002 | `embedding-content-logging.test.ts` compara `embeddingText` com a string capturada pelo cliente de embeddings e confirma que `text` preserva o conteúdo armazenado; cobre `embeddingContent` prioritário. | Passou |
| AC-003 | `document-content-logging.test.ts` chama o helper com flag desligada e confirma zero chamadas ao logger. A configuração também tem default `false` em `env.ts`. | Passou |
| AC-004 | O teste verifica corte em 10 caracteres, total original e `textTruncated=true`; a configuração limita o máximo a 50.000 e usa default de 2.000. | Passou |
| AC-005 | Testes específicos cobrem flag ligada/desligada e igualdade entre texto logado e payload do client. | Passou |

## Comandos executados

- `ASAAS_WEBHOOK_URL=https://example.com/webhook node --experimental-test-module-mocks --import tsx --test src/worker/services/__tests__/document-content-logging.test.ts src/worker/services/__tests__/embedding-content-logging.test.ts src/worker/services/__tests__/document-worker.service.test.ts src/worker/services/__tests__/document-worker.doc-chunker.integration.test.ts` (em `backend`): **8 passaram, 0 falharam**.
- `ASAAS_WEBHOOK_URL=https://example.com/webhook node --experimental-test-module-mocks --import tsx --test src/worker/services/__tests__/document-worker.doc-chunker.integration.test.ts` (em `backend`, após adicionar a verificação independente de mapeamento): **1 passou, 0 falharam**.
- `npm run typecheck` (em `backend`): **passou**.

A variável `ASAAS_WEBHOOK_URL` é necessária porque o schema local de configuração a exige nesta execução de teste. Os testes não chamaram OpenRouter nem gravaram no banco.

## Achados e lacunas

- Sem achados bloqueantes: flag desativada por padrão, limite por campo aplicado antes do logger, e `embeddingText` deriva da mesma matriz enviada ao client. O campo `text` dos eventos de worker corresponde ao `raw_text` salvo como conteúdo principal.
- Na revisão independente, a chamada HTTP real ainda estava pendente; a auditoria local concluída pelo agente principal está registrada abaixo.

## Auditoria real concluída pelo agente principal

- Chamada `DocChunkerClient` → parser local `http://127.0.0.1:8083/chunk` usando `pH e pOH.pdf`, com `DOCUMENT_EXTRACTION_CONTENT_LOG_ENABLED=true` e limite de 50.000 caracteres.
- Para exercitar `EmbeddingService` sem efeitos externos, o repositório foi dublado com os chunks reais retornados pelo parser e o cliente de embeddings foi dublado; a captura confirmou que `embeddingText` era idêntico ao `chunk.text` do Docling e que `text` preservava o `raw_text` que o repositório salva como conteúdo principal. Não houve gravação no banco nem chamada ao OpenRouter.
- Resultado: HTTP concluído, 4 páginas cobertas, 3 chunks. O conteúdo principal (`raw_text`) somou 2.353 caracteres (839, 567 e 947); o conteúdo contextualizado de embedding (`text`) somou 2.410 caracteres (839, 567 e 1.004), exatamente o tamanho enviado ao client simulado. Todos os campos foram logados sem truncamento.
- O classificador Python real identifica este PDF como `SCANNED` e habilita OCR. O OCR recuperou `pH` e `pOH`, além de texto das páginas 1–4. A leitura não é perfeita: há erros de reconhecimento em fórmulas/palavras e omissões em alternativas; portanto, OCR executou e gerou conteúdo indexável, mas a fidelidade precisa de revisão/correção para uso confiável.
- A flag e o limite foram documentados em `backend/.env.example`, desligados por padrão.
