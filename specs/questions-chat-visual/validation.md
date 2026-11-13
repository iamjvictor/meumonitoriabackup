# Validação independente — pacote 1

Data: 2026-11-02. Banco de integração: Supabase local `dbtemp` em `127.0.0.1:56322`. Os cenários Postgres criam um tenant com UUIDs gerados por execução e removem a árvore pelo professor em `finally`; nenhum documento ou artefato PDF preexistente é consultado ou alterado.

## Matriz AC → evidência

| Critério | Cenário/evidência | Resultado |
|---|---|---|
| AC-001 | `document-block.repository.reprocessing.test.ts`: reaproveita ID para bloco referenciado idêntico, aborta bloco referenciado alterado e substitui bloco alterado sem referências. Testes Postgres criam blocos de questão com número/página no tenant efêmero. | PASS nos testes focados; reconciliação dos dez blocos de `Quimica-3.pdf` fica para o E2E do pacote 4. |
| AC-003: repetição e vínculos | `document-worker.repository.reprocessing.qa.test.ts` e `document-worker.repository.idempotent-chunks.test.ts`: repetição idêntica não chama `deleteMany`; alteração de chunk ligado a `QuestionSource` aborta sem exclusão. | PASS. |
| AC-003: concorrência real | `document-question-reprocessing.database.qa.test.ts`: duas chamadas `saveQuestion` simultâneas, em documentos distintos do tenant QA, com o mesmo tópico e `textHash`. Ambas retornam o mesmo ID; há uma questão e duas fontes, uma por documento. | PASS no Postgres `dbtemp`; 1 questão, 2 fontes. |
| AC-003: preservação real | No mesmo cenário Postgres, após criar fontes, tentou-se substituir o chunk da primeira origem. A operação foi recusada e consulta posterior confirmou o mesmo ID/hash de chunk e as duas origens. | PASS. |
| AC-003: rollback real | O teste Postgres provocou `P2002` em `createMany` após o método executar `deleteMany`, usando duas linhas com o mesmo `(blockId, chunkIndexInBlock)`. Após rejeição, consulta confirmou ID/hash do chunk anterior intactos. | PASS; transação reverteu a exclusão. |
| AC-008 | Os testes registram as estruturas necessárias para auditoria local (IDs, hashes, páginas, fontes), sem tocar fixtures do worker. | Parcial; relatório consolidado de três PDFs/chat fica para o pacote 4. |

## Comandos e resultados

- `cd backend && node --import tsx --test src/repositories/__tests__/document-question-reprocessing.database.qa.test.ts` — PASS, 2/2 no Postgres `dbtemp`.
- `env -i PATH="$PATH" NODE_ENV=test SUPABASE_URL=http://127.0.0.1:56321 SUPABASE_PUBLISHABLE_KEY=local SUPABASE_SERVICE_ROLE_KEY=local DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:56322/postgres REDIS_URL=redis://127.0.0.1:6379 OPENROUTER_EMBEDDING_MODEL=test OPENROUTER_QUESTION_MODEL=initial-test-model ASAAS_CREDENTIAL_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ASAAS_WEBHOOK_URL=http://localhost:3000/api/webhooks/asaas node --import tsx --test backend/src/repositories/__tests__/document-worker.repository.reprocessing.qa.test.ts backend/src/repositories/__tests__/document-worker.repository.idempotent-chunks.test.ts backend/src/repositories/__tests__/document-block.repository.reprocessing.test.ts backend/src/repositories/__tests__/question.repository.reprocessing.test.ts backend/src/repositories/__tests__/document-worker.repository.test.ts` — PASS, 11/11.
- `npm run typecheck --prefix backend` — PASS após correção do cast do mock no teste do repositório de questão.
- `git diff --check` para arquivos do pacote — nenhum whitespace inválido nos arquivos do pacote. O comando sem path também apontou trailing whitespace preexistente em `time.md`, fora do escopo e não alterado.

## Limites da evidência

- A concorrência Postgres cobre duas persistências de mesma identidade; não é uma prova de estresse com dezenas de sessões nem de recuperação de queda do processo.
- O cenário de rollback simula falha de constraint depois da exclusão, dentro da transação real. Interrupção abrupta do processo não foi simulada.
- Não foi repetido o worker sobre os PDFs já presentes em `dbtemp`, conforme a instrução de preservar seus dados. Reconciliação dos dez blocos, assets visuais e pergunta real no chat continuam pendentes dos pacotes posteriores.

## Revisão independente — pacote 1

