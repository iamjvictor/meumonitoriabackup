# Validação QA independente — prompt de fórmulas

## Escopo

O aceite atual da `spec.md` é prompt-only. A proposta anterior de ferramenta visual/function calling foi cancelada; esse fluxo aparece aqui apenas como histórico. Revisados serviço estruturado, prompt, schema e testes. Nenhuma escrita em banco, migration, mudança de credencial ou deploy foi feita.

## Revisão

- Não encontrei implementação de ferramenta nem `tools`, `tool_choice` ou function calling no serviço estruturado/cliente em escopo. O request segue `createStructuredChatCompletion` com schema JSON.
- O prompt em `backend/src/worker/services/structured-question-extraction.service.ts` pede preservar sinais, parênteses, frações, unidades, expoentes e índices; usar a imagem da página como evidência; não inferir símbolos; indicar ambiguidade com anotação.
- O teste de serviço verifica prompt, contexto integral, uma chamada, imagem e ausência de ferramenta.
- A árvore tinha outras mudanças alheias a este escopo; não foram avaliadas.

## Comandos e resultados

| Comando/ação | Tipo | Resultado |
|---|---|---|
| `node --import tsx --test src/worker/services/__tests__/structured-question-extraction.service.test.ts src/worker/services/__tests__/question-extraction-reconciliation.test.ts src/worker/services/__tests__/question-extraction-windows.test.ts` (backend, sem env dummy) | Testes locais | Falhou ao carregar as suítes por `ASAAS_WEBHOOK_URL` vazia/inválida. |
| `ASAAS_WEBHOOK_URL=https://example.test/webhook node --import tsx --test src/worker/services/__tests__/structured-question-extraction.service.test.ts src/worker/services/__tests__/question-extraction-reconciliation.test.ts src/worker/services/__tests__/question-extraction-windows.test.ts` (backend) | Mocks/fixture offline | 14 passaram, 0 falharam. Cobriu prompt, chamada única, imagem, limite, truncamento e reconciliação. |
| `pdftotext -layout 'tests/document-parser/documentos-professor/Simulado Pedro Lucas.pdf' /tmp/pedroqa/full.txt`; `pdftoppm -f 4 -l 4 -png -r 150 -singlefile ... /tmp/pedroqa/page4` | PDF local | Texto de cinco páginas; raster página 4 em 1241×1754. É raster sintético renderizado do PDF, não crop/asset do parser Docling. |
| Harness one-off: `dotenv.parse(backend/.env)` antes dos imports; `StructuredQuestionExtractionService` com repositório em memória; DeepSeek V4.1 Flash; PDF completo + raster página 4; 16.000 tokens de saída, reasoning `none`, timeout 180 s | Uma chamada real OpenRouter, sem DB | HTTP 200, `finish_reason=stop`, 4.069 tokens prompt, 3.743 completion, 7.812 total, reasoning 0, duração 14.745 ms; serviço reportou `llmCalls=1`. Resultado salvo em `tests/document-parser/results/pedro-lucas-prompt-only-real-2026-11-06.json`. Nenhuma chave foi impressa. |

## Evidência semântica da chamada real

- O modelo retornou **10 questões numeradas de 01 a 10**, cada uma com cinco alternativas rotuladas A–E.
- Q07 A veio como **`3 × 1017`**, sem sobrescrito ou separação que preserve inequivocamente `10¹⁷`. O esperado pela imagem original é `3 × 10¹⁷`; portanto, a chamada **não atende** ao critério de notação da Q07, apesar de `visualEvidence` associar o asset de página 4 à questão.
- As questões 07 e 08 apontam para a imagem full-page sintética da página 4. Isso comprova o envio/associação no harness, mas não que um crop Docling produzido pelo pipeline real esteja corretamente associado.
- O registro JSON contém a resposta estruturada salva pelo harness e metadados de uso, sem credenciais. Respostas do modelo e alternativas foram verificadas questão a questão; não se considerou a contagem isolada como aprovação.
- Uma execução real histórica de 05/11 também retornou Q07 A como `3 × 10 17`; serve apenas como comparação, não como evidência da execução de hoje.

## Evidências por critério

| Critério | Resultado | Evidência |
|---|---|---|
| AC-001 — documento integral em uma chamada, sem ferramenta | **Passou** | Teste unitário verifica uma chamada e ausência de `tools`; execução real registrou `llmCalls=1`, com todo o texto dos cinco pages/chunks e raster na mensagem. O serviço não acessou banco: repositório em memória. |
| AC-002 — prompt preserva notação, consulta imagem e sinaliza incerteza | **Passou em contrato do prompt; falha parcial na execução** | Asserções de teste comprovam as instruções. Na chamada real, a resposta achatou o expoente de Q07 em `1017`, sem anotação de incerteza, embora referencie visualEvidence de página 4. |
| AC-003 — Pedro Lucas: dez questões e Q07 A exatamente `3 × 10¹⁷` | **Falhou** | Dez questões e cinco alternativas A–E foram extraídas, mas Q07 A retornou `3 × 1017`. Resultado bruto: `tests/document-parser/results/pedro-lucas-prompt-only-real-2026-11-06.json`. |
| AC-004 — separar testes simulados e chamada real; sem DB | **Passou** | 14 testes mocks/offline identificados separadamente; uma chamada real com repositório em memória, sem DB. |

## Achado

### Alta — o prompt não assegurou fidelidade do expoente em Q07

**Arquivo:** `backend/src/worker/services/structured-question-extraction.service.ts` (prompt do sistema, no método `extractDocument`).

**Reprodução:** executar o harness descrito acima com `tests/document-parser/documentos-professor/Simulado Pedro Lucas.pdf`; uma chamada multimodal única; ler Q07, alternativa A no JSON de resultado.

