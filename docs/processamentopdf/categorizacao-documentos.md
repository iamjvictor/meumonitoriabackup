# Categorização de perguntas e escopo da base de conhecimento

## Decisão atual (18/10/2026)

- A categorização por tópico serve às perguntas do banco de questões e aos documentos enviados para extrair perguntas. O upload de flashcards continua exigindo tópico no contrato atual.
- O professor envia a base de conhecimento para uma **matéria de um monitor seu**, sem selecionar tópico. O backend confirma que o monitor pertence ao professor e que a matéria pertence ao monitor; os chunks são indexados com `teacherId`, `monitorId` e `subjectId`.
- O chat busca trechos com esse mesmo escopo de professor, monitor e matéria. O contexto de uma pergunta pode orientar o texto da consulta, mas não restringe a busca ao tópico nem ao PDF de origem da pergunta.
- O arquivo da base de conhecimento não precisa receber categoria de tópico. A busca pode considerar todos os chunks `READY` da matéria. A consulta atual também não filtra pela `tag` do documento, portanto pode recuperar chunks de outros tipos de upload no mesmo escopo.

O fluxo acima está nas alterações locais de [`document.model.ts`](../../backend/src/models/document.model.ts), [`document.repository.ts`](../../backend/src/repositories/document.repository.ts), [`MonitorWorkspace.tsx`](../../frontend/src/modules/teacher/components/monitor/MonitorWorkspace.tsx) e [`knowledge-retrieval-chat.provider.ts`](../../backend/src/modules/chat/rag/providers/knowledge-retrieval-chat.provider.ts). A análise abaixo registra o estado anterior de 17/10/2026 e a alternativa de classificação por bloco considerada naquela data; ela não descreve a decisão atual.

## Análise histórica (17/10/2026)

Na data da análise, o upload de base de conhecimento exigia tópico. A possibilidade de enviar o arquivo apenas para a matéria ainda não estava implementada.

## Conceitos observados na análise histórica

| Conceito | Persistência | Papel atual |
| --- | --- | --- |
| Finalidade do upload (`tag`) | `MonitorDocument.tag`: `KNOWLEDGE_BASE`, `QUESTIONS` ou `FLASHCARDS` | Escolhe o processamento após a indexação. Continua obrigatória. |
| Matéria (`subjectId`) | Documento e cada chunk | Delimita o material do monitor e é filtro obrigatório na recuperação de conhecimento. |
| Tópico raiz (`topicId`) | Documento, `MonitorDocumentTopic` e `DocumentChunkTopic` | É obrigatório na API de upload atual. Todos os chunks recebem esse vínculo, salvo quando há classificação de bloco já persistida. |
| Subtópico e subsubtópico | Entidades próprias na árvore do monitor | A tela permite selecioná-los, mas converte a seleção para o ID do tópico raiz ao enviar documentos. O documento e o chunk não guardam esses IDs. |
| Antiga `question_categories` | Removida pela migration | Era uma taxonomia de questões. Sua remoção não eliminou `tag`, matéria nem vínculos com tópicos. |

Fontes: [`backend/src/models/document.model.ts`](../../backend/src/models/document.model.ts), [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma), [`backend/supabase/migrations/20260815224005_remove_question_categories.sql`](../../backend/supabase/migrations/20260815224005_remove_question_categories.sql).

## Entrada e persistência no estado histórico

1. A tela exige um tópico raiz disponível. Ao selecionar um subtópico ou subsubtópico, `selectedTopicId` continua sendo o ID do tópico raiz. Cada item da fila guarda esse ID. Fontes: [`MonitorWorkspace.tsx`](../../frontend/src/modules/teacher/components/monitor/MonitorWorkspace.tsx), [`MonitorStructureSidebar.tsx`](../../frontend/src/modules/teacher/components/monitor/MonitorStructureSidebar.tsx).
2. O cliente envia `file`, `subjectId`, `topicId` e `tag` como multipart. O controller aceita um arquivo por requisição. O schema Zod exige UUIDs para matéria e tópico. Sem `topicId`, a API retorna `400 VALIDATION_ERROR`. Fontes: [`TeacherMonitorService.ts`](../../frontend/src/modules/teacher/services/TeacherMonitorService.ts), [`document.controller.ts`](../../backend/src/controllers/document.controller.ts), [`document.model.ts`](../../backend/src/models/document.model.ts).
3. O repositório confirma que o monitor pertence ao professor e que o tópico pertence à matéria. O PDF passa pela preparação/compressão, é enviado ao bucket `monitor-documents`, e o banco recebe um `MonitorDocument` em `QUEUED` com um vínculo `MonitorDocumentTopic` para o tópico informado. O serviço publica um job BullMQ. Fontes: [`document.repository.ts`](../../backend/src/repositories/document.repository.ts), [`document.service.ts`](../../backend/src/services/document.service.ts).

