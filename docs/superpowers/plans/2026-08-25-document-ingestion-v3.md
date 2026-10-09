# Document Ingestion V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Every code task MUST use `superpowers:test-driven-development`: write a failing test, run it, implement the minimum, run it green, then refactor without changing behavior.

**Goal:** Evoluir a ingestão de documentos do MeuMonitorAI para reconstruir questões, alternativas, gabaritos, soluções, fórmulas, tabelas e figuras a partir de evidência visual versionada, mantendo fallback para o fluxo legado até a V3 superar o baseline.

**Architecture:** O MinerU permanece isolado atrás de um adaptador parser-neutro. O backend normaliza os outputs em `LayoutDocument`, persiste parse runs e evidências, monta `QuestionSpan`/`QuestionCandidate`, cria `QuestionContextPack` por agente e usa retrieval híbrido apenas para suporte conceitual. O fluxo legado continua ativo durante shadow mode, opt-in e rollout gradual.

**Tech Stack:** Python 3.12, MinerU com versão fixa, Docker, TypeScript, Fastify, BullMQ, Prisma 7, PostgreSQL/Supabase Storage/RLS, Zod, Vitest ou runner existente via `tsx`.

**Spec:** [`2026-09-08-melhoria-v3.md`](2026-09-08-melhoria-v3.md)

## Global Constraints

- O parser visual identifica regiões físicas; o MeuMonitorAI interpreta o papel pedagógico delas.
- O domínio interno não depende do JSON específico do MinerU.
- `QuestionSpan` e `RetrievalChunk` são projeções diferentes da mesma evidência.
- Questões, soluções e gabaritos são associados explicitamente, nunca apenas por vizinhança global.
- Questões estruturalmente inválidas não seguem automaticamente para geração.
- Texto bruto, texto normalizado e conteúdo matemático devem ser preservados separadamente.
- Toda mudança de parser ou modelo deve ser versionada e mensurável.
- O professor continua sendo a autoridade final de publicação.
- O fluxo atual permanece disponível até o novo superar o baseline.
- A primeira entrega não integra simultaneamente MinerU e PaddleOCR, não remove o extrator atual, não publica automaticamente, não corrige OCR matemático de forma irrestrita, não migra todos os documentos sem validação, não usa VLM próprio para figuras complexas e não faz fine-tuning de modelos de layout.
- O gate da Fase 1 exige melhora clara em ordem de leitura e matemática, nenhuma regressão crítica em texto simples, custo/latência aceitáveis e artefatos suficientes para auditoria.
- Todo código novo deve seguir RED-GREEN-REFACTOR; nenhum teste pode ser escrito apenas para confirmar a implementação.
- Não usar `latest` em produção; versões de parser, backend, modelo, imagem e configuração devem ser registradas.

## Mapa de arquivos e responsabilidades

- `services/document-parser/`: serviço isolado e offline do MinerU; não importa Prisma, Supabase ou domínio pedagógico.
- `test/mineru-spike/`: artefatos brutos, manifests, fixtures e relatórios comparativos do spike.
- `test/corpus/`: corpus ouro, anotações e fixtures de regressão do parser/assembler.
- `backend/src/worker/services/document-parser/`: adapter TypeScript, schemas e normalização do `LayoutDocument`.
- `backend/src/worker/services/`: orquestração do parse, montagem pedagógica, chunks e context packs.
- `backend/src/repositories/`: persistência transacional de parse runs, elementos, assets, spans e relações.
- `backend/prisma/schema.prisma`: modelos e enums persistidos.
- `backend/supabase/migrations/`: migrations incrementais para novas entidades, índices, RLS e estados.
- `backend/src/scripts/`: comandos determinísticos de benchmark, shadow mode e regressão.
- `frontend/src/`: revisão visual; só entra depois de evidência persistida e autorização definida.

---

### Task 1: Recuperar e fechar o spike da Fase 1

**Objetivo:** fazer o processamento isolado reproduzir o caso real sem alterar o pipeline produtivo.

