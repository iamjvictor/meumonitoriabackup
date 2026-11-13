# Validação QA independente (parcial)

Data: 2026-11-05. Revisão e testes sem escrita no banco de produção. O `test-plan.md` foi criado/atualizado antes desta avaliação, a partir do `spec.md`. O teste independente de PDF.js está em `backend/src/worker/services/__tests__/pedro-lucas-full-text.qa.test.ts`.

## Resumo

O PDF local tem cinco páginas e o novo chunker PDF.js cobre todos os 7.830 caracteres normalizados em oito chunks. Um teste local confirma dez blocos numerados (01–10), cada qual com alternativas A–E, incluindo o fim da questão 08. Isso prova extração textual e chunking; não prova extração estruturada pelo modelo.

O parser Docling local em `127.0.0.1:8083` respondeu ao mesmo PDF com cinco páginas, sete chunks do endpoint v2 e um asset PNG na página 1 (cartão-resposta). Essa chamada foi diretamente ao parser e não percorreu o worker nem persistiu dados. O caminho real de QUESTIONS usa PDF.js por padrão; o asset não chega aos chunks usados pelo extrator estruturado.

O modelo configurado foi chamado usando explicitamente, em memória, a chave e o nome de modelo lidos de `backend/.env`; nenhum valor secreto foi impresso. O OpenRouter aceitou a resposta estruturada (HTTP 200), mas encerrou com `finish_reason=length` no teto de 4.000 tokens. O cliente lançou `MODEL_OUTPUT_TRUNCATED`, então nenhuma questão foi salva. A validação das dez questões pelo LLM está bloqueada por este limite.

## Achados

### P1 — Imagens não acompanham chunks no caminho PDF.js

Em [document-worker.service.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/worker/services/document-worker.service.ts:282), a extração visual opcional persiste assets antes do fluxo textual. `processVisualAssetsOnly` não liga esses assets aos chunks. Depois, o caminho QUESTIONS constrói e persiste chunks PDF.js em [document-worker.service.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/worker/services/document-worker.service.ts:665), sem chamar `linkVisualAssetsToChunks`. A rota estruturada só carrega imagens que já estão em `chunk.visualAssets` ([structured-question-extraction.service.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/worker/services/structured-question-extraction.service.ts:118) e [linha 126](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/worker/services/structured-question-extraction.service.ts:126)). Além disso, `DOCUMENT_VISUAL_ASSETS_ENABLED` tem default `false` e não está configurada no `backend/.env`.

**Reprodução/evidência:** PDF.js marca uma imagem na página 1; parser v2 retorna um asset nessa página. No PDF.js full-text, os chunks não carregam `visualAssets`, e a seleção de imagens no extrator depende dessa relação. Assim, mesmo com a flag visual ativada e asset persistido, a rota QUESTIONS não o envia ao modelo. O teste real do extrator não chegou a enviar imagem. Correção necessária: ligar assets às páginas/chunks produzidos pelo PDF.js e verificar ligação ambígua/ausente como pendência.

### P1 — Resposta do modelo para o Pedro Lucas é truncada a 4.000 tokens

O extrator passa `aiModels.questionExtractionMaxTokens` à chamada em [structured-question-extraction.service.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/worker/services/structured-question-extraction.service.ts:84). No `.env`, esse teto é 4.000. Com o PDF inteiro em uma janela, a chamada real configurada consumiu exatamente 4.000 tokens de completion e retornou `finish_reason=length`; o cliente rejeitou a resposta como `MODEL_OUTPUT_TRUNCATED`. Nenhuma candidata chegou à persistência em memória nem ao banco.

**Reprodução:** executar o comando de chamada real abaixo com a chave e o modelo lidos de `backend/.env`; saída relevante: HTTP 200, `promptTokens=2939`, `completionTokens=4000`, `finishReason=length`, `MODEL_OUTPUT_TRUNCATED`. Não houve gravação no banco. Aumentar somente o limite no ambiente não foi feito nesta revisão parcial; a configuração corrente falha no critério do PDF.

### P1 — OCR adaptativo não está demonstrado para QUESTIONS

O caminho PDF.js encerra o processamento quando a extração é marcada `NEEDS_OCR`; nesse ramo, o worker marca o documento e pula chunking/extração, sem executar OCR ali. Para QUESTIONS, o Doc-chunker normal não é escolhido pelo caminho de configuração padrão. Portanto, PDFs digitalizados dependem de integração externa/Docling configurada antes do worker; a implementação não comprova que inicia OCR adaptativamente. Critério AC-001 permanece não atendido/verificado para PDFs digitalizados e mistos.

### P2 — Nenhum renderizador frontend consome o vínculo visual

Busca independente por `questionVisualAsset`, `visualEvidence` e `visualAssets` em `frontend/src` não encontrou consumidor. O backend pode armazenar associação, mas esta entrega não demonstra renderização junto ao enunciado/alternativa. Verificar contrato de leitura/API e UI antes de aceitar AC-005/006 para uso visual ponta a ponta.

## Matriz dos critérios

