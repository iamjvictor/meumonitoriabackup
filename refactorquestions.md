# Integração das questões do acervo com o monitor

## Objetivo

Quando o professor escolher uma matéria, tópico e perfil de prova no fluxo de criação do monitor, o sistema deverá localizar as questões correspondentes em `question_bank_items` e criar uma cópia local em `questions`.

A cópia local continuará sendo a questão usada pelos fluxos atuais de prática, tentativas, desafios, simulados e relatórios. A linha em `questions` terá um vínculo opcional com o item original do acervo por meio de `questionBankItemId`. Esse vínculo existe para rastreabilidade e para permitir consultar metadados da origem, como `subtopic` e `subsubtopic`; ele não deve tornar o fluxo dos alunos dependente de uma referência polimórfica.

## Decisão arquitetural

`question_bank_items` é a fonte global e compartilhada das questões importadas.

`questions` é a representação operacional da questão dentro de um monitor. Cada cópia recebe seus próprios `teacherId`, `monitorId`, `subjectId` e `topicId`, preservando a identidade local exigida pelos fluxos existentes.

`Question.questionBankItemId` é nullable porque questões criadas a partir dos documentos do professor não possuem origem no acervo global.

A cópia deve ser tratada como um snapshot. Depois que ela for criada, alterações futuras no item global não devem alterar silenciosamente uma questão que já pode ter sido exibida ou respondida por alunos. O vínculo permite auditoria e consulta da origem, mas o conteúdo usado pelo aluno fica armazenado na própria linha de `questions`.

## Estados da importação e publicação

O monitor deve permanecer em `DRAFT` durante todo o onboarding e enquanto as questões estiverem sendo copiadas. O job de importação precisa expor um estado próprio, que pode ser armazenado em uma tabela de job ou em uma estrutura equivalente:

```text
PENDING
PROCESSING
COMPLETED
PARTIAL_FAILURE
FAILED
```

O endpoint de publicação deve validar no servidor:

- o monitor está em estado publicável;
- o job não está `PENDING` ou `PROCESSING`;
- todas as seleções válidas foram processadas;
- não existem falhas não resolvidas;
- as questões necessárias foram criadas em `questions`.

O frontend não deve habilitar publicação apenas com base em seu próprio estado. A última validação deve ser feita no backend. Se o job falhar, o monitor continua em rascunho e deve permitir retry idempotente.

## Fluxo de criação

1. O professor escolhe o perfil da prova e os caminhos de matéria/tópico no modal de criação.
2. O frontend mantém a seleção em estado local até a confirmação.
3. O backend recebe o payload atual de matérias e tópicos, acrescido das seleções do banco.
4. Dentro da mesma transação, o backend cria o monitor, as matérias e os tópicos locais pelo fluxo existente.
5. Para cada nó selecionado, busca em `question_bank_items` por `examType`, `board`, `subject`, `topic`, `subtopic` e `subsubtopic`. Como a árvore é pré-definida pelo banco, a seleção deve preservar os identificadores estáveis do caminho, usando os nomes apenas para exibição.
6. O monitor continua em `DRAFT` e um job assíncrono começa a materializar as questões. O professor pode continuar o onboarding.
7. Para cada item encontrado, cria uma linha em `questions`, conforme o mapeamento detalhado abaixo.
8. A cópia recebe os IDs do monitor, professor, matéria e tópico locais.
9. Se a mesma questão global aparecer em mais de uma seleção do mesmo monitor, ela deve ser criada uma única vez.
10. O job é idempotente e pode continuar de onde parou em caso de falha.
11. O professor só pode publicar o monitor quando a importação estiver concluída com sucesso e todas as questões selecionadas tiverem sido processadas.
12. Prática, tentativas, desafios, simulados, chat e relatórios continuam recebendo `Question.id` como hoje.

Questões geradas ou extraídas de documentos continuam sendo criadas sem `questionBankItemId` (`NULL`) e não passam pelo fluxo de cópia do acervo.

## Schema atual relevante

### `Question` atual

