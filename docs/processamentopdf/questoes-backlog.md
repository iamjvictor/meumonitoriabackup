# Process Questions

Backlog das melhorias pendentes no processamento e na extração de questões.

Este documento registra o que ainda não foi implementado após os testes com `google/gemini-2.5-flash-lite` e `google/gemini-2.5-flash`.

## Estado atual

Já implementado:

- Contratos de saída estruturada alinhados entre JSON Schema e Zod.
- Alternativas aceitam textos matemáticos mais longos.
- Evidências e razões aceitam contexto suficiente para explicar fórmulas.
- Agentes estruturados configurados para `google/gemini-2.5-flash`.
- Embeddings continuam usando `qwen/qwen3-embedding-8b`.

Ainda pendente:

- Melhorar a qualidade dos blocos de questão antes de chamar os agentes.
- Evitar candidatos duplicados ou artificiais originados do mesmo bloco.
- Recuperar fórmulas e elementos visuais quebrados.
- Roteamento das chamadas de IA por qualidade e dificuldade.
- Separar melhor enunciado, alternativas, solução e gabarito.
- Criar métricas de qualidade e um conjunto de avaliação reproduzível.

## P0 — Melhorar a entrada antes do LLM

### Reconstrução de `QuestionSpan`

- [ ] Agrupar todos os fragmentos consecutivos da mesma questão antes da extração.
- [ ] Preservar ordem de leitura, página, coluna, posição e bounding box.
- [ ] Incluir contexto anterior e posterior quando o enunciado começa ou termina em outro bloco.
- [ ] Impedir que cabeçalhos, rodapés, exemplos e soluções de outra questão entrem no enunciado.
- [ ] Registrar a confiança da ordem de leitura.

Critério de aceitação:

```text
Uma questão dividida em vários blocos chega ao agente como um único contexto coerente,
sem misturar conteúdo de questões vizinhas.
```

### Eliminar candidatos artificiais

- [ ] Não criar candidatos repetidos para cada tentativa parcial de leitura das alternativas.
- [ ] Consolidar candidatos pelo identificador da questão e pelo `sourceKey`.
- [ ] Rejeitar candidatos com enunciado vazio ou insuficiente antes dos agentes de conclusão.
- [ ] Rejeitar alternativas isoladas, fragmentos de fórmula e pedaços de rodapé.
- [ ] Diferenciar `INVALID_EXTRACTION`, `VISUAL_PENDING`, `NEEDS_CONTEXT` e `READY_FOR_AI`.
- [ ] Medir quantos candidatos foram descartados por cada motivo.

Observação do teste:

```text
Um documento gerou 7 candidatas, mas apenas 3 foram salvas; várias tinham 0, 1,
2 ou 3 alternativas e vinham do mesmo bloco estrutural.
```

## P0 — Recuperar matemática e conteúdo visual

- [ ] Detectar expressões com baixa qualidade, índices separados ou operadores ausentes.
- [ ] Preservar o recorte visual da região da página relacionada à questão.
- [ ] Enviar fórmulas quebradas para recuperação multimodal com `google/gemini-2.5-flash`.
- [ ] Solicitar fórmula em LaTeX ou representação matemática normalizada.
- [ ] Validar se a fórmula recuperada possui sintaxe e símbolos suficientes.
- [ ] Marcar a questão como `VISUAL_PENDING` quando a recuperação não for confiável.
- [ ] Não gerar alternativas ou gabarito a partir de uma fórmula cuja leitura esteja incompleta.

Exemplos observados:

```text
x 1 y 2
AB = x B − x A
1 0 0
4
```

## P1 — Separar fontes da questão

O contexto enviado ao modelo deve distinguir explicitamente:

```text
statementSource
alternativesSource
answerKeySource
solutionSource
neighboringContext
visualEvidence
```

Pendências:

- [ ] Separar enunciado, alternativas, solução e gabarito no pacote de contexto.
- [ ] Associar cada trecho a página, bloco e chunk de origem.
- [ ] Impedir que solução ou explicação seja confundida com enunciado.
- [ ] Preservar a questão mesmo quando somente uma fonte estiver disponível.
- [ ] Registrar quais campos foram extraídos e quais foram gerados.

## P1 — Roteamento por qualidade

O Lite não deve ser usado novamente como agente obrigatório em todas as etapas. Para o Flash atual, ainda é importante evitar chamadas desnecessárias.

Proposta:

```text
Entrada confiável
→ validação curta.

Entrada sem gabarito
→ agente de gabarito.

Entrada sem alternativas suficientes
→ agente de alternativas.

Fórmula, imagem ou ordem de leitura duvidosa
→ reconstrução multimodal.

Falha de schema ou baixa confiança
→ retry reduzido, fallback controlado ou revisão humana.
```

Pendências:

- [ ] Criar `inputQualityScore` para cada candidata.
- [ ] Considerar quantidade de alternativas, presença de enunciado, gabarito, fórmula e evidência visual.
- [ ] Usar `readingOrderConfidence` no roteamento.
- [ ] Não executar explicação, revisão e normalização quando a questão ainda não é elegível.
- [ ] Registrar o motivo de cada escalonamento para o modelo mais caro.

