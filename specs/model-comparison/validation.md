# Validação independente — comparação de modelos

## Escopo e ambiente

Revisão local/offline dos artefatos existentes. Nenhum runner E2E ou chamada de inferência foi executado. Não foram lidos valores dos arquivos `.env.test.*`; apenas nomes de variáveis e status Git/ignore. O diff em `backend/src` foi tratado como preexistente da rodada anterior, conforme orientação do coordenador.

## Evidências por critério

| Critério | Resultado | Evidência |
|---|---|---|
| AC-001 isolamento, nomes e entradas | **Falha / bloqueador** | Há quatro arquivos spec com nomes canônicos e cada `.env.test.*` declara banco PostgreSQL local com database name exclusivo e `ALLOW_PAID=0`. Porém, cada spec só chama `runDryRun`; `config.mjs:77-91` gera rodadas/questões nulas sintéticas e marca isolamento e reuso como `BLOCKED`. Não há execução dos PDFs nem import/reuso de chunks ou embeddings; os destinos declarados não comprovam que a aplicação os usa. |
| AC-002 roteamento somente em teste e configuração por etapa | **Parcial / bloqueador para execução real** | Matriz declarativa existe em `runner/config.mjs:7-27`. Interceptor global está em arquivo de teste e agora falha fechado quando a etapa não é mapeada (`openrouter-interceptor.mjs:43-56`). Porém, não é instalado por nenhum spec E2E, e a classificação depende de `schemaName`/texto de prompt (`:8-30`); não há evidência de que todos os fluxos sejam reconhecidos. Os nomes de env por agente existem, mas o runner só informa em vez de validar a correspondência real (`config.mjs:62-66`). |
| AC-003 dry-run, catálogo, limites e custo | **Parcial / lacuna** | `runDryRun` consulta GET público `/models` por padrão (`config.mjs:54-60`), sem chamar endpoint de inferência. Apenas testa presença dos IDs (`:61-75`); não verifica modalidades, suporte a schema, parâmetros de reasoning/temperature, retenção ou preços. Custo é corretamente `NAO_VERIFICADO`; máximo estimado não foi produzido. |
| AC-004 gate, telemetria e segredo | **Parcial** | Gate do interceptor bloqueia por padrão e registra evento sem body/headers (`openrouter-interceptor.mjs:41-45`); teste QA isolado confirma bloqueio sem rede de inferência. Contudo, o escape depende de `MODEL_COMPARISON_ALLOW_PAID=1` e não exige token/registro de confirmação pós-dry-run. O interceptor não é chamado pelos specs. Campos de custo/schema ficam nulos; não há sanitização do `error` em falhas (`:64-69`). Provedor efetivo/tokens só são preenchidos se resposta JSON for lida (`:51-60`). |
| AC-005 saída comparativa e referência | **Parcial** | Fixture de gabarito está corretamente vazia e `SEM_VERDADE_DE_REFERENCIA`; sem respostas inventadas. Comparador gera arquivos para resumos existentes e `NAO_VERIFICADO` para ausência. Não há dados reais de execução. O CSV/MD não tem comparação de variação entre rodadas, decisão do revisor versus professor nem visual/chat recuperado; o visual é sempre declarado não encontrado (`comparar_testes.ts:129-132`). A faixa `reference.status === 'COMPLETO'` também continua preenchendo `gabaritoHumano` com `NAO_VERIFICADO` (`:142`). |
| AC-006 sem alteração de produção e revisão | **Sem regressão atribuível a esta tarefa, com ressalva** | Novos artefatos estão em testes/specs/fixtures; alterações de `backend/src` constam como preexistentes, conforme o coordenador. Não foi feita revisão completa de todos os diffs preexistentes. |

## Rechecagem de preflight, custo e telemetria (2026-11-02)

O preflight público foi executado sem endpoints de inferência. Os cinco IDs existem no catálogo consultado; a resposta por endpoint lista modalidades e quais provedores anunciam `structured_outputs` e `response_format`:

| Modelo | Entrada | Provedores que anunciam structured outputs / response_format |
|---|---|---|
| `qwen/qwen3-vl-30b-a3b-instruct` | texto, imagem | DeepInfra, Novita, SiliconFlow |
| `qwen/qwen3-vl-235b-a22b-instruct` | texto, imagem | DeepInfra, Venice, Parasail |
| `deepseek/deepseek-v3.2` | somente texto | SiliconFlow, DeepInfra, AtlasCloud, Baidu, Phala, Mara |
| `moonshotai/kimi-k2.5` | texto, imagem | AtlasCloud, SiliconFlow, Venice, Novita |
| `moonshotai/kimi-k2.6` | texto, imagem | Baidu, Chutes, DigitalOcean, StreamLake, CoreWeave, Crusoe, DeepInfra, Venice, Parasail, SiliconFlow, Inceptron, Novita, GMICloud, AtlasCloud, Cloudflare, Moonshot AI, Phala |