**Veredito: aprovado nos cenários delimitados de AC-001/003/008**, sem substituir a validação E2E dos dez PDFs. Os testes focados de reprocessamento existentes, os testes QA de worker/repositórios e o teste de banco isolado foram executados; a suíte focada passou (11/11 anteriormente registrada), o teste de concorrência/rollback real em `dbtemp` passou (2/2), e `npm run typecheck --prefix backend` passou. O banco foi consultado após limpeza: `SELECT count(*) FROM teachers WHERE username LIKE 'questions-reprocessing-qa-%'` retornou `0`. A revisão verificou a ordem do lock por documento antes de locks de identidade em `saveQuestion`; escritores de `QuestionSource` passam pelo mesmo protocolo. A conclusão não cobre associação visual final, alternativas ou caminho do chat.

## Cobertura independente em preparação — pacote 2

Comando: `cd backend && node --import tsx --test src/worker/services/__tests__/document-visual-linking.package2.qa.test.ts src/worker/services/completeQuestion/__tests__/question-alternatives-validation.package2.qa.test.ts`.

Resultado atual: PASS, 4/4 testes. Cenários cobrem ambiguidade page-only com persistência exclusiva de candidatos revisáveis, associação por `item_ref`, rejeição de opções duplicadas após normalização e preservação de alternativas de origem ao completar faltantes. Ainda aguardam cobertura final do contrato de resolução manual, persistência da origem e falha real de saída estruturada truncada/JSON inválido no diff final do pacote 2.

## Revisão independente — pacote 2 (revisão do diff atual)

**Veredito: aprovado com lacuna de integração para AC-004.** Typecheck passou (`npm run typecheck --prefix backend`). Comando focado executado em `backend` com variáveis locais de teste e `dbtemp` como `DATABASE_URL`:

`node --import tsx --test src/worker/services/__tests__/document-visual-linking.package2.qa.test.ts src/worker/services/__tests__/document-visual-linking.review-confirmation.test.ts src/worker/services/__tests__/question-statement-evidence.package2.test.ts src/worker/services/completeQuestion/__tests__/question-alternatives-validation.package2.qa.test.ts src/worker/services/completeQuestion/__tests__/question-answer-invalid-result.package2.qa.test.ts src/repositories/__tests__/document-visual-link.repository.review-confirmation.test.ts src/worker/services/__tests__/document-visual-linking.service.test.ts src/worker/services/__tests__/question-extraction.service.test.ts src/worker/services/completeQuestion/__tests__/question-completion.service.test.ts`

Resultado: PASS, 36/36. Uma primeira execução sem `ASAAS_WEBHOOK_URL` falhou na inicialização comum de configuração; repetida com env completo de teste passou. Nenhuma chamada a IA nem mutação de banco ocorreu.

- AC-001: a identidade de sourceKey não depende do ID transitório de bloco; os testes de promoção/evidência e regressões passaram. Ainda não houve reconciliação das dez spans contra o PDF original nesta revisão.
- AC-002: opções documentais permanecem presentes ao completar faltantes; opções duplicadas após normalização são rejeitadas; resposta fora das alternativas gera `INVALID_ANSWER`/null; falhas ficam explícitas. A cobertura independente comprova transformação e estado parcial, não valida correção química ou saída truncada real do provedor.
- AC-004: `PAGE_CANDIDATE` conserva ids dos assets e persiste com role `REVIEW_CANDIDATE`; `persistQuestionLinks` não é chamado para ambiguidade; `item_ref` exato escolhe apenas um. Confirmação selecionada marca `REVIEW` e `AVAILABLE`, confere documento e páginas, e regrava span + questão em transação. Impacto de tabela periódica não é tratado como asset visual obrigatório; referência a valores de tabela de dados ausentes permanece bloqueada.
- AC-008: completion parcial registra `missingFields`/falha de agente. Sem relatório E2E das dez candidatas, AC-008 permanece parcialmente comprovado.

**Lacuna de integração (AC-004):** não existe uso/call-site de `confirmQuestionVisualReview` no código atual (`rg` encontrou apenas método e testes). O método declara que o chamador deve autorizar revisão, mas não recebe identidade/decisão do revisor nem há rota/serviço conectado que comprove autorização humana. Assim, persistência atômica do comando foi verificada com mocks; não foi demonstrado fluxo operacional de revisão humana nem auditoria de quem confirmou. Antes de afirmar AC-004 concluído, ligar o comando a um caminho autorizado e registrar reviewer/decisão. Também falta teste Postgres real para validar rollback das quatro gravações em falha e isolamento questionId/span.

Limitação adicional: no repositório, `questionSource.findFirst` liga `questionId` ao documento e ao `documentBlockId`, mas o modelo não mantém relação direta `QuestionSpan`→`Question`. Quando vários spans/questões compartilham o mesmo bloco, isso não demonstra que o questionId passado pertence àquele span. Confirmar se bloco é granularidade suficiente para este dataset; caso não seja, validar evidência textual/sourceKey da questão antes de gravar o vínculo.

