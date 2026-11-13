# QA — extração de questões em outros PDFs

Data: 2026-11-06. Execução real do parser Docling v2 e do OpenRouter. Nenhuma gravação no banco/Storage.

## Método e isolamento

Segui [test-plan.md](./test-plan.md). Usei `DocChunkerV2Client` e `StructuredQuestionExtractionService` do backend, com assets retornados pelo parser e um repositório em memória que capturou os objetos exatamente como chegaram à fronteira `save`. As imagens enviadas foram PNGs reais do parser, associados no harness aos chunks cuja lista de páginas contém a página do asset. Esse vínculo é local, inferido pela sobreposição de página; não veio de tabelas/Storage.

A chave veio de `dotenv.parse(backend/.env)` antes dos imports de configuração. Não foi impressa nem salva. Sobrescrevi apenas as configurações pedidas: `QUESTION_EXTRACTION_MAX_TOKENS=16000`, timeout `180000 ms` e reasoning `none`. Modelo efetivo: `deepseek/deepseek-v4.1-flash`. O custo não foi incluído na resposta/log retornado pelo OpenRouter, então não está disponível nesta execução.

| Arquivo | SHA-256 | Páginas | Chunks enviados | Assets disponíveis/enviados | Chamadas | Tokens prompt/completion/total | Duração LLM |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `Quimica-3.pdf` | `dbc94a84bc48dfba51b0eda410e7cf116430827b6cd8468338030eb10ef3a28d` | 16 | 13 | 20 / 20 | 1 | 9.765 / 2.984 / 12.749 | 17.146 ms |
| `Estequiometria.pdf` | `63ac6bcdc1a33ef8a67998886482432496754695f6a3db9c918e3c6e7eb346cd` | 4 | 3 | 8 / 6 | 1 | 3.281 / 436 / 3.717 | 3.713 ms |

Ambas as respostas tiveram HTTP 200, `finishReason=stop`, reasoning tokens 0 e não foram truncadas. A extração confirmou uma janela e uma chamada por documento. O SHA de `questionsQuimica.pdf` coincide com `Quimica-3.pdf`, portanto não contei esse arquivo duplicado como outro caso.

## Resultado por PDF

### Quimica-3.pdf — caderno discursivo

O PDF contém as questões 01–10; a resposta retornou exatamente 10 objetos, numerados 01–10, todos sem alternativas e sem gabarito. O formato é discursivo no original, então ausência de alternativas está correta. As questões 01–10 receberam referências a chunks existentes. O modelo associou evidência visual a 9 questões; a Q08 não citou asset. Nos casos citados, os IDs foram validados pelo serviço contra os assets disponibilizados.

**Achado P2 — fórmulas em imagem foram perdidas na saída estruturada.** O PDF, página impressa 3 (página 3 do arquivo), mostra a reação `2 Br⁻(aq) + Cl₂(g) → Br₂(ℓ) + 2 Cl⁻(aq)`. A resposta manteve o pedido de identificar o agente oxidante, mas no local da reação escreveu literalmente `<!-- formula-not-decoded -->` ([JSON, Q01, linha 139](../../tests/document-parser/results/quimica-3-structured-extraction-real-2026-11-06.json:139)). O mesmo marcador substituiu a reação da Q04 (linha 198) e a equação da eletrólise na Q05 (linha 217). Os objetos citam assets de imagem, mas as fórmulas não foram preservadas; precisam de revisão do professor.

**Achado P2 — notação de expoente/subscrito foi achatada em mais itens.** Por exemplo, na Q04 a resposta escreve `4,0 x 10 7 s - 1`, enquanto a página impressa 6 mostra `4,0 × 10⁷ s⁻¹`; também apresenta fórmulas como `H 2 O2` e `MnO 2` em vez de índices claros. A imagem está associada à Q04, mas a saída ainda não seguiu a regra de preservar expoentes/índices sem ambiguidade. Evidência no mesmo JSON, Q04 na linha 198.

### Estequiometria.pdf — questão objetiva e questão discursiva

O texto visível tem duas questões: uma objetiva com alternativas A–D e uma discursiva sem alternativas. A resposta retornou 2 objetos. A questão objetiva tem as quatro alternativas e os textos `328`, `321`, `214`, `107` na ordem correta. A questão discursiva veio sem alternativas, o que corresponde ao formato original. Como o PDF não numera as questões, os dois campos `number=null` não são omissão de numeração impressa.