Esses metadados confirmam que existe ao menos um candidato compatível por ID; ainda não validam uma configuração efetiva do pipeline, porque nenhum provedor foi escolhido para cada etapa. DeepSeek não pode receber imagem. A retenção específica por provedor segue `NAO_VERIFICADO` no próprio relatório.

O relatório `/tmp/model-comparison-provider-preflight.json` foi criado localmente para a auditoria. `budget.status` foi `NAO_VERIFICADO`, pois não foi fornecido `--budget-config` com provedor pinado, cardinalidade de chamadas e tokens máximos. Logo, não existe custo máximo verificado para apresentar. Não se deve inferir provedor efetivo ou custo a partir do pedido enviado.

Os quatro `summary.json` mais recentes que já estavam no workspace indicam `executionMode=dry-run`, `paidCallsMade=0`, `pipelineExecuted=false`, `provider.status=UNRESOLVED`, `cost.status=NAO_VERIFICADO`, `isolation=BLOCKED`, `baselineReuse=BLOCKED`. As variáveis de execução no processo estavam sem definição; cada env separado define `MODEL_COMPARISON_ALLOW_PAID=0`. Nenhum teste E2E foi chamado durante esta rechecagem.

### Achados adicionais no interceptor

- **Bloqueador — provedor efetivo é inferido do pedido:** `openrouter-interceptor.mjs:36-39` inicializa `event.provider` com o valor configurado, e `:70` usa `payload.provider ?? provider`. Quando a resposta não traz o provedor efetivo, o relatório apresenta o provedor solicitado como se fosse efetivo. Registre campos separados `requestedProvider` e `providerUsed`; deixe `providerUsed=NAO_VERIFICADO` sem evidência de resposta.
- **Bloqueador — custo não é calculado nem prova limite:** `:36-42` inicia `estimatedCostUsd` como `null` e não o preenche depois da resposta. O preflight pode calcular custo teórico, mas não é conectado às chamadas nem possui configuração máxima neste workspace.
- **Alto — tentativa é contador global, não índice da tentativa por agente:** `:26` mantém um só `attempt`, incrementado em `:39`. Isso mistura agentes e não representa retries individuais. O campo necessário para comparar falhas por chamada não está demonstrado.
- **Alto — reasoning e temperatura não são aplicados ao request:** o interceptor altera apenas `model` e `provider` (`:58-59`), sem definir `reasoning` ou temperatura. Os `.env` incluem `AI_REASONING_EFFORT=none` e temperaturas em variáveis diferentes por etapa, mas o `runDryRun` apenas parseia um arquivo e não carrega essas variáveis no processo; o resumo segue com temperatura “baseline por etapa a confirmar” (`config.mjs:118`). Não há configuração especial do agente de revisão do teste D. Marcar isso `NAO_VERIFICADO` e bloquear `READY` até existir configuração validada.
- **Alto — schema nunca é validado pelo interceptor:** `schemaValidFirstAttempt` e `schemaError` ficam `null` (`:41-42`) e não existe validação da resposta (`:64-74`). Não tratar `READY` ou telemetria atual como prova de JSON válido.
- **Alto — flag de execução não atesta pré-condições reais:** `:49-57` permite envio se `MODEL_COMPARISON_ALLOW_PAID=1`, `MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED=1` e `MODEL_COMPARISON_READY=1`; o interceptor não lê/valida o sumário de preflight, escolha de provedor ou orçamento. No estado atual a chamada continua bloqueada (flags ausentes e nenhuma especificação instala o interceptor), mas um futuro set manual dessas flags pode contornar lacunas de auditoria. `READY` deve depender de evidência verificada e orçamento completo, ou continuar bloqueado.

## Achados

### Bloqueador — não há pipeline de comparação executável

- **Arquivo/linhas:** [config.mjs](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/tests/model-comparison/runner/config.mjs:77) e [spec E2E](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/test/e2e/e2e_economica_qwen30b_deepseek.e2e.spec.ts:5)
- **Evidência:** as duas rodadas criadas contêm enunciados, alternativas, resposta e explicação nulos; não ocorre ingestão, OCR, uso dos PDFs, leitura de 10 questões, criação de perguntas nem execução do chat visual. Todos os quatro specs repetem somente essas asserções dry-run.
- **Impacto:** nenhum resultado de qualidade ou comparação de modelos pode ser obtido. O próprio resumo marca asserções `NOT_RUN`.
- **Reprodução:** inspecionar `runDryRun` e rodar apenas o teste QA de interceptação abaixo; não rodar os E2Es porque fazem GET de catálogo e não representam E2E de processamento.

### Alto — isolamento/reuso de baseline declaradamente bloqueados

- **Arquivo/linhas:** [config.mjs](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/tests/model-comparison/runner/config.mjs:89)
- **Evidência:** `isolation.status` e `baselineReuse.status` são `BLOCKED`; a configuração registra que o banco local é compartilhado e que ingestão regenera OCR/chunks/embeddings. Os envs ignorados não constituem evidência de isolamento.
- **Impacto:** não satisfaz banco/schema independente nem reuso por hash; não executar pipeline até resolução.

### Médio — preflight não comprova capacidades, provedor, preço ou retenção