**Files:**
- Modify: `services/document-parser/pyproject.toml`
- Modify: `services/document-parser/scripts/run_mineru.py`
- Modify: `services/document-parser/Dockerfile`
- Modify: `services/document-parser/README.md`
- Create: `services/document-parser/tests/test_manifest.py`
- Create: `services/document-parser/tests/test_normalize_content_list.py`
- Modify: `test/mineru-spike/razao-proporcao-e-regra-de-tres/manifest.json`

**Interfaces:**
- `run(args: argparse.Namespace) -> int` mantém status de saída não zero em falha.
- `normalize_content_list(value: Any) -> dict[str, Any]` continua produzindo artefato `spike-v1`.
- O manifesto deve registrar `mineruVersion`, backend, configuração, hardware, duração, warnings, exit code e arquivos.

- [ ] Escrever testes para: uma execução bem-sucedida produz manifesto completo; uma execução com dependência ausente produz erro legível; uma lista MinerU com página, categoria, texto e bbox normaliza para páginas 1-based; conteúdo inválido gera warning sem perder o manifesto.
- [ ] Rodar os testes e observar RED por comportamento ausente ou incorreto.
- [ ] Fixar a versão efetiva do MinerU e dependências transitivas necessárias, incluindo a dependência que causou `ModuleNotFoundError: No module named 'six'`; remover a faixa aberta `mineru>=3.0.0`.
- [ ] Fazer o wrapper resolver o executável pelo mesmo ambiente Python, preservar stdout/stderr e diferenciar falha de comando, timeout e falha do parser.
- [ ] Fazer o Dockerfile instalar exatamente o lock/versões declaradas e documentar a execução Python 3.12.
- [ ] Rodar os testes GREEN e depois executar o PDF de 48 páginas com timeout controlado, preservando os outputs brutos.
- [ ] Atualizar o README com o comando reproduzível, versão fixada e diagnóstico da limitação CPU/GPU do ambiente.
- [ ] Registrar no relatório do subagente se o MinerU completou o PDF, quais artefatos foram produzidos e o pico de memória/tempo observado.

**Gate:** não avançar se o PDF de referência não completar ou se o manifesto não permitir reproduzir e auditar a falha.

### Task 2: Corpus ouro, anotações e baseline do fluxo atual

**Objetivo:** criar a medida de decisão antes de comparar o MinerU com o fluxo existente.

**Files:**
- Create: `test/corpus/README.md`
- Create: `test/corpus/gold/*.json`
- Create: `test/corpus/manifest.json`
- Create: `backend/src/scripts/evaluate-document-ingestion.ts`
- Create: `backend/src/scripts/report-document-ingestion-baseline.ts`
- Create: `test/scripts/test-document-ingestion-evaluation.ts`
- Modify: `backend/package.json`

**Interfaces:**
- `evaluateDocumentIngestion(input: EvaluationInput): EvaluationReport` retorna contagens e métricas estruturais.
- `EvaluationReport` inclui reading order, boundary precision/recall/F1, alternativa, gabarito, solução, fórmula, figura/tabela, false positives editoriais, spans contaminados e custo/latência quando disponíveis.
- O comando de avaliação aceita versão do pipeline e caminho do corpus e grava JSON determinístico.

- [ ] Escrever testes com fixtures literais para: boundary F1; alternativa associada; solução/gabarito; fórmula preservada; candidato editorial falso positivo; questão curta válida não descartada.
- [ ] Rodar os testes e observar RED.
- [ ] Selecionar 40–60 páginas cobrindo os grupos definidos em `2026-09-08-melhoria-v3.md`, incluindo `test/docsTeste/razao-proporcao-e-regra-de-tres.pdf` e as páginas dos chunks problemáticos.
- [ ] Criar anotações ouro com ordem, bbox, tipo, span, statement, alternativas, resposta, solução, fórmulas, assets, section path e `shouldPromote`.
- [ ] Implementar a avaliação sem computar a expectativa usando o próprio código avaliado.
- [ ] Rodar o baseline sobre o fluxo atual e salvar relatório versionado em `test/corpus/results/`.
- [ ] Documentar o comando único que reproduz o baseline e as metas iniciais da especificação.

