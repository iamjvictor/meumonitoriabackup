# Doc-chunker para ingestão da base de conhecimento

Data: 2026-10-24  
Status: revisada para implementação; sem alteração de runtime

## Intenção

Fazer o upload de PDFs da base de conhecimento produzir chunks citáveis e embeddings em produção. O serviço Python `doc-chunker` interpreta o PDF com Docling e `HybridChunker`. O worker Node mantém a fila, validação do contrato, persistência, embeddings e regras de acesso por professor, monitor e matéria. No modo `auto`, falhas transitórias do serviço acionam o caminho PDF.js existente dentro da mesma tentativa do job.

Esta proposta substitui o serviço Python `document-parser` na ingestão de documentos `KNOWLEDGE_BASE`; não executa uma segunda conversão Docling do mesmo arquivo. O nome do serviço Railway pode ser mantido durante a migração, mas a rota e a versão do contrato são novas.

## Situação atual e restrições

- `DOCUMENT_INGESTION_V3_ENABLED` envia o PDF ao parser Docling para persistir o layout. Em seguida o worker usa PDF.js para extrair texto, detecta `DocumentBlock`, chunkeia no Node e gera embeddings.
- O parser envia HTTP 200 após 250 ms e transmite espaços até a conversão terminar. Exceção posterior pode deixar um corpo sem JSON; o cliente registra `PARSER_INVALID_JSON`. O timeout do adaptador acaba quando chegam os cabeçalhos; o timeout do orquestrador não cancela o trabalho Python.
- `DocumentChunk` já tem `content`, `embeddingContent`, `tokenCount`, `pageStart`, `pageEnd`, `blockId?` e vetor `vector(2048)`, mas não tem `pages`, `headings`, caixas ou `engine`. `saveExtractedChunks` exige `blockId` e substitui todos os chunks em transação; não serve diretamente para chunks do Docling.
- A configuração local e o exemplo usam `qwen/qwen3-embedding-8b` via OpenRouter, com `OPENROUTER_EMBEDDING_DIMENSIONS=2048`. O worker envia `embeddingContent || content` ao provedor. O nome e a dimensão efetivos em produção devem ser confirmados nas variáveis do Railway antes do rollout.
- O processamento de documentos `QUESTIONS` e `FLASHCARDS` depende de blocos e vínculos `blockId`; esta entrega conserva o pipeline desses tipos até que haja mapeamento explícito de chunks Docling para blocos pedagógicos.
- A fila BullMQ já transporta `documentId`, tem três tentativas e backoff. O fallback do modo `auto` ocorre dentro de uma tentativa; retry da fila é reservado para falha de ambos os caminhos ou etapa posterior.

## Objetivos

1. Um PDF `KNOWLEDGE_BASE` válido gera chunks Docling com contexto de títulos e páginas, que são efetivamente usados para embeddings e recuperação.
2. Falhas do Docling produzem erro identificável; o worker nunca confunde recebimento de cabeçalhos com conversão concluída.
3. No modo `auto`, uma falha transitória do `doc-chunker` usa PDF.js sem misturar chunks dos dois mecanismos.
4. Reprocessamento e retry preservam isolamento entre monitores, vínculos de tópicos, citações e fontes já ligadas a flashcards.
5. A implantação é reversível por configuração, sem mudar a fila, o provedor de embeddings nem o armazenamento do PDF.

## Fora do escopo

- Executar embeddings no Python ou baixar pesos do modelo Qwen de 8 bilhões de parâmetros. O Python carrega somente o tokenizer.
- Migrar automaticamente documentos antigos, questões e flashcards para chunks Docling.
- Substituir todas as regras de detecção de blocos e extração de questões.
- Aceitar URL arbitrária informada pelo cliente. O primeiro contrato usa multipart enviado pelo worker; URL assinada exige validação de origem, prazo e proteção contra acesso a endereços internos.
- Fallback silencioso de documentos inválidos, sem texto ou que exigem OCR.

## Abordagens

| Abordagem | Vantagem | Custo/limite |
| --- | --- | --- |
| Evoluir o parser atual e manter chunks no Node | Menor mudança inicial | Mantém duas leituras do PDF e não usa o `HybridChunker` como proposto |
| Usar `docling-serve` | Menos HTTP próprio | Contrato, proveniência, configuração e tratamento de falhas precisam ser adaptados e fixados por versão |
| **Evoluir o container Python para `doc-chunker` com contrato próprio** | Um parse por arquivo, resposta ajustada ao banco e logs controlados | Exige nova persistência e migração gradual no worker |

