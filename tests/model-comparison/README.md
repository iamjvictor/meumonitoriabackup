# Comparação dos pipelines de documentos

O executor importa uma cópia sanitizada do baseline em um Postgres local `dbtemp`, com banco novo por teste, rodada e `runId`. Cada execução percorre duas rodadas e grava `reports/<teste>/<runId>/summary.json`, `calls.jsonl` e os artefatos protegidos de cada rodada em `round-1/` e `round-2/`. O baseline Gemini existente é somente referência; não é reexecutado.

## Nomes dos testes

- `e2e_economica_qwen30b_deepseek`: descrição visual Qwen 30B, extração e revisão conforme matriz, conclusão combinada DeepSeek.
- `e2e_qualidade_kimi_gera_qwen_revisa`: descrição visual Qwen 235B, revisão Qwen e conclusão combinada Kimi K2.6.
- `e2e_so_qwen235b`: processamento e conclusão combinada Qwen 235B.
- `e2e_revisao_cruzada_qwen_gera_deepseek_revisa`: conclusão Qwen 235B e revisão DeepSeek com raciocínio ativado.

O serviço atual completa alternativas, gabarito e explicação de questões discursivas em uma única chamada `question_completion_full`. Portanto, no caso Kimi a chamada combinada é atribuída a Kimi K2.6; a comparação isolada de alternativas/explicação com Kimi K2.5 não é possível sem alterar o pipeline de produção. Essa limitação aparece no resumo.

## Preflight e dry-run

O preflight consulta somente metadados públicos, IDs, capabilities, providers e preços. Não chama inferência:

```sh
node tests/model-comparison/provider-preflight.mjs --out reports/model-comparison/provider-preflight.json
MODEL_COMPARISON_PREFLIGHT_PATH=reports/model-comparison/provider-preflight.json \
  node --import ./backend/node_modules/tsx/dist/loader.mjs --test backend/test/e2e/*.e2e.spec.ts
```

Os quatro specs chamam o executor em dry-run. O dry-run verifica configuração, pin de provider, ausência de DB já usado e destino local; não importa dados nem chama modelos. O resumo deixa `pipelineExecuted=false`.

## Execução local autorizada

Use um `runId` novo a cada comparação. O modo sem `--execute` é sempre dry-run.

```sh
node tests/model-comparison/runner/execute-pipeline.mjs \
  --test e2e_economica_qwen30b_deepseek --run-id run-economica-20261102-01
```

Depois de revisar o preflight, custo previsto e conteúdo das variáveis, a execução de inferência é iniciada explicitamente pelo coordenador com `--execute`:

```sh
node tests/model-comparison/runner/execute-pipeline.mjs \
  --test e2e_economica_qwen30b_deepseek --run-id run-economica-20261102-01 --execute
```

Repita para cada nome. `--execute` provisiona dois bancos locais vazios, importa o grafo baseline e executa os serviços reais nas duas rodadas. O processo filho recebe apenas variáveis test-only, segredo OpenRouter e credenciais do Supabase local; ele não herda o ambiente do terminal nem carrega o `backend/.env`.

### Custo e tokens

Cada rodada descreve e indexa os 31 assets visuais do baseline: 31 chamadas de visão e 31 embeddings Qwen de texto; os embeddings dos 22 chunks são copiados e verificados por hash. A extração determinística processa os 10 blocos explícitos. Embeddings adicionais de questões, se disparados pelo serviço, também são registrados. Em oito rodadas, são esperadas 248 descrições e 248 embeddings visuais. Não há teto máximo de custo verificável porque tokens máximos agregados de visão, chat e embeddings não estão limitados pelo runner. O relatório separa `usage.cost` de estimativas baseadas em tokens e preço do endpoint pinado; câmbio e custo em BRL ficam `NAO_VERIFICADO` até haver fonte/data registrada.

O interceptor espaça em 10 segundos o início de chamadas consecutivas ao mesmo provider, incluindo visão, chat e embeddings. Registra o tempo de espera por chamada e total, e grava `Retry-After` numérico quando fornecido; não repete automaticamente respostas 429.

## Saídas e limpeza

`summary.json` consolida as duas rodadas, `pipelineExecuted`/`pipelineComplete`, verificações de qualidade por questão e campo, descrições por asset, chat multimodal Q03, retries, tokens, custos observados/estimados e latência. `calls.jsonl` não contém prompt, imagem, conteúdo PDF, headers ou chaves. O filho bloqueia fetch fora dos endpoints OpenRouter exatos, metadados allowlisted e GET ao Storage Supabase local. A versão do chunker ausente no baseline e a retenção específica do provedor permanecem `NAO_VERIFICADO`.

Os bancos e objetos Storage de teste não são apagados automaticamente. Para limpeza, consulte os nomes exatos em `summary.json` (`rounds[].database.name`), confira que começam com `mc_` e que a URL é `127.0.0.1:56322`, depois apague apenas cada banco daquele run, por exemplo com `dropdb --host 127.0.0.1 --port 56322 --username postgres '<nome-exato>'`. Remova somente o prefixo Storage `model-comparison/<teste>/round-<n>/<runId>` correspondente. Para limpar relatórios, remova somente `reports/<teste>/<runId>`. Nunca use wildcard em `dropdb` nem remova o baseline.