## Revisão do conserto do pacote 2 — rota e escopo de confirmação

Comando: em `backend`, `node --import tsx --test src/controllers/__tests__/document-visual-review.controller.test.ts src/repositories/__tests__/document-visual-link.repository.review-confirmation.test.ts src/worker/services/__tests__/document-visual-linking.review-confirmation.test.ts src/modules/chat/rag/services/chat-visual-context.service.test.ts src/modules/chat/rag/services/chat-visual-image-loader.service.test.ts`, seguido de `npm run typecheck`.

Resultado: PASS, 17/17 testes e typecheck. A rota exige `authMiddleware`; controller recusa usuário ausente e repassa `request.user.id`; repositório confere `monitorDocument.teacher.userId`, documento, asset e span no mesmo documento, páginas compatíveis, questão do mesmo professor com fonte no documento e associação span/questão única por chunks + texto normalizado. Gravações de link + estado estão dentro de `$transaction`. O teste de falha de transação usa mock/staged writes, portanto confirma propagação de erro e ordem de writes, mas **não é teste de rollback real no Postgres**. Chat consulta `question_visual_assets` e filtra contexto por `teacherId`, `monitorId`, `subjectId`; o vínculo `REVIEW` criado fica disponível à consulta (ela exclui `PAGE_CANDIDATE`). Testes de contexto/loader passaram.

**Lacunas remanescentes:**

- **AC-004, false negative para texto alterado:** `document-visual-link.repository.ts` exige `normalizeVisualIdentity(question.text) === normalizeVisualIdentity(span.candidate.statement)` antes de confirmar, além da identidade única por source chunks. A extração chama a confirmação de vínculo depois de `QuestionCompletionService` e pode reconstruir/normalizar o texto final por IA, enquanto `QuestionCandidate.statement` continua o texto pré-conclusão; diferenças lexicais reais ou acentuação/normalização podem impedir a revisão mesmo quando os source chunk IDs e a página identificam unicamente a questão. Não foi possível provar com a fixture atual, que usa texto idêntico. Incluir fixture com texto final normalizado/reconstruído e span original; preferir um vínculo determinístico por fonte/sourceKey ou correspondência de evidência que permita a transformação sem perder a rejeição de span trocado.
- **Auditoria durável:** ator aparece no `console.info` do service, mas não há tabela/evento persistente com ator, decisão, asset, span, timestamp e antes/depois. Logs operacionais não provam trilha consultável/durável. O pedido de revisão do fluxo foi atendido quanto à autenticidade/ownership; auditoria durável permanece lacuna explicitamente aberta.
- **Rollback real:** a persistência usa `$transaction`, mas nenhum teste independente executado aqui conecta-se ao Postgres para falhar numa escrita após o delete/upsert inicial e conferir estado anterior. Preservar como evidência faltante, sem considerar o mock como rollback real.

Sem chamada de worker, sem mutações do banco e sem alteração em arquivos do implementador nesta revisão.

## Rollback real da confirmação visual em `dbtemp`

Teste independente: `backend/src/repositories/__tests__/document-visual-review-rollback.database.qa.test.ts`.

Comando executado: `cd backend && node --import tsx --test src/repositories/__tests__/document-visual-review-rollback.database.qa.test.ts`.

Resultado: PASS, 1/1 em Postgres local `127.0.0.1:56322`. Fixture criada durante o teste com professor/tenant aleatório, documento, bloco, chunk, parse run, dois assets, questão, span e dois candidatos `PAGE_CANDIDATE`; limpeza em `finally`. A falha é injetada apenas na última escrita (`questionSpan.update`) por enum visualStatus inválido, depois de executar no banco real `deleteMany` e os dois upserts dentro do `$transaction`. Após rollback, leitura SQL/Prisma confirmou os dois candidatos originais com `PAGE_CANDIDATE/REVIEW_CANDIDATE`, zero `QuestionVisualAsset`, `visualStatus=PENDING_EXTRACTION` e campos de aprovação da questão ainda null. O teste provou rollback real, sem acessar fixtures anteriores. Verificação posterior: `SELECT count(*) FROM teachers WHERE username LIKE 'visual-review-rollback-qa-%'` → `0`. `npm run typecheck` passou.

## SourceKey e questão final reconstruída

