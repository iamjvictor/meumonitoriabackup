# Task 1 brief — Execute real local pipeline for model comparison

Leia primeiro `specs/model-comparison/spec.md`, `plan.md`, `tasks.md` e `specs/model-comparison/validation.md`.

## Objetivo

Substituir o atual dry-run-only dos quatro specs por uma execução test-only que importe o snapshot já existente em banco local separado e execute os serviços reais de conhecimento visual e processamento de questões, sem alterações em `backend/src/**`.

## Matriz e repetições

Use as combinações exatas já declaradas em `tests/model-comparison/runner/config.mjs` (`TESTS`) e duas rodadas independentes por teste. Inclua no resumo o baseline atual Gemini já executado em `dbtemp/artifacts/9df3b11e-d426-4542-aa57-1d1982f17f01/e2e-results-summary.json` e `question-origin-snapshot.json`; não reexecute Gemini. Baseline existente reporta 10 questões, 90 chamadas estruturadas, 141107 tokens de prompt, 57889 de completion, mas custo por provedor não foi reportado. Deixe custo `NAO_VERIFICADO`.

## Serviços reais a executar

1. Copiar para cada destino somente o grafo sanitizado do baseline: os três PDFs, 22 chunks e embeddings, OCR/texto/blocos, 31 assets e relações. O reuso exato de conteúdo/vector é comprovável por hash. `chunker_version` está nulo para parte dos chunks: marque versão como `NAO_VERIFICADO`, não bloqueie geração de resultados apenas por essa ausência e não declare equivalência de versão.
2. Executar `DocumentVisualIndexingService.describeAndIndexAsset(assetId)` para os assets do baseline, em ordem estável, com o env de teste e o modelo visual daquela matriz. Esse serviço cria embeddings para novas descrições com o modelo fixo `qwen/qwen3-embedding-8b`; registre essas chamadas e custos junto às demais. Os 22 embeddings de texto/chunks do baseline não podem ser regenerados.
3. Executar `new QuestionExtractionService().processDocument(quimica3DocumentId)`. Para os blocos OCR explícitos do PDF, a extração do enunciado é determinística no serviço atual; registrar isso como `DETERMINISTIC_SOURCE_EXTRACTION` e não atribuir chamadas de LLM a essa etapa. As chamadas de geração, resposta, explicação, revisão, normalização e categorias são roteadas pelo interceptor test-only de acordo com schemaName e com a matriz.
4. Se for possível sem iniciar servidor publicado, testar a recuperação e resposta multimodal da questão 03 usando o contexto/asset visual do destino e o `chatImage` da matriz. Faça isso por serviço/gateway do app existente, não invente uma pergunta substituta. Caso exija dependências externas não locais, registre `NAO_VERIFICADO` e explique o ponto exato.

## Isolamento e operação

- Uma base Postgres separada por teste e rodada, identificada por `expectedTargetDatabaseName`; nunca usar ou truncar `postgres` fonte. Somente o Supabase local de `dbtemp` em `127.0.0.1:56322` e seu Storage local.
- Use `supabase db dump --local --schema public,auth` para obter apenas schema (sem dados) e carregue-o em banco vazio local; habilite `extensions.vector` quando necessário. Importador exige tabelas provisionadas; não execute migrations em banco compartilhado nem `db push`.
- Antes da importação, exigir que URL final seja loopback e nome seja `expectedTargetDatabaseName`; destino recém-criado/vazio. Guardar registro mínimo da criação/descarte dos DBs e impedir `dropdb` fora da allowlist.
- Os specs devem usar `runId` único e chamar executor; não executar catálogo GET em cada spec. O setup local deve confirmar os quatro modelos e provedores por preflight público antes de qualquer chamada paga. Providers ficam pinados em env por ID, `order: [provider]`, `allow_fallbacks: false`.
- Carregar `backend/.env` somente no processo filho de teste para obter chave de API e secrets locais; aplicar `.env.test.<nome>` depois; nunca imprimir ou gravar valores secretos. Não alterar o `.env` existente.
- O usuário autorizou em 2026-11-02 que os quatro experimentos rodem localmente com os modelos solicitados. Não executar nada publicado, não fazer push/deploy, não usar banco ou Storage em produção/sandbox. Não adicionar dependência.
- Permita `MODEL_COMPARISON_ALLOW_PAID=1` somente dentro do processo de teste iniciado pelo executor, após provider capability preflight e após provar processo/local DB. Não use flags globais para permitir outros processos.

## Telemetria e saída

- Em `reports/<test>/<runId>/`: `summary.json`, `calls.jsonl`, resultados por questão, uso visual por asset e logs de execução sanitizados.
- Cada resposta HTTP deve guardar modelo, requested provider, provider efetivo somente se resposta comprovar, request schema/task, rodada, tentativa, tokens, reasoning tokens, latência, status/campo inválido, temperatura e teto de tokens enviados. Nunca guardar prompt, conteúdo PDF, Authorization ou chave no JSONL.
- Preferir `usage.cost` de OpenRouter quando presente. Se ausente, calcular estimativa observada somente a partir de tokens, preço público do endpoint pinado e metodologia explícita, identificada como estimativa; sem informação, `NAO_VERIFICADO`. Obter USD/BRL com fonte e data ao gerar relatório final.
- Todas as dez questões por rodada devem ser verificadas no DB isolado como PENDING_REVIEW, sem duplicatas. Guardar alternativa/gabarito/explicação; respostas alvo humanas permanecem vazias e acurácia é `SEM_VERDADE_DE_REFERENCIA`.
- O runner precisa parar em erro fatal após registrar falha. Nunca apresentar dry-run como execução do pipeline.

## Arquivos sob responsabilidade

Somente: `tests/model-comparison/runner/**`, `backend/test/e2e/**`, `backend/.env.test.*`, `tests/model-comparison/README.md` e o relatório deste pacote `specs/model-comparison/task-1-runner-report.md`. Não editar `specs/model-comparison/spec.md`, `plan.md`, `tasks.md`, comparador ou qualquer arquivo em `backend/src/**`.

## Verificação esperada

- Testes fake do executor para DB allowlist, schema isolation, reuso hashes, estágios, status, custo/tokens e fail-closed.
- Dry-run confirma setup e mapeamento sem enviar inference. NÃO execute chamadas OpenRouter reais ainda; após a sessão revisar o runner e limites do custo, a sessão coordenadora iniciará os experimentos autorizados pelo usuário.
- Relatório em `specs/model-comparison/task-1-runner-report.md`: resumo, arquivos, comandos/resultados, limitações. Resposta ao coordenador: status, resumo de teste, impedimentos, sem reproduzir conteúdo de PDFs, saída de modelos ou segredo.