| Critério | Resultado | Evidência / lacuna |
| --- | --- | --- |
| AC-001 | Parcial | PDF nativo passa no caso Pedro. Parser local v2 foi chamado diretamente. OCR para documentos escaneados não foi executado pelo worker; OCR misto não testado. |
| AC-002 | Parcial | O teste independente confirma cobertura exata do texto normalizado em oito chunks e páginas sem lacuna. Persistência de chunks/embeddings foi coberta por dublês/contratos existentes, não por worker real; nenhuma escrita no banco. |
| AC-003 | Parcial | Unit tests de janelas/textos passam. A chamada real enviou uma janela, mas truncou a saída; não há prova de processamento e reconciliação de documento que exceda uma janela. |
| AC-004 | Falhou na execução real | PDF.js encontra dez blocos A–E e questão 08 completa. A chamada real do modelo truncou em 4.000 tokens e não produziu conjunto persistido; não se pode afirmar dez questões extraídas pelo LLM. |
| AC-005 | Não atendido | Asset não está ligado aos chunks PDF.js; multimodal não foi testado na rota nova. Gabarito em imagem permaneceu fora de escopo. |
| AC-006 | Parcial | Unit test verifica persistência mockada e IDs de origem. Sem banco não se verificou idempotência/retry real. Frontend não consome vínculo visual. |
| AC-007 | Parcial | Testes com dublês e teste local textual passam; chamada real foi identificada separadamente e falhou por truncamento. Falta OCR real, janela longa, imagem e idempotência ponta a ponta. |

## Comandos executados e resultados

- `NODE_ENV=test ASAAS_WEBHOOK_URL=https://example.invalid/api/webhook node --import tsx --test src/worker/services/__tests__/pedro-lucas-full-text.qa.test.ts` (em `backend/`) — passou: um PDF local, 10 questões, A–E, cobertura total e Q08 completa. Sem banco e sem modelo.
- `NODE_ENV=test ASAAS_WEBHOOK_URL=https://example.invalid/api/webhook node --import tsx --test src/worker/services/__tests__/full-document-text-chunker.test.ts src/worker/services/__tests__/question-extraction-windows.test.ts src/worker/services/__tests__/structured-question-extraction.service.test.ts` — passou: 7/7. Todos os testes de modelo/reposição são com dublês.
- `NODE_ENV=test ASAAS_WEBHOOK_URL=https://example.invalid/api/webhook node --experimental-test-module-mocks --import tsx --test src/worker/services/__tests__/document-worker.service.test.ts src/worker/services/__tests__/question-extraction.service.test.ts` — passou: 21/21; cobre sobretudo comportamento legado/mocks, não o PDF com a nova extração real.
- `npm run typecheck` (em `backend/`) — passou.
- Chamada Docling v2 real em `http://127.0.0.1:8083` com o PDF local — HTTP 200 pela resposta validada do cliente: 5 páginas, 7 chunks, 1 PNG, 0 warnings. Isto não exercita PDF.js QUESTIONS e não grava no banco.
- Chamada real do novo `StructuredQuestionExtractionService` com chunks gerados por PDF.js, repositório em memória e valores de `backend/.env` explicitamente parseados — HTTP 200 do OpenRouter, schema aceito, completion truncada em 4.000, erro `MODEL_OUTPUT_TRUNCATED`. Nenhuma persistência real.
- Tentativas iniciais sem `NODE_ENV=test`/URL de webhook válida falharam na validação de configuração (`ASAAS_WEBHOOK_URL`); tentativas corrigidas acima passaram. Nenhum teste modificou configuração ou código de produção.

## Limitações pendentes

- A chamada real foi somente textual, porque nenhum asset está ligado aos chunks PDF.js. O PDF Pedro Lucas contém um cartão-resposta visual na página 1; o requisito de analisar imagem de questão deve ser coberto com outro PDF que possua figura no enunciado/alternativa.
- A resposta truncada impediu avaliar número/qualidade das candidatas do modelo, associação visual, questão repetida e múltiplas figuras.
- O worker completo não foi executado: exigiria isolamento/mock integral do Supabase, persistência de parse runs, embeddings, banco e Storage para evitar banco de produção. Os testes disponíveis não cobrem esse fluxo todo.
- Não executei retry/idempotência contra banco real, migrações, deploy ou processamento de documento persistido.

## Revalidação após as correções do backend

Data: 2026-11-05 (horário local). Repeti o teste real com o extrator atualizado, usando a chave e o modelo lidos diretamente de `backend/.env` em memória e repositório de persistência em memória. Nenhuma conexão ou escrita no banco de produção foi usada. Resultado estruturado anonimizado salvo em [pedro-lucas-deepseek-real-2026-11-05.json](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/tests/document-parser/results/pedro-lucas-deepseek-real-2026-11-05.json); o arquivo não contém a chave.

### Execução real e comparação com o PDF