No fluxo real, `question-extraction.service.ts` gera `sourceKey` antes de concluir questão, persiste o mesmo valor em `QuestionSpan`, e entrega o mesmo valor ao `saveQuestion`; a revisão final já removeu a recomputação de sourceKey a partir do texto pós-IA. Portanto a igualdade `Question.sourceKey === QuestionSpan.sourceKey` continua válida se o texto da questão for reconstruído, desde que persistência preserve a mesma identidade da origem. O teste atual da rota usa texto idêntico e o teste de rollback usa sourceKey igual, mas ainda não há fixture que demonstre pergunta pós-IA com texto divergente e confirmação visual completa; manter esse cenário como cobertura desejável de regressão no worker.

## Auditoria durável sem migration

Inspeção de `backend/prisma/schema.prisma`: há `Question.reviewedAt/reviewedBy` e `QuestionAiGeneration.acceptedAt/acceptedBy`, porém os primeiros representam revisão/estado de conteúdo da questão e os segundos aceitação de uma geração IA. Nenhum deles registra uma decisão de associação visual (asset, span, tipo de decisão e ator) semanticamente sem distorcer outro fluxo. Não há modelo/tabela/evento de auditoria visual dedicado. Embora seja tecnicamente possível guardar um objeto em `Question.metadata` ou `QuestionSpan.evidence`, isso seria uma convenção sem append-only, sem garantia de concorrência/histórico e sem consulta tipada; não considero isso uma trilha auditável adequada. Conclusão: não encontrei mecanismo durável apto sem migration. `console.info` permanece observabilidade operacional, não auditoria persistente.

## Revisão independente — pacote 3 (rota e contexto multimodal)

Comando de suíte focada, de `backend`, com variáveis locais de teste (`DATABASE_URL=127.0.0.1:56322`, SUPABASE local, flag visual ligada):

`node --import tsx --test src/modules/chat/__tests__/chat-question-visual-endpoint.package3.qa.test.ts src/modules/chat/rag/services/chat-visual-bytes-and-limit.package3.qa.test.ts src/modules/chat/rag/services/chat-visual-context.service.test.ts src/modules/chat/providers/__tests__/openrouter-chat.gateway.test.ts src/modules/chat/rag/services/chat-visual-image-loader.service.test.ts`

Resultado: PASS, 18/18; `npm run typecheck` passou.

QA independente adicional: a rota Fastify recebeu uma questão aprovada em contexto autorizado, puxou asset com escopo esperado, baixou Blob do mock de Storage e chamou `OpenRouterClient.createChatCompletion`; decodifiquei `image_url` capturada e comparei Buffer byte a byte e SHA-256 contra os bytes do mock Storage. Questão pendente, questão oficial de outro monitor e contexto que declara outro monitor retornaram 403 antes de nova chamada ao gateway. Questão pendente/escopo incorreto não vaza imagem.

O loader omite checksum divergente, registra razão sem incluir bytes, e o gateway passa texto instruindo modelo a não afirmar que viu imagem ausente. O limite em `ChatVisualContextService` prioriza imagens da questão antes de upload do estudante e visual de knowledge; fontes que estouram limite 4 são informadas no contexto. Esta evidência é de unidade/rota com boundaries mockados, não execução real de Supabase Storage ou OpenRouter multimodal, nem avaliação de resposta factual do modelo.

**Lacuna P2 — truncagem no repository:** `PrismaChatVisualContextRepository.questionAssets` retorna `LIMIT 4`. Se houver cinco ou mais ligações `question_visual_assets`, o repository entrega quatro ao resolver sem indicar que truncou; portanto `omittedSources` da camada superior não detecta a quinta imagem de origem QUESTION e não consegue avisar sobre ela. A ordenação `confidence/page/createdAt` torna seleção determinística, mas não garante que o asset necessário esteja entre os quatro e o texto de limite não cobre esse corte SQL. Sugestão: buscar até cinco e derivar truncation flag, ou retornar total/limite junto das referências, para que o aviso seja explícito.

## Revisão da correção de truncagem do quinto asset

O `COUNT(*) OVER()` é calculado no SELECT sob os mesmos filtros de status `APPROVED`, teacher, monitor, subject e método de associação, antes do `LIMIT 4`. A fixture no `dbtemp` criou questão aprovada com cinco `QuestionVisualAsset` no tenant descartável; a consulta devolveu quatro assets e `totalCount=5` em cada linha. A mesma chamada com outro teacher e com a questão alterada para `PENDING_REVIEW` devolveu lista vazia, sem revelar ids nem contagem. `ChatVisualContextService` calcula a diferença e coloca aviso `QUESTION (1)` no texto do modelo; o metadata interno `totalCount` não é devolvido no manifesto/contexto serializado. O aviso segue até a última mensagem do gateway como parte do contexto multimodal.

Comandos: em `backend`, `node --import tsx --test src/modules/chat/rag/repositories/__tests__/prisma-chat-visual-context.count.database.qa.test.ts src/modules/chat/rag/services/chat-visual-context.service.test.ts src/modules/chat/rag/services/chat-visual-bytes-and-limit.package3.qa.test.ts`; em seguida `npm run typecheck`.

