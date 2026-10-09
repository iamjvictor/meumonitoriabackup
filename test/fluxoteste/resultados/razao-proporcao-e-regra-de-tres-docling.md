# Fluxo oficial de ingestão com Docling HTTP

> Integração de teste sem LLM e sem banco real. O relatório simula parse, layout e chunks.

## parse

- status: `COMPLETED`
- parseRunId: `docling-run-1`
- parser selecionado: **DOCLING**
- fallback legado: **não**
- motivo do fallback: `-`
- parser requisitado: `DOCLING`
- requisições ao parser: **2**

## layout

- origem: **DOCLING**
- páginas: **1**
- elementos: **2**

| categoria | quantidade |
| --- | ---: |
| TEXT | 2 |

## chunks

- chunks persistidos: **1**
- chunks de questão: **0**

| id | bloco | tipo | questão | páginas | índice | tokens | status | conteúdo |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- |
| chunk-1 | block-1 | FORMULA | - | 1-1 | 0 | 60 | EMBEDDING_PENDING | Regra de três Se 3 cadernos custam R$ 18, quanto custam 5? Use a regra de três para justificar o resultado em uma explicação completa, com pelo menos uma frase adicional, para que o fluxo oficial consiga montar chunks úteis para a IA depois. |