Escolha desta especificação: contrato próprio no container existente. A seleção foi fornecida no desenho do usuário. O serviço continua privado na Railway.

## Fluxo alvo para `KNOWLEDGE_BASE`

```text
Upload → Storage → BullMQ(documentId) → worker baixa PDF e calcula SHA-256
                                  ↓
                       POST /chunk (multipart)
                                  ↓
          Docling → HybridChunker → resposta contextualizada + proveniência
                                  ↓
       worker valida hash/versão/chunks → persiste lote de chunks e metadados
                                  ↓
                  EmbeddingService → OpenRouter → vector(2048)

Falha transitória em modo auto → PDF.js → DocumentText → blocos → ChunkService
```

O worker escolhe a fonte antes de gravar chunks. A persistência do lote Docling e de sua procedência é atômica. Um fallback somente começa se nenhum chunk Docling tiver sido confirmado. Falhas depois da gravação, como erro do provedor de embeddings, retomam os chunks pendentes sem reconverter o PDF.

## Contrato HTTP `doc-chunker/v1`

`GET /health` comprova que o processo atende HTTP. `GET /ready` comprova que tokenizer e converter foram inicializados e que o serviço aceita trabalho; o health check Railway usa `/health` e o worker só considera `/ready` para diagnóstico, sem converter PDFs de teste no health check.

`POST /chunk` recebe `multipart/form-data` com `file` PDF obrigatório e cabeçalhos `X-Document-Id`, `X-Request-Id` e `X-Expected-SHA256`. O serviço calcula o hash dos bytes recebidos, rejeita divergência antes de converter e devolve `400` para entrada inválida, `413` para tamanho acima do limite e `500/503` para falha interna/recurso indisponível. Tamanho máximo, tempo máximo e concorrência são configuráveis e registrados no boot. O serviço só aceita tráfego da rede privada; eventual autenticação interna deve ser definida antes de expor domínio público.

Resposta completa:

```json
{
  "schema_version": "doc-chunker/v1",
  "request_id": "uuid-da-tentativa",
  "status": "completed",
  "doc_hash": "sha256-hex",
  "engine": "docling",
  "parser_version": "2.122.0",
  "tokenizer_id": "Qwen/Qwen3-Embedding-8B",
  "chunker_version": "hybrid-v1",
  "page_count": 4,
  "chunks": [
    {
      "index": 0,
      "text": "Artigo 5\nPagamento\nO locatário pagará…",
      "raw_text": "O locatário pagará…",
      "headings": ["Artigo 5", "Pagamento"],
      "pages": [3, 4],
      "type": "text",
      "tokens": 412,
      "provenance": [
        { "page": 3, "item_ref": "#/texts/12", "bbox": [10, 20, 300, 80], "coord_origin": "BOTTOMLEFT" }
      ]
    }
  ]
}
```

`text` é `chunker.contextualize(chunk)` e alimenta `embeddingContent`; `raw_text` alimenta `content`, para exibição/citação sem títulos duplicados. `tokens` conta **`text` contextualizado** com o tokenizer declarado. `pages` é o conjunto ordenado e sem duplicatas de `prov.page_no`; é 1-based. `provenance` é opcional por item, inclui origem da coordenada e só é emitido quando Docling fornece página e caixa válidas. `type` usa enum controlado (`text`, `table`, `formula`, `mixed`); a classificação é feita a partir dos itens do Docling, nunca por suposição baseada no texto. `origin` do Docling não deve transportar caminhos temporários ou URL assinada; somente campos seguros e úteis devem ser selecionados.

O worker valida esquema, índices contíguos, hash, tamanho da resposta, limites de tokens, páginas dentro de `page_count`, número de chunks e ausência de strings vazias antes de persistir. Uma resposta `status=failed` é falha mesmo se recebida com HTTP 200. Corpo interrompido, JSON inválido e JSON válido fora do contrato recebem códigos distintos nos logs. Não registrar PDF, texto completo, URL assinada nem resposta integral.

## Conversão, tokenizer e OCR

