# Imagens de PDFs e do chat — plano de implementação e avaliação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** extrair e armazenar imagens de PDFs, vinculá-las a chunks e questões, aceitar fotos do aluno no chat e medir se a IA recebeu e compreendeu o contexto visual correto.

**Architecture:** o serviço Python exporta texto e recortes do mesmo parse em um pacote v2. O worker valida, guarda os bytes em Storage privado, persiste os vínculos e indexa descrições factuais. O chat seleciona imagens pela questão autorizada ou por recuperação de conhecimento, combina-as com anexos do aluno e envia conteúdo multimodal a um modelo com visão.

**Tech Stack:** Docling/Python, Fastify/Node/TypeScript, Prisma/Postgres, Supabase Storage, Redis, OpenRouter, frontend Next.js.

**Spec:** [`docs/processamentopdf/specs/2026-10-27-chat-multimodal-document-images-design.md`](../specs/2026-10-27-chat-multimodal-document-images-design.md)

**Spec de avaliação posterior:** [`docs/processamentopdf/specs/2026-10-27-avaliacao-qualidade-imagens-questoes-design.md`](../specs/2026-10-27-avaliacao-qualidade-imagens-questoes-design.md). Tarefas 1–7 implementam o fluxo; a tarefa 8 executa a avaliação ponta a ponta após a implementação. Testes unitários e de contrato continuam nas tarefas 1–7.

## Global Constraints

- Preservar `/chunk` v1 e mensagens de chat somente textuais; ativar visual por configuração reversível.
- Parser sem credenciais Supabase; worker valida hashes do PDF e de cada asset antes de persistir.
- Assets de PDF em `document-parser-artifacts` privado; anexos do aluno em `chat-attachments` privado com expiração máxima de 24 horas.
- Upload do chat: 1 imagem, até 5 MiB, JPEG/PNG/WebP, até 4096 × 4096 pixels antes da normalização.
- Toda leitura de imagem valida aluno, monitor, matéria e documento/questão; não registrar bytes, base64 ou URLs assinadas.
- O contexto da questão anexada prevalece sobre o RAG geral; follow-up recarrega questão e imagens autorizadas.
- Antes de editar o frontend Next.js, ler o guia relevante em `frontend/node_modules/next/dist/docs/`, conforme `AGENTS.md`.
- Não habilitar em produção até medir o corpus da spec de avaliação e registrar numerador/denominador dos gates.

## Arquivos e limites de responsabilidade

| Área | Arquivos principais | Papel |
| --- | --- | --- |
| Parser | `services/document-parser/scripts/doc_chunker.py`, `docling_http_service.py`, novo `visual_asset_export.py` | Extrair recortes e manifesto v2 do mesmo parse. |
| Transporte | `backend/src/worker/services/doc-chunker/doc-chunker.client.ts`, novo `doc-chunker-v2.client.ts` | Receber pacote, limitar descompressão e validar hashes/contrato. |
| Persistência | `backend/prisma/schema.prisma`, nova migration, `document-parser.repository.ts`, novo `document-visual-asset.repository.ts` | Assets, vínculos e idempotência. |
| Indexação | novo `backend/src/worker/services/document-visual-indexing.service.ts` | Descrição factual e chunk visual com embedding. |
| Seleção no chat | `backend/src/modules/chat/rag/`, novo `chat-visual-context.service.ts` | Resolver questão, fontes e imagens autorizadas. |
| Upload do aluno | `backend/src/modules/chat/chat.routes.ts`, novo `chat-image-attachment.repository.ts` | Upload privado, preview, expiração e autorização. |
| Modelo | `backend/src/modules/chat/models/chat-generation.model.ts`, `chat-prompt.builder.ts`, `openrouter-chat.gateway.ts`, `backend/src/worker/client/openrouter.client.ts` | Partes de texto e imagem no request. |
| Interface | `frontend/src/modules/student/components/StudentRightSidebar.tsx`, `StudentContext.tsx` | Arquivo real, miniatura, envio, retry e histórico. |
| Qualidade | `tests/document-parser/visual-quality/`, novo `backend/src/scripts/evaluate-visual-chat.ts` | Gold set, manifesto do prompt, relatório e comparação com baseline. |

## Review Focus