```prisma
model Question {
  id                      String                       @id @default(uuid()) @db.Uuid
  teacherId               String                       @map("teacher_id") @db.Uuid
  monitorId               String                       @map("monitor_id") @db.Uuid
  subjectId               String                       @map("subject_id") @db.Uuid
  topicId                 String?                      @map("topic_id") @db.Uuid
  text                    String
  alternatives            Json
  kind                    QuestionKind                 @default(UNKNOWN)
  statementOrigin         QuestionContentOrigin        @default(SOURCE_DOCUMENT) @map("statement_origin")
  alternativesOrigin      QuestionContentOrigin?       @map("alternatives_origin")
  categoryOrigin          QuestionContentOrigin?       @map("category_origin")
  difficulty              String?
  difficultyOrigin        QuestionContentOrigin?       @map("difficulty_origin")
  correctAnswer           String?                      @map("correct_answer")
  correctAnswerOrigin     QuestionAnswerOrigin?        @map("correct_answer_origin")
  correctAnswerConfidence Float?                       @map("correct_answer_confidence")
  explanation             String?
  explanationOrigin       QuestionExplanationOrigin?   @map("explanation_origin")
  explanationConfidence   Float?                       @map("explanation_confidence")
  categoryConfidence      Float?                       @map("category_confidence")
  difficultyConfidence    Float?                       @map("difficulty_confidence")
  completenessStatus      QuestionCompletenessStatus   @default(MISSING_ANSWER) @map("completeness_status")
  needsReview             Boolean                      @default(true) @map("needs_review")
  qualityScore            Float?                       @map("quality_score")
  textHash                String                       @map("text_hash")
  sourceKey               String                       @unique @map("source_key")
  metadata                Json?
  status                  QuestionStatus               @default(PENDING_REVIEW)
  reviewedAt              DateTime?                    @map("reviewed_at")
  reviewedBy              String?                      @map("reviewed_by") @db.Uuid
  embedding               Unsupported("vector(2048)")?
  embeddingModel          String?                      @map("embedding_model")
  embeddingVersion        String?                      @map("embedding_version")
  embeddedAt              DateTime?                    @map("embedded_at")
  createdAt               DateTime                     @default(now()) @map("created_at")
  updatedAt               DateTime                     @updatedAt @map("updated_at")

  teacher               Teacher                  @relation(fields: [teacherId], references: [id], onDelete: Cascade)
  monitor               Monitor                  @relation(fields: [monitorId], references: [id], onDelete: Cascade)
  subject               MonitorSubject           @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  topic                 MonitorTopic?            @relation(fields: [topicId], references: [id], onDelete: Cascade)
  sources               QuestionSource[]
  topicLinks            QuestionTopic[]
  contentReports        StudentContentReport[]
  aiGenerations         QuestionAiGeneration[]
  dailyChallenges       DailyChallenge[]
  questionAttempts      StudentQuestionAttempt[]
  weeklySimulationItems WeeklySimulationItem[]

  @@unique([topicId, textHash])
  @@index([monitorId, subjectId, topicId, status])
  @@map("questions")
}
```

### `QuestionBankItem` atual

```prisma
model QuestionBankItem {
  id                   String   @id @default(uuid()) @db.Uuid
  provider             String
  providerQuestionId   String   @map("provider_question_id")
  externalId           String?  @map("external_id")
  examType             String   @map("exam_type")
  examName             String   @map("exam_name")
  board                String?
  institution          String?
  examYear             Int?     @map("exam_year")
  subject              String
  topic                String
  subtopic             String?
  subsubtopic          String?
  taxonomyPath         Json     @map("taxonomy_path")
  statementHtml        String   @map("statement_html") @db.Text
  statementText        String   @map("statement_text") @db.Text
  alternatives         Json
  correctAnswer        String   @map("correct_answer")
  difficulty           String?
  sourceUrl             String?  @map("source_url") @db.Text
  imageUrls             Json     @map("image_urls")
  rawPayload            Json     @map("raw_payload")
  contentHash           String   @map("content_hash")
  explanation           String?  @db.Text
  explanationStatus     String   @default("NOT_REQUESTED") @map("explanation_status")
  status                String   @default("IMPORTED")
  sourceFetchedAt       DateTime @map("source_fetched_at")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  @@unique([provider, providerQuestionId])
  @@index([examType, board, subject, topic, status])
  @@index([provider, examYear])
  @@index([contentHash])
  @@map("question_bank_items")
}
```

### `MonitorQuestionBankSelection` atual

```prisma
model MonitorQuestionBankSelection {
  id             String   @id @default(uuid()) @db.Uuid
  monitorTopicId String   @map("monitor_topic_id") @db.Uuid
  subtopic       String?
  subsubtopic    String?
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  monitorTopic MonitorTopic @relation(fields: [monitorTopicId], references: [id], onDelete: Cascade)

  @@index([monitorTopicId])
  @@map("monitor_question_bank_selections")
}
```