**Achado P2 — anotação manuscrita de resolução contaminou o enunciado da segunda questão.** Na imagem da página 4, a Q2 termina em “reagem com 40 g do gás oxigênio?”. Depois desse trecho há cálculos manuscritos; a resposta incorporou `1 mol de ga's 22,4L` ao `statement` da questão ([JSON, Q2, linha 91](../../tests/document-parser/results/estequiometria-structured-extraction-real-2026-11-06.json:91)). A frase pertence à anotação de resolução no material, não ao enunciado impresso. O PDF também contém outras anotações manuscritas da resolução da primeira questão, mas a resposta da Q1 preservou o enunciado impresso e as alternativas sem adicionar essas contas.

## Evidências por critério

| Critério | Resultado | Evidência |
| --- | --- | --- |
| Cobertura de questões | PASS nesta amostra: 10/10 no Química e 2/2 em Estequiometria. | `rawStructuredOutput.questions` nos dois JSONs; comparação com os PDFs originais. |
| Alternativas e tipos | PASS: as dez questões de Química são discursivas; Estequiometria mantém A–D na objetiva e não inventa opções para a discursiva. | Objetos por `number` nos JSONs. |
| Fidelidade de fórmulas | FAIL parcial: reação ausente na Q01 de Química, comentário HTML literal, expoentes/índices achatados na Q04; fórmula da questão objetiva de Estequiometria está legível como `Na₂CO₃`/`H₂O₂`. | Q01 e Q04 de Química; Q1 de Estequiometria. |
| Limites do enunciado | FAIL parcial: anotação manuscrita indevida entrou no enunciado discursivo de Estequiometria. | Q2 de Estequiometria, comparação com página 4 renderizada. |
| Uma chamada, sem reconciliação | PASS: 1 janela e 1 chamada em cada serviço; saída capturada no `save` in-memory sem alteração pelo harness. | Campos `requests`, `windows`, `llmCalls` e `rawStructuredOutput`. |
| Referências visuais/chunks | PASS estrutural para IDs citados: validação da própria service não rejeitou referências. A associação de assets foi feita no harness via sobreposição de páginas, não pelo banco. | `sourceChunkIds`, `visualEvidence` e resultado de processamento em cada JSON. |
| Persistência/revisão no Prisma | NÃO AVALIADO: o repositório era simulado. Não prova gravação no banco, vínculo no Storage ou flags de revisão. | Nota de isolamento em ambos os JSONs. |
| Tokens/custo | Tokens disponíveis e registrados; custo indisponível no payload/log observado. | `extraction.usage` nos JSONs. |

## Comandos executados

```bash
sha256sum tests/document-parser/teacher-materials/Quimica-3.pdf tests/document-parser/teacher-materials/Estequiometria.pdf 'tests/document-parser/teacher-materials/pH e pOH.pdf'
cd backend && node --import tsx src/scripts/.qa-run-other-question-pdfs.ts
pdftotext -layout tests/document-parser/teacher-materials/Estequiometria.pdf -
pdftoppm -f 3 -l 4 -scale-to 1200 -png tests/document-parser/teacher-materials/Quimica-3.pdf /tmp/qa-pdf-render/quimica
pdftoppm -f 6 -l 6 -scale-to 1800 -png tests/document-parser/teacher-materials/Quimica-3.pdf /tmp/qa-pdf-render/qzoom
pdftoppm -f 4 -l 4 -scale-to 1800 -png tests/document-parser/teacher-materials/Estequiometria.pdf /tmp/qa-pdf-render/est
```

Saída completa guardada em:

- [`quimica-3-structured-extraction-real-2026-11-06.json`](../../tests/document-parser/results/quimica-3-structured-extraction-real-2026-11-06.json)
- [`estequiometria-structured-extraction-real-2026-11-06.json`](../../tests/document-parser/results/estequiometria-structured-extraction-real-2026-11-06.json)

## Lacunas e encaminhamento

Esta execução valida o caminho de parser real → extração estruturada real → fronteira simulada de persistência, não a ingestão completa do worker, criação de embeddings, persistência em produção, associação persistida de assets nem estado “pendente de revisão”. A amostra indica que o modelo cobre questões objetivas e discursivas, mas a saída ainda exige revisão humana para fórmulas e para separar enunciado de solução manuscrita. Recomendo encaminhar ao arquiteto os achados de fidelidade e contaminação de enunciado; não alterei código de produção.
