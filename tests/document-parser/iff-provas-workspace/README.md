# Experimento de extração — provas antigas do IFF

Workspace isolado para validar o PDF original antes de processar o corpus completo.

## Recorte testado

`iff-selecao-2010-pages-1-30.pdf` contém somente as páginas físicas 1–30 do arquivo original. O caderno começa na página física 3: capa na 1, instruções na 2, prova Ensino Médio/Técnico concomitante/integrado PROEJA nas páginas físicas 3–28 (questões 1–40 e gabarito), e início de outro caderno/gabarito nas páginas 29–30. A prova está identificada como Processo Seletivo 2010, edital de 21/09/2009; portanto, “prova de 2009” provavelmente se refere ao ano de aplicação/elaboração, embora o concurso seja Seleção 2010.

## Objetivo e critérios de aceite

- **AC-001**: processar apenas o recorte de 30 páginas pelo fluxo Docling já usado no document-parser e guardar os artefatos aqui.
- **AC-002**: confirmar texto e proveniência em todas as páginas do recorte, incluindo imagens/tabelas que possam exigir revisão visual.
- **AC-003**: reconhecer a estrutura da primeira prova: identificação IFF/Seleção 2010, questões 1–40 em ordem e gabarito correspondente.
- **AC-004**: distinguir fim da prova Ensino Médio/Técnico concomitante/integrado PROEJA e início do caderno Técnico Subsequente, sem misturar seus enunciados/gabaritos.
- **AC-005**: registrar falhas/limites antes de considerar o método pronto para aplicar ao PDF completo.

## Execução

Entrada original: `/home/joaov/Downloads/Arquivo Provas Antigas.pdf` (431 páginas).
SHA-256 original: `539596cf78e5fd93815f1d8d3e8084fd753839f95311c5e4e7710961988d5a52`.
SHA-256 do recorte: `1824c111741c4cac5443ad3ecd48c1411722b3d527929becf56dd7f8d550550d`.

Extração de referência de texto: `pdftotext -layout` em `source-text.txt`.
Parser principal e configuração: `services/document-parser/scripts/run_mineru.py` (Docling v2, conversão CPU padrão). Resultados completos ficam em `extraction/`.

Não há gravação no banco, fila ou chamada de IA neste experimento. O PDF original não é copiado para o workspace.

## Resultado desta primeira execução

Docling 2.122.0 concluiu o recorte em 10 min 45 s e identificou as 40 questões do primeiro caderno e os dois gabaritos. A auditoria do caminho legado PDF.js produziu 0/40 blocos determinísticos, mas não representa o fluxo atualizado, que extrai o documento completo e o envia em uma chamada estruturada à LLM. A saída Docling direta identifica 40 marcadores e separa os gabaritos, mas ainda não é perfeita: alternativas ficam fora de ordem em algumas questões, fórmulas podem ser corrompidas e figuras/gráficos não têm conteúdo semântico no Markdown. A validação pendente é uma execução ponta a ponta da chamada estruturada à LLM; detalhes estão em [validation.md](validation.md).


## Chamada estruturada à LLM

Foi executado o `StructuredQuestionExtractionService` no texto Docling das páginas 1–29 (a página 30 está vazia), em uma única janela. A LLM retornou 40 registros, Q1–Q40. Não houve persistência em banco; os resultados estão em [questions-review.md](extraction/questions-review.md) e no JSON bruto. A revisão encontrou erros de mistura/reordenação em Q1, Q28 e Q33; nenhum asset de imagem foi anexado, portanto questões dependentes de figuras ainda precisam revisão.
