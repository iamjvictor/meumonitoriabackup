# Relatório — Comparador dos testes de modelos

## Status

Implementado em `tests/model-comparison/comparar_testes.ts` com testes sintéticos em `tests/model-comparison/comparar_testes.test.ts`.

## O que mudou

- O relatório só aceita summaries com `pipelineExecuted === true`, `summary.test` igual ao diretório e `summary.runId` igual ao nome da execução. Dry-runs, fakes, summaries ausentes e nomes inconsistentes são omitidos das métricas de qualidade/custo; seus arquivos permanecem intactos.
- `comparativo.md` e `comparativo.csv` mostram uma linha para o baseline Gemini existente e uma linha para cada uma das quatro combinações. O Markdown também inclui tabela por rodada; `comparativo-rodadas.csv` é criado somente quando existem execuções reais elegíveis.
- A linha baseline lê `e2e-results-summary.json` ao lado do `question-origin-snapshot.json`, registra os tokens/chamadas reportados (quando presentes) e mantém custo como `NAO_VERIFICADO` porque o worker não informou preço/custo.
- Os relatórios por execução comparam questões por número e enunciado normalizado, exibem enunciado/alternativas/gabarito/explicação/evidência/revisão/status, verificam a estrutura A–E e registram elementos visuais e o resultado de chat da Q03 quando recebidos no summary.
- Inclui variação entre rodadas para gabarito e alternativas, tokens, custo, latência, retries e falhas observadas. Custo em BRL só aparece quando o summary fornece cotação com fonte e data; custos e tokens com campos faltantes permanecem `NAO_VERIFICADO`.
- O comparador mantém acurácia humana como `SEM VERDADE DE REFERÊNCIA`; não usa gabarito de baseline como se fosse validação docente.

## Verificação

Comando executado em `backend/`:

```sh
node --import tsx --test ../tests/model-comparison/comparar_testes.test.ts
```

Resultado atualizado: **4/4 testes passaram**. Os casos cobrem ausência de execuções efetivas, filtragem de dry-run/fake (incluindo não gerar `comparacao.md` para essas pastas), modos locais permitidos (`execute`, `pipeline`, `local-e2e`), baseline Gemini e custo sem informação, variação R1/R2, cobertura visual, chat Q03 e conversão USD/BRL com FX sintético. Um teste confirma que, se a descrição da página visual esperada faltar, os elementos continuam no denominador e ficam registrados como ausentes (`0/2` no cenário sintético). Os dados foram sintéticos; não houve rede, inferência, leitura de PDFs, acesso a PII, banco ou Storage.

## Rechecagem QA dos achados P2

- **Cobertura visual com página sem descrição:** agora o denominador soma todos os `expectedElements` antes de procurar assets da página. Página ausente conta como zero elementos encontrados e a linha explica a ausência; se não houver metadados de descrição, o resultado segue `NAO_VERIFICADO`.
- **Modo de execução:** além de `pipelineExecuted=true` e da correspondência entre `test`/`runId` e diretório, o summary precisa usar exatamente um dos modos locais conhecidos: `execute`, `pipeline` ou `local-e2e`. `fake`, `dry-run` e valores arbitrários ficam fora do relatório.

`git diff --check` nos dois arquivos alterados não reportou erro.

## Lacunas

- Nenhum summary de execução real foi lido durante este pacote; portanto ainda não há comparação de qualidade/custo dos modelos. A saída real depende do runner produzir o contrato esperado.
- Quando o `costSource` não chega por chamada, o relatório indica que o resumo contém custo numérico mas não discrimina a fonte. Não converte estimativa em custo efetivo.
- Se faltarem chamadas, FX, output visual ou chat Q03, os respectivos campos permanecem `NAO_VERIFICADO`.