Resultado: PASS, 9/9 e typecheck. Consulta após cleanup: `SELECT count(*) FROM teachers WHERE username LIKE 'chat-visual-count-qa-%'` → `0`.

**Veredito: correção aprovada** para contagem/truncagem de assets da questão e isolamento/status. O teste independente de repository confirma query real em Postgres; o teste unitário confirma mensagem propagada ao resolver. Ainda não foi feita chamada multimodal real ao provider.

## Sequência E2E preparada (não executada nesta revisão)

Executar apenas após haver IDs e objetos Storage novos e exclusivos; os artefatos antigos sob `dbtemp/artifacts/` e os documentos atualmente seedados não são entrada desta sequência. Não executar `db push`, `seed`, `db reset`, `90_cleanup_document_e2e.sql` nem `run-document-worker.mjs` com IDs antigos.

1. Confirmar ambiente local e URL antes de qualquer escrita: `supabase status --workdir dbtemp`; consultar apenas `127.0.0.1:56322`; conferir estado de `dbtemp/storage/` e manter cópia/manifest dos objetos atuais.
2. Criar uma fixture descartável com UUIDs aleatórios: tenant professor/monitor/matéria/tópicos, 3 documentos e paths Storage com prefixo randômico. Copiar PDFs de `tests/document-parser/teacher-materials/` para os novos paths sem editar originais. Tags: Quimica-3=`QUESTIONS`, Estequiometria e pH/pOH=`KNOWLEDGE_BASE`.
3. Processar somente os novos IDs pelo worker usando a configuração local de `dbtemp`, Docling/OCR local e os modelos configurados; gravar relatório em diretório de artefatos exclusivo da execução. Registrar snapshot anterior/posterior de spans, candidatas, questões, sources, visual links, chunks, embeddings e checksums.
4. Conferir 10 spans de Química com PDF, ambiguidade e resolução de imagem; rodar o count test e cenário de repetição/concor­rência com IDs dessa fixture; não aceitar `READY` sozinho.
5. Conferir retrieval dos dois documentos de conhecimento, incluindo figura/anotações da página 3, sem questões criadas.
6. Aprovar somente uma questão verificada e visualmente vinculada no tenant novo; provisionar aluno e autorização de acesso efêmera. Executar rota real de chat com questão aprovada e pergunta sobre detalhe visual; no gateway registrar modelo, quantidade/bytes e SHA em memória/relatório sem gravar URL assinada nem bytes. Repetir com outra questão/tenant e asset corrompido/ausente.
7. Revisar saída com pessoa, salvar JSON/Markdown e transcrição sob `dbtemp/artifacts/<run-id>/`; limpar apenas registros pelo professor randômico e objetos Storage pelo prefixo randômico. Consultar contagem zero para prefixo e preservar todos os dados/artefatos preexistentes.

Dependências ainda a satisfazer antes da execução: fixture seed/upload de IDs aleatórios não está versionada; chamada real requer Supabase Storage local, provider visual ativo e revisão humana da resposta. Portanto a sequência está preparada, mas o E2E dos três PDFs e resposta factual permanece BLOCKED até fixture isolada e serviço/provider estarem disponíveis.

## Revisão independente do chat real — run `2d7bc13c-7573-435d-b43a-37e68702ee37`

**Veredito: transmissão de bytes íntegros comprovada; imagem certa não transmitida; interpretação visual não comprovada (AC-004/AC-005 falham neste run).** Artefatos examinados: `dbtemp/artifacts/2d7bc13c-7573-435d-b43a-37e68702ee37/visual-chat.json`, `visual-chat-server.log`, PDF original `dbtemp/storage/monitor-documents/Quimica-3.pdf` página 5 e registros/objetos visuais locais de `dbtemp`.

