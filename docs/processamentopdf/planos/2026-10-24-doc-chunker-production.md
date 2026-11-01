# Doc-chunker para ingestão da base de conhecimento — Plano de implementação

> **Para agentes:** executar este plano etapa por etapa, com testes focados antes de avançar. A spec revisada está em `docs/processamentopdf/specs/2026-10-24-doc-chunker-production-design.md`.

**Objetivo:** produzir chunks Docling contextualizados, citações por página e embeddings para documentos `KNOWLEDGE_BASE`, com fallback PDF.js controlado e falhas identificáveis.

**Arquitetura:** o container Python recebe um PDF por `POST /chunk`, converte uma vez com Docling, aplica `HybridChunker` e devolve um contrato versionado com proveniência. O worker Node valida a resposta, persiste o conjunto de chunks atomicamente e reutiliza o `EmbeddingService`; em `auto`, seleciona PDF.js somente após uma falha Docling elegível e antes de persistir chunks Docling.

**Stack:** Python 3.12, Docling 2.122.0, `HybridChunker`, Fastify/Node, Prisma/PostgreSQL, BullMQ/Redis, OpenRouter embeddings e Railway.

**Spec:** `docs/processamentopdf/specs/2026-10-24-doc-chunker-production-design.md`

## Restrições globais

- Aplicar Docling somente a `KNOWLEDGE_BASE`; `QUESTIONS` e `FLASHCARDS` permanecem no pipeline atual.
- O worker baixa o arquivo do Storage; o serviço Python recebe multipart e não aceita URL fornecida pelo cliente.
- A primeira versão só responde depois de converter, validar e serializar o JSON completo; não usar o streaming atual de espaços.
- O `request_id` é um UUID novo por chamada HTTP; worker envia `X-Request-Id`, Python devolve o mesmo ID no cabeçalho e no campo JSON.
- `text` contextualizado alimenta `embeddingContent`; `raw_text` alimenta `content` e citações.
- O Python usa o tokenizer fixado na imagem; a dimensão do embedding continua 2048 e deve ser conferida nas variáveis Railway antes do rollout.
- Nenhum PDF, texto de chunk, vetor, credencial, URL assinada ou resposta JSON integral pode aparecer em logs.
- `DOCUMENT_TEXT_SOURCE` começa em `pdfjs`; habilitar `docling` em homologação e `auto` em produção somente após os critérios de aceite.
- Erros posteriores à gravação reutilizam chunks pendentes; troca de engine/version não mistura lotes nem remove fontes protegidas.
- Mudanças locais fora dos arquivos deste plano não entram na imagem nem na migration.

## Review Focus

- Conversão que falha depois do limite de streaming antigo: responder JSON de erro identificável, nunca HTTP 200 com corpo vazio — teste da exceção tardia no servidor Python.
- Resposta interrompida ou JSON válido com contrato incorreto: classificar como corpo interrompido ou erro de contrato e não persistir chunks — testes do cliente e validação.
- PDF escaneado sem OCR ou PDF sem texto convertível: retornar `OCR_REQUIRED`/`NO_EXTRACTABLE_TEXT`, sem sucesso vazio — testes de conversão e fallback.
- Retry após persistência ou falha de embeddings: reutilizar o lote identificado por `source_key`, sem duplicar chunks, misturar engines ou remover fontes ligadas — testes de repositório/worker.
- Chunk Docling sem `blockId`: permitir recuperação e citação por página sem regressão nos fluxos de questões/flashcards — testes do repositório de retrieval e provedores RAG.

---

### Task 1: Contrato HTTP, correlação e respostas de falha

**Files:**
- Modify: `services/document-parser/scripts/docling_http_service.py`
- Modify: `services/document-parser/tests/test_http_server.py`
- Modify: `services/document-parser/README.md`
- Create: `backend/src/worker/services/doc-chunker/doc-chunker.client.ts`
- Create: `backend/src/worker/services/doc-chunker/__tests__/doc-chunker.client.test.ts`
- Modify: `backend/src/config/env.ts`

**Interfaces:**
- `DocChunkerRequest`: `documentId`, `requestId`, `expectedSha256`, `fileName`, `mimeType`, `fileBytes`.
- `DocChunkerResponse`: `schema_version: 'doc-chunker/v1'`, `request_id`, `status: 'completed'`, `doc_hash`, `engine`, `parser_version`, `tokenizer_id`, `chunker_version`, `page_count`, `chunks`.
- `DocChunkerClient.chunk(input): Promise<DocChunkerResponse>` valida status HTTP, resposta integral, `X-Request-Id`, hash e schema antes de retornar.

