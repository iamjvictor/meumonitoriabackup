# Avaliação visual de PDFs e perguntas

Este diretório separa **referência anotada** (`gold.jsonl`), **observação de uma execução** (`*-observations.jsonl`) e resultados gerados (`*-results.jsonl`, `*-report.md`). A resposta precisa ser revisada por uma pessoa; o script calcula automaticamente extração, associação, recuperação e correspondência entre hashes esperados e entregues.

## Executar o avaliador

```bash
cd backend
node --import tsx src/scripts/evaluate-visual-chat.ts \
  --corpus ../tests/document-parser/visual-quality/gold.jsonl \
  --observations ../tests/document-parser/visual-quality/run-observations.jsonl \
  --output ../tests/document-parser/visual-quality/run-results.jsonl \
  --report ../tests/document-parser/visual-quality/run-report.md
```

As observações são capturadas no ambiente de teste a partir do pacote `/chunk/v2`, dos vínculos persistidos e dos eventos correlacionados pelo `requestId`: `chat.visual_context_resolved` e `chat.multimodal_payload_prepared`. O último evento registra `assetId` e SHA-256 dos bytes efetivamente anexados; nenhum base64 ou URL privada deve ser copiado para o corpus. O campo `humanReview` deve ser preenchido depois de comparar a resposta com os fatos anotados. Use também `baselineHumanReview` para a execução textual pareada.

## Contrato resumido

- `gold.jsonl`: `caseId`, categoria, criticidade, pergunta e contexto, SHA-256 do PDF, assets esperados (`sha256` + página), fatos obrigatórios com IDs, resposta aceitável e afirmações proibidas.
- `run-observations.jsonl`: uma linha por `caseId`, modelo/versão de prompt/latência/custo e resultado observado por etapa: `extractedAssets`, `linkedAssets`, `retrievedAssets`, `contextManifest`, `sentImageSha256`, resposta multimodal e baseline.
- `humanReview`: `questionUnderstood`, `visualFactsCorrect`, `relationToQuestionCorrect`, `pedagogicalReasoning`, `sourcePageCorrect`, `limitationHonest`, `matchedFactIds` e `unsupportedVisualClaims`.

O avaliador reprova a resposta multimodal quando falta qualquer fato obrigatório, quando não foi enviada a imagem esperada, ou quando chega asset fora da lista autorizada. Sem rubrica humana, a resposta fica `PENDING` e o relatório não passa o gate. A letra correta ou uma resposta textual plausível não substitui a validação dos fatos visuais.

## Estado do corpus

O `gold.jsonl` contém por enquanto o caso piloto da questão 01 de `questionsQuimica.pdf`, com a tabela periódica da página 15. Ainda não atende ao mínimo de 20 casos da spec e não autoriza canário. Falta anotar gráficos, fórmulas, tabelas, follow-ups, troca de questão, foto ilegível, negativas e distratores, cada qual com revisão independente.

`smoke-observations.jsonl` / `smoke-report.md` registram o reteste real do parser. `questionsQuimica.pdf` concluiu `/chunk/v2` com 13 chunks dentro do limite de 500 tokens e 20 imagens; a tabela da questão 01 foi exportada com o hash anotado. `ocrTeste.pdf`, com `DOCUMENT_PARSER_ENABLE_OCR=true`, concluiu com 3 chunks e imagens completas das páginas escaneadas 1, 3 e 4. Todos os hashes do pacote ZIP foram verificados. A observação contém apenas o asset extraído pelo parser: não houve ingestão em banco, vínculo com questão, chamada ao chat ou revisão humana.

## O que falta para avaliação ponta a ponta

1. Ingerir os PDFs no banco e storage de um ambiente isolado, com imagens visuais habilitadas; anotar os IDs de questão/monitor/matéria necessários para enviar ao chat autenticado.
2. Verificar a associação da tabela da página 15 à questão 01 e revisar as imagens de página inteira usadas quando o Docling não emite `Picture`.
3. Executar as perguntas no chat multimodal e baseline textual, coletar os eventos por `requestId` e completar a rubrica humana.
4. Atingir pelo menos 20 casos revisados e avaliar os gates da spec antes de qualquer rollout.
