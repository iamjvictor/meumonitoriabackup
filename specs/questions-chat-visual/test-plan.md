# Plano independente de testes — questions, reprocessamento e chat visual

Base: `docs/superpowers/plans/2026-11-02-correcao-questions-chat-visual.md`. Os cenários abaixo derivam dos ACs e dos incidentes registrados nos relatórios em `dbtemp/artifacts/`: conflito `P2002` por `(topic_id, text_hash)`, perda de `question_sources` ao substituir chunks, dez blocos detectados mas apenas nove questões persistidas, asset da página 3 com associação ambígua e necessidade de provar o envio da imagem real ao chat.

## Princípios de execução

- Não usar mocks para alegar persistência, concorrência em Postgres, autorização real, acesso ao Storage ou envio multimodal. Testes unitários com mocks cobrem apenas transformação/decisão local; os ACs correspondentes precisam também de integração no `dbtemp`.
- Nunca rodar novamente o worker em dados com relações existentes até o cenário de preservação passar. Os dados de integração devem usar IDs exclusivos e banco/buckets `dbtemp`.
- Capturar `questionId`, número, página, `sourceKey`, `textHash`, IDs de chunks/assets, estado e origem antes/depois. Comparar conjuntos e hashes, não apenas contagens.
- Não imprimir chaves, URLs assinadas ou bytes de imagem em logs. Ao verificar envio visual, calcular SHA-256 localmente e inspecionar a requisição interceptada em memória.
- Registrar cada cenário como PASS/FAIL/BLOCKED, comando, duração, dados e artefato em `validation.md`. Uma falha que bloqueie etapas posteriores mantém os ACs downstream como BLOCKED, sem converter mock em sucesso.

## Cenários e rastreabilidade

| ID | AC | Nível | Preparação e ação | Resultado exigido |
|---|---|---|---|---|
| QA-001 | AC-001, AC-008 | Integração Postgres | Ingerir uma fixture com 10 blocos numerados, um por página conhecida; consultar blocos, spans, candidatas, questões e fontes. | Cada questão/candidata tem origem, número e página rastreáveis; total classificado explica exatamente os dez blocos; bloqueios aparecem como candidatos com motivo. |
| QA-002 | AC-003 | Integração Postgres + Storage | Guardar snapshot de IDs/hash/origens/assets; executar ingestão idêntica duas vezes. | Segunda execução não cria duplicatas nem altera IDs, hashes ou vínculos; origens e assets continuam consultáveis. |
| QA-003 | AC-003 | Integração/concorrência Postgres | Iniciar duas persistências simultâneas para o mesmo `documentId` e mesmo conteúdo. | Uma representação lógica por questão/chunk; sem `P2002` não tratado, sem exclusões órfãs e com relações válidas. |
| QA-004 | AC-003 | Integração/transação | Injetar falha depois de preparar chunks substitutos e antes de finalizar remapeamento das origens. | Rollback mantém o snapshot anterior completo; nenhuma fonte/asset desaparece. Em mudança de conteúdo não mapeável, operação aborta sem deletar o estado anterior. |
| QA-005 | AC-003 | Integração de domínio | Mesmo texto da mesma questão em reexecução versus mesmo texto vindo de origem distinta; incluir questão aprovada e pendente. | Reexecução reutiliza a questão e acrescenta/reconcilia origem sem alterar revisão humana; duplicidade entre fontes segue regra única documentada e não falha em `(topic_id,text_hash)`. |
| QA-006 | AC-002 | Unidade + integração | Questão discursiva, alternativas válidas, JSON truncado, alternativa repetida e resposta fora do conjunto. | Só estrutura válida é marcada completa/AI_GENERATED; inválida ou parcial mantém pendência explícita; alternativas de origem são preservadas. |
| QA-007 | AC-004 | Unidade + integração Storage | Asset único com geometria que intersecta a questão, asset fora da região, múltiplos assets, caixas ausentes e decisão manual de ambiguidade. | Associação automática só quando evidência espacial é inequívoca; ambiguidade guarda candidatos e permite resolução auditável; hash do asset não muda. |
| QA-008 | AC-005, AC-006 | Integração chat/gateway | Questão aprovada e autorizada com figura vinculada; interceptar payload multimodal no gateway. | Payload contém texto e imagem `image_url`/equivalente, MIME válido e bytes com SHA igual ao asset certo; escopo pertence à questão e tenant esperados. |
| QA-009 | AC-006 | Integração chat | Repetir com questão pendente, outro tenant, asset de outra questão, Storage ausente e bytes corrompidos. | Acesso indevido é recusado; imagem não é anexada; resposta/log não afirma ter visto a figura e não revela URL ou conteúdo de outro tenant. |
| QA-010 | AC-005 | E2E real com modelo multimodal | Enviar pela rota autenticada uma pergunta sobre um detalhe verificável apenas na figura da questão. | Evidência no gateway prova bytes enviados; resposta é compatível com detalhe visual e revisão humana confirma. Se modelo/provider não suportar visão, cenário falha explicitamente. |
| QA-011 | AC-007 | E2E OCR/RAG local | Processar Estequiometria e pH/pOH como `KNOWLEDGE_BASE`; buscar anotações e figura da página 3. | Chunks/embeddings e citações recuperam conteúdo dos documentos e imagem; nenhuma questão é criada a partir deles. |
| QA-012 | AC-001 a AC-008 | E2E três PDFs + relatório | Ingerir `Quimica-3.pdf`, Estequiometria e pH/pOH em ambiente local limpo; repetir ingestão e consultar relatório. | Dez questões reconciliadas com PDF; estados incompletos justificados; fontes e assets íntegros; chat visual provado; relatório separa teste real, mock e revisão humana. |