- Modelo: `deepseek/deepseek-v4.1-flash` (lido explicitamente de `backend/.env`). Schema JSON estruturado aceito em todas as chamadas finais; nenhuma falha de schema nos resultados que o cliente aceitou.
- O primeiro pedido do documento inteiro terminou em `length`; o novo mecanismo subdividiu até terminar as respostas finais. Foram 11 chamadas reais, cinco respostas truncadas pelo limite, e seis subchamadas concluídas; o processo completou sem erro. Nenhuma imagem de questão foi analisada: o único asset do PDF é o cartão-resposta na página 1, excluído da interpretação nesta fase.
- Saída agregada: **14 candidatas**, em vez das 10 questões esperadas. Os números 01, 02, 03 e 08 aparecem em duplicidade/fragmento. A reconciliação só mescla enunciado normalizado idêntico com chunk de origem compartilhado, por isso não consolidou os fragmentos.
- Comparação candidata a candidata com o texto extraído do PDF:

| Candidata | Nº do modelo | Enunciado vs PDF | Alternativas vs PDF |
| --- | --- | --- | --- |
| 1 | 01 | Completo | 5 completas |
| 2 | 02 | Completo | 5 rótulos, E termina em `BH`; a fonte termina em `BH 3` |
| 3 | “Questão 01” | Incompleto: omite as afirmações I–V, repete trecho do enunciado | 5 completas; duplicata parcial de 01 |
| 4 | “Questão 02” | Só o comando, duplicata de 02 | 5 rótulos; E termina em `BH` |
| 5 | “Questão 03” | Completo | 5 completas |
| 6 | 03 | Comando completo, duplicata de 03 | 5 completas |
| 7 | 04 | Completo | 5 completas |
| 8 | 05 | Completo | 5 rótulos; E termina após “e”, omitindo o resto da alternativa da fonte |
| 9 | 06 | Completo | 5 completas |
| 10 | 07 | Completo | 5 rótulos; alternativa A sai `3 × 10`, sem o expoente 17 separado no texto-fonte |
| 11 | 08 | Fragmento: para após “fórmula molecular” | 0 |
| 12 | 08 | Completo, incluindo a continuação e o bloco de alternativas | 5 completas |
| 13 | 09 | Completo | 5 completas |
| 14 | 10 | Completo | 5 completas |

Resultado do critério AC-004: **falhou**. Há 10 números de questão diferentes, mas 14 registros/candidatas, sem consolidação integral de 01/02/03/08; alternativas ou enunciados continuam incompletos em candidatas 2/3/4/8/10/11. O arquivo JSON local contém as strings e alternativas retornadas, sem segredo de autenticação.

### Revisão das correções de código

**P1 — integração visual de QUESTIONS continua sem disparar o parser v2 no caminho padrão.** `visualAssetsRequired` é calculado como verdadeiro para QUESTIONS quando há cliente v2, mas o `if` externo que chama `chunkWithAssets` só inclui `shouldUseDocChunker(...)` ou `shouldParseVisualAssets(...) && tag === 'KNOWLEDGE_BASE'` ([document-worker.service.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/worker/services/document-worker.service.ts:280), [linha 285](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/worker/services/document-worker.service.ts:285)). `shouldUseDocChunker` retorna falso para QUESTIONS; o segundo ramo exclui QUESTIONS. Nesse caminho, `visualParseRunId` fica `null`, então a ligação recém-adicionada entre chunks PDF.js e assets em [document-worker.service.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/worker/services/document-worker.service.ts:664) não roda. Testes isolados de linking passam, mas não cobrem esse gate de integração. AC-005 segue não demonstrado/atendido para o fluxo do worker.

**P1 — a divisão adaptativa recupera saída truncada, mas não valida completude semântica e a reconciliação deixa duplicatas.** O run produziu 14 resultados mesmo terminando sem erro. A saída inclui três alternativas truncadas e um fragmento de Q08 em uma resposta cujo `finish_reason` não disparou uma nova divisão; 01/02/03/08 ficaram duplicadas ou fragmentadas. A reconciliação só junta strings normalizadas idênticas com chunks compartilhados ([question-extraction-windows.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/worker/services/question-extraction-windows.ts:112)); o serviço persiste cada resultado restante ([structured-question-extraction.service.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/worker/services/structured-question-extraction.service.ts:99)). AC-004 falha e um retry de truncamento, por si só, não fecha o critério.

### Verificações automatizadas atualizadas

- Typecheck: `npm run typecheck` em `backend/` passou.
- Testes de worker: `NODE_ENV=test ASAAS_WEBHOOK_URL=https://example.invalid/api/webhook node --experimental-test-module-mocks --import tsx --test src/worker/services/__tests__/document-worker.service.test.ts` em `backend/` passou 5/5; os cenários de integração visual/QUESTIONS neste arquivo ainda usam dublês e não testam o gate acima com o PDF local.
- Suíte combinada de chunker, janelas, parser de visual links, extração estruturada e Pedro PDF.js, repetida após a correção da expectativa do teste de imagem: 21/21 passaram. A tentativa anterior falhou porque a expectativa não correspondia à forma `data:image/png;base64,...`; no estado atual o teste passa. Não alterei teste nem produção.
- O teste PDF.js independente segue passando: cinco páginas, oito chunks, 7.830 caracteres normalizados cobertos e texto-fonte contendo exatamente as questões numeradas 01–10 com A–E. Esse resultado não equivale à saída LLM, que falhou no critério acima.
- O parser v2 local não foi chamado nesta rodada de revalidação: o worker completo exigiria persistência de parse run, assets, chunks e embeddings. A chamada real ficou isolada em PDF.js + OpenRouter + repositório em memória.