- Criar uma instância reutilizável de `DocumentConverter` e uma de `HybridChunker` por processo, após o aquecimento. O converter deve manter a análise atual com `pypdfium2` e a política explícita de OCR, em vez de trocar silenciosamente para os padrões de `DocumentConverter()`.
- Usar `HuggingFaceTokenizer(AutoTokenizer.from_pretrained("Qwen/Qwen3-Embedding-8B"), max_tokens=500)` e `HybridChunker(..., merge_peers=True)` como ponto de partida. **500 é uma meta conservadora de recuperação**, alinhada ao máximo de child chunks configurado hoje, não o contexto máximo do Qwen. O limite definitivo deve passar por corpus real, contagem do texto contextualizado e limites efetivos do provedor OpenRouter. Fixar a revisão do tokenizer e pré-carregar seus arquivos na imagem para não depender de download no primeiro PDF.
- Se o modelo de embeddings mudar, o tokenizer e `chunker_version` devem mudar juntos; chunks anteriores não são reusados com contagem incompatível sem reprocessamento.
- Texto escaneado sem camada nativa suficiente exige OCR explícito. Se OCR estiver indisponível, responder erro tipado `OCR_REQUIRED` ou resultado `needs_ocr`; não retornar uma lista vazia como sucesso.
- Se `HybridChunker` produzir zero chunks, avaliar o conteúdo convertível. Só gerar um chunk a partir do Markdown quando houver texto substancial e ele couber no limite; caso contrário, dividir com o mesmo tokenizer ou classificar `NO_EXTRACTABLE_TEXT`/`OCR_REQUIRED`. Nunca enviar um documento inteiro além do limite como único embedding.
- Chunks grandes demais após `contextualize` são repartidos ou rejeitados antes de sair do serviço. Não juntar chunks curtos no Node: isso destruiria a relação entre texto e proveniência; ajustar regras no Python e medir qualidade.

## Transporte, timeout e erros

O protocolo não pode marcar conversão concluída ao receber cabeçalhos. Para a primeira versão, manter a requisição síncrona com resposta JSON integral e status HTTP fiel: enviar cabeçalhos somente depois da conversão e serialização, ou adotar um envelope de streaming completo que sempre termina com `status=completed|failed`. **Não manter o streaming atual de espaços com tentativa posterior de enviar outro status HTTP.** Se a Railway ou a rede interna impuser limite menor que a duração observada dos PDFs reais, migrar para `202 + polling` com estado durável antes do rollout; um mapa de jobs apenas em memória não atende retry/restart de produção.

No Node, um único `AbortController` cobre upload, cabeçalhos e leitura do corpo. Ao expirar, a conexão é abortada e o código é `DOC_CHUNKER_TIMEOUT`. O servidor registra conversão cancelada/desconexão quando observável; não promete interromper o Docling se a biblioteca não oferecer cancelamento. O timeout do worker deve ser maior que o limite de conversão do serviço, com margem para transporte e persistência. O log `request_finished` só é emitido após corpo válido ser enviado por completo. Toda falha inclui `request_id`, `doc_hash`, etapa (`input`, `convert`, `chunk`, `serialize`, `send`), duração, código e classe da exceção; traceback fica somente nos logs do serviço.

## Seleção de fonte e fallback

Introduzir `DOCUMENT_TEXT_SOURCE=pdfjs|docling|auto`:

- `pdfjs`: caminho atual, sem chamada ao novo serviço.
- `docling`: caminho novo estrito; falha tipada e retry da fila, sem fallback. Útil para homologação e diagnóstico.
- `auto`: caminho novo primeiro; em erro de rede, timeout, indisponibilidade, 5xx, corpo interrompido ou contrato inválido, registra a causa e executa PDF.js uma vez dentro do mesmo job. É o modo proposto para produção após validação.

Erros de entrada, hash divergente, PDF inválido, `OCR_REQUIRED` e `NO_EXTRACTABLE_TEXT` não acionam PDF.js automaticamente, pois o fallback pode mascarar conteúdo incompleto. Se houver `DocumentChunk` Docling persistido, falha posterior retoma a etapa pendente ou falha o job; não alterna para PDF.js e apaga embeddings já criados. O modo efetivo (`docling`, `pdfjs` ou `pdfjs_fallback`) acompanha o documento e os eventos do job. `DOCUMENT_INGESTION_V3_ENABLED` e `DOCUMENT_PARSER_BASE_URL` existentes devem ser migrados com validação de boot; configuração incompatível falha cedo, sem deixar o caminho antigo executar Docling ocultamente.

## Persistência e compatibilidade