**Gate:** o mesmo comando deve produzir métricas comparáveis para duas versões do pipeline.

### Task 3: Comparação de backends e decisão de saída da Fase 1

**Objetivo:** decidir com evidência se MinerU entra na V3 e qual backend será usado.

**Files:**
- Create: `services/document-parser/scripts/run-corpus.py`
- Create: `services/document-parser/scripts/collect-runtime-metrics.py`
- Create: `test/mineru-spike/README.md`
- Create: `test/mineru-spike/reports/phase-1-report.json`
- Modify: `services/document-parser/README.md`

- [ ] Escrever teste de integração do runner com um PDF fixture curto, verificando manifesto por documento e falha isolada por item.
- [ ] Rodar o teste e observar RED.
- [ ] Implementar processamento do corpus com diretório por documento, não sobrescrever parse anterior e coletar tempo, tamanho dos artefatos, warnings e memória disponível.
- [ ] Executar backend CPU disponível e backend de maior precisão somente se o hardware oferecer suporte; registrar indisponibilidade como dado, não como sucesso.
- [ ] Comparar outputs MinerU com baseline usando a avaliação da Task 2 e revisar visualmente as páginas problemáticas.
- [ ] Produzir relatório com decisão `PASS`, `FAIL` ou `ALTERNATIVE_ADAPTER_REQUIRED`, incluindo regressões e custo.
- [ ] Se o gate falhar, manter a interface planejada e registrar Docling/PP-StructureV3 como próximo adapter, sem redesenhar o domínio nem iniciar persistência.

**Gate:** só as tarefas seguintes de integração devem ser liberadas com `PASS` documentado.

### Task 4: Contrato neutro `LayoutDocument` e adapter

**Objetivo:** normalizar outputs de qualquer parser sem importar tipos do MinerU no domínio.

**Files:**
- Create: `backend/src/worker/services/document-parser/layout-document.types.ts`
- Create: `backend/src/worker/services/document-parser/layout-document.schema.ts`
- Create: `backend/src/worker/services/document-parser/document-parser.adapter.ts`
- Create: `backend/src/worker/services/document-parser/mineru.adapter.ts`
- Create: `backend/src/worker/services/document-parser/layout-document-normalizer.ts`
- Create: `backend/src/worker/services/document-parser/__tests__/layout-document-normalizer.test.ts`
- Create: `backend/src/worker/services/document-parser/__tests__/mineru.adapter.test.ts`

**Interfaces:**
- `ParserName = 'PDFJS' | 'MINERU' | 'PADDLE' | 'DOCLING'`.
- `LayoutCategory = 'TITLE' | 'TEXT' | 'LIST' | 'TABLE' | 'FIGURE' | 'FORMULA' | 'CAPTION' | 'HEADER' | 'FOOTER' | 'PAGE_NUMBER' | 'FOOTNOTE' | 'UNKNOWN'`.
- `BoundingBox` contém `x0`, `y0`, `x1`, `y1` e `coordinateSpace`.
- `DocumentParserAdapter` expõe `parse(input): Promise<ParseSubmission>`, `getStatus(parseRunId): Promise<ParseStatus>` e `getResult(parseRunId): Promise<LayoutDocument>`.
- `LayoutDocument` preserva schemaVersion, documentId, parseRunId, parser metadata, pages, elements, assets e warnings conforme a especificação.

- [ ] Escrever testes de schema para bbox inválida, página 0/1-based, elemento sem texto permitido, categoria desconhecida, LaTeX preservado e assets referenciados.
- [ ] Rodar RED.
- [ ] Implementar tipos, schema Zod e normalização de coordenadas para `NORMALIZED_1000` sem mutar raw output.
- [ ] Implementar adapter MinerU que consuma apenas o manifesto/artefatos e traduza categorias externas para `LayoutCategory`.
- [ ] Rodar GREEN e `backend` typecheck.

