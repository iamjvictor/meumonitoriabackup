# Auditoria de qualidade — questionsQuimica.pdf (27/10/2026)

## Escopo

PDF de 16 páginas e dez questões discursivas. Testes locais, sem escrita no banco ou no storage de produção. O caminho de questões usa PDF.js para texto; o pacote Docling v2 é usado para imagens quando a flag visual está habilitada.

## Resultado medido

| Etapa | Resultado | Evidência |
| --- | ---: | --- |
| Blocos estruturais `QUESTION` | 10/10 | `python3 -m unittest tests/document-parser/test_questions_pdf.py -v` passou |
| Candidatas determinísticas | 10/10, numeradas 01–10 | `questionsQuimica.pdfjs-after.json` |
| Cobertura exata do texto do bloco por chunk de questão | 10/10 | `chunkCoverageExact` no mesmo relatório |
| Promoção determinística | 9 `READY_FOR_COMPLETION`; 1 `VISUAL_PENDING` (01) | `candidateReadiness` |
| Chunks do pacote Docling v2 | 13, máximo de 499 tokens | Upload local a `/chunk/v2` |
| Imagens Docling v2 | 20, incluindo tabela da página 15 | Manifesto ZIP e verificação SHA-256 |
| Dry run com agentes, sem persistência | 10 candidatas percorridas; 0 completadas com IA | 19 requisições estruturadas responderam HTTP 401; nenhuma gerou alternativas/gabarito |
| Questões finais salvas | Não medido | O teste não conecta ao banco |

O número 10 em “Questões completadas” no relatório do script `test-question-dry-run.ts` conta candidatas percorridas. Não equivale a conclusão com IA: nesse teste, todas as chamadas foram recusadas com HTTP 401. As notas 0–5/100 desse dry run refletem principalmente a indisponibilidade da IA e não medem a qualidade pedagógica das questões geradas. O teste confirma ganho de **cobertura estrutural**, sem comprovar melhora na quantidade salva em produção; o relato anterior de quatro questões salvas não é um baseline executado no mesmo ambiente.

## Qualidade do conteúdo

- Os dez enunciados foram encontrados, e nenhum bloco de questão perdeu cobertura textual no chunk correspondente.
- O PDF é discursivo: as dez candidatas começam sem alternativas e dependem dos agentes para a conversão em múltipla escolha. Essa etapa não pôde ser avaliada com HTTP 401.
- A extração textual ainda degrada notação química. Na questão 01, por exemplo, a equação fica com `C l` e índices deslocados; a questão 08 perde índices em `CO₂` e `H₃PO₄`. Isso pode comprometer respostas mesmo quando o enunciado é detectado.
- Os 13 chunks Docling v2 são de recuperação, não delimitadores de questões. Alguns misturam várias páginas e questões; a tabela periódica gera texto ruidoso e um chunk muito curto. Para extração de questões, a cobertura de 10/10 vem do caminho PDF.js do worker.

## Por que a questão 01 permanece `VISUAL_PENDING`

1. O enunciado na página 3 pede consulta à tabela periódica da página 15. A validação marca `MISSING_VISUAL_EVIDENCE` e bloqueia a promoção antes da conclusão por IA.
2. O pacote Docling v2 contém a tabela na página 15, mas a decisão de promoção chama `requiresMissingFigure(..., false)`: ela não recebe evidência de que uma imagem específica foi vinculada.
3. O vinculador procura imagens nas páginas dos chunks de origem. Com a questão 01 na página 3 e sem referência de item/bbox, ele produziu `PAGE_CANDIDATE` para `#/pictures/4` da página 3; a tabela `#/pictures/16` da página 15 não foi considerada. A simulação com os 20 assets reais retornou zero vínculos e `PENDING_EXTRACTION`.
4. Mesmo quando um vínculo visual é criado, o repositório atualiza `visualStatus`; não há reavaliação automática da candidata `VISUAL_PENDING` para `READY_FOR_COMPLETION`.

## Próxima verificação necessária

Executar em ambiente isolado com credencial válida do OpenRouter e flags visuais habilitadas. Medir separadamente: candidatas detectadas, candidatas promovidas, questões persistidas, qualidade de fórmulas, tabela vinculada à questão 01, imagem enviada ao modelo e revisão humana da resposta. A referência explícita do enunciado à página 15 precisa entrar na associação visual com segurança antes de desbloquear a questão 01.