Criar uma rotina de persistência específica para chunks Docling, mantendo a transação e os advisory locks usados pelo repositório atual. Ela grava `content=raw_text`, `embeddingContent=text`, índices estáveis, `pageStart/min(pages)`, `pageEnd/max(pages)`, tópicos do documento e estado `EMBEDDING_PENDING`. Ampliar a estrutura para `pages`, `headings`, `type`, `engine`, `tokenizer_id`, `chunker_version`, `provenance` e `doc_hash` (colunas ou JSON validado, com índice nas páginas se a busca exigir). Cada chunk Docling recebe `source_key` estável derivada de `document_id`, `doc_hash`, `engine`, `chunker_version` e `index`, protegida por índice único. Validar o lote inteiro antes de uma única transação de substituição; falha antes do commit preserva os chunks anteriores. Preservar `teacherId`, `monitorId` e `subjectId` derivados do documento no banco, jamais da resposta Python.

Para `KNOWLEDGE_BASE`, `blockId` pode ser nulo no esquema, mas leitores de RAG, citações, perfil de tópico e regras de qualidade devem ser auditados para funcionar com chunks sem bloco. Questões e flashcards continuam no caminho atual até existir uma estratégia de vínculos com blocos pedagógicos. Se um documento já possui `FlashcardSource` ou outras referências protegidas, seguir a trava de substituição existente; não apagar chunks vinculados durante retry ou migração. Uma troca de engine ou versão cria novo conjunto de chunks apenas após validar o lote completo e a política de substituição.

O layout Docling só continua sendo persistido se tiver consumidor explícito; a conversão não deve ser repetida para obtê-lo. Se o layout permanecer necessário, incluí-lo como artefato versionado no mesmo parse ou em armazenamento temporário controlado, sem duplicar a conversão. Não manter resultados grandes no campo `inlineResults` do adaptador após a conclusão.

## Observabilidade em logs por etapa

API, worker e Python emitem uma linha JSON por evento, com nomes estáveis e horário UTC em ISO 8601. O worker gera um UUID `request_id` novo por tentativa HTTP ao Python e o envia em `X-Request-Id`; Python devolve o mesmo valor no cabeçalho e no campo `request_id` da resposta, e o worker valida ambos. `document_id`, `job_id` e `job_attempt` correlacionam o evento à fila. O fallback conserva o `request_id` da tentativa Docling e registra um UUID `fallback_id` próprio para o caminho PDF.js. O hash do arquivo identifica o conteúdo sem expor o PDF. Cada etapa emite `started` e, se a execução terminar de forma observável, exatamente um terminal `completed`, `failed`, `skipped` ou `cancelled`; um processo encerrado abruptamente pode não emitir terminal. Nesse caso, o watchdog registra `document_stage.stalled`, sem fabricar um evento terminal. O terminal inclui `duration_ms` monotônico medido no próprio processo. Um evento de sucesso só é emitido após a operação correspondente terminar, inclusive leitura do corpo HTTP e commit no banco.

Campos comuns: `event`, `timestamp`, `service`, `environment`, `service_version`, `request_id`, `document_id`, `job_id`, `job_attempt`, `stage`, `outcome`, `duration_ms` (nos terminais) e `doc_hash` quando conhecido. Campos de erro: `error_code` estável, `error_class`, `failure_kind` (`input`, `conversion`, `chunking`, `timeout`, `network`, `contract`, `persistence`, `embedding`, `resource`) e `retryable`. O worker registra `source_mode` e `effective_engine`. IDs e código de erro devem ter o mesmo nome em ambos os processos; mensagens de exceção podem ser resumidas, sem conteúdo do documento.

