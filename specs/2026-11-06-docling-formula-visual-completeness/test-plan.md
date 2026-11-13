# Plano de QA — fórmula e figura na revisão de questões

## Escopo e isolamento

Validar os critérios AC-001 a AC-006 da especificação `docs/superpowers/specs/2026-11-06-question-formula-visual-completeness-design.md`. O E2E pode usar credenciais de IA já configuradas em `backend/.env`, mas todas as URLs de banco e Storage serão fixadas em `dbtemp` local (`127.0.0.1:56322` e Storage local). Não enviar dados para Supabase remoto. Não aprovar uma questão somente pela contagem de questões ou por JSON estruturalmente válido.

## Cenários

| ID | AC | Nível | Entrada e passos | Resultado esperado |
|---|---|---|---|---|
| QA-001 | AC-001 | Parser/worker | Rodar Docling em `Quimica-3.pdf`; consultar o FormulaItem da Q04 e o chunk enviado à extração estruturada. | `orig` e `text` enriquecido seguem como campos distintos, com página/itemRef/bbox; o request não descarta o original. |
| QA-002 | AC-001, AC-003, AC-005 | E2E real | Processar Q04 e inspecionar enunciado persistido e payload de revisão. | Reação `2 H₂O₂(aq) → 2 H₂O(l) + O₂(g)` legível; constante `4,0 × 10⁷ s⁻¹` com expoente correto; índices/expoentes renderizados como MathML/KaTeX, sem `10 7` achatado. |
| QA-003 | AC-001, AC-003, AC-005 | E2E real | Processar Q05 e inspecionar enunciado persistido e payload de revisão. | `H₂O(l) → H₂(g) + ½ O₂(g)` ou representação LaTeX equivalente fiel; não aceitar `\lceil` como substituição de `½`. Renderer apresenta a fórmula sem erro. |
| QA-004 | AC-002, AC-003, AC-004, AC-005, AC-006 | Parser + persistência + revisão | Inspecionar manifesto Docling de todas as páginas de `Quimica-3.pdf`; conferir visualmente a tabela periódica FIGURE da página impressa 15 e associá-la à Q01 da página impressa 3, cujo enunciado explicitamente depende da tabela. Processar e abrir Q01 na revisão. | Associação entre páginas diferentes é válida porque o enunciado referencia a tabela e o modelo sustenta o vínculo. Somente FIGURE reconhecido é enviado/salvo. Relação mantém origem real `pageNumber=15`, `readingOrder`, `bbox` e âncora literal junto à referência textual da questão. Não aceitar asset decorativo (ex.: selo/número da questão) como evidência substantiva. |
| QA-005 | AC-002, AC-003, AC-004, AC-005 | Worker/repositório/UI | Escolher uma questão sem FIGURE vinculado; conferir request enviado, registros e tela. | Nenhuma imagem na chamada daquela questão, nenhum `QuestionVisualAsset` e nenhum placeholder de imagem na revisão. |
| QA-006 | AC-002, AC-004 | Worker/repositório | Usar documento SCANNED/MIXED que gere assets `PAGE`; conferir ligações da questão e Storage. | PAGE pode continuar no nível do documento para OCR/conhecimento, mas não é enviado nem associado à questão como figura. Sem crop sintético. |
| QA-007 | AC-003, AC-004 | Worker/repositório | Tentar associar à questão uma figura de outra questão sem referência textual; tentar citar asset fora da janela do documento ou usar âncora inexistente. | Vínculos sem suporte textual, asset fora do documento/janela e âncora inválida são rejeitados; nenhuma associação incorreta é persistida. Referência válida da Q01 à tabela da página 15 é aceita, com provenance `pageNumber=15` preservada. |
| QA-008 | AC-005 | UI unitário + inspeção local | Abrir modo de leitura da revisão para texto com LaTeX, FIGURE ancorado e alternativa com fórmula; depois abrir edição. | Enunciado/alternativa têm KaTeX renderizado; FIGURE aparece antes/depois do trecho conforme a âncora; `alt` e página presentes; edição e callbacks continuam editáveis; PAGE não aparece. |
| QA-009 | AC-004, AC-006 | E2E isolado | Executar pipeline real de parser → chunks → embeddings → extração estruturada → save no banco local. Capturar IDs e consultar diretamente as linhas de questão, fontes e relações visuais. | Documento e questões ficam no banco `dbtemp`; estados são de revisão pendente; conteúdo/fórmulas/fontes e relações batem com o request/asset. Confirmar que script não usa endpoint Supabase remoto. |
| QA-010 | AC-006 | Interface local | Iniciar API/Frontend locais, autenticar com fixture local e abrir questão persistida via tela de revisão docente. | Payload de produção local exibe texto, KaTeX e FIGURE posicionada conforme QA-004; a relação visual e texto apresentados correspondem ao que foi salvo. |

## Regras de decisão

- Falha em QA-002 ou QA-003 reprova fidelidade matemática mesmo que OCR/LLM retorne dez questões.
- Não há critério para associar imagem quando o Docling não detectou FIGURE substantiva na questão.
- Asset PAGE nunca conta como evidência visual da questão.
- O vínculo só é aceito se origem, página, ordem/bbox e âncora textual forem verificáveis e coerentes com a página renderizada.
- Se o PDF/Docling não gerar qualquer FIGURE apropriado, registrar esse fato e executar também um fixture comprovado com FIGURE para validar a capacidade positiva; não converter um PAGE ou crop em substituto.
- Custos, modelo usado, chamadas reais, tempos, IDs locais e hash do PDF são anotados em `validation.md`; nunca registrar segredo de API.

## Verificação incremental QA-003 — restauração da equação completa de Q05

| ID | AC | Entrada e passos | Resultado esperado |
|---|---|---|---|
| QA-003A | AC-001, AC-003 | Enviar à normalização a resposta da LLM com a linha de Q05 achatada (`H 2 O ... + 1 / 2 O 2 ...`) junto da evidência Docling: `originalText` contendo `H 2 O`, `H 2 (g)` e `1 / 2 O 2`, e `enrichedText` contendo a equação e o glifo `\\lceil`. | A linha inteira usa o LaTeX enriquecido em um único bloco `$$...$$`; apenas a fração é corrigida para `\\frac{1}{2}` porque o texto original comprova `1/2`. O restante do enunciado permanece intacto. |
| QA-003B | AC-001, AC-003 | Repetir com `originalText` ausente ou sem `1 / 2 O 2`, com espécies diferentes, sem linha seguinte “Apresente”, ou com linha já delimitada em `$$...$$`. | Não substituir a linha nem inferir/duplicar fórmula ou delimitadores. |
| QA-003C | AC-001, AC-003 | Reexecutar o caso Q04 de decomposição de peróxido de hidrogênio com sua `formulaEvidence`. | A correção da equação de Q05 não altera a reação de Q04; a fórmula correta de Q04 continua baseada exclusivamente em sua própria evidência Docling. |