## Reteste de chamada única com reasoning desativado no processo

Executado após autorização do arquiteto; não houve alteração do `.env`. A chave e o modelo foram lidos de `backend/.env` em memória, com `AI_REASONING_EFFORT=none`, `OPENROUTER_STRUCTURED_TIMEOUT_MS=180000` e `QUESTION_EXTRACTION_MAX_TOKENS=16000` definidos somente no processo antes de importar a configuração. O worker recebeu todos os oito chunks de texto em uma janela, mais uma imagem PNG rasterizada da página 4 do próprio PDF para testar a leitura do expoente de Q07. Repositório mock em memória; nenhuma escrita ou conexão ao banco.

Uma chamada real: HTTP 200, `finish_reason=stop`, `prompt_tokens=3638`, `completion_tokens=3524`, `total_tokens=7162`, `responseChars=11335`. A resposta incluiu `usage.completion_tokens_details`; `reasoning_tokens=0`. A saída estruturada foi aceita pelo schema e retornou 10 questões 01–10. Isso confirma que o processo com `AI_REASONING_EFFORT=none` não consumiu tokens de reasoning nessa resposta e concluiu a extração. É evidência compatível com a hipótese de raciocínio consumir o teto no run anterior, mas a divisão de tokens daquele run não foi capturada; portanto não dá para atribuir causalidade retroativamente.

### Comparação final por questão

| Nº | Enunciado no resultado final | Alternativas | Estado vs PDF |
| --- | --- | --- | --- |
| 01 | Enunciado completo com reação, afirmações I–V e frase de seleção | A–E, completas | Confere |
| 02 | Comando completo “Assinale a alternativa...” | A–E; E termina em `BH 3` após normalização | Confere |
| 03 | Comando completo “Assinale a alternativa correta” | A–E | Conteúdo confere; E inclui o rodapé `@quimica.bizurada` |
| 04 | Enunciado e afirmações I–V completos | A–E, completas | Confere |
| 05 | Enunciado completo sobre ligação metálica | A–E; E restaurada até o fim textual | Confere |
| 06 | Comando completo sobre tipos de ligação | A–E | Conteúdo confere; E inclui o rodapé `@quimica.bizurada` |
| 07 | Enunciado completo, mas inclui o `17` solto no final | A–E; A = `3 × 10`, sem expoente | Falha: a imagem da página mostra `3 × 10^17` |
| 08 | Enunciado completo, fórmula e reação incluídas | A–E | Conteúdo confere; E inclui o rodapé `@quimica.bizurada` |
| 09 | Enunciado completo com as três afirmações | A–E, completas | Confere |
| 10 | Comando completo “Sobre os modelos atômicos...” | A–E | Conteúdo confere; E inclui o rodapé `@quimica.bizurada` |

Questões 07 e 08 citaram o asset da imagem de página 4 com papel `STATEMENT`. A resposta prova que o modelo/provider aceitou a imagem (HTTP 200 e saída estruturada), mas a alternativa Q07 permaneceu incompleta no objeto final.

### Limite de atribuição do expoente Q07

O JSON bruto do modelo **antes** de `reconcileStructuredQuestions` não foi capturado, então não posso afirmar se o modelo escreveu o expoente e a reconciliação o removeu. A captura preservada contém o objeto final depois do serviço. O resultado final `3 × 10` coincide com o reconstrutor de fonte: [question-extraction-reconciliation.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/worker/services/question-extraction-reconciliation.ts:64) usa os marcadores textuais da alternativa, que no texto PDF.js deixam `17` separado antes de `A)`. A função substitui as alternativas do modelo quando consegue parsear alternativas da fonte. A advertência de integridade foi desenhada justamente para alertar sobre esse caso, mas o expoente visível na página não foi aplicado ao campo A. O arquivo local registra explicitamente que a saída pré-reconciliação não foi capturada.

O teste [question-extraction-reconciliation.test.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/worker/services/__tests__/question-extraction-reconciliation.test.ts:74) afirma que “o PDF não traz o expoente de A”; isso descreve a extração textual PDF.js, mas é falso para a página renderizada, que mostra visualmente o sobrescrito 17. O critério de fidelidade Q07 segue pendente.

### Gate visual, UI e testes na revisão atual

- O gate visual foi corrigido nesta versão: `shouldUseDocChunker('QUESTIONS', 'pdfjs') === true` e o teste de integração com dublês `document-worker.doc-chunker.integration.test.ts` verifica chamada v2, persistência/vínculo de asset antes de embeddings e extração posterior. O teste passou usando `--experimental-test-module-mocks`. Isso prova o contrato por mock, não o processamento completo do worker contra Docling/Storage/banco real.
- Revisão da UI: o repositório de leitura gera URL assinada para cada asset/question role; `MonitorWorkspace` mapeia `visualAssets`; `MonitorQuestionsReviewTab` renderiza `STATEMENT` junto ao enunciado e `ALTERNATIVE:A` etc. dentro da opção. Os contratos atuais cobrem os dois vínculos.
- Teste frontend `node --test tests/monitor-questions-view-extraction.test.mjs`: 2/2 passaram; `npm run typecheck` em `frontend/` passou.
- Suíte backend de extrator/reconciliação/chunker/linking: 22/22 passou. Integração worker Docling v2: 1/1 passou com módulo mockado. `npm run typecheck` em `backend/` passou.
- A fixture local de questão com figuras (Quimica-3, página 9 / Estequiometria, páginas com diagramas) foi identificada no parser v2 em execução anterior, mas não houve uma chamada de modelo separada para um recorte dessa fixture nesta rodada; a imagem real enviada ao modelo foi a página 4 do Pedro Lucas. Portanto o teste comprova que o provider aceita uma imagem PNG real e que o frontend associa/renderiza papéis, mas não valida ainda a leitura de um recorte real de figura de outro PDF.

