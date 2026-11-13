# Validação

| Critério | Tarefa | Cenário | Resultado |
|---|---|---|---|
| AC-001 | Pacotes 1–2 | TP-001 | Atendido: Docling 2.122.0 COMPLETED; entrada LLM usou páginas 1–29 e uma chamada |
| AC-002 | Pacotes 1–2 | TP-002 | Parcial: layout tem páginas 1–30; página 30 vazia. Nenhum asset visual foi anexado à chamada |
| AC-003 | Pacote 2 | TP-003 | Parcial: LLM retornou questões 1–40 em ordem, mas amostragem identificou contaminações/reordenação em Q1, Q28 e Q33; fórmulas/figuras precisam revisão |
| AC-004 | Pacote 2 | TP-004 | Parcial: saída cobre Q1–Q40 do primeiro caderno; gabaritos foram deliberadamente ignorados pelo contrato estruturado, e não há conteúdo do segundo curso nas questões |
| AC-005 | Pacote 2 | TP-005 | Atendido: resultado, uso de tokens e lacunas registrados abaixo |

## Evidência preliminar

Poppler extrai texto nativo do recorte: 1.192 linhas, 6.190 palavras, 50.770 caracteres. Detecta QUESTÃO 1–40 nas páginas físicas 3–26 e dois gabaritos distintos nas páginas 27–28. Não há necessidade inicial de OCR para texto corrido; tabelas/figuras precisam ser verificadas na saída Docling.


## Execução Docling 2026-11-06

**Concluída.** A conversão levou 645.592 ms (10 min 45 s). O manifesto registra `COMPLETED`, Docling 2.122.0, 30 páginas e `exitCode: 0`. Foram produzidos `document.md`, `document.json` e `layout.json`.

Comando: `services/document-parser/.venv/bin/python services/document-parser/scripts/run_mineru.py --input tests/document-parser/iff-provas-workspace/iff-selecao-2010-pages-1-30.pdf --output tests/document-parser/iff-provas-workspace/extraction/docling-run-001` A auditoria abaixo concluiu os critérios estruturais e registra as lacunas de qualidade.



## Auditoria do caminho legado PDF.js (não representa o fluxo estruturado atual)

Executado `node --import tsx src/scripts/audit-question-chunks.ts ... --source=pdfjs --expect-count=40` sobre o recorte (sem banco/IA). Resultado do auditor antigo de blocos/candidatas: 30 páginas, 6 blocos, **0 blocos QUESTION**, 0 candidatas determinísticas e somente 9 chunks. Esse caminho determinístico não é a extração estruturada atual via LLM e não deve ser usado como critério de sucesso deste experimento; o JSON fica apenas como diagnóstico da baseline antiga. A linha `ANSWER_KEY` começa na página 2 e termina na 28, engolindo instruções e questões. Os outros dois blocos ANSWER_KEY reconhecem os gabaritos das páginas 28–29, mas o segundo fica `NEEDS_REVIEW` por conter também o título Técnico Subsequente. Relatório detalhado: `extraction/questions-flow-pdfjs.json`.

## Resultados e achados

- `layout.json` tem 30 páginas, numeradas de 1 a 30. Páginas 1–29 têm elementos com texto; página 30 está sem texto, o que coincide com o final em branco do baseline.
- `document.md` contém exatamente os marcadores QUESTÃO 1–40, em ordem crescente, e dois cabeçalhos/gabaritos: Processo Seletivo 2010 Ensino Médio/Técnico Concomitante/Integrado PROEJA e Técnico Subsequente.
- O texto identifica o edital como setembro de 2009 e a seleção como 2010.
- Limite funcional importante: imagens aparecem como `<!-- image -->` e não carregam o conteúdo necessário para responder itens visuais. Exemplos visíveis no recorte incluem a questão 4 (campanha), questão 7 (gráfico/tabela), além de figuras e mapas nas questões de matemática/geografia. Os arquivos exportados não contêm PNGs porque este script exporta documento/layout textual; este ensaio não valida a associação de assets visuais.
- A ordem de leitura em algumas questões fica alterada: alternativas aparecem em ordem `a, c, b, d, e` em várias questões. Fórmulas da questão 11 estão claramente corrompidas no Markdown (`\S S e n d ...`). Portanto, a contagem estrutural está correta, mas o extrato ainda não está perfeito como conteúdo pedagógico.
- A extração Poppler de referência contém 6.190 palavras; o Markdown Docling tem 39.379 caracteres. As diferenças são esperadas em imagens, tabelas e fórmulas, mas precisam ser resolvidas para uso confiável de questões visuais.