### Task 5: Parse orchestration, idempotência e fallback

**Objetivo:** executar parse assíncrono fora do job BullMQ pesado e integrar o resultado sem perder o legado.

**Files:**
- Create: `backend/src/repositories/document-parse-run.repository.ts`
- Create: `backend/src/worker/services/document-parse-orchestrator.service.ts`
- Modify: `backend/src/queues/document.queue.ts`
- Modify: `backend/src/worker/services/document-worker.service.ts`
- Create: `backend/src/worker/services/__tests__/document-parse-orchestrator.test.ts`
- Modify: `backend/src/worker/services/document-worker.service.test.ts` or create it if absent

- [ ] Escrever testes para chave idempotente por content hash + parser/version/backend/model/config/schema, reuso de parse concluído, timeout, retry transitório, circuit breaker e `FALLBACK_REQUIRED`.
- [ ] Rodar RED.
- [ ] Implementar criação de parse run e jobs assíncronos sem colocar bytes de PDF no BullMQ; usar referência controlada/URL assinada curta.
- [ ] Implementar heartbeat, progresso, timeout por documento e ausência de loop infinito.
- [ ] Integrar o resultado normalizado ao worker atrás de feature flag; fallback para o extrator atual quando permitido.
- [ ] Rodar GREEN, typecheck e os testes existentes de documentos.

### Task 6: Persistência de parse runs, elementos, assets e segurança