1. Duas questões e figuras na mesma página: nenhuma figura pode ser atribuída à questão vizinha; teste na tarefa 3.
2. Follow-up “e nessa figura?” após outra questão: usar só o contexto autorizado do turno certo; teste na tarefa 5.
3. Upload com MIME falso/arquivo corrompido ou ID de outro aluno: rejeitar sem enviar ao modelo; teste na tarefa 6.
4. Falha após upload e antes do commit: asset não vira fonte válida e objeto órfão é reconciliado; teste na tarefa 2.
5. Modelo sem visão ou crop ausente: erro explícito/limitação honesta, nunca resposta que afirme ter visto a imagem; testes nas tarefas 5 e 7.

---

### Task 1 — Parser Docling e contrato v2

**Arquivos:** criar `services/document-parser/scripts/visual_asset_export.py`; modificar `doc_chunker.py`, `docling_http_service.py`, `run_mineru.py`; criar `services/document-parser/tests/test_visual_asset_export.py` e ampliar `test_http_server.py`.

**Interface produzida:** `export_visual_assets(document, pdf_hash) -> list[VisualAssetArtifact]`; pacote ZIP contém `manifest.json` com `schema_version: doc-chunker/v2` e arquivos `assets/<assetKey>.png`. O v1 conserva a resposta JSON atual.

- [x] Escrever teste que converte PDF com figura, lê o pacote e verifica página, `source_item_ref`, bbox, legenda, SHA-256 e bytes decodificáveis; incluir PDF sem imagem e imagem ausente com warning.
- [x] Executar `cd services/document-parser && uv run python -m unittest tests/test_visual_asset_export.py tests/test_http_server.py -v`; confirmar falha antes da implementação.
- [x] Habilitar opções de imagem do Docling; exportar recortes e manifesto do mesmo documento convertido, com IDs determinísticos e limites de contagem/bytes.
- [x] Reexecutar o comando e confirmar sucesso. Medir páginas, quantidade de imagens, dimensões, bytes e warnings sem imprimir conteúdo visual.

### Task 2 — Transporte validado e persistência privada

**Arquivos:** criar `backend/src/worker/services/doc-chunker/doc-chunker-v2.client.ts` e teste correspondente; modificar `backend/prisma/schema.prisma`, criar migration, criar `backend/src/repositories/document-visual-asset.repository.ts` e `backend/src/worker/services/document-visual-asset-cleanup.service.ts`; modificar `backend/src/worker/services/document-worker.service.ts`.

**Interface produzida:** `DocChunkerV2Client.chunkWithAssets(input) -> { chunks, assets, warnings, docHash }`; `persistVisualParseRun(input) -> { parseRunId, assetIdsByKey }`. Adicionar `sourceKey` idempotente em `DocumentVisualAsset`, `DocumentChunkVisualAsset` e `QuestionVisualAsset` com FKs e método/confiança.

- [x] Escrever testes de pacote válido, hash divergente, path malicioso, ZIP expandido acima do limite, retry idempotente e upload que falha antes do commit.
- [x] Rodar testes focados com `cd backend && node --import tsx --test src/worker/services/doc-chunker/__tests__/doc-chunker-v2.client.test.ts src/repositories/__tests__/document-visual-asset.repository.test.ts`; confirmar falha inicial.
- [x] Implementar validação do pacote e persistência no bucket privado `document-parser-artifacts`; reuso por hash/configuração, estados de parse run e reconciliação de órfãos.
- [x] Reexecutar testes e `cd backend && npm run typecheck`; confirmar sucesso.

### Task 3 — Vincular imagem ao chunk e à questão certa

**Arquivos:** criar `backend/src/worker/services/document-visual-linking.service.ts` e testes; modificar `document-worker.service.ts`, `question-extraction.service.ts` e `document-visual-asset.repository.ts`.

**Interface produzida:** `linkVisualAssetsToChunks(parseRunId, chunks) -> LinkReport`; `linkVisualAssetsToQuestions(documentId, questionSpans) -> LinkReport`, com `linked`, `ambiguous`, `missing` e métodos `ITEM_REF`, `BBOX`, `CAPTION`, `PAGE_CANDIDATE`.