Artefato desta execução: [pedro-lucas-deepseek-single-request-reasoning-none-2026-11-05.json](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/tests/document-parser/results/pedro-lucas-deepseek-single-request-reasoning-none-2026-11-05.json). Não guardei o texto bruto do modelo antes da reconciliação nem qualquer credencial ou conteúdo de reasoning.

## QA final após correção de reasoning, timeout e orçamento

Data: 2026-11-05. Esta rodada substitui o resultado de truncamento das rodadas anteriores. Não alterei código de produção nem rodei worker contra banco; todas as candidatas foram guardadas em repositório em memória. A chave e modelo vieram de `backend/.env` parseado antes dos imports, sem imprimir ou salvar a chave. Overrides somente no processo: `QUESTION_EXTRACTION_MAX_TOKENS=16000`, `QUESTION_EXTRACTION_TIMEOUT_MS=180000`, `QUESTION_EXTRACTION_REASONING_EFFORT=none`.

### Chamada real ao OpenRouter

Comando executado em `backend/`: `node --import ./node_modules/tsx/dist/loader.mjs /tmp/qa-pedro-final-one-call.mjs`.

- Modelo: `deepseek/deepseek-v4.1-flash`; endpoint recebeu `response_format=json_schema`, schema `document_questions` e `provider.require_parameters=true`.
- Contagem HTTP: **1** chamada. Todos os 8 chunks ordenados, com IDs/páginas, seguiram no mesmo corpo; texto de entrada da requisição: 8.888 caracteres; fonte PDF.js normalizada: 7.830 caracteres em 5 páginas, cobertura integral em 8 chunks.
- O processo aplicou timeout de 180.000 ms via configuração carregada antes do import; a chamada levou 10.978 ms. Pedido enviou `max_tokens=16000`, `reasoning.effort=none` e uma parte multimodal `image_url` de 208.074 caracteres de data URL.
- Resposta HTTP 200, `finish_reason=stop`, schema aceito, 3.653 tokens de prompt, 3.835 completion, 7.488 total, 0 reasoning tokens. Sem erro de truncamento/schema.
- Retornou 10 candidatas 01–10 com 5 alternativas A–E cada; 10 foram reconciliadas e salvas no repositório em memória. O JSON preserva o objeto estruturado bruto pré-reconciliação e os objetos finais, sem segredo: [resultado da revalidação final](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/tests/document-parser/results/pedro-lucas-final-correction-2026-11-05.json) (modo local `0600`). Não contém chave nem texto de reasoning.

### Comparação por questão: retorno bruto → objeto final

| Questão | Enunciado no retorno bruto / final | Alternativas brutas → finais | Resultado contra a fonte |
| --- | --- | --- | --- |
| 01 | Completo / mantido completo | A–E completas / A–E completas | Confere; sem rodapé. |
| 02 | Completo / mantido completo | E bruto termina em `BH`; reconciliação restaura `BH 3` do texto-fonte; A–E finais | Final completo, com quebra entre `BH` e `3`; sem rodapé. |
| 03 | Comando completo / mantido | A–E / A–E completas | Confere; sem `@quimica.bizurada`. |
| 04 | Enunciado e afirmações I–V / mantidos | A–E / A–E completas | Confere; sem rodapé. |
| 05 | Enunciado completo / mantido | A–E / A–E completas | Confere; sem rodapé. |
| 06 | Comando completo / mantido | A–E / A–E completas | Confere; sem rodapé. |
| 07 | Bruto termina em `75 g/mol`; final ganha `17` solto no fim do enunciado | A bruto e final `3 × 10 17`; A–E presentes | **Requer revisão:** PDF mostra `3 × 10¹⁷` na alternativa A. Os dígitos 17 estão presentes, mas sem marcação de expoente; a reconciliação ainda coloca uma cópia solta do `17` no enunciado. |
| 08 | Enunciado, reação e instrução de cálculo completos / mantidos | A–E / A–E completas | Confere a continuação e as alternativas; sem rodapé. |
| 09 | Enunciado e afirmações I–III / mantidos | A–E / A–E completas | Confere; sem rodapé. |
| 10 | Comando completo / mantido | A–E / A–E completas | Confere; sem rodapé. |

Nenhuma das alternativas brutas ou finais contém `@quimica.bizurada`. Não houve gabarito inferido; `correctAnswer` fica nulo conforme escopo. O enunciado Q07 bruto estava separado corretamente; o `17` extra aparece no resultado final, portanto entrou na reconciliação de texto-fonte, não na geração bruta.