## Suítes automatizadas esperadas

- Repositórios: `node --import tsx --test backend/src/repositories/__tests__/document-worker.repository.test.ts backend/src/repositories/__tests__/document-worker.repository.reprocessing.qa.test.ts backend/src/repositories/__tests__/question.repository.reprocessing.qa.test.ts`.
- Worker/visual: executar testes unitários de `question-extraction.service`, `document-visual-linking.service` e persistência de spans/visuais conforme os paths existentes.
- Chat: `npm --prefix backend run test:chat`, adicionando testes de gateway multimodal e resolução do asset da questão.
- Banco local: scripts de integração com `DATABASE_URL` apontada exclusivamente para `127.0.0.1:56322`; rodar QA-001 a QA-005 e validar snapshots no SQL/Prisma. Proibir fallback para `.env` de produção.
- Primeiro teste Postgres isolado para concorrência de identidade e rollback de substituição: `cd backend && node --import tsx --test src/repositories/__tests__/document-question-reprocessing.database.qa.test.ts`.
- E2E: comandos versionados em `dbtemp/README.md`, com entrada explícita das três fixtures; saída JSON e Markdown gravada sob `dbtemp/artifacts/`.

## Regras de aprovação

1. AC-003 é bloqueador: se repetição ou concorrência apagar uma relação, não iniciar o E2E que reprocessa o PDF completo.
2. AC-005 só passa com chamada interceptada contendo os bytes da imagem; teste que verifica somente `visualAssetIds`, descrição textual ou referência no prompt não basta.
3. AC-001 só passa quando cada um dos dez blocos é contabilizado como questão pronta ou candidata rastreável; `document.status = READY` isoladamente não prova completude.
4. AC-002 exige estrutura e validação química: cinco opções e uma letra de resposta não provam que a alternativa correta está certa.
5. Banco/Storage ou provider indisponível deve ser registrado como BLOCKED, com razão, sem inferir aprovação.

## Casos independentes adicionados para o pacote 2

