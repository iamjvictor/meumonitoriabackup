# Test plan — runner local de comparação de modelos

Este plano cobre o pacote do runner definido em `task-1-runner-brief.md` e os critérios de `spec.md`. Ele valida isolamento, reuso do baseline, roteamento, fluxo dos serviços, saídas e telemetria sem alterar produção. Resultados de execução reais ficam para o coordenador preencher após revisar o runner.

## Limites desta validação

- Os testes de QA e dry-run usam fixtures e clientes/transporte falsos; não enviam inferências.
- O dry-run pode consultar catálogo público e metadados dos modelos/provedores. Deve confirmar que não enviou requisições a endpoints de chat/completions nem a endpoints de embeddings.
- Não executar migrações, `db push`, importação real, escrita em Storage real, acesso a ambiente publicado ou inferência paga nesta fase.
- A execução paga dos quatro experimentos ocorre somente na etapa coordenada após revisão do runner; registrar sua autorização e os resultados separadamente. A autorização anterior do usuário não converte um dry-run em pipeline executado.
- Não abrir nem reproduzir conteúdo de PDF, saída de modelo ou PII nos relatórios de QA.

## Cenários e critérios de aceite

| ID | Cenário e critérios | Procedimento de teste | Resultado esperado |
|---|---|---|---|
| TP-001 | Matriz de testes, configs e rodadas — AC-001, AC-002 | Validar os quatro nomes exatos e as matrizes `TESTS`; verificar env específico por nome e rodada 1/2 com `runId` distinto. Testar que nome/rodada fora da allowlist falham antes de abrir conexão. | Quatro combinações correspondem à matriz aprovada; cada execução fica identificada por teste, rodada e `runId`. Configuração inválida falha fechado. |
| TP-002 | Processo e destinos locais isolados — AC-001, AC-003, AC-006 | Com cliente fake, validar URL loopback, porta local e nome esperado via `expectedTargetDatabaseName`; rejeitar host remoto, banco fonte, query/search path, esquema compartilhado, banco incorreto ou destino não vazio. Conferir que o executor usa processo filho e env do teste, sem alterar env global ou `.env` existente. | Uma base separada por teste/rodada. Nenhuma conexão ao banco fonte para escrita, serviço publicado ou Storage remoto. Falhas de allowlist/isolamento ocorrem antes de qualquer escrita. |
| TP-003 | Dump/schema e pré-condições do destino — AC-003, AC-006 | Falsificar setup local: validar uso de schema provisionado sem migrations no banco compartilhado, existência das tabelas necessárias e ausência de dados no destino. Testar falha de conexão, tabela ausente, banco não vazio e tentativa de drop fora da allowlist. | Dry-run descreve o schema/destino; não executa migration, `db push`, truncamento ou drop. Pré-condições ausentes bloqueiam importação. |
| TP-004 | Reuso verificável do baseline — AC-001, AC-004 | Em fixture sintética, validar hashes esperados dos três PDFs, chunks, embeddings, assets e relações; contar 22 chunks/vetores e 31 assets; verificar os três documentos. Garantir que o hash do vetor é preservado e que nenhum embedding dos chunks do baseline é regenerado. | Os mesmos objetos/chunks/vetores são importados por hash. O modelo de embedding dos chunks é `qwen/qwen3-embedding-8b`. `chunker_version` ausente permanece `NAO_VERIFICADO`; o relatório não declara equivalência de versão. Descrição visual pode criar embeddings novos com o modelo fixo, sem confundi-los com os 22 vetores reutilizados. |
| TP-005 | Grafo, remapeamento e Storage local — AC-001, AC-006 | Usar DB/Storage fakes para validar UUIDs novos e FKs remapeadas; conferir `document_id` de chunks/assets/blocos, relações chunk-asset/evidence, paths sob prefixo de teste/rodada/runId e hashes de bytes. Simular erro em cada etapa para verificar rollback e limpeza compensatória. | O grafo de cada cópia é internamente consistente e não referencia IDs/path de origem. Os PDFs e 31 assets preservam bytes por hash. Nenhuma escrita sai dos fakes durante QA. Se limpeza de Storage falhar, resultado informa objetos órfãos e não marca sucesso. |
| TP-006 | Evidência das dez questões-alvo — AC-001, AC-004, AC-005 | Validar que os dez blocos da evidência pertencem a `Quimica-3.pdf`, numerados 1–10 sem duplicatas, com hash e página consistentes. Conferir que os outputs gerados do baseline não são inseridos como resultado dos novos modelos. | O mesmo conjunto fonte de dez questões é identificado sem inventar gabarito humano. Outputs antigos não contaminam a rodada. Respostas humanas seguem `SEM_VERDADE_DE_REFERENCIA` enquanto o fixture docente estiver vazio. |
| TP-007 | Extração determinística e fluxo de questões — AC-004, AC-005 | Com DB e transporte LLM falsos, executar o caminho real do serviço de extração de questões para o documento de Química-3. Confirmar que os blocos OCR explicitamente reconhecidos são registrados como `DETERMINISTIC_SOURCE_EXTRACTION`, sem atribuir chamada de LLM à extração, e testar as etapas roteadas por schema. | Cada rodada produz exatamente dez questões distintas em `PENDING_REVIEW`. Cada questão tem cinco alternativas A–E, resposta compatível, explicação/evidence dentro dos limites e `missingFields` vazio ou justificável. Erro fatal é registrado e interrompe a execução. |
| TP-008 | Indexação visual dos assets — AC-004, AC-007 | Com transporte falso e assets sintéticos, chamar `describeAndIndexAsset` em ordem estável para todos os assets do baseline. Registrar as chamadas de descrição visual e embeddings novos com o modelo fixo. Conferir que vetores/chunks reutilizados não são enviados para reembedding. | Todos os assets esperados são processados uma vez por rodada; embeddings das descrições novas ficam distinguidos dos vetores reaproveitados. Falhas/retries são associados ao asset e à etapa corretos. |
| TP-009 | Questão 03: contexto visual no chat — AC-004, AC-007 | Em teste fake, exercitar o serviço/gateway multimodal local com a questão 03 e asset/contexto da cópia isolada; verificar que a imagem/contexto chega à chamada `chatImage` e que a resposta se apoia na diferença visual definida na fixture. Não substituir por pergunta sintética. | A fixture confirma seleção do asset da questão 03 e conteúdo contextual entregue à etapa multimodal. Se a rota exigir servidor ou dependência não local, registrar `NAO_VERIFICADO`, apontar a dependência e não alegar sucesso do chat real. |
| TP-010 | Roteamento de modelo, provedor e capabilities — AC-002, AC-003 | Em testes fake, mapear schemas/etapas à matriz aprovada; consultar capabilities no preflight; rejeitar modelo/modalidade incompatível, ausência de `structured_outputs`, provider desconhecido, fallback habilitado ou etapa sem mapeamento. Para reasoning, testar controle compatível com modelo e endpoint, inclusive revisão D. | Cada chamada fake usa o modelo previsto, `provider.order=[provider]` e `allow_fallbacks=false`. Reasoning fica desativado nas etapas curtas quando suportado; endpoint incompatível bloqueia. Apenas a revisão do teste D pode habilitar reasoning e elevar seu teto. Temperatura e tetos existentes são preservados nas demais etapas. |
| TP-011 | Barreira do dry-run e execução real — AC-003, AC-006 | Spy de transporte verifica que preflight/dry-run não chama chat/completions nem embeddings. Tentar habilitar a execução fora do processo filho, sem preflight ou sem destino local provado. | `paidCallsMade=0`; pipeline não é apresentado como executado pelo dry-run. Flags de autorização não vazam ao shell nem liberam outros processos. A fase real permanece bloqueada até o executor coordenado assumir explicitamente a rodada. |
| TP-012 | Telemetria, erros e segredo — AC-004, AC-007 | Com respostas fakes, validar JSONL por chamada e agregação por rodada/agente: teste, runId, operação, etapa, modelo, provider solicitado/efetivo, tentativa/evidência, tokens, reasoning tokens, latência, custo/source, status HTTP, temperatura/teto e erro de schema quando observável. Injetar uma chave/Bearer sentinela em headers/erros e procurar nos artefatos. | `provider` efetivo só é preenchido com prova da resposta; custo usa `usage.cost` ou estimativa explicitamente identificada com preço e metodologia; caso contrário `NAO_VERIFICADO`. Schema failure só é afirmado com feedback observável. Nenhum prompt, conteúdo PDF, Authorization ou segredo aparece nos logs. Chamadas bloqueadas não contam como requisições executadas. |
| TP-013 | Relatórios e comparação com baseline — AC-005, AC-007 | Com resumos sintéticos, conferir ligação ao baseline Gemini existente, comparação por questão/rodada, questão 03, métricas, variação entre rodadas, custos USD/BRL com fonte/data e status de ausência de gabarito docente. | Markdown/CSV e summaries representam dados presentes. Custo do baseline continua `NAO_VERIFICADO`; acurácia humana é `SEM_VERDADE_DE_REFERENCIA`; qualquer métrica sem prova é `NAO_VERIFICADO`, não zero nem sucesso inferido. |
| TP-014 | Não regressão de produção — AC-002, AC-006 | Revisar o diff atribuído ao pacote e confirmar que alterações estão limitadas aos arquivos permitidos no brief; procurar mudanças em `backend/src/**`, migrations ou arquivos `.env` existentes. | Nenhum comportamento/contrato de produção ou migration alterado. Secrets de `.env` existente só são carregados em memória no processo filho e nunca impressos/copied. |