O banco admite `MonitorDocument.topicId` nulo, e há caminhos no worker para documentos sem tópico. Isso **não** torna o upload apenas por matéria funcional: o contrato HTTP exige tópico e `DocumentRepository.save()` assume um tópico para o caminho do Storage e para `topicLinks`.

## Processamento compartilhado pelos três tipos

O worker baixa o arquivo do Storage. Quando o parser V3 está habilitado, submete o PDF ao Docling para extrair layout e persiste o resultado; uma falha do parser interrompe o processamento nesse caminho. Em seguida, o fluxo atual extrai páginas e texto do PDF, normaliza o texto, detecta blocos estruturais, cria chunks elegíveis e gera embeddings. Se a extração indicar `NEEDS_OCR`, as etapas seguintes são puladas. Fontes: [`document-worker.service.ts`](../../backend/src/worker/services/document-worker.service.ts), [`document-ingestion-v3.service.ts`](../../backend/src/worker/services/document-parser/document-ingestion-v3.service.ts), [`chunk.service.ts`](../../backend/src/worker/services/chunk.service.ts).

Ao salvar os chunks, o sistema usa os tópicos classificados do bloco, se existirem; caso contrário, copia os vínculos de tópico do documento. No upload atual, há um tópico no documento, então os chunks recebem esse tópico. Os chunks carregam também `teacherId`, `monitorId` e `subjectId`. Fonte: [`document-worker.repository.ts`](../../backend/src/repositories/document-worker.repository.ts), função `saveExtractedChunks`.

### O que acontece com cada `tag`

| Upload | Depois dos chunks e embeddings | Dependência do tópico |
| --- | --- | --- |
| Base de conhecimento | Tenta gerar o perfil do tópico; se `topicId` estiver nulo, tenta gerar perfis dos tópicos da matéria. Não extrai questões nem gera flashcards. | A indexação vetorial funciona por matéria; buscas filtradas por tópico precisam de `DocumentChunkTopic`. O perfil de tópico busca fontes na matéria, sem filtro de tópico nessa consulta. |
| Banco de questões | Extrai questões para revisão e processa seus vínculos com tópicos. Não gera flashcards automaticamente. | A extração requer ao menos um tópico em `document.topicLinks`; o tópico escolhido no upload é tratado como fonte de verdade da questão. Sem links, a extração retorna sem questões. |
| Flashcards | Gera candidatos a partir dos chunks `READY` de tipos conceituais, desde que embeddings tenham sido produzidos. Não extrai questões. | Cada candidato precisa escolher um `topicId` entre os vínculos do seu chunk. Chunk sem tópico não gera candidato persistível. |

Fontes: [`document-worker.service.ts`](../../backend/src/worker/services/document-worker.service.ts), [`question-extraction.service.ts`](../../backend/src/worker/services/question-extraction.service.ts), [`flashcard-generation.service.ts`](../../backend/src/worker/services/flashcard/flashcard-generation.service.ts).

### Estado real do classificador de blocos

Existe [`DocumentBlockTopicClassificationService`](../../backend/src/worker/services/document-block-topic-classification.service.ts). Ele pode herdar `document.topicId` ou pedir à LLM que escolha um tópico **da lista de `document.topicLinks`** para cada bloco. Porém não há chamada a esse serviço no fluxo de [`DocumentWorkerService`](../../backend/src/worker/services/document-worker.service.ts). Portanto, a classificação automática de blocos **não acontece no upload atual**. Mesmo se o serviço fosse chamado isoladamente com um documento sem tópico e sem `topicLinks`, a lista de tópicos permitidos estaria vazia; ele não descobriria automaticamente todos os tópicos da matéria. Em falhas de lote, sua regra atual pode escolher o primeiro tópico permitido, o que exige cuidado antes de usá-lo para PDFs abrangentes.

## Efeito sobre o RAG

