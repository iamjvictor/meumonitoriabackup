# Implementação de processamento recuperável de livros

> Execução: seguir o fluxo do repositório com implementador e revisor_qa, pacote a pacote. Este turno produz somente o plano.

**Objetivo:** converter livros sem perder lotes concluídos e publicar contexto validado para o RAG.

**Arquitetura:** worker coordena lotes; parser executa cada conversão em subprocesso limitado; artefatos são gravados atomicamente em disco e enviados ao Storage privado antes do checkpoint concluído. Banco registra a execução e os lotes. Uma etapa final monta o documento e publica a geração validada.

**Stack:** Python 3.12, Docling 2.122.0, Node/TypeScript, BullMQ, Prisma/Postgres e Storage privado existente.

**Especificação:** [spec.md](spec.md).

## Restrições globais

Preservar mudanças preexistentes. Não mudar o caminho QUESTIONS. Não reduzir escala nem desligar fórmulas globalmente sem comparação de qualidade. Nenhuma gravação em produção durante implementação/QA; fixtures e banco isolado. Máximo de dois implementadores simultâneos. Sem commit, push, migration aplicada ou deploy automático.

## Contratos

1. `KnowledgeBatchRequest`: `documentId`, `runId`, `contentHash`, `configurationHash`, `pageStart`, `pageEnd`, `profile`; intervalos inclusivos e indexados em 1. Nova rota interna `/knowledge/batch/v1`, preservando `/chunk` e `/chunk/v2`. Autenticação de serviço, tamanho máximo e validação do intervalo obrigatórios.
2. `KnowledgeBatchResult`: `schemaVersion`, identidade da requisição, versão do parser, páginas esperadas/concluídas/vazias/falhas, status, tempos, manifest e pacote JSON/Markdown/assets com checksums. Não retornar somente texto concatenado. Resultados interrompidos são parciais e não promovíveis.
3. `batchKey = SHA256(teacherId + documentId + contentHash + parserVersion + configurationHash + pageStart + pageEnd + schemaVersion)`. Hash de configuração inclui valores efetivos; prazo operacional não invalida conteúdo já validado.
4. Persistência nova: `KnowledgeProcessingRun` e `KnowledgeProcessingBatch` ligados ao documento. Run: configuração, hashes, orçamento consumido, lease/heartbeat, estado e geração. Batch: intervalo, batchKey único, tentativas, estado, manifest privado/checksum, duração e erro. Índice por execução/intervalo. Constraint e verificação de tenant em todas as operações.
5. Estados run: QUEUED, RUNNING, PAUSED_TIMEOUT, FAILED, READY_TO_PUBLISH, COMPLETED, CANCELLED. Batch: PENDING, RUNNING, COMPLETED, FAILED. Expiração de lease permite retomada; não implica checkpoint concluído.
6. Checkpoint: validar saída → escrever arquivo temporário → rename atômico → upload privado → verificar checksum → concluir lote em transação. Se cair entre upload e commit, reconciliar objeto órfão pela identidade; não duplicar. Caminho privado inclui professor/documento/run/batch. Disco é cache; Storage e banco sustentam retomada após troca de host.
7. Publicação: assets e chunks preparados fora da geração ativa; embeddings concluídos antes da troca. Necessário identificador de geração ativa no documento e geração nos chunks/assets usados pelo RAG. Consulta só lê geração ativa; rollback volta à anterior. Registros legados sem geração mantêm leitura compatível até migração explícita. Referências antigas não são removidas.

## Sequência de implementação

### P1 — Perfil e benchmark

Arquivos: `scripts/run_mineru.py`, novo `scripts/knowledge_profile.py`, novo `scripts/benchmark_knowledge.py`, README do parser; caminhos relativos a `services/document-parser/`.

- [ ] Definir `KnowledgeProfile` e `build_pipeline_options(profile)` com validação de limites, incluindo `document_timeout`.
- [ ] Expor configurações atuais, sem trocar defaults; separar escala de OCR de `images_scale`.
- [ ] Benchmark controlado de cinco páginas representativas (texto, fórmulas, tabela, imagem e scan), saída JSON por condição e comparação manual com PDF.
- [ ] Medir reinicialização dos modelos por lote; aceitar custo inicial de subprocesso isolado e evitar worker persistente antes de medir.

### P2 — Processo limitado e lote

Arquivos: novos `scripts/knowledge_batch_runner.py`, `scripts/knowledge_batch_manifest.py`; integrar em `scripts/docling_http_service.py` e reutilizar conversor/exportadores.

- [ ] `run_batch(request, input_path, output_dir) -> KnowledgeBatchResult`: selecionar `page_range`, registrar páginas absolutas e executar conversão em subprocesso.
- [ ] Aplicar timeout cooperativo e watchdog externo com grupo de processos; sempre recolher filhos e limpar temporários incompletos.
- [ ] Inspecionar status e erros do ConversionResult, não apenas `.document`.
- [ ] Expor rota versionada com identidade e checksums; limitar concorrência e tamanho, validar autenticação e cancelar processo ao expirar prazo do job.

### P3 — Ledger durável e cliente

Arquivos: `backend/prisma/schema.prisma`, migration nova, `backend/src/config/env.ts`, `.env.example`, novos `repositories/knowledge-processing.repository.ts` e `worker/services/doc-chunker/knowledge-batch.client.ts`.

