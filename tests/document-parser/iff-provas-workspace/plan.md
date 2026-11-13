# Plano

1. Recortar páginas físicas 1–30 sem reordenar.
2. Gerar baseline textual com Poppler e registrar metadados/hashes.
3. Rodar `services/document-parser/scripts/run_mineru.py` no ambiente local Docling, salvando manifesto, Markdown, JSON Docling e layout.
4. Auditar cobertura de páginas, títulos de seção, marcadores de questão, gabaritos e imagens/tabelas.
5. Registrar evidências e lacunas em validation.md; iterar o extrator de teste neste workspace, sem tocar no pipeline de produção.
