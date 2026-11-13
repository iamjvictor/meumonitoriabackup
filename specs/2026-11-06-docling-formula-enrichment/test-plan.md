# Plano de QA — Docling Formula Enrichment

## Critérios de aceite

- AC-001: O pipeline PDF do parser habilita explicitamente o enriquecimento de fórmulas do Docling.
- AC-002: A execução real do parser no PDF `tests/document-parser/teacher-materials/Quimica-3.pdf` (ou fixture equivalente) extrai a equação da questão 4 como conteúdo textual útil, sem `<!-- formula-not-decoded -->`.
- AC-003: A saída preserva evidência suficiente para reconhecer a reação catalisada por MnO₂: `2 H₂O₂ (aq) → 2 H₂O (l) + O₂ (g)` (texto equivalente/LaTeX aceito; conferir a imagem ou JSON do Docling se caracteres não forem normalizados).
- AC-004: A verificação é somente local e não chama a LLM, grava no banco, nem altera credenciais.

## Cenários

| ID | AC | Nível | Procedimento | Resultado esperado |
|---|---|---|---|---|
| QA-001 | AC-001 | Unitário/configuração | Executar o teste do parser que inspeciona as opções do `PdfPipelineOptions` criado por `get_document_converter`. | `do_formula_enrichment` está explicitamente `True`. |
| QA-002 | AC-002, AC-003, AC-004 | Integração local | Enviar o PDF Quimica-3 ao endpoint `/chunk` do document-parser local (ou executar o mesmo caminho Docling sem HTTP); inspecionar texto da página da questão 4, itens de fórmula e assets exportados. | Texto contém a reação ou representação equivalente, sem marcador não decodificado. Nenhuma chamada de LLM ou escrita no banco. |
| QA-003 | AC-002, AC-003 | Regressão do artefato | Comparar saída anterior arquivada com a nova saída da Q04 e verificar ocorrência do marcador e expressão química. | O marcador anterior desaparece e a reação está recuperável na saída nova. |

## Dados e limitações

- Fixture prioritária: `tests/document-parser/teacher-materials/Quimica-3.pdf`.
- Comparar com `tests/document-parser/results/quimica-3-structured-extraction-real-2026-11-06.json` apenas como referência anterior; ela representa resposta da LLM baseada no parser anterior, não substitui a saída Docling bruta.
- O teste real pode depender dos modelos locais/cache do Docling. Registrar versão, comando e qualquer indisponibilidade. Uma opção habilitada, isoladamente, não prova extração correta.