**Esperado:** `3 × 10¹⁷`, conforme raster da página 4.

**Obtido:** `3 × 1017`. O número pode ser interpretado como 1017 e não registra que a posição de expoente estava incerta. A resposta tem referência à imagem, mas a saída textual não preserva a posição tipográfica. O critério AC-003 não está atendido; encaminhar ao arquiteto para decidir refinamento de prompt/teste.

## Limitações

- A raster foi gerada localmente da página inteira do PDF, não obtida do parser Docling nem da associação persistida do pipeline real.
- O teste real valida a chamada isolada do serviço com repositório fake; não valida salvamento Prisma, banco nem renderização de produto.
- Não foi executado typecheck nesta rodada; os testes unitários direcionados passaram.

## Revalidação após reforço de prompt (2026-11-06)

O prompt foi alterado para exigir Unicode inequívoco (ex.: `x²`, `H₂O`) ou LaTeX delimitado com chaves explícitas (`$x^{n+1}$`, `$a_{i+1}$`), proibir achatar índices/expoentes e examinar visualmente a região da fórmula. A inspeção confirmou que o fluxo continua sem ferramenta/function calling.

Foi iniciada uma execução independente do PDF completo mais a raster sintética da página 4, com uma única requisição. O env foi carregado com `dotenv.parse(backend/.env)` antes dos imports. Modelo configurado: `deepseek/deepseek-v4.1-flash`; orçamento de saída 16.000 tokens, reasoning `none`, timeout de 180 s. O processo expirou em 180 s com `StructuredCompletionError` `TIMEOUT`. A resposta não foi capturada, então não houve saída bruta/reconciliada, usage ou custo para avaliar. Não houve DB. O registro está em `tests/document-parser/results/pedro-lucas-prompt-unicode-real-timeout-2026-11-06.json` e não contém credenciais.

**Critérios:** o prompt e a ausência de ferramentas foram confirmados por inspeção; fidelidade Q07 após o novo prompt ficou **inconclusiva** por timeout. A chamada anterior, com prompt anterior, falhou com `3 × 1017`, portanto não pode servir de evidência de que o reforço resolveu o problema. O limite de uma chamada nesta rodada foi respeitado; não foi feito retry.

### Reexecução independente autorizada com timeout de 300 s

Após o timeout anterior, foi autorizada uma nova execução independente com timeout aumentado para 300 s. Uma única requisição foi enviada com o mesmo PDF integral (8.399 caracteres, cinco páginas), raster sintética full-page da página 4 (1241×1754), modelo `deepseek/deepseek-v4.1-flash`, 16.000 tokens, reasoning `none`, carregando `backend/.env` por `dotenv.parse` antes dos imports. Usou repositório em memória e não acessou banco.

**Resultado:** HTTP 200, `finish_reason=stop`, uma chamada, 4.228 tokens de entrada, 3.710 de saída, 7.938 total, reasoning 0; tempo medido pelo cliente 13,670 s e pelo harness 13,694 s. A resposta de usage não continha campo de custo; custo exato não está disponível neste registro. JSON com resposta bruta e saída reconciliada: `tests/document-parser/results/pedro-lucas-prompt-unicode-real-300s-2026-11-06.json`.

Após o prompt reforçado, executei `ASAAS_WEBHOOK_URL=https://example.test/webhook node --import tsx --test src/worker/services/__tests__/structured-question-extraction.service.test.ts src/worker/services/__tests__/question-extraction-reconciliation.test.ts src/worker/services/__tests__/question-extraction-windows.test.ts` em `backend/`: **14 passaram, 0 falharam**. São testes locais mock/offline, separados da chamada OpenRouter real.

| Verificação | Resultado |
|---|---|
| Questões e alternativas | Bruto e reconciliado têm dez questões, 01–10, cada uma com alternativas A–E. |
| Chunk de origem | Todos os `sourceChunkIds` apontam para chunks enviados (páginas 2–5). Q07 referencia `qa-page-4`. |
| Figura | Q07 associa o asset raster página 4 como `STATEMENT`; as outras nove não referenciam imagem. É uma raster sintética, não asset/crop do Docling. |
| Gabarito / ressalvas | `correctAnswer` é null nas dez questões; não se inferiu gabarito. `sourceIntegrityWarnings` ficou vazio nas dez. |
| Q07 A bruto | `3 × 10^17`, LaTeX textual inequívoco e correto para `3 × 10¹⁷`. O prompt reforçado funcionou na saída bruta. |
| Q07 A reconciliado | `3 × 1017`, perdeu a posição do expoente. A reconciliação regrediu a saída correta do modelo. |

### Achado alto — reconciliação remove formatação inequívoca de expoente

**Arquivo:** `backend/src/worker/services/question-extraction-reconciliation.ts:117-150`.

**Reprodução:** usar o resultado real salvo acima; comparar `rawStructuredOutput.questions[6].alternatives[0].text` com `reconciledPersistedCandidates[6].alternatives[0].text`. O valor bruto é `3 × 10^17`, e o reconciliado é `3 × 1017`.

`canonicalizeCandidate` prefere alternativas parseadas do texto OCR. A preservação do texto do modelo acontece só quando ele é maior e `normalize(cleanModelText).startsWith(normalize(sourceAlternative.text))` em `question-extraction-reconciliation.ts:121-129`. Como a sequência LaTeX `10^17` não começa textualmente com a versão achatada OCR `1017`, a notação inequívoca é descartada. A resposta do modelo tem `visualEvidence`, mas `sourceIntegrityWarnings` não sinaliza a corrupção resultante. O prompt atende o caso bruto; a saída entregue após reconciliação não atende AC-003.