- [ ] **Step 1: Escrever testes de contrato que falham**
  - Python: `test_streamed_parser_exception_returns_json_error` força a conversão a falhar depois de 250 ms e exige JSON com `status=failed`, código tipado e `request_id` correto.
  - Python: `test_post_chunk_echoes_request_id_and_rejects_hash_mismatch` confere cabeçalho/campo de resposta e rejeição antes da conversão.
  - TypeScript: verificar HTTP 200 com JSON truncado, JSON fora do schema, hash divergente e `X-Request-Id` divergente.
- [ ] **Step 2: Executar os testes focados e confirmar falha**
  - Run: `cd services/document-parser && UV_CACHE_DIR=/tmp/meumonitorai-docling-uv-cache uv run python -m unittest tests.test_http_server.DoclingHttpServiceTests.test_streamed_parser_exception_returns_json_error -v`
  - Run: `cd backend && node --import tsx --test src/worker/services/doc-chunker/__tests__/doc-chunker.client.test.ts`
- [ ] **Step 3: Remover a resposta prematura do caminho Python**
  - `GET /health` continua verificando o processo; adicionar `GET /ready` para recursos inicializados.
  - `POST /chunk` envia status/cabeçalhos depois da serialização integral, converte exceções em envelope JSON com status HTTP correspondente e ecoa `X-Request-Id` mais `request_id`.
  - Limitar bytes, duração e concorrência por configuração; emitir `request_completed` só depois de escrever o corpo completo.
- [ ] **Step 4: Implementar o cliente Node**
  - Criar UUID por tentativa, usar um `AbortController` para upload, cabeçalhos e leitura do corpo, e produzir códigos distintos para HTTP, timeout, rede, corpo interrompido e contrato inválido.
  - Não registrar corpo nem trechos da resposta.
- [ ] **Step 5: Reexecutar os testes focados e typecheck**
  - Expected: todos os casos do contrato passam; `npm run typecheck` em `backend` passa.

### Task 2: Conversão Docling, tokenizer, OCR e `HybridChunker`

**Files:**
- Create: `services/document-parser/scripts/doc_chunker.py`
- Modify: `services/document-parser/scripts/docling_http_service.py`
- Modify: `services/document-parser/pyproject.toml`
- Modify: `services/document-parser/uv.lock`
- Modify: `services/document-parser/tests/test_http_server.py`
- Create: `services/document-parser/tests/test_doc_chunker.py`

**Interfaces:**
- `DocChunkerService.chunk(file_name: str, payload: bytes, request_id: str, expected_sha256: str) -> dict[str, object]` retorna somente o contrato `doc-chunker/v1`.
- Inicializar uma instância reutilizável do converter, tokenizer e chunker por processo; compartilhar a análise atual da camada de texto e a política explícita de OCR.

- [ ] **Step 1: Escrever testes para saída e casos-limite**
  - Validar `contextualize` em `text`, texto original em `raw_text`, token count do texto contextualizado, índices contíguos e páginas 1-based sem duplicatas.
  - Testar texto, tabela, conteúdo misto, PDF escaneado sem OCR e conversão sem texto extraível.
  - Testar chunk maior que o limite, resposta acima do limite e proveniência sem bbox/página.
- [ ] **Step 2: Executar os testes de chunker e confirmar falha**
  - Run: `cd services/document-parser && UV_CACHE_DIR=/tmp/meumonitorai-docling-uv-cache uv run python -m unittest tests.test_doc_chunker -v`
- [ ] **Step 3: Implementar conversão e chunking**
  - Fixar Docling 2.122.0, tokenizer Qwen3 Embedding 8B e revisão do tokenizer na imagem.
  - Usar `HybridChunker(max_tokens=500, merge_peers=True)` como ponto de partida; contar `text` contextualizado com o tokenizer declarado.
  - Responder `OCR_REQUIRED` ou `NO_EXTRACTABLE_TEXT` quando aplicável; não gerar chunk vazio ou acima do limite.
  - Emitir logs por validação, camada de texto/OCR, conversão, chunking e serialização, agregando contagens sem imprimir conteúdo.
- [ ] **Step 4: Executar suíte Python do serviço**
  - Run: `cd services/document-parser && UV_CACHE_DIR=/tmp/meumonitorai-docling-uv-cache uv run python -m unittest discover -s tests -p 'test_*.py' -v`
- [ ] **Step 5: Validar construção da imagem Python**
  - Run: `docker build -t meumonitorai-doc-chunker:local -f services/document-parser/Dockerfile services/document-parser`
  - Expected: build inclui tokenizer fixado e `/health`/`/ready` sem download no primeiro PDF.