Essa tabela já existe para representar a seleção de caminhos do acervo por tópico local. Ela ainda não contém `examType`, `board` ou `selectionKey`, embora esses campos tenham aparecido no plano anterior. A nova implementação deve adicionar o perfil da prova explicitamente para que a cópia não misture ENEM, FGV, Cesgranrio ou outros perfis com a mesma matéria/tópico.

### Tabelas que continuam apontando para `Question`

Estas tabelas permanecem sem alteração estrutural nesta fase:

```prisma
model StudentQuestionAttempt {
  id               String                       @id @default(uuid()) @db.Uuid
  studentId        String                       @map("student_id") @db.Uuid
  questionId       String                       @map("question_id") @db.Uuid
  monitorId        String                       @map("monitor_id") @db.Uuid
  dailyChallengeId String?                      @map("daily_challenge_id") @db.Uuid
  mode             StudentQuestionAttemptMode
  status           StudentQuestionAttemptStatus @default(ACTIVE)
  selectedAnswer   String                       @map("selected_answer")
  isCorrect        Boolean                      @map("is_correct")
  responseTimeMs   Int?                         @map("response_time_ms")
  answeredAt       DateTime                     @default(now()) @map("answered_at")
  metadata         Json?
  idempotencyKey   String?                      @unique @map("idempotency_key") @db.Uuid
  createdAt        DateTime                     @default(now()) @map("created_at")

  student              Student                @relation(fields: [studentId], references: [id], onDelete: Cascade)
  question             Question               @relation(fields: [questionId], references: [id], onDelete: Restrict)
  monitor              Monitor                @relation(fields: [monitorId], references: [id], onDelete: Restrict)
  dailyChallenge       DailyChallenge?        @relation(fields: [dailyChallengeId], references: [id], onDelete: SetNull)
  challengeAttempt     DailyChallengeAttempt?

  @@index([studentId, answeredAt])
  @@index([monitorId, answeredAt])
  @@index([questionId, studentId])
  @@index([studentId, status, answeredAt])
  @@map("student_question_attempts")
}

model DailyChallenge {
  id                String   @id @default(uuid()) @db.Uuid
  monitorId         String   @map("monitor_id") @db.Uuid
  questionId        String   @map("question_id") @db.Uuid
  challengeDate     DateTime @map("challenge_date") @db.Date
  availableFrom     DateTime @map("available_from")
  availableUntil    DateTime @map("available_until")
  selectionStrategy String   @map("selection_strategy")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  monitor          Monitor                  @relation(fields: [monitorId], references: [id], onDelete: Cascade)
  question         Question                 @relation(fields: [questionId], references: [id], onDelete: Restrict)
  attempts         DailyChallengeAttempt[]
  questionAttempts StudentQuestionAttempt[]

  @@unique([monitorId, challengeDate])
  @@unique([monitorId, questionId])
  @@index([challengeDate])
  @@map("daily_challenges")
}

model WeeklySimulationItem {
  id                String                  @id @default(uuid()) @db.Uuid
  simulationId      String                  @map("simulation_id") @db.Uuid
  questionId        String                  @map("question_id") @db.Uuid
  position          Int
  subjectId         String                  @map("subject_id") @db.Uuid
  topicId           String?                 @map("topic_id") @db.Uuid
  difficultyScore   Float                   @map("difficulty_score")
  selectionPriority WeeklySelectionPriority @map("selection_priority")
  selectionReason   String                  @map("selection_reason")
  selectedAnswer    String?                 @map("selected_answer")
  isCorrect         Boolean?                @map("is_correct")
  responseTimeMs    Int?                   @map("response_time_ms")
  answeredAt        DateTime?               @map("answered_at")
  createdAt         DateTime                @default(now()) @map("created_at")
  updatedAt         DateTime                @updatedAt @map("updated_at")

  simulation      WeeklySimulation        @relation(fields: [simulationId], references: [id], onDelete: Cascade)
  question        Question                @relation(fields: [questionId], references: [id], onDelete: Restrict)
  subject         MonitorSubject          @relation(fields: [subjectId], references: [id], onDelete: Restrict)
  topic           MonitorTopic?           @relation(fields: [topicId], references: [id], onDelete: SetNull)

  @@unique([simulationId, questionId])
  @@unique([simulationId, position])
  @@index([simulationId, topicId])
  @@map("weekly_simulation_items")
}
```