- [x] Testar vínculo por `self_ref`, bbox e ordem de leitura; testar duas questões/duas figuras na mesma página, questão entre páginas e `VISUAL_PENDING` sem imagem confiável.
- [x] Confirmar falha com `cd backend && node --import tsx --test src/worker/services/__tests__/document-visual-linking.service.test.ts`.
- [x] Associar apenas vínculos verificáveis; página isolada gera candidato para revisão. Persistir o vínculo após criação do `QuestionSpan`/`Question`, sem depender de `DOCUMENT_TEXT_SOURCE` para PDFs `QUESTIONS`.
- [x] Reexecutar testes e verificar contagens por página: detectadas, ligadas, ambíguas e sem crop.

### Task 4 — Descrição factual e busca de visuais

**Arquivos:** criar `backend/src/worker/services/document-visual-indexing.service.ts` e teste; modificar `backend/src/repositories/knowledge-retrieval.repository.ts`, `backend/src/modules/chat/rag/providers/knowledge-retrieval-chat.provider.ts`.

**Interface produzida:** `describeAndIndexAsset(assetId) -> { descriptionStatus, visualChunkId }`; busca retorna asset IDs e páginas ligados ao chunk, sem bytes no resultado SQL.

- [x] Testar descrição com labels/eixos visíveis, descrição com incerteza, falha do modelo seguida de retry e recuperação do asset pelo texto da descrição.
- [x] Confirmar falha com testes focados `node --import tsx --test` no diretório `backend`.
- [x] Implementar prompt factual e chunk visual embeddado com Qwen; registrar modelo/versão. Falha de descrição não apaga o asset e sinaliza cobertura incompleta.
- [x] Reexecutar testes; confirmar que um PDF sem figuras segue recuperável por texto.

### Task 5 — Contexto da questão, follow-up e seleção visual no RAG

**Arquivos:** criar `backend/src/modules/chat/rag/services/chat-visual-context.service.ts` e teste; modificar `chat.service.ts`, `chat-context-resolver.service.ts`, `chat-context.assembler.ts`, `chat-rag.model.ts` e o provider de evidência da questão.

**Interface produzida:** `resolveVisualContext({ scope, currentQuestionId, resolvedAttachment, rag, studentImageIds }) -> { text, images, contextManifest }`; cada imagem tem origem, asset/anexo ID, página e hash.

- [x] Testar pergunta direta sobre a questão, follow-up “e nessa figura?”, troca de questão, fonte sem imagem, figura ambígua e imagem expirando entre busca e geração.
- [x] Confirmar falha com `cd backend && node --import tsx --test src/modules/chat/rag/services/__tests__/chat-visual-context.service.test.ts src/modules/chat/services/__tests__/chat.service.test.ts`.
- [x] Recarregar questão/enunciado/alternativas e assets autorizados quando o anexo vier do histórico; selecionar imagem atual do aluno, figura da questão e só depois apoio de conhecimento. Registrar manifesto efetivo sem bytes.
- [x] Reexecutar testes; confirmar que nenhum `slice` textual remove os identificadores das imagens.

### Task 6 — Upload real e histórico de anexos do aluno

**Arquivos:** modificar `backend/src/modules/chat/chat.routes.ts`, `chat-history.model.ts`; criar `backend/src/modules/chat/repositories/chat-image-attachment.repository.ts`, `backend/src/modules/chat/services/chat-image-cleanup.service.ts`, migration/bucket privado e testes; modificar `frontend/src/modules/student/components/StudentRightSidebar.tsx` e `StudentContext.tsx`.

**Interface produzida:** endpoint autenticado de upload retorna `attachmentId`; POST de mensagens aceita `imageAttachmentIds: string[]` com máximo 1; preview exige mesma autorização de escopo. Histórico guarda apenas IDs/metadados.

- [x] Testar arquivo real, MIME falso, bytes corrompidos, limite 5 MiB, dimensão, escopo forjado, retry idempotente, preview e expiração/limpeza.
- [x] Escrever os testes de validação e interface antes de concluir a mudança. Ler o guia Next.js relevante em `node_modules/next/dist/docs/` antes de editar o frontend.
- [x] Implementar upload com `@fastify/multipart`, validação com `sharp`, storage privado, registro com `expiresAt`, coleta por expiração e UI com miniatura/remoção.
- [x] Reexecutar testes focados e `npm run typecheck` em `backend` e `frontend`.