- `backend/src/worker/services/__tests__/document-visual-linking.package2.qa.test.ts`: confirma que dois assets na mesma página, sem prova espacial/item_ref, permanecem apenas `REVIEW_CANDIDATE`, não são promovidos a `QuestionVisualAsset`, mantêm seus IDs no reporte e deixam o span `PENDING_EXTRACTION`; também verifica seleção por `item_ref` inequívoco.
- `backend/src/worker/services/completeQuestion/__tests__/question-alternatives-validation.package2.qa.test.ts`: verifica rejeição de cinco registros que colapsam para menos de cinco textos distintos e preservação de alternativas documentais ao completar opções ausentes.
- Comando focado: `cd backend && node --import tsx --test src/worker/services/__tests__/document-visual-linking.package2.qa.test.ts src/worker/services/completeQuestion/__tests__/question-alternatives-validation.package2.qa.test.ts`.
- Lacuna intencional até o término do pacote 2: integração da resolução manual ambígua até `Question`, auditoria da origem `AI_GENERATED` versus documental no contrato de persistência, truncamento/JSON inválido via OpenRouter client, e integração dos spans das dez questões com a página original. Esses casos exigem o diff final e fixtures/ports que o implementador ainda está alterando.
- `backend/src/worker/services/completeQuestion/__tests__/question-answer-invalid-result.package2.qa.test.ts`: verifica resposta fora de A–E como `INVALID_ANSWER`, `correctAnswer: null` e decisão não gerada.

## Casos independentes adicionados para o pacote 3

- `backend/src/modules/chat/__tests__/chat-question-visual-endpoint.package3.qa.test.ts`: Fastify route real com doubles dos boundaries externos; testa questão aprovada do monitor, pending, monitor/tenant divergente e igualdade byte a byte + SHA-256 na chamada capturada do provider.
- `backend/src/modules/chat/rag/services/chat-visual-bytes-and-limit.package3.qa.test.ts`: garante prioridade dos até quatro assets da questão sobre upload/RAG, aviso explícito de fontes omitidas no limite, e omissão de imagem com checksum inválido sem data URL/afirmação de visão.
- O payload capturado prova que bytes verificados pelo `ChatVisualImageLoader` chegam na fronteira do `OpenRouterChatGateway`. Este teste usa doubles para Storage, auth, banco, Redis e provider: não substitui teste com Supabase Storage real nem chamada multimodal real.

## Repetição adicional de origem (AC-003)

- `backend/src/repositories/__tests__/question-source-repeat-idempotency.qa.test.ts`: cria tenant, documento, bloco, chunk e questão próprios no Postgres `dbtemp`; chama `saveQuestion` duas vezes com a mesma `sourceKey`, `textHash`, origem (`chunkId` + `role`) e intervalo. Exige mesmo ID lógico e snapshot completo de hash/origens inalterado. Não lê nem reprocessa os documentos/fixtures existentes.
- O mesmo teste cobre retomada de uma questão parcial com papéis `ALTERNATIVE`/`ANSWER_KEY` no chunk já ligado e reprocessamento de uma questão aprovada/revisada; deve preservar campos aprovados e anexar a nova relação `EXPLANATION` sem duplicar papéis existentes.
- Evidência observada em `dbtemp/artifacts/2d7bc13c-7573-435d-b43a-37e68702ee37/report.failed.json`: 10 questões antes/depois; sources contam 10→26. Em oito questões, três linhas do snapshot reportam o mesmo `chunkId`, `documentBlockId` e `pageStart`; cinco questões têm `textHash` distinto antes/depois. O snapshot não registra `QuestionSource.role`, intervalos de caracteres, excerpt nem conteúdo da questão; por isso não permite classificar as 16 linhas adicionais como duplicatas reais ou novas relações de papel, nem explica as cinco mudanças de hash. A chave única do schema é `(questionId, chunkId, role)`: papéis distintos podem ser relações distintas, ainda que chunk/bloco/página coincidam. O teste isolado cobre idempotência do mesmo papel; para fechar o achado E2E, o relatório deve incluir papel e intervalos e uma repetição controlada deve comparar conjuntos por `(questionId, chunkId, role)` e textHash com a mesma saída determinística/modelo congelado.