**Objetivo:** persistir proveniência e artefatos privados sem apagar versões anteriores.

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/supabase/migrations/20260826090000_create_document_layout_evidence.sql`
- Create: `backend/src/repositories/document-layout.repository.ts`
- Create: `backend/src/repositories/__tests__/document-layout.repository.test.ts`
- Modify: `backend/src/lib/supabase.ts` only if private asset helpers are missing

- [ ] Escrever testes de repositório para múltiplos parse runs, seleção de parse ativo, ordenação por página/readingOrder, checksum de asset e ownership.
- [ ] Rodar RED.
- [ ] Adicionar `DocumentParseRun`, `DocumentLayoutElement`, `DocumentVisualAsset`, `DocumentBlockElement` e `DocumentEvidenceRelation` com os campos da especificação, enums e índices necessários.
- [ ] Criar migration incremental com RLS em todas as tabelas públicas novas, políticas por professor/monitor/documento e bucket privado.
- [ ] Garantir acesso a assets somente por endpoint autorizado ou URL assinada curta; nenhum conteúdo integral em logs.
- [ ] Implementar persistência transacional e seleção explícita do parse ativo; parse antigo nunca é sobrescrito.
- [ ] Rodar migration/Prisma validation, GREEN e testes de segurança disponíveis.

### Task 7: Normalização segura e montagem de `QuestionSpan`

**Objetivo:** reconstruir unidades pedagógicas completas com regras determinísticas e revisão explícita em casos ambíguos.

**Files:**
- Create: `backend/src/worker/services/layout-content-normalizer.service.ts`
- Create: `backend/src/worker/services/pedagogical-assembler.service.ts`
- Create: `backend/src/worker/services/question-span-gate.service.ts`
- Create: `backend/src/worker/services/__tests__/layout-content-normalizer.test.ts`
- Create: `backend/src/worker/services/__tests__/pedagogical-assembler.test.ts`
- Modify: `backend/src/repositories/question-candidate.repository.ts`
- Modify: `backend/prisma/schema.prisma` and migration only where existing `QuestionSpan` fields are insufficient

**Interfaces:**
- `PedagogicalRole = 'SECTION_TITLE' | 'QUESTION_MARKER' | 'QUESTION_STATEMENT' | 'ALTERNATIVE' | 'ANSWER_KEY' | 'SOLUTION' | 'THEORY' | 'WORKED_EXAMPLE' | 'TEACHER_GUIDANCE' | 'VISUAL_EVIDENCE' | 'EDITORIAL_NOISE' | 'UNKNOWN'`.
- `assembleQuestionSpan(document: LayoutDocument): QuestionSpanAssembly[]` groups elements by marker, column, section, reading order and page continuity.
- `canPromoteQuestion(input): PromotionDecision` returns status, reasons, warnings, math status and evidence IDs.
- `MathLayoutStatus = 'NOT_APPLICABLE' | 'VALID' | 'UNCERTAIN' | 'CORRUPTED' | 'REQUIRES_VISUAL_PARSE'`.

- [ ] Escrever testes RED para duas colunas, questão que atravessa página, alternativas A–E, questão curta completa, solução promocional, número repetido em seções distintas, fórmula corrompida, tabela/figura essencial e `chunkIndex - 1/+1` irrelevante.
- [ ] Implementar preservação separada de rawText, normalizedText, LaTeX e crop/asset; header/footer só saem da projeção semântica.
- [ ] Implementar assembler determinístico: marcador → mesma coluna/seção → continuidade → alternativas → parada no próximo marcador → exclusão de solução/gabarito/orientação.
- [ ] Implementar associação de solução/gabarito por documento, seção, número, compatibilidade textual, página, ordem e menção explícita; empate vira revisão.
- [ ] Implementar gate que bloqueia candidato contaminado, incompleto, matematicamente corrompido ou sem visual essencial.
- [ ] Rodar GREEN e testes de regressão do corpus.

### Task 8: Chunks, `QuestionCandidate` e `QuestionContextPack`

**Objetivo:** separar a projeção de retrieval da projeção pedagógica e entregar contexto mínimo por agente.

**Files:**
- Create: `backend/src/worker/services/question-context-pack.service.ts`
- Create: `backend/src/worker/services/__tests__/question-context-pack.test.ts`
- Modify: `backend/src/worker/services/chunk.service.ts`
- Modify: `backend/src/worker/services/question-source-context.service.ts`
- Modify: `backend/src/repositories/question-candidate.repository.ts`
- Modify: `backend/src/worker/services/completeQuestion/*.ts` only at the typed input boundary
 - Modify: `backend/src/config/env.ts` with the chunk limits from `2026-09-08-melhoria-v3.md`

**Interfaces:**
- `QuestionContextPack` contém version, documentId, questionSpanId, questionSource, answerKeySource opcional, solutionSource opcional, conceptSupport, visuals e quality.
- `buildQuestionContextPack(input): Promise<QuestionContextPack>` nunca usa chunk anterior/seguinte como regra principal.

- [ ] Escrever testes RED para chunk atômico de questão, solução relacionada, teoria 250–450 tokens, título não embeddado sozinho, questão curta válida, fragmento incompleto descartado e pack por agente.
- [ ] Implementar regras de chunk por tipo com targets/max/overlap especificados; preservar section path e relação explícita.
- [ ] Implementar candidate com element IDs, chunk IDs, asset IDs, status estrutural, math status, razões e confiança por associação.
- [ ] Implementar packs distintos para reconstrução, alternativas, gabarito, explicação e auditoria; permitir omitir gabarito no agente de alternativas.
- [ ] Rodar GREEN, scripts de qualidade de chunk e testes de statement evidence.

### Task 9: Retrieval híbrido e avaliação de contexto

**Objetivo:** recuperar suporte conceitual relevante sem contaminar a questão com solução/gabarito de outra unidade.

**Files:**
- Modify: `backend/src/repositories/knowledge-retrieval.repository.ts`
- Modify: `backend/src/services/knowledge-retrieval.service.ts`
- Modify: `backend/src/services/retrieval-evaluation.service.ts`
- Create: `backend/src/worker/services/hybrid-retrieval.service.ts`
- Create: `backend/src/worker/services/__tests__/hybrid-retrieval.test.ts`
- Modify: `backend/src/scripts/test-chunk-quality.ts` or create a dedicated evaluation script

- [ ] Escrever testes RED para filtros por documento/assunto/seção/tipo, exclusão da própria questão em suporte externo, fusão lexical+dense, rerank, child→parent, deduplicação e orçamento.
- [ ] Implementar busca vetorial nos children, busca lexical/BM25 disponível, fusão e reranking com registro de scores e motivo de inclusão.
- [ ] Buscar solução/gabarito por relação explícita antes de retrieval; priorizar THEORY/WORKED_EXAMPLE para suporte.
- [ ] Criar gold cases de fórmula, definição, exemplo análogo, solução correta e contaminante.
- [ ] Rodar GREEN e comparar dense-only versus híbrido em Recall@K, MRR, NDCG, Context Precision/Recall e impacto na resposta.

### Task 10: Agentes, revisão visual e rollout controlado

**Objetivo:** integrar evidência estruturada aos agentes e disponibilizar rollout reversível com revisão do professor.

**Files:**
- Modify: `backend/src/worker/services/completeQuestion/*.ts`
- Modify: `backend/src/worker/services/question-quality.service.ts`
- Modify: `backend/src/worker/services/document-worker.service.ts`
- Create: `backend/src/worker/services/__tests__/question-context-integration.test.ts`
- Create: `backend/src/worker/services/quality-router.service.ts`
- Create: `backend/src/worker/services/__tests__/quality-router.test.ts`
- Modify: `frontend/src/modules/teacher/components/` with the smallest review/debug surface needed
- Create: `frontend/src/modules/teacher/services/DocumentEvidenceService.ts`
- Create: migration only if existing review enums cannot represent required pending states

- [ ] Escrever testes RED para agentes receberem packs tipados, cada campo gerado carregar evidence IDs, ausência de evidência gerar pendência, fórmula corrompida bloquear gabarito/explicação, falha de explicação não apagar enunciado e fallback manter o fluxo legado.
- [ ] Implementar prompts/inputs estruturados sem permitir invenção quando a evidência estiver ausente; preservar correções em formato patch.
- [ ] Implementar estados `PENDING_REVIEW_COMPLETE`, `PENDING_REVIEW_INCOMPLETE`, `PENDING_REVIEW_VISUAL`, `PENDING_REVIEW_MATH`, `PENDING_REVIEW_AMBIGUOUS_SOURCE` e `REJECTED_STRUCTURAL` mapeados aos enums existentes ou por migration explícita.
- [ ] Implementar Quality Router com regras explicáveis: fast path para PDF digital simples; MinerU para scan, colunas, fórmulas, tabelas/figuras, glyphs corrompidos e spans incompletos.
- [ ] Implementar shadow mode, feature flag opt-in, revisão obrigatória, roteamento por qualidade, reprocessamento sem sobrescrever aprovadas e fallback desligável.
- [ ] Implementar revisão visual autorizada com página, bbox, reading order, papéis pedagógicos, texto bruto/normalizado, parser/versão/confiança, asset assinado e razão de bloqueio.
- [ ] Rodar GREEN, testes de integração upload → parse → elementos → spans → chunks → pack → agente → revisão e typecheck/build frontend/backend.

## Ordem de execução e gates

1. Tasks 1–3: fechar Fase 1; se o gate falhar, parar a integração e executar adapter alternativo mantendo os mesmos contratos.
2. Tasks 4–6: contrato, orquestração e persistência; nenhum agente de IA deve consumir layout antes da validação do schema e RLS.
3. Tasks 7–9: assembler, proveniência, context pack e retrieval; nenhum span inválido pode ser promovido.
4. Task 10: integração e rollout; V3 começa em shadow mode e só vira padrão depois de superar o baseline.

## Verificação final

- Rodar todos os testes TDD novos e scripts existentes de documentos, chunks, candidatos e evidência.
- Rodar `npm run typecheck`, `npm run lint`, `npm run prisma:validate` no backend quando aplicável.
- Rodar build do frontend e backend.
- Reexecutar o corpus ouro e comparar com o baseline versionado.
- Confirmar que nenhuma questão contaminada ou matemática corrompida foi promovida automaticamente.
- Confirmar fallback por feature flag e acesso autorizado aos assets.
- Fazer revisão ampla do branch com `superpowers:requesting-code-review` antes de considerar a V3 pronta.