- `visual-chat.json` relata `chatHttpStatus=200`, `questionStatusAfter=APPROVED`, `assetPage=5`, `byteChecksumMatches=true`, esperado/baixado SHA-256 `f72b4bc0d3fa7487f4f6c9ecda43d3867432d68ec48ec0b53462c84d48376ae7`. O server log confirma uma imagem anexada, 2.583 bytes, o mesmo SHA-256, modelo `google/gemini-2.5-flash`, e resposta HTTP 200 do provider. Isso prova integridade dos bytes do asset selecionado até o caminho do gateway.
- Porém, consulta read-only da fixture mostrou que o asset vinculado `7faf5405-7eec-4ab6-97e0-b0427bf6740f` tem dimensão **38×39**, `sourceItemRef=#/pictures/6`, bbox aproximada `(33,680)-(71,719)` e corresponde visualmente ao pequeno marcador “QUESTÃO 03” no canto superior esquerdo. Baixei o objeto do bucket privado e seu SHA confere; a inspeção do objeto confirma que ele contém apenas o marcador, não as moléculas.
- Há outro asset de página 5, `a7f43fcd-2627-40b8-bc6e-517ec551cd6f`, dimensão **379×77**, `sourceItemRef=#/pictures/7`, bbox `(126,594)-(506,671)`. Baixado do Storage local, tem SHA-256 `45789fbdbc0ca341cf4577b42806e3bad633cca1a7e2bfd1f665da03bde668b5`; sua inspeção contém as duas estruturas moleculares com os rótulos “tretinoína” e “isotretinoína”, visíveis na página 5 do PDF. Esse não é o asset que consta em `question_visual_assets` nem no payload do chat.
- O texto da resposta descreve a diferença como “a cadeia principal faz uma ‘curva’ ou ‘dobra’”. A página renderizada mostra visualmente uma cadeia mais estendida no desenho da esquerda e uma mudança de direção próxima da extremidade com o grupo carboxila no desenho da direita. Essa descrição é compatível com a comparação visual em nível geométrico. Não é possível atribuir essa observação ao modelo, porque os bytes enviados eram apenas o marcador da questão; alegações específicas de cis/trans não são validadas aqui por conhecimento químico externo.

**Impacto:** status HTTP 200, aprovação e SHA correto do asset selecionado não bastam: o vínculo `REVIEW` escolheu o asset errado. A resposta plausível não prova percepção da figura e pode ter vindo de memória/conhecimento textual. O caso não satisfaz o objetivo de perguntar ao chat sobre uma questão com a imagem correta.

**Limites/evidência:** revisão local do PDF/asset e banco `dbtemp`, sem alteração da fixture. Hash do PDF original: `dbc94a84bc48dfba51b0eda410e7cf116430827b6cd8468338030eb10ef3a28d`. Não recalculado o SHA da requisição OpenRouter independentemente: a transcrição registra o hash do loader e bytes enviados como imagem, mas o request body bruto não foi preservado. Revisão humana deve reexecutar o chat após vincular o asset estrutural `a7f43fcd-2627-40b8-bc6e-517ec551cd6f` e verificar no log que o hash seja `45789fbdbc0ca341cf4577b42806e3bad633cca1a7e2bfd1f665da03bde668b5`; esse reprocessamento não foi feito nesta revisão.

## Repetição E2E e idempotência da mesma origem — AC-003

**Inspeção independente dos artefatos existentes:** `dbtemp/artifacts/2d7bc13c-7573-435d-b43a-37e68702ee37/report.failed.json` registra `beforeCount=10`, `afterCount=10`, `stable=false` e `questionSources=26` depois de 10 antes. O snapshot lista três fontes para oito questões; em cada trio, `chunkId`, `documentBlockId` e `pageStart` são idênticos. Cinco de dez `textHash` diferem antes/depois, embora o `id` e `sourceKey` da questão coincidam. O log `Quimica-3-repeat.worker.log` mostra nova execução de extração/conclusão via LLM e `questionsSaved=10`, logo não congela as saídas para isolar apenas a persistência.

**Interpretação com limite:** não é possível afirmar que as 16 relações adicionais são duplicatas: o relatório não serializa `QuestionSource.role`, offsets, excerpt nem conteúdo/text hash do texto. O schema define unicidade por `(questionId, chunkId, role)`, então múltiplos papéis no mesmo chunk podem ser relações legítimas. Em sentido inverso, contagens 10→26 também não provam preservação correta sem comparar a chave única completa. Os cinco hashes alterados indicam mudança no texto normalizado (a implementação calcula `textHash` a partir dele), mas artefatos não permitem decidir se foi apenas normalização ou alteração semântica. Assim, a repetição manteve dez IDs/quantidade, mas AC-003 ainda não tem prova de estabilidade de fontes e conteúdo no E2E.

**Teste independente criado e executado:** `backend/src/repositories/__tests__/question-source-repeat-idempotency.qa.test.ts`. Comando `cd backend && node --import tsx --test src/repositories/__tests__/question-source-repeat-idempotency.qa.test.ts`; resultado PASS, 1/1 em Postgres local `127.0.0.1:56322`. O teste cria tenant, documento, bloco, chunk e questão com IDs aleatórios; chama `saveQuestion` duas vezes com a mesma `sourceKey`, `textHash`, `chunkId`, `role`, offsets e excerpt; verifica mesmo ID e igualdade do snapshot completo da origem/hash. Limpa o tenant em `finally` e não acessa/reprocessa fixtures existentes.