## Alterações propostas no schema

### Alteração em `Question`

Adicionar um vínculo nullable para o item original:

```prisma
model Question {
  id                 String  @id @default(uuid()) @db.Uuid
  questionBankItemId String? @map("question_bank_item_id") @db.Uuid

  // campos atuais...

  questionBankItem QuestionBankItem? @relation(
    fields: [questionBankItemId],
    references: [id],
    onDelete: Restrict
  )

  @@index([questionBankItemId])
  @@unique([monitorId, questionBankItemId])
}
```

O índice permite consultar rapidamente a origem. A unicidade por monitor evita criar duas cópias do mesmo item dentro do mesmo monitor. Como `questionBankItemId` é nullable, questões próprias continuam permitidas; essa regra deve ser validada no PostgreSQL para garantir múltiplas linhas com `NULL`. O `ON DELETE RESTRICT` impede que uma exclusão física destrua a rastreabilidade; itens do banco devem ser arquivados, não removidos enquanto houver cópias.

### Alteração em `QuestionBankItem`

Adicionar somente a relação inversa no Prisma:

```prisma
model QuestionBankItem {
  // campos atuais...

  questions Question[]
}
```

Uma mesma questão de `question_bank_items` pode possuir uma cópia em vários monitores, cada uma com o seu próprio `Question.id`.

### Alteração em `MonitorQuestionBankSelection`

```prisma
model MonitorQuestionBankSelection {
  id             String   @id @default(uuid()) @db.Uuid
  monitorTopicId String   @map("monitor_topic_id") @db.Uuid
  examType       String   @map("exam_type")
  board          String?
  subtopic       String?
  subsubtopic    String?
  selectionKey   String   @map("selection_key")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  monitorTopic MonitorTopic @relation(fields: [monitorTopicId], references: [id], onDelete: Cascade)

  @@unique([monitorTopicId, selectionKey])
  @@index([monitorTopicId, examType, board])
  @@map("monitor_question_bank_selections")
}
```

`selectionKey` deve ser calculada a partir de `examType`, `board`, `subtopic` e `subsubtopic` normalizados. A matéria e o tópico local continuam sendo obtidos pelas relações `monitorTopic → subject → monitor`.

## Mapeamento de `QuestionBankItem` para `Question`

Cada item do banco encontrado pela seleção gera uma cópia local. O vínculo é individual: uma linha de `Question` aponta para exatamente um `QuestionBankItem`.

| Origem em `QuestionBankItem` | Destino em `Question` | Regra |
|---|---|---|
| `id` | `questionBankItemId` | FK nullable para rastrear a origem. Para cópias do banco, é obrigatório. |
| contexto da seleção | `teacherId` | ID do professor dono do monitor. Não vem do item global. |
| contexto da criação | `monitorId` | ID do monitor local. Não vem do item global. |
| matéria criada localmente | `subjectId` | ID de `MonitorSubject` associado ao monitor. |
| tópico criado localmente | `topicId` | ID de `MonitorTopic` correspondente ao `topic` selecionado. |
| `statementText` | `text` | Texto operacional usado pela prática. |
| `alternatives` | `alternatives` | Copiar o JSON normalizado das alternativas. |
| — | `kind` | Definir como `MULTIPLE_CHOICE`, pois o contrato atual do banco importa questões objetivas com alternativas. |
| — | `statementOrigin` | Definir como `EXTERNAL_SOURCE`. Se o enum ou o fluxo ainda não suportar esse valor no persistidor, adaptar o contrato antes da importação. |
| — | `alternativesOrigin` | `EXTERNAL_SOURCE`. |
| `difficulty` | `difficulty` | Copiar quando existir; caso contrário, deixar `NULL`. |
| `difficulty` | `difficultyOrigin` | `EXTERNAL_SOURCE` quando `difficulty` estiver preenchida; caso contrário, `NULL`. |
| `correctAnswer` | `correctAnswer` | Copiar o gabarito normalizado. |
| — | `correctAnswerOrigin` | `EXTERNAL_SOURCE`. |
| `explanation` | `explanation` | Copiar quando existir. |
| — | `explanationOrigin` | `EXTERNAL_SOURCE` quando houver explicação; caso contrário, `NULL`. |
| validação do item importado | `completenessStatus` | `COMPLETE_FROM_SOURCE` somente quando houver alternativas válidas e exatamente um gabarito compatível. Itens inválidos não devem ser publicados. |
| validação do item importado | `needsReview` | `false` somente se o item estiver no status aceito para publicação no acervo. Caso contrário, não criar a cópia publicável. |
| item validado | `status` | `APPROVED` para que os fluxos atuais de prática e desempenho possam servi-lo. A regra deve ser explícita e testada. |
| `contentHash` ou hash de `statementText` | `textHash` | Usar hash determinístico para manter a deduplicação atual por tópico. |
| monitor + item global | `sourceKey` | Chave determinística, por exemplo `question-bank:{monitorId}:{questionBankItemId}`. |
| `statementHtml`, `imageUrls`, `provider`, `providerQuestionId`, `externalId`, `examType`, `board`, `examName`, `examYear`, `subtopic`, `subsubtopic`, `sourceUrl`, `contentHash`, `sourceFetchedAt` | `metadata` | Guardar snapshot dos metadados que não possuem coluna própria em `Question`. Isso preserva o contexto visto no momento da cópia. |