| Etapa | Eventos de início e término | Dados adicionais no término |
| --- | --- | --- |
| API aceita upload e enfileira documento | `document_upload.accepted`, `document_job.enqueued` ou `document_job.enqueue_failed` | `document_id`, tamanho, tipo, tag, `job_id`; não registrar nome completo se contiver dados pessoais |
| Worker inicia job e baixa PDF | `document_job.started`, `document_download.started/completed/failed` | bytes, `doc_hash`, duração do download |
| Worker chama Python e consome resposta | `doc_chunker_client.request_started`, `headers_received`, `body_received`, `request_completed/failed` | duração até cabeçalhos e até corpo, HTTP status, bytes da resposta, resultado da validação; `headers_received` não é sucesso da conversão |
| Python recebe e valida PDF | `doc_chunker.request_started`, `input_validation.started/completed/failed` | bytes, hash recebido/calculado, formato, limite aplicado |
| Python analisa texto e OCR | `doc_chunker.text_layer.started/completed/failed` | páginas totais, páginas com texto, classificação, OCR ativado, duração |
| Python converte com Docling | `doc_chunker.conversion.started/completed/failed` | versão do parser, páginas convertidas, avisos, duração; falha traz traceback no log Python |
| Python cria chunks | `doc_chunker.chunking.started/completed/failed` | versão/tokenizer, `max_tokens`, chunks, contagem mínima/máxima de tokens, chunks sem página, duração |
| Python serializa e envia | `doc_chunker.response.started/completed/failed`, `doc_chunker.request_completed/failed` | status real, bytes enviados, duração total; `request_completed` somente após envio íntegro |
| Worker valida e grava chunks | `document_chunks.validation_started/completed/failed`, `document_chunks.persist_started/completed/failed` | chunks aceitos/rejeitados, engine, páginas cobertas, duração da transação, versão e contagem persistida |
| Worker faz fallback PDF.js | `document_chunker.fallback_started/completed/failed` | código e etapa da falha Docling, duração, chunks PDF.js, engine final; em `skipped`, registrar motivo |
| Worker gera e grava embeddings | `document_embeddings.started`, `document_embeddings.batch_started/completed/failed`, `document_embeddings.completed/failed` | lotes, chunks, modelo, dimensões, tentativas, duração; aproveitar os eventos existentes sem duplicá-los |
| Worker encerra job | `document_job.completed/failed/retry_scheduled` | engine efetiva, chunks prontos, duração total, status do documento, causa terminal |

O Python também registra um evento de boot com versão do Docling, tokenizer, limites, concorrência e PID, sem imprimir variáveis sensíveis. Registrar RSS do processo e memória disponível no início e no fim da conversão, além de amostra periódica enquanto houver conversões ativas; `in_flight` e fila de espera ajudam a distinguir saturação de lentidão do Docling. O worker atualiza o estágio e seu `request_id` no `DocumentProcessingJob` ativo. Um watchdog consulta jobs `PROCESSING` cujo estágio excedeu o limite configurado mais 30 segundos e emite `document_stage.stalled`, deduplicado por `job_id`, `job_attempt` e `stage`. Um OOM pode matar o processo antes do log terminal: o evento do watchdog, correlacionado ao reinício do container e às métricas da Railway, é sinal de investigação, não prova de que o PDF falhou. O evento fica nos logs Railway; notificação externa não faz parte desta entrega.

Logs de falha devem responder: **qual documento/tentativa, qual etapa, qual duração, qual código, houve fallback e qual foi o resultado final?** Não emitir um log por chunk nem imprimir `text`, `raw_text`, Markdown, PDF, vetor, token de acesso, URL assinada ou corpo JSON completo. Agregados por lote mantêm o volume controlado. Os exemplos abaixo fixam a forma dos eventos:

```json
{"event":"doc_chunker.conversion.failed","timestamp":"2026-10-24T17:20:54.000Z","service":"doc-chunker","request_id":"...","document_id":"...","doc_hash":"...","stage":"convert","outcome":"failed","duration_ms":3120,"error_code":"DOCLING_CONVERSION_FAILED","error_class":"RuntimeError","failure_kind":"conversion","retryable":true}
{"event":"document_chunker.fallback_completed","timestamp":"2026-10-24T17:20:58.000Z","service":"worker","request_id":"...","fallback_id":"...","document_id":"...","job_id":"...","job_attempt":1,"stage":"fallback","outcome":"completed","duration_ms":1880,"source_mode":"auto","effective_engine":"pdfjs","upstream_error_code":"DOCLING_CONVERSION_FAILED","chunk_count":12}
```

Critérios de aceite da observabilidade: uma execução bem-sucedida pode ser reconstruída do upload ao embedding por IDs; uma falha após os cabeçalhos mostra erro terminal no Python e no worker; timeout distingue espera por cabeçalhos de espera pelo corpo; fallback mostra causa e engine final; logs de teste e produção não contêm conteúdo nem credenciais. A falta de evento terminal é detectável por correlação de `started` sem terminal após o prazo máximo, com alerta para reinício/OOM do container.

## Implantação e aceitação