A busca de conhecimento exige professor, monitor e matéria. O filtro por tópico é opcional, mas, quando informado, exige um registro correspondente em `document_chunk_topics`. A busca híbrida combina similaridade vetorial e relevância lexical e retorna até o limite solicitado. A consulta não restringe os chunks pela `tag` do documento: conteúdo dos três tipos pode aparecer se estiver indexado no mesmo escopo. Fontes: [`knowledge-retrieval.repository.ts`](../../backend/src/repositories/knowledge-retrieval.repository.ts), [`knowledge-retrieval.service.ts`](../../backend/src/services/knowledge-retrieval.service.ts), [`knowledge-retrieval-chat.provider.ts`](../../backend/src/modules/chat/rag/providers/knowledge-retrieval-chat.provider.ts).

Se apenas tornarmos `topicId` opcional e salvarmos um PDF de base de conhecimento sem vínculos de tópico:

| Consulta | Resultado para esse PDF | Impacto |
| --- | --- | --- |
| RAG da matéria, sem `topicId` | Seus chunks `READY` podem ser recuperados. | A cobertura da matéria aumenta. O conjunto candidato também cresce; com limite de resultados, trechos menos pertinentes podem disputar espaço. |
| RAG com `topicId` | Seus chunks ficam invisíveis, pois não têm `DocumentChunkTopic`. | Uma pergunta do aluno dentro de um tópico perde a nova base, mesmo que o PDF contenha a resposta. Este é o principal bloqueio funcional. |
| Geração de perfis de tópico | A busca usada pelo perfil enxerga chunks da matéria. | O perfil pode usar fontes de outros tópicos se a recuperação não selecionar trechos adequados. |

O efeito acima é deduzido das consultas e dos vínculos persistidos; não é uma medição de qualidade ou latência em produção. O impacto de volume, precisão e tempo de resposta dependerá do tamanho dos PDFs e das consultas reais.

## Proposta para upload de base de conhecimento apenas por matéria

**Recomendação:** aceitar `topicId` opcional apenas quando `tag=knowledge` e classificar os blocos elegíveis entre os tópicos raiz da matéria **antes de criar os chunks**. Preservar a matéria como escopo de segurança e permitir blocos sem tópico quando a evidência for insuficiente. Assim, material abrangente pode contribuir para vários tópicos sem atribuir o PDF inteiro a um tópico arbitrário.

1. **Contrato e interface:** liberar a opção “Toda a matéria” na tela de base de conhecimento. Validar no backend: `subjectId` obrigatório; `topicId` opcional apenas para `knowledge`; `questions` e `flashcards` continuam exigindo tópico. Evitar usar um texto como `undefined` no caminho do Storage e criar `topicLinks` somente quando houver IDs válidos.
2. **Classificação:** após detectar blocos e antes de criar chunks, buscar todos os tópicos raiz da matéria, com suas definições e orientações; fornecer essa lista ao classificador. Persistir a classificação e a confiança por bloco. Não classificar pelo primeiro tópico como fallback automático quando a LLM falhar; deixar o bloco no escopo da matéria e registrar a falha para revisão ou reprocessamento.
3. **Indexação e RAG:** propagar os vínculos classificados de cada bloco aos seus chunks. A busca filtrada por tópico já consulta `DocumentChunkTopic`, então poderá recuperar os trechos classificados sem ampliar indiscriminadamente o filtro. Blocos sem tópico continuarão visíveis apenas em buscas da matéria. Decidir explicitamente se conteúdo geral da matéria deve também servir como fallback em buscas por tópico; isso exigiria uma regra de busca e avaliação de relevância próprias.
4. **Operação e revisão:** expor quantos blocos e chunks foram classificados, ficaram sem tópico ou tiveram erro. Permitir corrigir vínculo e reindexar com cuidado: a substituição de chunks já é barrada quando há fontes de flashcards vinculadas. Medir recuperação por matéria e por tópico com casos esperados antes de usar a classificação em todos os uploads.

**Impacto estimado:** médio no caminho de upload e processamento, baixo no SQL principal do RAG se os chunks forem classificados antes da indexação, e potencialmente alto na qualidade da recuperação se a classificação errar ou deixar muitos blocos sem tópico. Há custo adicional de chamadas à LLM proporcional à quantidade de blocos. Suporte real a subtópicos exige uma mudança separada de esquema, vínculos, classificador, filtros do RAG e interface; selecionar um subtópico na árvore hoje não fornece essa granularidade.

Uma alternativa menor seria incluir todos os chunks sem tópico em toda busca por tópico da mesma matéria. Isso tornaria a base imediatamente visível, mas aumentaria candidatos irrelevantes em cada tópico e enfraqueceria a separação temática. É adequada apenas como fallback deliberado e avaliado, não como substituto da classificação por bloco.