## P1 — Tratamento de falhas estruturadas

- [ ] Separar `MODEL_OUTPUT_TRUNCATED`, `INVALID_SCHEMA`, `EMPTY_RESPONSE`, `429` e `502` nas métricas.
- [ ] Não repetir três vezes uma resposta truncada com o mesmo limite e o mesmo prompt.
- [ ] Para truncamento, reduzir o contrato ou encaminhar para outro agente/modelo.
- [ ] Para erro de schema, registrar os campos rejeitados e o conteúdo da validação.
- [ ] Manter retry com backoff apenas para falhas transitórias de provedor.
- [ ] Persistir falha por agente sem descartar a questão inteira.
- [ ] Manter questões incompletas como `PENDING_REVIEW`, com `missingFields` e diagnóstico.

Problema observado:

```text
question_answer usando maxTokens=300 terminou repetidamente em MAX_TOKENS.
```

Esse limite ainda precisa ser avaliado separadamente no próximo benchmark.

## P1 — Gabarito e explicação independentes

- [ ] Manter gabarito como contrato mínimo com apenas a letra e o estado de confiança.
- [ ] Gerar explicação em chamada separada.
- [ ] Não invalidar gabarito válido porque a explicação falhou.
- [ ] Não invalidar alternativas válidas porque a revisão final falhou.
- [ ] Registrar `missingFields` por questão e por agente.

Contratos desejados:

```json
{ "answerStatus": "FOUND", "correctAlternative": "C" }
```

```json
{ "explanation": "..." }
```

## P1 — Cobertura de questões do documento

- [ ] Comparar quantidade de questões detectadas no layout com quantidade de candidatas.
- [ ] Comparar numeração encontrada no texto com numeração persistida.
- [ ] Detectar saltos de numeração e questões ignoradas.
- [ ] Registrar `detectedQuestionCount`, `candidateCount`, `savedCount` e `retainedCount`.
- [ ] Exibir no monitor quando o documento contém questões retidas ou descartadas.
- [ ] Não marcar a base como plenamente pronta quando todas as questões foram retidas ou estão incompletas.

## P1 — Categorização e tópico

- [ ] Executar categorização mesmo em questões parciais, quando houver enunciado suficiente.
- [ ] Diferenciar ausência de tópico, falha do agente e tópico fora da lista permitida.
- [ ] Persistir `topicId = null` com motivo explícito e `needsReview = true`.
- [ ] Evitar que um perfil de tópico incorreto influencie todas as questões do documento.

## P2 — Benchmark reproduzível

Criar um conjunto fixo de questões com gabarito conhecido e comparar os modelos sem alterar o restante do pipeline.

Métricas mínimas:

- [ ] enunciado completo;
- [ ] alternativas corretas e completas;
- [ ] gabarito correto;
- [ ] explicação coerente;
- [ ] schema válido na primeira tentativa;
- [ ] retries por agente;
- [ ] questões salvas, parciais e retidas;
- [ ] tempo por etapa;
- [ ] tokens de entrada e saída;
- [ ] custo estimado;
- [ ] taxa de descarte correto.

O modelo não deve ser avaliado apenas pela quantidade de questões geradas. Questões extras inválidas representam piora de qualidade.

## Observações para o próximo teste

Registrar para cada documento:

```text
documentId
originalName
pageCount
textChars
blockCount
chunkCount
detectedQuestionCount
candidateCount
questionsSaved
questionsWithMissingFields
questionsRetained
groupsFailed
schemaFailures
truncatedResponses
totalDurationMs
```

## Relatório do teste — quatro arquivos em Lógica

Data do teste: `2026-09-22`.

O processamento confirmou que o problema principal continua sendo a qualidade da reconstrução das questões, e não a disponibilidade dos serviços. O Docling e o OpenRouter responderam normalmente, mas o texto extraído de alguns PDFs misturou enunciados, alternativas, soluções, cabeçalhos e trechos de questões vizinhas.

### Resultados observados

| Documento | Duração total | Questões extraídas | Salvas | Retidas | Status |
|---|---:|---:|---:|---:|---|
| `d7yd6u2fxbcog.pdf` | 202,5 s | 4 | 4 | 0 | READY |
| `1xoebyf256iv.pdf` | 273,6 s | 6 | 5 | 1 | READY |

Os outros dois documentos foram processados no mesmo lote, mas os eventos finais completos não ficaram disponíveis no recorte do terminal usado para este relatório. Eles devem ser incluídos novamente em um benchmark com coleta persistida dos eventos de conclusão.

### Médias de duração por etapa

As médias abaixo usam somente eventos `document_processing_stage_timed` disponíveis no terminal. A coluna `n` informa quantos documentos sustentam cada média; quando `n = 1`, trata-se de uma referência inicial, não de uma média representativa.

