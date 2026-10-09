# Fase 1 — relatório do spike MinerU

## Execução

Status: **concluída para a amostra reduzida**.

| Item | Valor |
|---|---|
| Parser | MinerU 3.4.5 |
| Backend | `pipeline` |
| Ambiente | Python 3.11.0rc1, PyTorch 2.6.0 CPU, torchvision 0.21.0 CPU |
| PDF original | `test/docsTeste/razao-proporcao-e-regra-de-tres.pdf` |
| Páginas do PDF original | 48 |
| Amostra processada | 10 páginas críticas |
| Tempo da amostra | aproximadamente 180 segundos |
| Resultado | COMPLETED |
| Artefatos | Markdown, JSON, middle/model JSON, layout PDF, span PDF, origin PDF e 21 imagens |

O manifesto reproduzível está em:

```text
test/mineru-spike/sample-pages/manifest.json
```

O conteúdo normalizado experimental está em:

```text
test/mineru-spike/sample-pages/layout.json
```

## Páginas avaliadas

Foram selecionadas as páginas 4, 7, 18, 21, 26, 27, 28, 40, 41 e 43 do PDF original. A amostra foi criada em um PDF de 10 páginas para reduzir o tempo de processamento CPU.

Importante: nesse PDF reduzido, o índice de página do MinerU é relativo à amostra. Na integração real, devemos processar o documento completo ou preservar um mapa `samplePage → sourcePage` para não perder a página original.

## Saída estrutural observada

O `content_list.json` produziu 153 elementos normalizados:

| Categoria | Quantidade |
|---|---:|
| TEXT | 93 |
| HEADER | 29 |
| EQUATION | 14 |
| PAGE_NUMBER | 10 |
| IMAGE | 5 |
| TABLE | 2 |

O parser também gerou uma visualização de layout e uma visualização de spans, o que permite conferir a ordem de leitura e a região física de cada elemento antes de qualquer LLM.

## Ganhos comprovados

### Fórmulas

As fórmulas foram extraídas em LaTeX, por exemplo:

```latex
E = { \frac { d } { r } }
```

Isso é muito mais útil do que o texto linear anterior, que podia separar numerador e denominador em linhas independentes.

### Classificação visual

O MinerU separou, no mesmo documento:

- texto;
- equações;
- tabelas;
- imagens;
- cabeçalhos;
- número de página.

Isso permite que o MeuMonitorAI filtre cabeçalhos e números de página sem apagar a evidência visual de uma figura ou tabela.

### Questões objetivas

Na região equivalente à página 40 do documento original, o parser preservou questões 36 a 38 como blocos textuais distintos, em vez de misturar todas as linhas em um único chunk indiferenciado.

Na região equivalente à página 41, ele preservou a questão 39 e suas alternativas em elementos separados do texto de outras questões. Isso fornece base suficiente para o futuro `QuestionSpan` baseado em elementos.

### Figuras e tabelas

O parser identificou cinco imagens e duas tabelas na amostra. Também gerou recortes/arquivos visuais, portanto a associação futura pode usar:

```text
page + bbox + asset path + element type
```

## Problemas ainda observados

### 1. Cabeçalhos ainda aparecem no output bruto

O MinerU os classifica como `HEADER`, mas não devemos depender de uma remoção irreversível. A aplicação deve preservar o elemento bruto e excluir apenas a projeção semântica.

### 2. Alternativas podem permanecer no mesmo elemento textual

Na questão da cana-de-açúcar, as alternativas aparecem dentro de um elemento `TEXT`, apesar de estarem em ordem legível. O assembler pedagógico ainda precisará separar `a)` até `e)` por regra textual e posição.

### 3. Solução e questão aparecem próximas

Na página com o exercício das torneiras, o parser preservou `Solução:` e várias equações. Isso é positivo para layout, mas a classificação pedagógica deverá impedir que a solução seja anexada ao enunciado como se fosse parte da pergunta.

### 4. Matemática não é automaticamente perfeita

O LaTeX é muito melhor que o texto linear, mas há trechos como `3 0`, `6 t` e símbolos OCR imperfeitos. Portanto:

```text
LaTeX presente ≠ fórmula validada
```

Continuam necessários `mathLayoutStatus`, confidence, crop visual e bloqueio para fórmulas determinantes corrompidas.

### 5. Custo de CPU

A amostra de 10 páginas demorou aproximadamente 3 minutos. O PDF completo de 48 páginas não terminou dentro da janela operacional desta execução. Isso confirma a necessidade de:

- serviço assíncrono;
- cache por hash;
- execução em GPU ou infraestrutura dedicada quando necessário;
- fast path PDF.js para documentos simples;
- roteamento de documentos difíceis;
- progresso visível para o usuário.

## Decisão da Fase 1

**MinerU deve avançar para a Fase 2 como parser avançado candidato.**

Não devemos, ainda, substituir o extrator atual em produção. O resultado mostra que o MinerU oferece a representação visual necessária, mas ainda precisamos:

1. normalizar o output em contrato independente do MinerU;
2. preservar o mapeamento de página original;
3. implementar associação pedagógica entre questão, alternativas, solução e gabarito;
4. validar fórmulas com regras de qualidade;
5. medir o resultado contra o baseline em um corpus anotado;
6. decidir o backend de produção com base em qualidade e custo.

## Artefatos gerados

```text
services/document-parser/README.md
services/document-parser/pyproject.toml
services/document-parser/Dockerfile
services/document-parser/scripts/run_mineru.py
test/mineru-spike/razao-proporcao-sample-pages.pdf
test/mineru-spike/sample-pages/manifest.json
test/mineru-spike/sample-pages/layout.json
test/mineru-spike/sample-pages/razao-proporcao-sample-pages/auto/
```

## Próximo passo autorizado pela V3

Iniciar a Fase 2:

```text
LayoutDocument v1
→ adapter MinerU
→ parse run idempotente
→ validação de schema
→ persistência futura de elementos/assets
```

O banco e o fluxo produtivo ainda não foram alterados nesta Fase 1.
