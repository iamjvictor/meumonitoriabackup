# PDFs de regressão do parser

## Fixtures

| Arquivo | Uso | SHA-256 |
| --- | --- | --- |
| `ocrTeste.pdf` | Base de conhecimento escaneada, 4 páginas | `5dc9b25e4ea2f5eb0729d748d3de2058d53cc90167ad558851504dddd40c4acc` |
| `questionsQuimica.pdf` | Caderno digital com 10 questões discursivas, 16 páginas | `dbc94a84bc48dfba51b0eda410e7cf116430827b6cd8468338030eb10ef3a28d` |

Os arquivos foram copiados de `pH e pOH.pdf` e `Quimica-3.pdf`, respectivamente. Os hashes foram conferidos contra os originais.

## Executar

Na raiz do repositório:

```bash
python3 -m unittest tests/document-parser/test_questions_pdf.py -v
DOC_CHUNKER_URL=http://127.0.0.1:8080 python3 -m unittest tests/document-parser/test_ocr_upload.py -v
```

O segundo teste exige o serviço HTTP com `DOCUMENT_PARSER_ENABLE_OCR=true` e `pdftotext` instalado. Sem `DOC_CHUNKER_URL`, o teste é pulado. Ele envia o PDF real a `/chunk`, valida resposta, hash, páginas, recuperação de texto e presença de `pH` e `pOH`. O primeiro chama o extrator PDF.js, normalização, montador de blocos, chunker e extração determinística reais do worker; não usa IA nem banco.

Para comparar o parser Docling em `QUESTIONS`:

```bash
cd backend
npm run test:questions-parser -- ../tests/document-parser/questionsQuimica.pdf ../tests/document-parser/results/questionsQuimica.docling.json --source=docling --parser-url=http://127.0.0.1:8080 --expect-numbers=01,02,03,04,05,06,07,08,09,10
```

## Resultado observado em 26/10/2026

- `/chunk` classificou `ocrTeste.pdf` como `SCANNED`, carregou RapidOCR e retornou 3 chunks com proveniência nas páginas 1–4. O texto bruto retornado tem cerca de 2,3 mil caracteres; a camada nativa tinha 148. O OCR recuperou `pH` e `pOH`, mas há erros de leitura em fórmulas e palavras.
- A baseline do PDF.js tinha quatro blocos de questão da capa e só reconhecia as questões reais 01–03, 05, 06 e 09 como candidatas. Os cortes em 04, 07, 08 e 10 vinham de frases iniciadas por “solução”; o parser as tratava como cabeçalho de resolução. Havia também falsos marcadores em `C.` no enunciado, nos passos `1)`/`2)` e na instrução “6. Ao terminar”.
- Depois dos ajustes, o PDF.js produz exatamente 10 blocos de questão, 10 chunks com cobertura integral e 10 candidatas determinísticas (01–10), sem candidatas da capa nem rodapés nos enunciados. O teste também confirma que `1)`/`2)` do procedimento da questão 08 não viram alternativas.
- A etapa de promoção marca 9 candidatas como `READY_FOR_COMPLETION`. A questão 01 permanece `VISUAL_PENDING` porque depende da tabela periódica da página 15, que não está no chunk da questão. A questão 09 agora passa: embora mencione uma tabela, o cabeçalho e as três linhas de dados foram extraídos no mesmo chunk.
- `/v1/parse` com Docling concluiu HTTP 200 para o caderno digital, mas a montagem atual gerou **0** blocos `QUESTION`: o texto convertido traz marcadores como `QUESTÃO 08` sem pontuação, que o detector ainda não aceita. O resultado está em `results/questionsQuimica.docling.json`.

O teste de questões mede também `evaluateQuestionCandidatePromotion`, mas para antes de `persistCandidates`. No fluxo real, cada candidata primeiro é registrada como span; 9 seguiriam para completion por IA e a 01 ficaria marcada para revisão visual. Depois, as questões são salvas para revisão, com campos ausentes e qualidade em `metadata`. O teste não chama IA nem banco; portanto, ainda falta um teste de integração do worker com banco/fila para comprovar conteúdo final, embeddings e recuperação RAG.

A [auditoria de qualidade de 27/10](./results/questionsQuimica.quality-audit-2026-10-27.md) repetiu a extração das dez candidatas, executou o dry run dos agentes e simulou o vínculo visual com os assets reais. O OpenRouter respondeu HTTP 401 nas chamadas do dry run; portanto, ainda não há contagem de questões concluídas pela IA ou salvas. A auditoria detalha a causa do `VISUAL_PENDING` da questão 01.

## Avaliação visual e pergunta contextual

O [README do corpus visual](./visual-quality/README.md) explica o formato do gold set, observações do fluxo real, rubrica humana e comando do avaliador. O reteste local de 27/10 com OCR habilitado registrou:

- `questionsQuimica.pdf`: `/chunk/v2` respondeu HTTP 200 com 13 chunks (máximo 499 tokens) e 20 imagens. A tabela da questão 01 está na página 15; seu SHA-256 confere com o corpus anotado.
- `ocrTeste.pdf`: `/chunk/v2` respondeu HTTP 200 com 3 chunks (máximo 489 tokens) e 3 imagens de página (1, 3 e 4). A página 2 ultrapassa o limiar de texto nativo e não recebe renderização de fallback. Os hashes de todos os PNGs conferem com o manifesto.
- O relatório `visual-quality/smoke-report.md` agora confirma a extração do asset piloto. Associação com a questão, envio ao chat e avaliação da resposta continuam sem execução real.

Esses resultados não autorizam rollout. A spec estabelece pelo menos 20 casos revisados e avaliação pareada textual/multimodal; o gold set atual contém apenas o caso piloto da questão 01.