### Imagem e caminho worker

A única imagem enviada ao modelo nesta chamada foi o raster local da página 4 do próprio Pedro Lucas, ligado em memória aos chunks que cobrem a página. O request tinha uma imagem `image_url`; o provider aceitou e retornou referências `visualEvidence` para Q07 e Q08. O arquivo é uma **renderização sintética da página inteira**, não um recorte visual retornado pelo Docling. Como o texto extraído já contém um `17` isolado e o raster mostra o mesmo número, a resposta não permite provar que o modelo obteve o expoente da imagem. Também não prova leitura de figuras de outro documento.

O teste `document-worker.doc-chunker.integration.test.ts` (1/1 dentro da suíte abaixo) cobre o gate QUESTIONS → Docling v2 → persistência/ligação asset/chunk → embeddings → extração, mas troca parser, storage, repositórios e embeddings por dublês. A chamada real acima chama diretamente `StructuredQuestionExtractionService` com chunks PDF.js e um asset em memória; ela não passa pelo worker, storage, banco ou parser Docling real. A UI tem teste contratual para os papéis `STATEMENT` e `ALTERNATIVE:*`; não fiz navegação visual no browser.

### Achados QA

#### P1 — Q07 perde a posição do sobrescrito na reconciliação

Arquivo: [question-extraction-reconciliation.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/worker/services/question-extraction-reconciliation.ts:130). `parseSourceQuestionSection` separa alternativas por marcadores A–E e `canonicalizeCandidate` substitui o enunciado do modelo pelo texto-fonte (`statement: parsed.statement`). No PDF.js, o token do expoente fica órfão depois do dado de massa molar; a saída final passa a terminar com esse `17`, embora o enunciado bruto não o tenha. A alternativa A preserva `3 × 10 17`, sem representação inequívoca de sobrescrito. A página renderizada mostra visualmente `3 × 10¹⁷`. A checagem de integridade em [structured-question-extraction.service.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/worker/services/structured-question-extraction.service.ts:44) só alerta quando o texto termina em `×10`; ela não marca `×10 17` nem a cópia no enunciado.

**Reprodução:** abrir o JSON de resultado final; comparar `rawStructuredOutputBeforeReconciliation.questions[number=07]` com `reconciledPersistedCandidates[number=07]` e com `/tmp/pedro-lucas-p4-4.png`. Resultado observado: bruto sem `17` final no enunciado; final com `...75 g/mol 17`; A final `3 × 10 17`; imagem fonte `3 × 10¹⁷` em A. Não fiz correção de produção.

#### P2 — OCR e asset de figura real ainda não validados ponta a ponta

O caminho preferido para QUESTIONS chama Docling v2 quando o cliente e URL estão configurados ([document-worker.service.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/worker/services/document-worker.service.ts:280)); a integração é coberta por mock. Sem o parser configurado, o ramo PDF.js marca `NEEDS_OCR` e pula chunking/embeddings/questões ([document-worker.service.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/worker/services/document-worker.service.ts:633)). Não executei PDF escaneado/misto no worker nem parser v2 com fixture de figura real nesta rodada. Assim, AC-001 e envio de um recorte real de figura permanecem parcialmente verificados. A requisição sintética valida aceitação de imagem pelo provider, mas não valida asset pipeline real ou entendimento visual.

#### P2 — cobertura de texto sem verificação no ramo Docling persistido

Quando os chunks Docling são persistidos, o worker pula o ramo PDF.js de cobertura integral e segue para embeddings/extrator ([document-worker.service.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/worker/services/document-worker.service.ts:451)). A integração mock usa um único chunk e não compara os caracteres do parser com a união dos chunks. O teste PDF.js prova cobertura para o Pedro Lucas local, mas não cobre a resposta completa do Docling. AC-002 está comprovado para o caminho PDF.js testado e permanece uma lacuna para o caminho parser/worker que será usado com imagens/OCR.

### Configuração de modelos: falha observada e causa

`ai-models.config.test.ts` falha quando executada com cwd `backend/` e `.env` local: esperado `openai/test-chat-model`, recebido `google/gemini-2.5-flash`. A causa reproduzida é o teste apagar `TOPIC_PROFILE_MODEL` e depois importar `env.ts`; `dotenv.config()` roda com `override=false` em `NODE_ENV=test` e repõe o valor do `.env` ([env.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/config/env.ts:6)). Em cwd isolado sem `.env`, o mesmo teste passa 1/1. O `.env` contém `TOPIC_PROFILE_MODEL=google/gemini-2.5-flash`; o código anterior também priorizava `env.TOPIC_PROFILE_MODEL`, então o resultado local é contaminação do teste pelo arquivo, não regressão causada pelo novo default em `ai-models.config.ts`.

### Comandos e resultados