### Task 3: Schema de chunks, migration e persistência atômica

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_docling_chunks/migration.sql`
- Modify: `backend/src/repositories/document-worker.repository.ts`
- Create: `backend/src/repositories/__tests__/document-worker.docling-chunks.test.ts`

**Interfaces:**
- `DoclingChunkInput`: campos validados do contrato, incluindo `index`, `text`, `rawText`, `headings`, `pages`, `type`, `tokens`, `provenance`.
- `saveDoclingChunks(documentId, expectedHash, chunks): Promise<{ savedCount: number; reused: boolean }>` valida autoridade do documento no backend, a chave de origem e troca o conjunto em uma transação.

- [ ] **Step 1: Escrever testes de repositório**
  - Provar que hash/índice inválido não altera chunks existentes; um lote válido grava todos os campos e deixa todos em `EMBEDDING_PENDING`.
  - Provar retry idempotente por `source_key` composto de documento, hash, engine, chunker version e índice.
  - Provar que `teacherId`, `monitorId` e `subjectId` vêm do documento no banco, nunca do payload Python.
  - Provar que vínculos protegidos impedem substituição e que rollback preserva o lote anterior.
- [ ] **Step 2: Executar testes focados e confirmar falha**
  - Run: `cd backend && node --import tsx --test src/repositories/__tests__/document-worker.docling-chunks.test.ts`
- [ ] **Step 3: Adicionar metadados e migration**
  - Persistir páginas, títulos, tipo, engine, tokenizer, chunker version, provenance, hash e `source_key` com unique index.
  - Preservar schema e comportamento dos chunks legados e não alterar as relações de questões/flashcards nesta etapa.
- [ ] **Step 4: Implementar `saveDoclingChunks` e validação do lote**
  - Validar contagens/índices/páginas novamente no backend antes da transação.
  - Só substituir o conjunto atual depois que o lote integral passar; atualizar o estado operacional do documento no mesmo commit.
- [ ] **Step 5: Validar Prisma e testes do repository**
  - Run: `cd backend && npx prisma validate`
  - Expected: migration e schema válidos; testes demonstram atomicidade e idempotência.

### Task 4: Compatibilidade RAG e citações sem `blockId`

**Files:**
- Modify: `backend/src/repositories/knowledge-retrieval.repository.ts`
- Modify: `backend/src/worker/services/hybrid-retrieval.service.ts`
- Modify: `backend/src/modules/chat/rag/providers/knowledge-retrieval-chat.provider.ts`
- Modify: `backend/src/modules/chat/rag/services/chat-context.assembler.ts`
- Create: `backend/src/repositories/__tests__/knowledge-retrieval.docling.test.ts`
- Modify: `backend/src/modules/chat/rag/providers/__tests__/knowledge-retrieval-chat.provider.test.ts`
- Modify: `backend/src/modules/chat/rag/services/__tests__/chat-context.assembler.test.ts`

**Interfaces:**
- Resultados de conhecimento expõem `chunkId`, `pageStart`, `pageEnd`, `pages`, `headings`, `engine` e `blockId: string | null`.
- Questões e flashcards mantêm as citações e vínculos atuais por bloco.

- [ ] **Step 1: Adicionar testes para chunks sem bloco**
  - `knowledge-retrieval.docling.test.ts`: busca retorna chunk `blockId=null`, citação por página e filtros de professor/monitor/matéria.
  - `knowledge-retrieval-chat.provider.test.ts`: propaga `chunkId`, páginas e títulos sem inventar bloco.
  - `chat-context.assembler.test.ts`: monta citação Docling e mantém citações por bloco.
- [ ] **Step 2: Executar os testes focados e confirmar falha**
  - Run: `cd backend && node --import tsx --test src/repositories/__tests__/knowledge-retrieval.docling.test.ts src/modules/chat/rag/providers/__tests__/knowledge-retrieval-chat.provider.test.ts src/modules/chat/rag/services/__tests__/chat-context.assembler.test.ts`
- [ ] **Step 3: Atualizar consultas e montagem de citações**
  - Permitir resultado baseado diretamente em `DocumentChunk` quando não houver bloco; não fabricar `blockId`.
  - Propagar páginas/títulos até a resposta RAG e manter o comportamento legado.
- [ ] **Step 4: Reexecutar retrieval/citation tests**
  - Expected: chunks Docling são recuperáveis/citáveis e os testes de questões/flashcards permanecem verdes.

### Task 5: Worker, modos de fonte, fallback e embeddings

**Files:**
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/worker/services/document-worker.service.ts`
- Modify: `backend/src/worker/services/embedding.service.ts` somente para telemetria/retry que faltar.
- Modify: `backend/src/worker/worker.ts` se o watchdog for integrado ao ciclo de vida do worker.
- Create: `backend/src/worker/services/__tests__/document-worker.doc-chunker.test.ts`
- Modify: `backend/src/worker/services/__tests__/document-worker.service.test.ts`