| Etapa | Média observada | n |
|---|---:|---:|
| Docling / parse | 16,1 s | 3 |
| Extração de texto | 0,3 s | 1 |
| Normalização de texto | 1,1 s | 1 |
| Detecção de blocos | 5,2 s | 1 |
| Criação de chunks | 4,4 s | 1 |
| Embeddings dos chunks | 12,4 s | 3 |
| Perfil do tópico | 8,1 s | 3 |
| Extração e conclusão das questões | 141,8 s | 3 |
| Associação de gabaritos | 0,2 s | 2 |
| Preparação para revisão | 0,2 s | 2 |

As etapas de extração de texto, normalização, detecção de blocos e criação de chunks precisam de mais execuções para formar uma média confiável. O maior valor já confirmado é a extração/conclusão de questões, que concentra as chamadas sequenciais aos agentes.

No documento `1xoebyf256iv.pdf`, a extração/conclusão consumiu `211,8 s` de um total de `273,6 s`. No documento `d7yd6u2fxbcog.pdf`, consumiu `168,0 s` de `202,5 s`. Isso confirma que o maior gargalo atual está depois do Docling, nas chamadas sequenciais por candidata:

```text
embeddings individuais
→ alternativas
→ gabarito
→ explicação
→ revisão de qualidade
→ correção/normalização
→ novo embedding
```

### Falhas e problemas registrados

- O Flash respondeu com `HTTP 200`, sem os erros anteriores de endpoint `404`, timeout ou falha de conexão.
- Ainda ocorreram falhas `INVALID_SCHEMA` porque o modelo retornou explicações, razões e evidências acima dos limites do contrato local.
- O retry repetiu respostas semanticamente semelhantes e aumentou o tempo sem corrigir a origem do problema.
- Uma questão recebeu alternativas de outro problema; o próprio modelo informou `alternativesMatchStatement: false`, `answerMatchesAlternative: false` e `explanationMatchesAnswer: false`.
- Outra candidata foi formada a partir de um fragmento de solução, como `De fato, este é o...`, e foi interpretada indevidamente como enunciado.
- Foram observadas questões sem alternativas, com alternativas duplicadas, candidatas artificiais e mistura de rodapé/cabeçalho com o texto principal.
- O pipeline conseguiu reter parte das candidatas problemáticas para revisão, mas algumas ainda foram salvas com gabarito e explicação apesar da fonte inconsistente.

### Conclusão para os próximos aprimoramentos

O próximo ganho não deve vir apenas de trocar o modelo. A prioridade é impedir que candidatos contaminados cheguem aos agentes de conclusão:

1. reconstruir o `QuestionSpan` usando blocos consecutivos, posição, página e coluna;
2. separar rigorosamente `statementSource`, `alternativesSource`, `solutionSource` e `answerKeySource`;
3. bloquear promoção quando `alternativesMatchStatement` ou `answerMatchesAlternative` forem falsos;
4. limitar retries de schema e registrar qual campo excedeu o contrato;
5. medir e persistir todas as etapas de todos os documentos, inclusive os eventos finais.

## Registro do teste — dois arquivos de Matemática Básica

Data/hora de início observada nos logs: `2026-09-22 21:45:52`.

Este lote foi iniciado com concorrência 2, portanto os dois documentos entraram no worker simultaneamente.

| Documento | Document ID | Tamanho | Download | Estado no último registro |
|---|---|---:|---:|---|
| `apostila_mb_2013_2.pdf` | `fe70ce45-73f4-478a-a61d-8d5dbbcf9604` | 1.527.022 bytes | 1,57 s | aguardando resultado do Docling |
| `ExerciciosMatematica.pdf` | `f7a0d6c7-15ff-4b01-b163-5778ef9fdcde` | 1.293.081 bytes | 1,64 s | aguardando resultado do Docling |

### Eventos já confirmados

- Os dois documentos foram encontrados no banco e atualizados para `PROCESSING`.
- Os downloads foram concluídos com sucesso.
- Os dois PDFs foram enviados ao Docling por `POST http://127.0.0.1:8080/v1/parse`.
- O Docling respondeu `HTTP 200` nos dois envios.
- O timeout configurado para o parse foi de `600000 ms` por documento.
- Até o último registro não havia falha de conexão, timeout, erro de parser ou erro do worker.
- Ainda não havia sido emitido o resultado final de layout, por isso páginas, blocos, chunks, embeddings, questões e duração total permanecem pendentes.

### Métricas a completar

Quando os jobs terminarem, adicionar neste registro:

```text
pageCount
textChars
blockCount
chunkCount
detectedQuestionCount
candidateCount
questionsSaved
questionsRetained
schemaFailures
truncatedResponses
parseDurationMs
embeddingDurationMs
questionExtractionDurationMs
totalDurationMs
finalStatus
```

Este lote será usado posteriormente para comparar duração por faixa de tamanho do arquivo. A comparação deve separar pelo menos download, Docling, embeddings e extração/conclusão de questões, pois o tamanho do PDF sozinho não explica o custo total.

Referências relacionadas:

- `docs/processamentopdf/base-conhecimento.md`
- `docs/processamentopdf/questoes-backlog-backend.md`
- `docs/processamentopdf/planos/2026-08-26-document-question-pipeline-quality.md`