- Backend, testes alvo: `NODE_ENV=test ASAAS_WEBHOOK_URL=https://example.invalid/api/webhook node --experimental-test-module-mocks --import tsx --test src/worker/services/__tests__/full-document-text-chunker.test.ts src/worker/services/__tests__/question-extraction-windows.test.ts src/worker/services/__tests__/question-extraction-reconciliation.test.ts src/worker/services/__tests__/structured-question-extraction.service.test.ts src/worker/services/__tests__/pedro-lucas-full-text.qa.test.ts src/worker/services/__tests__/document-worker.doc-chunker.test.ts src/worker/services/__tests__/document-worker.doc-chunker.integration.test.ts src/worker/services/__tests__/document-worker-question-extraction-policy.test.ts` — **21/21 passou**.
- `NODE_ENV=test ASAAS_WEBHOOK_URL=https://example.invalid/api/webhook node --import tsx --test src/worker/client/__tests__/openrouter.client.test.ts` — **9/9 passou**.
- `npm run typecheck` em `backend/` — passou.
- `node --test tests/monitor-questions-view-extraction.test.mjs` em `frontend/` — **2/2 passou**; `npm run typecheck` em `frontend/` — passou.
- `NODE_ENV=test ASAAS_WEBHOOK_URL=https://example.invalid/api/webhook node --import tsx --test src/config/__tests__/ai-models.config.test.ts` em `backend/` — **falhou 0/1** pelo `.env` acima. Mesmo teste executado de `/tmp/qa-clean-env` com as variáveis obrigatórias de teste e sem `.env` no cwd — **passou 1/1**.
- Chamada real ao modelo — **1 request, 10 questões/A–E**, sem banco. Resultado não equivale a execução real do worker, embeddings ou persistência.

### Matriz de aceite atualizada

| Critério | Resultado QA final | Evidência / lacuna |
| --- | --- | --- |
| AC-001 | Parcial | PDF nativo testado. O worker chama v2 sob configuração, mas OCR escaneado/misto não foi executado; sem parser, ramo PDF.js pede OCR e interrompe. |
| AC-002 | Parcial | 7.830/7.830 caracteres normalizados em oito chunks PDF.js e embeddings READY exigidos pelo serviço; persistência/embeddings reais não executados. Ramo Docling não tem cobertura de caracteres verificada neste teste. |
| AC-003 | Passou para Pedro Lucas | Um corpo, um request, todos os chunks em ordem, schema estrito aceito; unit tests provam erro explícito acima do budget e sem subdivisão. |
| AC-004 | Parcial; pendente de aceite | Bruto/final 10 números distintos e cinco alternativas cada; Q08 completa; Q02-E recuperada. Q07 fica com `17` extra no enunciado e A sem formatação inequívoca de expoente. |
| AC-005 | Parcial | Request real incluiu PNG e provider respondeu; asset foi imagem sintética de página completa, não crop Docling. Worker mock prova encadeamento; fixture com figura e semântica visual real não executadas. |
| AC-006 | Parcial | Objetos foram salvos em memória; mocks verificam ordem e UI de leitura/renderização. Banco, retry e idempotência reais não executados. |
| AC-007 | Parcial | 21 testes backend, 9 cliente OpenRouter, 2 frontend e typechecks passam; teste config isolado passa. Faltam casos OCR real, parser→Storage→LLM com figura, worker/banco e idempotência ponta a ponta. |

Nenhum banco de produção foi acessado. Não executei migrations, deploy ou alterações de produção.

## Revalidação offline das correções finais de Q07 e cobertura Docling

Data: 2026-11-05. Não repeti a chamada paga; usei o objeto bruto real já salvo em [pedro-lucas-final-correction-2026-11-05.json](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/tests/document-parser/results/pedro-lucas-final-correction-2026-11-05.json) e o PDF local para refazer chunking, reconciliação e caminho de persistência mockado.

### Q07 e aviso na fronteira de persistência

O texto bruto real foi reprocessado com PDF.js/chunker/reconciliação atual. Agora o enunciado persistido termina em `75 g/mol`; o `17` órfão não é acrescentado a ele. A alternativa A permanece literalmente `3 × 10 17`: o fluxo não inventa HTML/Unicode de sobrescrito. A questão recebe dois avisos: `ORPHANED_NUMERIC_TOKEN_BEFORE_ALTERNATIVES` com `token=17` e `SCIENTIFIC_EXPONENT_FORMAT_UNVERIFIED` para A. O resultado continua requerendo conferência humana contra a página que mostra `3 × 10¹⁷`.

O teste QA novo `structured-question-extraction.persisted-warnings.qa.test.ts` passa a captura real e o PDF pelo serviço atual. Ele substitui Prisma e `saveQuestion` por dublês em memória, captura o argumento de persistência e verifica que ambos os avisos estão em `metadata.sourceIntegrityWarnings`; confirma também dez candidatos e exatamente uma chamada stub. O repositório real `saveQuestion` mapeia `input.metadata` para o campo Prisma `metadata` ([question.repository.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/repositories/question.repository.ts:373)). Isso verifica o payload na fronteira de persistência, sem afirmar escrita em banco.

