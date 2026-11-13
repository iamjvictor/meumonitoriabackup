# Relatório — executor local do pipeline de comparação

## Resultado desta tarefa

Foi implementado o runner test-only para as quatro matrizes. Ele provisiona um banco vazio por `test + round + runId`, importa em memória o grafo sanitizado do baseline e pode executar os serviços existentes de indexação visual, extração/conclusão de questões e chat multimodal Q03. Os artefatos consolidados seguem o contrato `reports/<teste>/<runId>/summary.json` e `calls.jsonl`; dados e resultados de cada rodada ficam em `round-1/` e `round-2/`.

Nenhuma inferência foi chamada. Após corrigir a serialização de JSONB, foi importado o grafo baseline em um banco local isolado novo para validar o caminho real de import. O banco permanece disponível para revisão; a versão do chunker ausente deixa a equivalência de versão como `NAO_VERIFICADO` e o resultado não elegível para comparação estrita.

## Mapeamento real do processamento

O código atual trata as questões discursivas com `question_completion_full`, uma chamada que produz alternativas, gabarito e explicação em conjunto. O executor não decompõe nem repete essa chamada. Foi adicionado o mapeamento test-only `completionFull`: DeepSeek V3.2 em ECONOMICA, Kimi K2.6 em QUALIDADE_KIMI e Qwen 235B nos testes 3 e 4. Consequentemente, alternativas e explicação não são avaliadas isoladamente com Kimi K2.5. Essa diferença aparece no resumo da execução.

O enunciado continua vindo dos blocos OCR explícitos pelo caminho determinístico existente; não é contabilizado como inferência de extração. A indexação visual espera os 31 assets, com 31 chamadas de visão e 31 embeddings visuais por rodada. Os 22 chunks e seus vetores são copiados e verificados por hash. Embeddings adicionais gerados pelo serviço de questões são contabilizados pelo interceptor.

## Segurança e isolamento

- O nome do banco é derivado de teste, rodada e `runId`; o destino deve ser loopback em `127.0.0.1:56322` e não pode existir antes da execução. Nenhum banco existente é truncado ou reaproveitado.
- O schema é obtido por `supabase db dump --local --schema public,auth`; o executor não executa migrations ou `db push`.
- Antes de aplicar o dump, o executor remove somente `OWNER TO "supabase_admin"`/`"supabase_auth_admin"`, `ALTER DEFAULT PRIVILEGES FOR ROLE` desses papéis e eventuais `SET ROLE` para eles. Mantém owners locais (`postgres`/`pg_database_owner`) e GRANT/REVOKE; os objetos sem owner explícito ficam pertencendo ao `postgres` que executa o schema.
- A configuração do processo filho é construída por allowlist. Do `backend/.env`, extrai somente `OPENROUTER_API_KEY`; URLs e chaves Supabase vêm de `supabase status --workdir dbtemp --output env`. O DSN de destino é calculado pelo runner. O filho usa cwd temporário vazio, Redis loopback fechado e parser/chunker loopback no-op.
- O interceptor exige modelo/provedor fixados e `allow_fallbacks:false`, verifica modalidades, `structured_outputs` e controle de reasoning disponível, roteia embeddings somente para `qwen/qwen3-embedding-8b`, valida JSON contra o schema enviado e guarda erros por caminho/tipo/tamanho. `usage.cost` é preferido; fallback de embeddings usa apenas tokens de entrada e tarifa do endpoint fixado.
- Cada resposta registrada inclui status HTTP, content-type reduzido a media type e flags de formato do payload (usage/provider/choices/message content/data), sem armazenar o conteúdo da resposta. Respostas 2xx não JSON e JSON sem envelope de completion recebem `NON_JSON_SUCCESS`/`MALFORMED_SUCCESS_RESPONSE`; erros de resposta são códigos limitados a classe/status, sem mensagem bruta do provedor.
- O interceptor aplica espaçamento de 10 segundos entre inícios de requests ao mesmo provedor (compartilhado por chat e embeddings), registra `rateLimitPacingMs` por chamada e o total em telemetria; `Retry-After` é guardado apenas como número em segundos, quando presente. Não há retry automático após 429.
- O `fetch` do filho permite apenas POST exato a `/api/v1/chat/completions` ou `/api/v1/embeddings`, GET de catálogo/model endpoints allowlisted e GET de objetos no Storage Supabase loopback. Qualquer outro host, path ou método é recusado.
- Exportação e importação real exigem os três PDFs baseline com nomes exatos, 22 chunks com embeddings Qwen e 31 assets; discrepância falha antes de criar o banco destino. `pipelineComplete` mede as duas rodadas concluídas e `qualityChecks` apresenta aprovação/falha/não verificação por campo e questão.
- Valores JavaScript array e objetos simples do snapshot são serializados explicitamente com `JSON.stringify` antes de `pg` para colunas JSONB. `Date`, `Buffer`, `null` e valores escalares mantêm o tratamento nativo.
- `calls.jsonl` não registra prompts, imagens, conteúdo de PDF, headers ou chaves. As saídas das questões, descrições visuais e resposta do chat ficam nos artefatos protegidos da rodada.
- Banco e objetos locais de teste permanecem após execução para revisão; o README documenta limpeza por nomes/prefixos exatos. Não há descarte automático.

## Arquivos entregues