**Lacuna para fechar AC-003:** repetir o processamento com entrada/modelo de extração congelados (ou reproduzir persistência em cima da mesma saída capturada) e registrar antes/depois chaves `(questionId, chunkId, role)`, campos de origem e checksum/texto normalizado. O teste de repository cobre repetição idêntica de um papel em fixture isolada, mas não fecha a integração do worker nem explica as cinco alterações de `textHash`.

## Revisão independente do retry de questão — AC-002/AC-003/AC-008

**Comandos executados:**

- `cd backend && node --import tsx --test src/repositories/__tests__/question-source-repeat-idempotency.qa.test.ts`
- `cd backend && node --import tsx --test src/repositories/__tests__/question.repository.reprocessing.test.ts`
- `cd backend && ASAAS_WEBHOOK_URL=https://localhost.example/api/webhooks/asaas PAYMENTS_PROVIDER=SIMULATED node --import tsx --test src/worker/services/__tests__/question-extraction.service.test.ts`

**Resultado:** o teste repository existente passou 3/3; o teste Postgres isolado falhou em duas asserções específicas: (1) completar questão `PENDING_REVIEW` parcial com origem `STATEMENT` existente e novas origens `ALTERNATIVE`/`ANSWER_KEY` no mesmo chunk deixou só `STATEMENT`; (2) reprocessar questão `APPROVED` preservou corretamente texto, hash, resposta, explicação, estado e ator/data de revisão, mas não anexou a nova origem `EXPLANATION` no mesmo chunk. Nenhuma fixture anterior foi acessada; a fixture do teste usa tenant aleatório e é removida em `finally`.

**Achado de severidade alta, arquivo `backend/src/repositories/question.repository.ts`, bloco `saveQuestion` próximo à linha 404:** `alreadyLinkedChunkIds` reduz relações a chunk IDs e `sources.filter` elimina todas as origens de um chunk já vinculado, sem comparar `role`. Isso contradiz a unicidade deliberada `(questionId, chunkId, role)` do schema; papéis diferentes são relações legítimas. O caminho real de extração gera `STATEMENT`, `ALTERNATIVE`, `ANSWER_KEY` e potencialmente `EXPLANATION` para o mesmo chunk (`question-extraction.service.ts` aproximadamente linhas 1008–1050), portanto o filtro pode apagar proveniência documental necessária tanto em retries parciais quanto em aprovadas. Correção recomendada ao arquiteto/implementador: deduplicar por chave completa `(chunkId, role)` ou deixar o `createMany(skipDuplicates:true)` aplicar a constraint; preservar a anexação de roles novas enquanto não sobrescreve conteúdo aprovado.

**Revisão de preservação:** a execução isolada comprovou que o caminho de reprocessamento de uma questão completa/aprovada preserva conteúdo, hash, status e marca de revisão. `question.repository.reprocessing.test.ts` também passou para colisão de conteúdo aprovado e para retry completo. O caso parcial promoveu os campos de completion corretamente no Postgres, mas perdeu os papéis novos. Portanto a preservação de respostas revisadas passou nesta fixture; proveniência multirole e `AC-003/AC-008` falharam. O teste de unidade existente “retry completo ... não adiciona novos papéis ao chunk já ligado” aceita exatamente a supressão que o teste QA independente rejeita e deve ser corrigido pelo implementador, sem relaxar a expectativa QA.

**Limitação adicional:** `findPendingQuestionForCompletion` procura por `sourceKey` ou por `documentId + documentBlockId` via `findFirst` sem ordenação; a fixture não prova comportamento quando mais de uma questão/span compartilha o mesmo bloco. Isso permanece sem verificação neste ciclo.

O teste unitário de `question-extraction.service` passou 16/16 com os overrides locais de configuração no comando acima. Ao rodá-lo junto aos outros arquivos sem override, `env.ts` rejeitou a URL Asaas preexistente (`ASAAS_WEBHOOK_URL`), antes dos testes de extração; não é falha do código testado. As 16 asserções passaram no comando repetido com URL local válida e `PAYMENTS_PROVIDER=SIMULATED`.

### Revalidação após filtro por papel

O implementador alterou a deduplicação para usar `(chunkId, role)`. Ajustei a asserção QA para ordenar papéis lexicamente no próprio teste, sem depender da ordem enum do Postgres (`QuestionSourceRole` declara `STATEMENT` antes de `ALTERNATIVE`). Revisão do trecho `question.repository.ts:404-426`: agora busca ambos os campos, aplica role padrão `CONTEXT` em ambos os lados e deixa `createMany(skipDuplicates)` respeitar a unicidade. A nova relação de papel deixa de ser descartada por compartilhar um chunk.