- **Arquivo/linhas:** [config.mjs](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/tests/model-comparison/runner/config.mjs:54)
- **Evidência:** catálogo `/models` confere apenas presença do ID. Provedor/preço ficam unresolved/NAO_VERIFICADO. Não há comprovação do provedor efetivamente usado, `provider.order`, suporte de imagem/structured output, retenção, teto de custo nem FX.
- **Impacto:** não pode ser mostrada uma estimativa máxima nem declarada viabilidade de execução; essas lacunas devem ser preenchidas antes de pedir aprovação para inferência.

### Médio — comparador não contempla todos os indicadores nem variação entre rodadas

- **Arquivo/linhas:** [comparar_testes.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/tests/model-comparison/comparar_testes.ts:129)
- **Evidência:** recuperação visual/chat sempre aparece como `NAO_VERIFICADO`; nenhuma métrica calcula diferença de gabarito/alternativas entre as duas rodadas. O report lê resumos, mas não valida duplicidade, exatamente dez questões ou os dois números de rodada.
- **Impacto:** até com resumos futuros, entregáveis analíticos não cobrem os critérios especificados.

## Comandos e resultados

- `node --test tests/model-comparison/qa/interceptor.qa.test.mjs tests/model-comparison/runner/interceptor.test.mjs` — **6/6 passaram**. Os testes usam transporte falso para a ramificação habilitada, confirmam `provider.order`/fallback desativado, e bloqueio sem transporte para chamada paga e etapa desconhecida. O teste QA verifica que evento bloqueado não inclui segredo.
- `node --test tests/model-comparison/provider-preflight.test.mjs` (executado junto dos testes acima) — **3/3 passaram**; testes de lógica sintética do inventário de provedor, retenção não verificada e cálculo de orçamento.
- `node tests/model-comparison/provider-preflight.mjs --out /tmp/model-comparison-provider-preflight.json` — **concluído**; fez apenas GET de catálogo e endpoints públicos de metadados, `inferenceCallsMade=false`; cinco IDs encontrados; nenhuma inferência.
- Inspeção dos quatro resumos mais recentes e nomes/valores booleanos relevantes de env/processo — execução permanece `dry-run`, paga desativada, provedor/preço não resolvidos. Nenhuma chamada E2E foi executada.
- `cd backend && node --import tsx --test ../tests/model-comparison/comparar_testes.test.ts` — **2/2 passaram** (testes existentes do comparador; execução local sem rede).
- `node --import tsx --test tests/model-comparison/comparar_testes.test.ts` na raiz — **falhou por ambiente**, `ERR_MODULE_NOT_FOUND: tsx`; o pacote está instalado em `backend/node_modules`. Reexecutado a partir de `backend`, passou.
- Nenhum `backend/test/e2e/*.spec.ts` foi executado: esses specs consultam catálogo externo e não executam o pipeline; não agregariam evidência de qualidade.
- Nenhuma inferência, acesso a serviço publicado, migração ou mutação de banco foi realizada.

## Limitações / próximo passo

O material atual é um esqueleto de dry-run e comparador, não quatro execuções E2E. O catálogo/preços/retenção ainda não foram provados em artefatos com fonte/data e não há custo máximo. Gabarito humano permanece ausente corretamente. Não declarar sucesso da comparação nem liberar chamadas pagas enquanto os bloqueadores de isolamento, reuso do baseline, execução do pipeline e fail-closed do roteamento persistirem.

## Revalidação do importador de baseline (2026-11-02)

Após os achados da revisão QA, o importador foi endurecido em `tests/model-comparison/runner/baseline-transfer.mjs`:

- rejeita snapshot com `format` diferente de `model-comparison-baseline-graph-v1`;
- aceita somente embeddings `qwen/qwen3-embedding-8b`;
- verifica que a prova do chunk, o chunk e o documento apontam para o mesmo documento;
- verifica as associações asset/arquivo/documento, chunk/asset e as relações de evidência dentro do documento;
- depois de inserir, relê e valida os caminhos de Storage, IDs de documento, os 10 blocos e suas relações; recalcula o hash do conteúdo textual dos blocos no destino;
- quando qualquer `chunker_version` está ausente, uma importação real retorna `IMPORTED_CHUNKER_VERSION_UNVERIFIED` e `comparisonEligible=false`, nunca `IMPORTED_AND_VERIFIED`.

`node --test tests/model-comparison/runner/baseline-transfer.test.mjs` — **8/8 passaram**, incluindo rejeições de formato, modelo e arestas inconsistentes. A importação real continua não executada; o teste do caminho `execute` usa somente banco e Storage fakes. A compensação do Storage é best-effort: se o PostgreSQL falhar depois de upload e a remoção também falhar, o erro lista os objetos possivelmente órfãos para limpeza manual.

Isso não remove os bloqueadores dos E2Es: os specs ainda chamam somente `runDryRun`; a versão do chunker continua não verificável no baseline; não há banco isolado provisionado/importado, política de retenção confirmada, orçamento máximo verificado ou aprovação para chamadas pagas. Os quatro fluxos não foram simulados nem executados.