**Interfaces:**
- `DOCUMENT_TEXT_SOURCE: 'pdfjs' | 'docling' | 'auto'`, default `pdfjs`.
- O worker usa `DocChunkerClient.chunk` apenas para `KNOWLEDGE_BASE`; `QUESTIONS` e `FLASHCARDS` mantêm o parser atual.
- `docling` propaga falha tipada; `auto` escolhe PDF.js apenas para falha transitória elegível e somente antes de qualquer persistência Docling.

- [ ] **Step 1: Escrever testes de roteamento e fallback**
  - Testar modos `pdfjs`, `docling`, `auto`; PDF inválido, hash divergente, `OCR_REQUIRED`, timeout, 5xx, corpo interrompido e contrato inválido.
  - Provar que `QUESTIONS`/`FLASHCARDS` não chamam doc-chunker.
  - Provar que erro de embedding retoma chunks pendentes sem reconverter e que fallback nunca mistura lotes.
- [ ] **Step 2: Executar testes de worker e confirmar falha**
  - Run: `cd backend && node --import tsx --test src/worker/services/__tests__/document-worker.doc-chunker.test.ts`
- [ ] **Step 3: Implementar configuração e seleção de fonte**
  - Validar URL/timeout/valores no boot; configuração incompatível falha cedo.
  - Manter `embeddingContent` como entrada do provedor e validar dimensão 2048.
  - Gravar engine efetiva e versão com o lote para retry/reprocessamento.
- [ ] **Step 4: Reexecutar testes e typecheck do backend**
  - Run: `cd backend && npm run typecheck`
  - Expected: todos os casos de seleção, fallback e retomada passam.

### Task 6: Logs correlacionados e watchdog de etapas travadas

**Files:**
- Modify: `backend/src/worker/services/document-worker.service.ts`
- Modify: `backend/src/repositories/document-processing-job.repository.ts`
- Modify: `services/document-parser/scripts/docling_http_service.py`
- Modify: `backend/src/worker/services/document-parser/document-parse-orchestrator.service.ts` apenas nos fluxos de `QUESTIONS`/`FLASHCARDS` que permanecerem no parser atual.
- Create: `backend/src/worker/services/__tests__/document-processing-stage-observability.test.ts`
- Modify: `backend/src/repositories/__tests__/document-worker.repository.test.ts` para consultar o estado seguro do estágio ativo.

**Interfaces:**
- Campos comuns JSON: `event`, `timestamp`, `service`, `environment`, `service_version`, `request_id`, `document_id`, `job_id`, `job_attempt`, `stage`, `outcome`.
- O snapshot de `DocumentProcessingJob` guarda somente `current_stage`, `request_id` e `stage_started_at`; nunca conteúdo do documento.
- Watchdog emite `document_stage.stalled` uma vez por `job_id`/tentativa/etapa se o limite configurado mais 30 segundos expirar.

- [ ] **Step 1: Escrever testes para eventos e watchdog**
  - Testar que cada estágio normal/falha tem no máximo um terminal e que o request id é igual entre worker, Python e resposta.
  - Simular job `PROCESSING` vencido e confirmar `document_stage.stalled` deduplicado.
  - Capturar logs e provar ausência de texto, filename pessoal, vetor, URL e credenciais.
- [ ] **Step 2: Executar testes focados e confirmar falha**
  - Run: `cd backend && node --import tsx --test src/worker/services/__tests__/document-processing-stage-observability.test.ts src/repositories/__tests__/document-worker.repository.test.ts`
  - Run: `cd services/document-parser && UV_CACHE_DIR=/tmp/meumonitorai-docling-uv-cache uv run python -m unittest tests.test_http_server -v`
- [ ] **Step 3: Instrumentar limites e durações**
  - Medir duração local com relógio monotônico; usar UTC somente para timestamp/correlação entre serviços.
  - Registrar duração até cabeçalhos e até corpo; só declarar `request_completed` após leitura e validação.
  - Emitir eventos por etapa Python e worker, métricas agregadas de RSS/in-flight e logs de boot.
- [ ] **Step 4: Implementar watchdog durável**
  - Atualizar o snapshot antes de iniciar estágio; watchdog consulta apenas jobs ainda `PROCESSING`, usa timeout configurado por etapa, emite um evento de stall deduplicado e não altera o resultado do documento.