| Questão | Resultado offline atual | Observação |
| --- | --- | --- |
| 01 | Enunciado completo; A–E | Sem rodapé. |
| 02 | Enunciado completo; A–E; E reconstruída como `BH 3` | `3` vem da fonte; pode haver quebra de linha visual. |
| 03 | Enunciado completo; A–E | Sem rodapé. |
| 04 | Enunciado/afirmações I–V; A–E | Completa. |
| 05 | Enunciado completo; A–E | E completa pela fonte. |
| 06 | Enunciado completo; A–E | Sem rodapé. |
| 07 | Enunciado sem token órfão; A–E; A=`3 × 10 17` | Avisos de token órfão e expoente sem formato inequívoco; revisão necessária. |
| 08 | Enunciado, equação e A–E | Continuação preservada; sem rodapé. |
| 09 | Enunciado/afirmações I–III; A–E | Completa. |
| 10 | Enunciado completo; A–E | Sem rodapé. |

A captura bruta pré-reconciliação segue com 10 questões distintas e cinco alternativas. A reconciliação preserva os dez números e a execução offline não faz nova requisição externa. `sourceIntegrityWarnings` não foi encontrado como dado consumido na UI; está persistido no metadata, mas não vi um indicador visual específico para avisar o professor sobre Q07.

### Parser v2 real local, sem worker/banco/modelo

O endpoint local `http://127.0.0.1:8083/chunk/v2` respondeu para duas fixtures via `DocChunkerV2Client`; não houve OpenRouter nem escrita no banco.

- `tests/document-parser/ocrTeste.pdf`: parser declarou 4 páginas, retornou 3 chunks cobrindo 1–4, total 2.353 caracteres `raw_text` e três assets PNG de rasterização de página (1, 3, 4), sem warnings. `pdftotext -layout` do PDF original encontrou 118 caracteres não brancos; a diferença é compatível com OCR do conteúdo escaneado. A chamada valida o parser, mas não o worker persistindo chunks/embeddings.
- `tests/document-parser/teacher-materials/Quimica-3.pdf`: 16 páginas declaradas, 13 chunks cobrindo páginas 1, 3–12, 15 e 16, 9.126 caracteres `raw_text`, 20 PNGs com bboxes/ordem, sem warnings. Assets de figuras reais foram retornados (incluindo recortes nas páginas 9 e 15); não foram enviados a modelo nesta rodada.

#### P2 — o gate de página rejeita páginas realmente em branco

O resultado Docling de Quimica-3 não tem chunk nas páginas 2, 13 e 14. Inspeção visual local confirmou página 2 completamente vazia; 13–14 são folhas de rascunho com apenas cabeçalho/rodapé. `assertQuestionParserPageCoverage` exige ao menos um chunk textual por página declarada e lança erro se falta alguma ([document-worker.service.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/worker/services/document-worker.service.ts:1164)). Como o erro ocorre antes de inserir `QUESTIONS_TEXT_COVERAGE_UNVERIFIED`, o worker nesta baseline falharia a ingestão em vez de concluir com estado parcial. Encaminhei ao arquiteto para ajuste da regra em páginas sem conteúdo útil; essa correção ainda precisa ser revalidada.

### Verificações na baseline corrigida

- `NODE_ENV=test ASAAS_WEBHOOK_URL=https://example.invalid/api/webhook node --experimental-test-module-mocks --import tsx --test src/worker/services/__tests__/question-extraction-reconciliation.test.ts src/worker/services/__tests__/structured-question-extraction.service.test.ts src/worker/services/__tests__/document-worker.doc-chunker.integration.test.ts src/worker/services/__tests__/document-worker.doc-chunker.test.ts` (em `backend/`) — **16/16 passou**.
- `NODE_ENV=test ASAAS_WEBHOOK_URL=https://example.invalid/api/webhook node --experimental-test-module-mocks --import tsx --test src/worker/services/__tests__/structured-question-extraction.persisted-warnings.qa.test.ts` — **1/1 passou**; captura real + PDF, nenhum request externo e nenhum banco.
- `npm run typecheck` em `backend/` — passou após o teste QA novo.
- Os testes anteriores de OpenRouter/frontend e seus typechecks continuam documentados acima; não houve nova chamada ao OpenRouter.

### Critérios após esta revalidação

| Critério | Estado atual |
| --- | --- |
| AC-001 | Parcial: parser local produziu texto compatível com OCR em fixture; worker/OCR não foi rodado e páginas vazias precisam ser aceitas sem perder sinalização. |
| AC-002 | PDF.js Pedro tem cobertura integral. Docling é explicitamente `UNVERIFIED` por caracteres e exige página presente; a regra atual falha com página em branco, aguardando correção. |
| AC-003 | Mantém uma janela/chamada; captura bruta reprocessada offline com um único stub. Nenhuma chamada paga repetida. |
| AC-004 | 10 questões e A–E mantidas; Q07 sem token no enunciado e com avisos, mas precisa de revisão humana para interpretar o sobrescrito. |
| AC-005 | Parser v2 local retornou recortes reais com bbox; não testei worker/storage/LLM ponta a ponta com esses bytes. |
| AC-006 | Avisos chegam ao argumento `saveQuestion.metadata` no teste mockado; nenhuma gravação/retry/idempotência real. UI não exibe o aviso específico. |
| AC-007 | Suíte focal e QA de persistência passam; parser local executado. Falta revalidar correção de páginas vazias e fluxo real de worker. |