Os campos `rawPayload` e `taxonomyPath` não precisam ser copiados integralmente para `Question` para o fluxo do aluno. Podem permanecer somente em `QuestionBankItem`; se forem necessários para auditoria, devem ser acessados pela relação `questionBankItem` ou armazenados explicitamente no snapshot, sem depender de uma leitura dinâmica para renderizar a questão.

O `statementHtml` e o `imageUrls` merecem atenção especial: `Question` atualmente não possui colunas próprias para eles. Se a interface do aluno precisar de HTML ou imagens para exibir corretamente a questão, o importador deve guardar esses valores em `metadata` ou, preferencialmente em uma alteração futura, criar campos renderizáveis próprios em `Question`. Não se deve perder imagens ou fórmulas simplesmente porque `text` recebeu apenas `statementText`.

## Regras de cópia e rastreabilidade

- `questionBankItemId` é preenchido somente para questões originadas do acervo.
- `teacherId`, `monitorId`, `subjectId` e `topicId` vêm do contexto local do monitor.
- `text` recebe `statementText`; `statementHtml` e `imageUrls` devem ser preservados em `metadata` enquanto `Question` não possuir campos renderizáveis próprios.
- `alternatives`, `correctAnswer`, `explanation` e `difficulty` são copiados para a questão local.
- `subtopic` e `subsubtopic` são preservados no snapshot da origem para que a questão continue auditável mesmo que a taxonomia global seja atualizada.
- `sourceKey` precisa continuar único. Para cópias do acervo, deve ser determinístico, por exemplo `question-bank:{monitorId}:{questionBankItemId}`.
- O status inicial deve ser `APPROVED` somente quando o item do banco estiver validado e completo para publicação.
- Uma atualização futura do item global não altera automaticamente a cópia local.
- Se for necessário atualizar uma cópia, será uma ação explícita e deverá considerar se já existem tentativas relacionadas.
- Questões do professor continuam com `questionBankItemId = NULL` e não devem ser associadas artificialmente a itens parecidos do acervo.

## Plano de implementação

### Task 1: Formalizar a identidade do perfil

- Criar helper puro para normalizar `examType` e `board` para comparação.
- Cobrir ENEM com `board = NULL`, CONCURSO/FGV e CONCURSO/CESGRANRIO.
- Garantir que caixa e espaços extras não criem divergências.
- Garantir que perfis diferentes nunca sejam misturados.

### Task 2: Ajustar a seleção do banco

- Atualizar o Prisma e a migration de `monitor_question_bank_selections` com `examType`, `board` e `selectionKey`.
- Manter `subtopic` e `subsubtopic` opcionais.
- Preservar a FK para `MonitorTopic` e exclusão em cascata.
- Não adicionar FKs redundantes para monitor ou matéria.
- Garantir que a migration seja aditiva e não altere dados existentes.

### Task 3: Alterar o schema de `Question`

- Adicionar `questionBankItemId` nullable em `questions`.
- Criar a FK para `question_bank_items` com `ON DELETE RESTRICT`.
- Criar a relação inversa no Prisma e índice por `questionBankItemId`.
- Definir a regra de unicidade por monitor para evitar duplicação.
- Validar compatibilidade com `sourceKey`, `textHash` e questões existentes.

### Task 4: Persistir monitor e seleções