- [ ] **Step 5: Reexecutar testes de observabilidade**
  - Expected: um operador consegue correlacionar sucesso/falha por IDs e detectar estágio travado sem inferir falha de conversão.

### Task 7: Rollout, configuração e reversão

**Files:**
- Modify: `services/document-parser/README.md`
- Modify: `backend/.env.example`
- Create: `docs/processamentopdf/operacao/doc-chunker-rollout.md`
- Modify: `services/document-parser/Dockerfile` somente para pré-carregar o tokenizer e validar `/ready` na imagem.

**Interfaces:**
- Configuração Railway documentada: `DOCUMENT_TEXT_SOURCE`, URL interna, timeout, concorrência, limite de bytes, OCR e modelo/dimensão efetivos.
- Health check Railway usa `/health`; worker registra estado `/ready` para diagnóstico.

- [ ] **Step 1: Documentar valores e rollout em cada ambiente**
  - Confirmar variáveis de embeddings no Railway antes de definir o tokenizer final.
  - Registrar como executar migration, health/readiness check, canário, critérios de parada e rollback para `pdfjs`.
- [ ] **Step 2: Build e verificação das imagens**
  - Build imagem Python e imagem do worker a partir de contextos limpos; garantir que não incluam `.env` nem mudanças fora deste plano.
- [ ] **Step 3: Executar migration e implantar em homologação na ordem segura**
  - Aplicar primeiro a migration aditiva (`cd backend && npm run prisma:deploy`); implantar Python e validar `/health`/`/ready`; implantar worker com `DOCUMENT_TEXT_SOURCE=pdfjs`; habilitar `docling` somente após a verificação do worker.
- [ ] **Step 4: Executar verificação integrada de homologação**
  - PDFs textuais, mistos, escaneados, longos, tabelas, fórmulas, PDF inválido, interrupção HTTP e indisponibilidade do provedor de embeddings.
- [ ] **Step 5: Rollout gradual**
  - `pdfjs` como padrão; canário `docling` em homologação; `auto` em produção após qualidade, custo, memória, fallback e recuperação aprovados.
- [ ] **Step 6: Confirmar rollback operacional**
  - Alterar novos jobs para `pdfjs`; jobs já iniciados mantêm a fonte registrada; nenhum lote parcial é removido.

## Revisão de cobertura

- O contrato HTTP, `/ready`, validação de hash e resposta completa são cobertos pelas Tasks 1–2.
- Tokenizer, OCR, chunking, proveniência e limites são cobertos pela Task 2.
- Persistência, isolamento de tenant, idempotência e proteção de fontes são cobertos pela Task 3.
- RAG/citações sem `blockId` e compatibilidade de questões/flashcards são cobertos pela Task 4.
- Configuração de fonte, fallback, retry e embeddings são cobertos pela Task 5.
- Correlação, logs privados, OOM/restart e alerta de etapa travada são cobertos pela Task 6.
- Build, canário, aceitação e rollback são cobertos pela Task 7.

## Revisão

- Não misturar o deploy deste trabalho com a feature assíncrona de materialização do acervo ou outras mudanças locais.
- Migration e imagem do worker são implantadas em ordem compatível; só habilitar `docling` depois que o serviço e schema estiverem prontos.
- Não declarar pronto até todos os critérios de aceite da spec e os fluxos de regressão de questões/flashcards passarem.

## Registro TDD da implementação

- HTTP/client: testes RED→GREEN para falha tardia sem JSON, hash/ID, contrato inválido, JSON truncado e timeout na leitura do corpo.
- Chunker/OCR: testes RED→GREEN para contexto/raw text, token limit, OCR em PDF misto e normalização de sequências de acento conhecidas. O upload de fixture com Docling real passa.
- Persistência: testes de lote inválido, origem do escopo, reuso após falha de embedding, proteção de referências e `source_key`.
- RAG: testes de busca sem `blockId`, filtro por título, propagação de página/título e montagem de citação.
- Worker/observabilidade: testes de rota exclusiva de `KNOWLEDGE_BASE`, regras de fallback, persistência de estágio, watchdog deduplicado e não exposição de filename/texto nos logs.
- Build local Python concluído e `/health` + `/ready` verificados em container local. Nenhuma migration foi aplicada a banco remoto e nenhuma imagem foi publicada.

**Verificação final local:** suíte Python completa (52 testes, 3 ignorados por modo smoke opt-in), 29 testes Node focados, 6 testes worker com mocks, `npm run typecheck`, `npx prisma validate`, build Docker e smoke `/health`/`/ready` passaram.
