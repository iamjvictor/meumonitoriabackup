# Validação QA — Docling Formula Enrichment

## Resultado

**Q04 aprovada no parser local com Docling 2.122.0.** Com `do_formula_enrichment=True`, a reação deixou de ser `<!-- formula-not-decoded -->` e passou a constar como LaTeX no Markdown exportado, no JSON do Docling e no `raw_text` do chunk. Nenhuma LLM, banco ou credencial foi usada.

## Evidências por critério

| Critério | Evidência | Resultado |
|---|---|---|
| AC-001: enrichment habilitado explicitamente | `services/document-parser/scripts/run_mineru.py:94`; teste `test_converter_enables_docling_formula_enrichment` | Aprovado; 4 testes do módulo passaram. |
| AC-002: parser real não deixa o marcador na Q04 | Conversão nova do PDF, saída `/tmp/docling-formula-enrichment-q4-2026-11-06/document.md`; busca por `formula-not-decoded` não encontrou marcador. | Aprovado. |
| AC-003: reação recuperável como texto | Markdown e `document.json` contêm `2 \\, H _ { 2 } O _ { 2 } \\left ( a q \\right ) \\xrightarrow { \\, M n O _ { 2 } \\left ( s \\right ) } 2 \\, H _ { 2 } O \\left ( \\ell \\right ) + O _ { 2 } \\left ( g \\right )`. O chunk de página 6 também contém a fórmula no `raw_text`. | Aprovado para Q04. A normalização LaTeX é legível e mantém reagentes, catalisador, seta, produtos e estados físicos. |
| AC-004: execução local isolada | Conversão via `run_mineru.py`; etapa de chunking/empacotamento executada sobre o `DoclingDocument` gerado. | Aprovado; sem chamada externa ou escrita no banco. |

## Comandos e dados

- `services/document-parser/.venv/bin/python -m unittest services/document-parser/tests/test_normalize_content_list.py -v` — 4 testes, sucesso.
- `services/document-parser/.venv/bin/python services/document-parser/scripts/run_mineru.py --input tests/document-parser/teacher-materials/Quimica-3.pdf --output /tmp/docling-formula-enrichment-q4-2026-11-06` — conversão fresca, `COMPLETED`, exit code 0, duração 234.874 ms, sem GPU detectada.
- A etapa de chunker e pacote v2 reutilizou o JSON recém-gerado (`DoclingDocument.model_validate_json`) com converter substituto para não executar a conversão cara duas vezes. Resultado: 13 chunks, fórmula de Q04 presente no `raw_text`, 20 assets visuais no total. Artefato: `/tmp/docling-formula-enrichment-q4-v2.zip`.
- SHA-256 do fixture: `dbc94a84bc48dfba51b0eda410e7cf116430827b6cd8468338030eb10ef3a28d`.

## Achados e lacunas

- **Observação — asset:** não foi exportado recorte específico da equação. O único asset da página 6 no pacote é `#/pictures/8`, o rótulo “QUESTÃO 04” (bbox `[32.49, 719.01, 73.42, 680.51]`). A fórmula é um item `#/texts/62` com label `formula` e bbox próprio `[217.32, 677.06, 420.47, 652.40]`; o exportador de assets atualmente inclui apenas `picture` e `figure`. A LLM poderá receber a fórmula textual, mas o pacote visual não inclui a imagem/crop dessa equação.
- O artefato do chunker foi criado usando o documento real desserializado e o fluxo real de chunking/exportação, mas sem segunda conversão pelo endpoint HTTP. A conversão fresca exercitou o mesmo `get_document_converter` chamado pelo serviço.
- Uma verificação exploratória encontrou outra fórmula no documento (página 7) cuja saída LaTeX aparenta estar incorreta (`\\lceil _ { 2 } O _ { 2 }` para parte da expressão). Não afeta o aceite específico de Q04, mas demonstra que habilitar o enrichment não garante precisão em todas as fórmulas; ampliar o corpus é recomendável.
