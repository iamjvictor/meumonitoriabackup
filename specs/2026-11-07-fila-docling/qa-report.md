# Relatório de QA independente — fila Docling

## Resumo

Os testes locais da fila, do contrato Docling v2 e do cliente passaram. O caso independente de coalescência por hash com extensões diferentes inicialmente encontrou vazamento de metadado em `/v1/parse`; após a correção do implementador, o teste passou e as requisições receberam o resultado correspondente à própria extensão. A correção foi verificada sem rede externa, banco ou parser real.

Para o IFF, que usa `/chunk/v2` e arquivo `.pdf`, não encontrei contaminação de `document_id`, basename ou `request_id`: o `DocChunkerService` exige extensão `.pdf` e converte usando `upload.pdf`; cada resposta v2 recebe o `request_id` individual no header e no manifesto. O teste de reprocessamento real (AC-006) não foi executado nesta rodada.

## Achado corrigido durante a rodada

### P2 — `/v1/parse` compartilhava resultado entre extensões que podem alterar a conversão

- Arquivos/linhas: [docling_http_service.py](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/services/document-parser/scripts/docling_http_service.py:194), [docling_http_service.py](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/services/document-parser/scripts/docling_http_service.py:238), [docling_http_service.py](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/services/document-parser/scripts/docling_http_service.py:517).
- Reprodução: `python services/document-parser/tests/test_parser_queue_qa.py ParserQueueIndependentTests.test_parse_does_not_share_identical_bytes_across_different_filename_suffixes`.
- Entrada: dois POST concorrentes em `/v1/parse` com payload idêntico; nomes `upload.pdf` e `upload.docx`.
- Resultado antes da correção: ambos retornavam `received_filename = upload.pdf`.
- Causa: as chaves do `ParserJobQueue` e do `CachedParseService` usavam apenas SHA-256; `RealDoclingParser.parse` usa `Path(filename).suffix` para escolher o sufixo do arquivo temporário.
- Correção verificada: identidade da operação/cache inclui o sufixo normalizado. Comando de reprodução agora passa; o parser stub é chamado uma vez para cada extensão e cada resposta contém seu filename.
- Impacto no IFF: o caso específico IFF não era afetado, pois usa `/chunk/v2` com extensão `.pdf`. A correção removeu também a mistura global de resultados para extensões distintas.

## Evidência por critério de aceite

| Critério | Resultado QA | Evidência / lacuna |
| --- | --- | --- |
| AC-001 | Passou | Teste de dois documentos diferentes com capacidade 1 confirma que o segundo não começa conversão antes da liberação do primeiro; ambos concluem. |
| AC-002 | Passou localmente | Backend HTTP continua aguardando com `DOC_CHUNKER_TIMEOUT_MS=1` e completa após liberar o stub. Cliente usa relógio virtual para avançar 600001 ms com deadline configurado em 700000 ms e valida o pacote completo. Não houve espera real de 600 segundos. |
| AC-003 | Passou localmente | Cliente diferencia rede, timeout configurado, cancelamento, stream interrompido e ZIP inválido; erro original de transporte fica em `cause`. Stub de falha do parser retorna código/status original e permite retry. |
| AC-004 | Passou nos cenários locais | `/chunk/v2` coalesce o mesmo conteúdo e gera manifesto/header com cada `request_id`, mantendo log do segundo `document_id`. `/v1/parse` separa operações quando a extensão difere. Cancelamento real através de HTTP não foi exercitado; cancelamento explícito do cliente foi validado nos testes do cliente. |
| AC-005 | Parcial | Teste local de capacidade, liberação após falha e integridade do pacote passou. Não foi feito stress de memória com muitos uploads grandes; a fila interna do `ThreadPoolExecutor` não está limitada e cada handler lê o upload antes de enfileirar. Validar o limite de memória sob backlog grande continua pendente. |
| AC-006 | Não executado | Nenhum acesso a banco/storage, parser real, embeddings, LLM ou reprocessamento IFF nesta atividade de QA. |
| AC-007 | Parcial | Testes unitários/HTTP locais executados; validação real do IFF pendente. |

## Comandos executados

- `python services/document-parser/tests/test_parser_queue_qa.py` — 5 passaram.
- `python services/document-parser/tests/test_parser_queue.py` — 6 passaram.
- `python services/document-parser/tests/test_http_server.py` — 18 passaram.
- `node --import tsx --test src/worker/services/doc-chunker/__tests__/doc-chunker-v2.queue.qa.test.ts src/worker/services/doc-chunker/__tests__/doc-chunker-v2.client.test.ts` (diretório `backend`) — 15 passaram.
- `npm run typecheck -- --pretty false` (diretório `backend`) — passou.

Os testes são locais e controlados, não fizeram chamadas externas e não iniciaram nem reiniciaram o parser compartilhado. O backlog/memória e o reprocessamento real permanecem fora da evidência desta execução.