## Resultados de execução

Preencher por cenário somente após executar o comando correspondente. Não transformar expectativa em evidência.

| ID | Comando/evidência | Resultado real | Status |
|---|---|---|---|
| TP-001 | A preencher pelo coordenador após revisão do runner | A preencher | PENDENTE |
| TP-002 | A preencher pelo coordenador após revisão do runner | A preencher | PENDENTE |
| TP-003 | A preencher pelo coordenador após revisão do runner | A preencher | PENDENTE |
| TP-004 | A preencher pelo coordenador após revisão do runner | A preencher | PENDENTE |
| TP-005 | A preencher pelo coordenador após revisão do runner | A preencher | PENDENTE |
| TP-006 | A preencher pelo coordenador após revisão do runner | A preencher | PENDENTE |
| TP-007 | A preencher pelo coordenador após revisão do runner | A preencher | PENDENTE |
| TP-008 | A preencher pelo coordenador após revisão do runner | A preencher | PENDENTE |
| TP-009 | A preencher pelo coordenador após revisão do runner | A preencher | PENDENTE |
| TP-010 | A preencher pelo coordenador após revisão do runner | A preencher | PENDENTE |
| TP-011 | A preencher pelo coordenador após revisão do runner | A preencher | PENDENTE |
| TP-012 | A preencher pelo coordenador após revisão do runner | A preencher | PENDENTE |
| TP-013 | A preencher pelo coordenador após revisão do runner | A preencher | PENDENTE |
| TP-014 | A preencher pelo coordenador após revisão do runner | A preencher | PENDENTE |

## Critérios de bloqueio

Bloquear a preparação/execução se a origem/destino não forem locais e exclusivos, hashes/grafo divergirem, modelo de embedding estiver errado, saída estruturada não tiver capability, provider não puder ser fixado, interceptação não cobrir uma etapa, segredo for encontrado, questão não corresponder à evidência, ou qualquer resumo afirmar dado não verificado. A versão de chunker ausente deve permanecer `NAO_VERIFICADO`; nesse caso, cópia por hashes pode ser reportada, mas nenhuma comparação deve afirmar equivalência de versão.

## Registro posterior de execuções reais

Após a revisão e início coordenado dos experimentos, registrar para cada teste/rodada o `runId`, banco local, hashes confirmados, os dez estados `PENDING_REVIEW`, evidência multimodal da questão 03, métricas de telemetria, comandos, falhas, custos e limitações. Não reproduzir conteúdo de PDF, PII, chaves ou prompts nos relatórios.