- Runner: `tests/model-comparison/runner/{child-environment,execute-pipeline,local-database,pipeline-worker,spec-runner}.mjs`, além de alterações em `config.mjs`, `openrouter-interceptor.mjs` e `telemetry-summary.mjs`.
- Testes fake: `tests/model-comparison/runner/executor.test.mjs` e `interceptor.test.mjs`; `baseline-transfer.test.mjs` também cobre isolamento/reuso por hash.
- Specs: os quatro `backend/test/e2e/*.e2e.spec.ts` usam o runner de duas rodadas em dry-run e não consultam catálogo individualmente.
- Configuração local: `.env.test.*` ignorados; todos os provedores relevantes da matriz estão pinados, incluindo DeepInfra para embeddings. `QUESTION_COMPLETION_MODEL` aponta ao modelo combinado definido para cada teste.
- Preflight e instruções: `tests/model-comparison/provider-preflight.mjs` registra capabilities do modelo; `tests/model-comparison/README.md` documenta comandos, nomes, limites de custo e limpeza.

## Verificações executadas

Comando:

```sh
node --check tests/model-comparison/runner/openrouter-interceptor.mjs
node --check tests/model-comparison/runner/execute-pipeline.mjs
node --check tests/model-comparison/runner/pipeline-worker.mjs
node --check tests/model-comparison/runner/child-environment.mjs
node --check tests/model-comparison/runner/local-database.mjs
node --check tests/model-comparison/runner/spec-runner.mjs
node --test tests/model-comparison/runner/baseline-transfer.test.mjs tests/model-comparison/runner/interceptor.test.mjs tests/model-comparison/runner/executor.test.mjs tests/model-comparison/provider-preflight.test.mjs
```

Resultado atual: **47/47 passaram**. Inclui testes que simulam HTTP 200 text/html e JSON sem envelope, verificando status, content-type, flags de forma, classificação e ausência de conteúdo privado no log; testa também pacing por provedor, agregação do tempo, captura numérica de `Retry-After` e ausência de retry automático. Também cobre dry-run dos quatro `.env.test.*` e bootstrap fake do worker por `process.execPath` absoluto, sem depender de `PATH` herdado. Após a correção JSONB, `baseline-transfer.test.mjs` também passou **9/9**, incluindo asserts para JSONB array/objeto (`ai_definition_sources`, `asset_ids` e `provenance`).

Também foi executado:

```sh
node --import ./backend/node_modules/tsx/dist/loader.mjs --test backend/test/e2e/*.e2e.spec.ts
```

Resultado: **4 specs ignorados** porque não foi fornecido `MODEL_COMPARISON_PREFLIGHT_PATH`; assim não consultaram catálogo nem fizeram inferência. Depois, como smoke isolado autorizado, foi executado:

```sh
node --input-type=module -e 'import { provisionIsolatedDatabase } from "./tests/model-comparison/runner/local-database.mjs"; const r=await provisionIsolatedDatabase({testName:"e2e_economica_qwen30b_deepseek",round:2,runId:"schema-smoke-ownerfix-20261102",workdir:process.cwd()}); console.log(JSON.stringify({databaseName:r.databaseName,tableCount:r.tableCount,removedSupabasePrivilegeStatements:r.removedSupabasePrivilegeStatements}));'
```

Resultado: schema importado sem escalada de role, exit 0; removeu 38 ownership e 6 `ALTER DEFAULT PRIVILEGES`. Leitura local read-only confirmou 83 tabelas `public` e 23 `auth`. Banco schema-only deixado para inspeção: `mc_economica_qwen30b__r2_869c672bd8858cfb`.

Também foi exportado o grafo do baseline do Supabase local e importado em novo banco vazio `mc_so_qwen235b_r1_f71e8aa895fc6849`, sem chamada de IA. Resultado `IMPORTED_CHUNKER_VERSION_UNVERIFIED`: verificados 3 PDFs, 22 chunks/vetores, 31 assets e 16 páginas; `comparisonEligible=false` porque `chunker_version` é nulo em parte dos chunks. A importação exercitou os valores JSONB reais e concluiu com sucesso. O banco e objetos no Storage local permanecem para inspeção. Nenhuma migration, `db push`, acesso remoto ou inferência paga ocorreu.

## Estado dos critérios e lacunas

| Critério | Estado nesta entrega |
|---|---|
| AC-001 entradas, runId e bancos isolados | Import real verificado no destino local dedicado: 3 PDFs, 22 chunks/vetores e 31 assets; hashes conferidos. Versão do chunker permanece `NAO_VERIFICADO` onde ausente. |
| AC-002 modelos/providers por etapa, schema e reasoning | Roteamento test-only implementado; verificação contra catálogo real deve ser feita no preflight de execução. Conclusão combinada documentada. |
| AC-003 dry-run e ambiente local | Lógica coberta por fakes; schema-only local carregado e validado. Preflight público deste runner não foi executado. |
| AC-004 serviços reais, 10 questões e chat Q03 | Worker implementado para executá-los; não executado. Resultado de qualidade, vínculo da imagem e resposta Q03 estão `NAO_VERIFICADO`. |
| AC-005 baseline | Referência configurada: 10 questões, 90 chamadas estruturadas, 141107 tokens de entrada e 57889 de saída; custo baseline `NAO_VERIFICADO`. |
| AC-006 segurança | Fakes confirmam bloqueios; escritas reais limitadas à criação de schema e import do grafo sanitizado nos DBs locais listados; sem migrations ou inferência. |
| AC-007 custo/FX/retention | Telemetria implementada. Não há teto máximo de custo verificável sem limites agregados de tokens; retenção específica e câmbio permanecem `NAO_VERIFICADO`. |

O comando real, a executar somente após revisão independente, é:

```sh
node tests/model-comparison/runner/execute-pipeline.mjs \
  --test e2e_economica_qwen30b_deepseek --run-id <runId-novo> --execute
```

O comando processa as duas rodadas sequencialmente. Os quatro testes ainda não foram executados e não há resultados de qualidade/custo a relatar.