### Task 7 — Payload multimodal e modelo com visão

**Arquivos:** modificar `backend/src/modules/chat/models/chat-generation.model.ts`, `services/chat-prompt.builder.ts`, `providers/openrouter-chat.gateway.ts`, `backend/src/worker/client/openrouter.client.ts`, `backend/src/config/ai-models.config.ts`; ampliar testes desses módulos.

**Interface produzida:** `ChatPromptMessage.content: string | ChatContentPart[]`, com `text` e `image_url`; mensagens sem imagem permanecem string. `CHAT_IMAGE_MODEL` seleciona o modelo visual; se ele não aceitar imagem, o erro do provedor vira falha explícita do chat. A capacidade do modelo ainda deve ser confirmada no canário da tarefa 8.

- [x] Testar payload com questão + figura + foto, ordem das partes, bytes privados sem URL pública, modo texto, modelo sem visão e falha de download.
- [x] Confirmar falha com `cd backend && node --import tsx --test src/modules/chat/services/__tests__/chat-prompt.builder.test.ts src/modules/chat/providers/__tests__/openrouter-chat.gateway.test.ts src/worker/client/__tests__/openrouter.client.test.ts`.
- [x] Implementar data URI, limite total do payload, observabilidade sem conteúdo e erro que não afirma leitura visual quando o modelo rejeita a imagem.
- [x] Reexecutar testes e `cd backend && npm run typecheck`.

### Task 8 — Medir compreensão e liberar por canário

**Arquivos:** criar `tests/document-parser/visual-quality/gold.jsonl`, `backend/src/scripts/evaluate-visual-chat.ts` e README do corpus; atualizar `docs/processamentopdf/README.md` e `docs/processamentopdf/questoes.md` com resultados medidos.

**Interface produzida:** `evaluate-visual-chat.ts --corpus <gold.jsonl> --observations <run.jsonl> --output <results.jsonl> --report <report.md>` valida observações correlacionadas do ambiente de teste e grava resultados/relatório com extração, associação, `recall@8`, hashes efetivamente anexados, resposta, rubrica humana, latência e custo. Credenciais e URLs de serviços não entram nos arquivos.

- [ ] Anotar ao menos 20 casos de figura obrigatória, gráfico, tabela, fórmula, foto, sem imagem, imagem ilegível, duas figuras na página, follow-up, troca de questão e imagem distratora. O piloto Q01 está anotado; registrar fatos visuais exigidos e afirmações proibidas.
- [x] Fazer teste do avaliador: reprovar resposta correta por conhecimento geral sem fatos visuais, detectar asset errado e resposta que afirma ter visto imagem ausente; manter caso sem rubrica como pendente.
- [ ] Rodar `cd backend && node --import tsx src/scripts/evaluate-visual-chat.ts --corpus ../tests/document-parser/visual-quality/gold.jsonl --observations ../tests/document-parser/visual-quality/run-observations.jsonl --output ../tests/document-parser/visual-quality/results.jsonl --report ../tests/document-parser/visual-quality/report.md` no ambiente de teste; publicar numerador/denominador, modelo/prompt, falhas por etapa e comparação pareada com fluxo textual atual. O smoke local comprova a extração da imagem Q01 pelo parser, mas não mede associação, entrega ao chat ou resposta.
- [ ] Usar os gates da spec de avaliação para decidir o canário: zero imagem de outra questão/escopo, 100% dos casos críticos com contexto entregue, `recall@8 >= 90%`, resposta visual/contextual correta em `>= 90%` dos casos rotulados. Falha em gate bloqueia ampliação e gera diagnóstico específico.
- [ ] Ativar por configuração no canário, inspecionar eventos e repetir o corpus após alteração de parser, modelo ou prompt.

## Autorrevisão de cobertura

- Extração, persistência, deduplicação e limpeza: tarefas 1–2 e 6.
- Vínculo com chunks/questões e busca: tarefas 3–4.
- Questão contextual, follow-up, autorização e payload multimodal: tarefas 5–7.
- Qualidade da **resposta** e não apenas da extração: tarefa 8 e a spec separada de avaliação.
- As metas são gates propostos. Não há resultado medido para o novo fluxo até executar a tarefa 8.