- Estender o payload de criação com `questionBankSelections` por tópico.
- Criar monitor, matérias, tópicos e seleções na transação inicial.
- Manter o monitor em `DRAFT` e enfileirar um job assíncrono para criar as cópias em `questions`.
- Associar cada seleção aos IDs locais retornados na criação, sem procurar tópicos somente por nome.
- Buscar os itens do acervo usando perfil e caminho taxonômico completo.
- Deduplicar o mesmo `QuestionBankItem` dentro do monitor.
- Fazer rollback da unidade de cópia que falhar e registrar o erro para retry; a publicação continuará bloqueada enquanto houver falha.

### Task 5: Implementar o job idempotente de importação

- Criar o serviço responsável por transformar cada `QuestionBankItem` em `Question`.
- Aplicar exatamente o mapeamento definido nesta documentação.
- Usar `sourceKey` determinístico e `upsert` para permitir retry sem duplicação.
- Validar alternativas, gabarito e status do item antes de criar uma questão `APPROVED`.
- Registrar progresso, quantidade processada, quantidade com erro e última falha.
- Garantir que o job possa ser retomado enquanto o professor continua o onboarding.
- Preservar no snapshot os metadados necessários para consultar `subtopic` e `subsubtopic`.

### Task 6: Preservar a seleção no frontend

- Manter perfil, `subtopic` e `subsubtopic` no estado local do modal.
- Enviar a seleção somente no clique final.
- Continuar criando `MonitorSubject.name` com `subject` e `MonitorTopic.name` com `topic`.
- Não concatenar níveis taxonômicos no nome do tópico.
- Ler a documentação Next.js local pertinente antes de alterar o componente.

### Task 7: Bloquear publicação até a importação terminar

- Manter o monitor em `DRAFT` durante `PENDING`, `PROCESSING`, `PARTIAL_FAILURE` e `FAILED`.
- Criar ou adaptar o endpoint de publicação para verificar o estado real do job no backend.
- Liberar publicação somente quando o job estiver `COMPLETED` e todas as questões esperadas estiverem materializadas.
- Testar que o frontend não consegue publicar chamando diretamente o endpoint antes da conclusão.
- Testar retry após falha parcial sem criar duplicatas.

### Task 8: Testar os consumidores existentes

- Criar questão do acervo e confirmar o vínculo com `QuestionBankItem`.
- Criar questão manual e confirmar `questionBankItemId = NULL`.
- Responder uma cópia em prática e confirmar que a tentativa usa `Question.id`.
- Criar desafio e simulado com uma cópia do acervo.
- Confirmar que relatórios continuam agrupando por monitor, matéria e tópico local.
- Confirmar que o mesmo item pode ser copiado para dois monitores.
- Confirmar que o mesmo item não é copiado duas vezes no mesmo monitor.
- Confirmar rollback quando a seleção aponta para perfil ou caminho inexistente.

### Task 9: Rollout

- Aplicar primeiro a migration aditiva.
- Publicar backend compatível com o campo nullable.
- Publicar frontend enviando as seleções.
- Validar monitores antigos, que permanecerão sem seleções e sem alterações nas questões existentes.
- Rodar Prisma validate, typecheck e testes focados de backend e frontend.

## Fora de escopo

- Substituir `Question.id` por uma identidade polimórfica.
- Fazer tentativas apontarem diretamente para `QuestionBankItem`.
- Alterar a estrutura de `StudentQuestionAttempt`, `DailyChallenge` ou `WeeklySimulationItem`.
- Atualizar automaticamente cópias locais quando o acervo global mudar.
- Criar um catálogo global novo de matérias, tópicos ou taxonomias.
- Usar `subtopic` ou `subsubtopic` como novos tópicos da IA.

## Critérios de aceite

- Ao confirmar a criação do monitor, itens selecionados do acervo geram cópias em `questions`.
- Cada cópia possui `questionBankItemId` preenchido.
- Questões próprias continuam com `questionBankItemId = NULL`.
- É possível consultar, a partir de `Question`, o `subtopic` e `subsubtopic` do item original.
- O monitor só pode ser publicado depois que o job de importação estiver `COMPLETED`.
- Falhas de importação deixam o monitor em `DRAFT` e podem ser reprocessadas sem duplicar questões.
- Uma mesma questão global pode ser usada em vários monitores sem compartilhar o mesmo `Question.id`.
- A mesma questão global não é duplicada dentro do mesmo monitor.
- Prática, tentativas, desafios, simulados e relatórios continuam funcionando com `Question.id`.
- O conteúdo local é um snapshot e não muda silenciosamente quando o item global é atualizado.
- Monitores existentes continuam funcionando sem migração de conteúdo.