## Conclusão do teste

O Docling direto percorre as 30 páginas e reconhece os marcadores das 40 questões. O caminho atual do worker prepara chunks do documento completo e envia todo o conteúdo em uma chamada estruturada à LLM, respeitando o orçamento configurado; não depende de detectar as questões previamente por regras determinísticas. A saída bruta do Docling ainda não é uma transcrição perfeita: ordem das alternativas, fórmulas e figuras não preservadas exigem enriquecimento visual e validação por questão. A validação pendente é executar o fluxo novo de ponta a ponta com este PDF: extração completa, chunks/páginas/assets e uma chamada estruturada à LLM, verificando as 40 questões, os dois gabaritos e as referências visuais. O auditor legado não mede essa etapa.


## Fluxo atualizado considerado

`StructuredQuestionExtractionService` carrega todos os chunks READY, monta uma única janela documental com `buildQuestionExtractionWindows` e faz uma chamada estruturada à LLM. O limite padrão de entrada no ambiente é 100.000 tokens; acima dele o serviço falha explicitamente sem particionar silenciosamente o documento. A extração do Markdown Docling do recorte tem 11.547 tokens pelo tokenizer do projeto (antes de instruções e evidências anexadas), então o texto cabe com ampla margem no limite padrão. Figuras substantivas entram como imagens multimodais quando o fluxo do parser as registra e associa aos chunks.

Ainda falta uma execução de ponta a ponta pela LLM para este PDF: o teste local anterior não criou chunks persistidos nem assets no pipeline do worker, e não fez chamada externa.


## Execução estruturada real — 2026-11-06

- Runner: `run-structured-extraction.ts`; usa a classe `StructuredQuestionExtractionService` real com um repositório local em memória, sem banco de dados. A resposta foi salva em `extraction/structured-llm-run-001.json`; versão legível em `extraction/questions-review.md`.
- Entrada: 29 chunks por página, páginas físicas 1–29; página 30 está em branco. 10.431 tokens de conteúdo pelo tokenizer local, limite configurado de entrada 100.000. A chamada usou override temporário de 16.000 tokens para saída, sem alterar `.env`.
- LLM: modelo `deepseek/deepseek-v4.1-flash`; 1 chamada; HTTP 200; 12.621 tokens de prompt, 15.451 de conclusão, 28.072 totais; `finish_reason=stop`.
- Resultado: 40 candidatas, números 1–40 em ordem. Não houve gravação em banco: o repositório foi simulado e salvou apenas no workspace. Todas as `correctAnswer` ficaram nulas conforme contrato; o gabarito não foi solicitado.
- Imagens anexadas: 0. As figuras e gráficos do PDF não foram enviados nesta primeira execução. Portanto, a LLM não pôde ler conteúdo que só existe em imagem.
- Revisão da saída: Q1 retornou seis alternativas e absorveu uma frase de contexto como alternativa A; Q28 retornou oito alternativas, misturando as três afirmativas do enunciado com as alternativas; Q33 retornou seis alternativas e incluiu como alternativa A texto de contexto sobre Olimpíadas. São falhas de layout/OCR herdadas da entrada e não devem ser aceitas sem correção.

### Resultado

A extração estruturada completou a chamada e recuperou 40 registros numa única janela, mas **não está pronta para aprovação automática**. O objetivo desta rodada (executar o fluxo LLM nas 30 primeiras páginas) foi atingido. Revisão humana e uma próxima passagem com assets visuais ainda são necessárias para qualidade integral.