1. Atualizar o container Python existente e pré-carregar converter/tokenizer. Medir RSS, duração por etapa, tamanho de resposta, taxa de erro e desempenho com concorrência 1 e 2. Começar com 1 se houver pressão de memória.
2. Implantar o serviço privado com `/health` e `/ready`; conferir URL interna, recursos Railway, versão da imagem e variáveis efetivas. Exercitar PDFs textuais, mistos, escaneados, longos, com tabelas, fórmulas e páginas sem texto.
3. Implantar o worker com `DOCUMENT_TEXT_SOURCE=pdfjs`, depois `docling` em homologação e `auto` em produção. Comparar conteúdo, páginas citadas, contagem de chunks, recuperação RAG e custo de embeddings contra o pipeline atual.
4. Consultar os eventos por `request_id`, `document_id` e `job_id`; configurar alertas para aumento de fallback, timeout, eventos `started` sem terminal, reinício/OOM e documentos `FAILED`.
5. Reverter para `pdfjs` por configuração se a taxa de falha ou qualidade ultrapassar os limites definidos antes do rollout. Jobs em andamento terminam na versão em que iniciaram; novos jobs usam a nova configuração.

Critérios de aceite: upload `KNOWLEDGE_BASE` em produção gera pelo menos um chunk citável com embedding 2048D, `embeddingContent` contextualizado e páginas corretas; PDF.js não é chamado em sucesso Docling; falha transitória em `auto` gera somente chunks PDF.js e preserva a causa Docling nos logs; OCR ausente não gera sucesso vazio; timeout cobre leitura do corpo; retry não mistura engines nem elimina fontes existentes; e nenhum HTTP 200 com corpo vazio é interpretado como conversão concluída.

## Camada TDD

Cada mudança de comportamento deve começar por um teste focado que falha pelo comportamento ausente, passar após a implementação mínima e permanecer na suíte de regressão. Executar os testes por camada antes de integrar os módulos:

- HTTP Python e protocolo Node: `services/document-parser/tests/test_http_server.py` e `backend/src/worker/services/doc-chunker/__tests__/doc-chunker.client.test.ts`. Cobrem falha tardia sem 200 vazio, hash e request ID, JSON truncado/fora do contrato, limite de corpo e timeout durante leitura.
- Conversão e OCR: `services/document-parser/tests/test_doc_chunker.py` e `test_chunk_upload_integration.py`. Cobrem contextualização, texto original, contagem de tokens, sequência de índices, páginas, proveniência, limite, acentos de PDF, OCR requerido e resposta HTTP do upload.
- Persistência e retry: `backend/src/repositories/__tests__/document-worker.docling-chunks.test.ts` e `document-processing-job.stage.test.ts`. Cobrem validação anterior à transação, escopo obtido do documento, `source_key`, reuso e proteção de referências.
- Retrieval e citações: `backend/src/repositories/__tests__/knowledge-retrieval.docling.test.ts`, testes do provider RAG e do assembler. Cobrem `blockId=null`, filtro por headings, páginas, títulos e manutenção da citação por bloco.
- Worker e observabilidade: `backend/src/worker/services/__tests__/document-worker.doc-chunker.test.ts`, `document-worker.doc-chunker.integration.test.ts` e `document-processing-stage-observability.test.ts`. Cobrem roteamento exclusivo de `KNOWLEDGE_BASE`, elegibilidade de fallback, persistência/reuso, embedding e deduplicação do watchdog.

Comandos de regressão da spec:

```bash
cd services/document-parser && UV_CACHE_DIR=/tmp/meumonitorai-docling-uv-cache uv run python -m unittest discover -s tests -p 'test_*.py' -v
cd backend && npm run typecheck && npx prisma validate
cd backend && node --import tsx --test src/worker/services/doc-chunker/__tests__/doc-chunker.client.test.ts src/repositories/__tests__/document-worker.docling-chunks.test.ts src/repositories/__tests__/document-processing-job.stage.test.ts src/repositories/__tests__/knowledge-retrieval.docling.test.ts src/worker/services/__tests__/document-worker.doc-chunker.test.ts src/worker/services/__tests__/document-processing-stage-observability.test.ts
```

O rollout Railway, aplicação da migration no banco remoto e validação de embeddings reais são verificações operacionais posteriores; a suíte local não as simula.

## Referências técnicas

- [Docling: chunking e `contextualize`](https://docling-project.github.io/docling/concepts/chunking/)
- [Docling: exemplo de `HybridChunker` e tokenizer](https://docling-project.github.io/docling/_generated/examples/hybrid_chunking/)
- [Qwen3-Embedding-8B: tokenizer do modelo](https://huggingface.co/Qwen/Qwen3-Embedding-8B)
- Código local: `services/document-parser/scripts/docling_http_service.py`, `backend/src/worker/services/document-worker.service.ts`, `backend/src/worker/services/chunk.service.ts`, `backend/src/repositories/document-worker.repository.ts`.