Comandos pós-correção:

- `cd backend && node --import tsx --test src/repositories/__tests__/question-source-repeat-idempotency.qa.test.ts` — PASS 1/1 em Postgres `dbtemp`; verificou repetição idêntica sem duplicata, upgrade de questão parcial com `ALTERNATIVE`/`ANSWER_KEY`, e preservação de texto, resposta, explicação, estado, `reviewedAt`/`reviewedBy` da questão aprovada enquanto anexa `EXPLANATION`.
- `cd backend && node --import tsx --test src/repositories/__tests__/question.repository.reprocessing.test.ts` — PASS 3/3; o teste foi corrigido para exigir papéis legítimos e deduplicar somente mesmo chunk + papel.
- `cd backend && ASAAS_WEBHOOK_URL=https://localhost.example/api/webhooks/asaas PAYMENTS_PROVIDER=SIMULATED node --import tsx --test src/worker/services/__tests__/question-extraction.service.test.ts` — PASS 16/16.

Limpeza confirmada: `SELECT count(*) FROM teachers WHERE username LIKE 'question-source-repeat-qa-%'` → `0`. Veredito desta revisão: falha de supressão de papel corrigida e casos independentes aprovados; AC-003 ainda depende de rerun do worker/saída congelada para explicar as alterações de hashes e conferir os vínculos end-to-end.

## Revisão do E2E `9df3b11e-d426-4542-aa57-1d1982f17f01` — repetição e RAG

**Reprocessamento (AC-003):** `report.json` registra 10→10 questões, `sameQuestionIdentitySet=true`, nenhum `textHash` alterado (`changedTextHashes=[]`) e listas de relações lógicas duplicadas vazias antes e depois. As fontes passam de 12 para 33; a distribuição observada é STATEMENT 10→10, ALTERNATIVE 0→10, ANSWER_KEY 0→10 e EXPLANATION 2→3. Portanto, as 21 relações adicionadas são novos papéis de proveniência no mesmo conjunto estável de chunks, não duplicatas segundo a chave única `(questionId, chunkId, role)`. `sameSourceIdentityMultiset=false` e `stable=false` são esperados porque o snapshot inclui essas novas relações; não equivalem, isoladamente, a falha de identidade. O arquivo `snapshot-after-reprocess.json` conserva os papéis e os respectivos IDs de chunk/documento/bloco. Esta é evidência positiva de que o filtro por `(chunkId, role)` não suprimiu os papéis legítimos no rerun.

**RAG de base de conhecimento (AC-007, evidência de recuperação):** os dois comandos audit-only executaram recuperação real no banco/índices e retornaram citações com conteúdo: Estequiometria teve 8 citações para 8 candidatos; pH/pOH teve 6 para 6. Em ambos, há citações `docling-visual` da página 3 com `visualAssetIds` e descrições textuais. O audit baixou os assets de página 3 do Storage e comparou checksums: Estequiometria 127.362 e 2.786 bytes, ambos coincidentes; pH/pOH 94.446 bytes, coincidente. `questionSources=0` para os dois KB, consistente com sua classificação como conhecimento.

**Significado de `contextBlocks: []`:** não significa que a busca não encontrou contexto. Os registros contêm citações com `content` não vazio (incluindo OCR e descrição da figura); a lista `contextBlocks` contém apenas blocos `DocumentBlock` expandidos. `loadKnowledgeContext` retorna vazio quando os candidatos não têm `blockId`; os candidatos Docling e figuras deste run têm `blockId=null`. Na rota de chat, `KnowledgeRetrievalChatProvider` constrói o texto de `context` diretamente de `citations[].content`, sem depender de `contextBlocks`, então essas citações podem formar contexto do modelo.

**Limites:** ambos os registros são `audit-only`: `run-document-worker.mjs` marca resultado como `skipped` e chama somente `KnowledgeRetrievalService.search`; não executa `KnowledgeRetrievalChatProvider`, não registra o texto final montado para o chat e não prova que um modelo recebeu essas citações. O relatório também marca o chat como `SKIPPED_REUSED_PRIOR_RUN_EVIDENCE`; a evidência reutilizada é a conversa multimodal real Q03 do run anterior, não uma conversa sobre as KBs. Os `visualAssetIds` e descrições comprovam recuperação indexada de figura, não envio dos bytes originais da figura de KB ao modelo. Para fechar prova de contexto de chat, falta uma chamada real de chat perguntando sobre a anotação/figura de cada KB e observabilidade do texto de contexto/citação que chegou ao gateway; para alegar visão direta da imagem, também seria necessário comprovar bytes multimodais correspondentes ao asset da KB. Nenhuma fixture foi alterada nesta revisão.