- [ ] Criar run/batch e constraints; gerar migration e revisá-la sem aplicar em produção.
- [ ] Implementar acquire/renew/release lease e compare-and-swap de estados; configuração e hashes imutáveis na execução.
- [ ] Cliente verifica manifest/checksum e usa timeout HTTP maior que o limite externo do lote; timeout de rede não marca sucesso nem libera lock indevidamente.
- [ ] Guardar artefatos em Storage privado existente, com prefixo separado e política de retenção para execuções concluídas, falhas e objetos órfãos.

### P4 — Orquestração e retomada

Arquivos: novo `backend/src/worker/services/knowledge-batch-processing.service.ts`, integração restrita em `document-worker.service.ts`, configuração de job existente.

- [ ] `processKnowledgeRun(documentId, runId?)` planeja lotes, reutiliza checkpoints válidos e agenda somente faltantes.
- [ ] Persistir progresso/budget após cada etapa; limitar tentativas e respeitar cancelamento.
- [ ] Processo morto perde lease; novo worker recupera com verificação de checksum. Não repetir lote COMPLETED válido.
- [ ] Atualizar saída dos processing jobs existentes com páginas concluídas/total e erro legível. Expor dados pelo endpoint de acompanhamento existente; UI nova fica fora desta entrega.

### P5 — Montagem, geração ativa e publicação

Arquivos: novo `scripts/knowledge_document_assembler.py`; `backend/prisma/schema.prisma` em etapa sequencial; repositórios de chunks/assets, `knowledge-retrieval.repository.ts` e repositório visual do chat.

- [ ] Remapear referências internas de cada lote, offsets de página e hierarquia; validar continuidade em uma tabela e um parágrafo que atravessam fronteira.
- [ ] Fazer chunking do documento montado com contexto de seção; lote de conversão não define sozinho a fronteira de chunk. Não inserir artificialmente texto ausente.
- [ ] Validar cobertura, detectar páginas falhas e manter ausência explícita de conteúdo. Página vazia exige evidência, não apenas texto de comprimento zero.
- [ ] Gravar geração em staging com IDs determinísticos; gerar embeddings somente para conteúdo novo; impedir mistura de modelo/dimensão.
- [ ] Trocar geração ativa em transação curta após validação; cobrir TODOS os leitores de chunks/assets do RAG com o filtro e leitura legada compatível. Rollback troca o ponteiro, não apaga referências.

### P6 — Validação integrada e rollout

- [ ] Executar o plano independente de QA, incluindo kill/restart, timeout, concorrência, isolamento e fronteiras.
- [ ] Rodar piloto local em cópia do Atkins com checkpoints; comprovar retomada após interrupção. Não afirmar qualidade pelo status READY.
- [ ] Liberar flag primeiro em ambiente de homologação; confirmar volume temporário, Storage privado, autenticação e orçamento.
- [ ] Produção somente em etapa posterior explícita, após evidência registrada. Rollback desliga a flag, preserva artefatos e geração anterior.

## Etapa posterior de qualidade

Classificar por página; manter Docling para ordem de leitura/layout mesmo em páginas com texto quando necessário. OCR somente em páginas/regiões que precisam. Reprocessar índices visuais falhos como jobs independentes. Criar avaliação com perguntas sustentadas por texto, fórmulas e imagens. GPU é evolução condicionada a infraestrutura disponível; não é pré-requisito desta entrega.

## Foco da revisão

1. Queda após upload e antes do checkpoint: P3/P4, reconciliação sem duplicata.
2. Referências e numeração entre lotes: P2/P5, páginas absolutas e assets corretos.
3. Retry concorrente: P3/P4, lease e fencing impedem dupla publicação.
4. Geração parcial visível ao RAG: P5, leitores e troca atômica.
5. Timeout sem matar inferência: P2, processo filho realmente encerrado e recurso liberado.

## Refinamentos após revisão independente

- Orçamento inicial de quatro horas é uma proteção operacional configurável; calibrar no piloto. Atingir o orçamento pausa a execução e mantém checkpoints, sem declarar o livro concluído.
- Benchmark separa inicialização dos modelos de conversão. Se inicialização superar 20% do tempo total dos lotes, registrar o custo antes do rollout; a primeira entrega mantém isolamento por processo para garantir encerramento. Processo persistente é otimização posterior que exige a mesma prova de cancelamento e liberação de memória.
- Run armazena documentId, teacherId e monitorId com FK composta para identidade do documento; batch referencia run e identidade correspondente por FK composta. Índices/constraints e acesso privado devem impedir ligação cruzada, não apenas validar o payload em aplicação. Planejar RLS para tabelas expostas e testes com roles equivalentes à aplicação.
- Antes de P5, inventariar todos os leitores por busca de document_chunks, document_visual_assets e document_visual_asset_indexes. Pontos já identificados: knowledge-retrieval.repository.ts, modules/chat/rag/repositories/prisma-chat-visual-context.repository.ts e contexto associado a question_sources/flashcard_sources. Leitores por referência histórica continuam apontando ao registro original; buscas de descoberta usam apenas geração ativa. Para documento com activeGenerationId nulo, ler somente registros legados de generationId nulo. Quando existe geração ativa, não misturar registros legados nas buscas. Testar cada leitor inventariado e rollback com a flag desligada sem tornar gerações staging visíveis.
- Política de retenção inicial: nenhum GC automático na primeira entrega. Artefatos concluídos, falhos e gerações anteriores ficam privados e contabilizados; ferramenta futura de limpeza deve fazer dry-run e respeitar referências. Isso evita exclusão acidental durante os primeiros pilotos.
