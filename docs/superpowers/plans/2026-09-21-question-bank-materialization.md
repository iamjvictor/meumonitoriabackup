# Question Bank Materialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suportar monitores somente próprios, somente do acervo ou mistos, criando cópias idempotentes das questões selecionadas em `questions` e preservando rastreabilidade sem alterar o contrato dos consumidores atuais.

**Architecture:** `question_bank_items` continua sendo o acervo global. A criação do monitor persiste `MonitorQuestionBankSelection` ligada aos `MonitorTopic` locais e, em seguida, um serviço de materialização consulta o acervo e faz upsert de snapshots em `questions`, usando `questionBankItemId` e `sourceKey` determinística. O frontend envia caminhos taxonômicos estáveis; `Question.id` continua sendo a identidade operacional para os alunos.

**Tech Stack:** Fastify 5, Zod 4, Prisma 7, PostgreSQL/Supabase, TypeScript, Next.js 16, React 19, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-21-question-bank-materialization-design.md`

## Global Constraints

- `Question.questionBankItemId` é nullable; questões documentais e manuais permanecem com `NULL`.
- Cópias do acervo são snapshots e não são atualizadas automaticamente.
- `sourceKey` de cópia usa `question-bank:{monitorId}:{questionBankItemId}`.
- `Question.id` continua sendo usado por prática, tentativas, desafios, simulados, chat e relatórios.
- Um item global pode ser copiado para vários monitores, mas apenas uma vez dentro de cada monitor.
- A seleção usa `examType`, `board`, `subject`, `topic`, `subtopic` e `subsubtopic` normalizados; IDs visuais do catálogo não são identidade persistente.
- O monitor permanece `DRAFT` quando a materialização do acervo falhar.
- A seleção do acervo é opcional; ausência de seleções não é erro e não deve impedir a criação do monitor.
- Conteúdo manual e conteúdo do acervo podem coexistir no mesmo `MonitorSubject`/`MonitorTopic`; o conteúdo próprio não deve ser descartado por coincidência de nomes.
- A seleção inicial do acervo importa somente questões; o upload posterior de bases de conhecimento continua no pipeline existente e não é redirecionado para o acervo.
- Migrações de banco são aditivas e devem manter compatibilidade com monitores antigos.

## Review Focus

- Perfil igual com caixa, espaços ou `board = NULL` diferente: deve normalizar e nunca misturar perfis distintos. Testar no Task 1.
- Seleção de tópico inteiro, subtópico inteiro e subsubtópico: deve expandir para o conjunto correto sem perder o contexto local. Testar no Task 1 e Task 4.
- Mesmo item encontrado por duas seleções: deve resultar em uma única `Question`. Testar no Task 4.
- Retry após cópia parcial: deve reutilizar `sourceKey`, atualizar a mesma linha e não duplicar. Testar no Task 4.
- Item inválido, sem alternativas válidas ou com gabarito incompatível: não pode virar questão `APPROVED` nem liberar publicação. Testar no Task 4 e Task 7.

## Mapa de arquivos

- Criar `backend/src/modules/question-bank/services/question-bank-selection.service.ts`: normalização, geração de `selectionKey` e expansão dos filtros.
- Criar `backend/src/modules/question-bank/services/question-bank-materialization.service.ts`: transformação e upsert dos itens globais em `questions`.
- Criar `backend/src/modules/question-bank/services/__tests__/question-bank-selection.service.test.ts`.
- Criar `backend/src/modules/question-bank/services/__tests__/question-bank-materialization.service.test.ts`.
- Modificar `backend/prisma/schema.prisma`: seleção, relação e `Question.questionBankItemId`.
- Criar migration aditiva em `backend/supabase/migrations/` e migration Prisma equivalente conforme o fluxo vigente do backend.
- Modificar `backend/src/models/monitor.model.ts`: payload de criação e validações.
- Modificar `backend/src/repositories/monitor.repository.ts`: criação transacional de monitor, árvore local e seleções.
- Modificar `backend/src/services/monitor.service.ts`: orquestração da criação e materialização.
- Modificar `backend/src/controllers/monitor.controller.ts` somente se o tipo Fastify do body precisar ser explicitado.
- Modificar `frontend/src/modules/teacher/components/TeacherMonitorCreationModal.tsx`: preservar a seleção canônica no `MonitorDraft`.
- Modificar `frontend/src/modules/teacher/services/TeacherMonitorService.ts`: enviar `questionBankSelections` no `createDraft`.
- Criar ou modificar testes de contrato do modal e do serviço frontend.
- Modificar a validação de publicação em `backend/src/repositories/monitor.repository.ts` ou extrair serviço dedicado, conforme a fronteira encontrada durante a implementação.
- Não modificar o pipeline de upload/processamento de documentos nesta iniciativa; ele permanece responsável por bases de conhecimento e questões extraídas dos documentos.

---

### Fase 1: Formalizar a origem do conteúdo e a identidade da seleção

**Resultado:** o fluxo distingue conteúdo manual de conteúdo do acervo, permite zero seleções do acervo e transforma cada seleção existente em um filtro estável para o banco.

**Files:**
- Create: `backend/src/modules/question-bank/services/question-bank-selection.service.ts`
- Test: `backend/src/modules/question-bank/services/__tests__/question-bank-selection.service.test.ts`
- Modify: `frontend/src/modules/teacher/components/TeacherMonitorCreationModal.tsx`
- Test: `frontend/tests/monitor-question-bank-selection-contract.test.mjs`

**Interfaces:**

```ts
export type QuestionBankSelectionInput = {
  subject: string;
  topic: string;
  examType: string;
  board?: string | null;
  subtopic?: string | null;
  subsubtopic?: string | null;
};

export type NormalizedQuestionBankSelection = {
  subject: string;
  topic: string;
  examType: string;
  board: string | null;
  subtopic: string | null;
  subsubtopic: string | null;
  selectionKey: string;
};

export function normalizeQuestionBankSelection(input: QuestionBankSelectionInput): NormalizedQuestionBankSelection;
export function buildSelectionWhere(selection: NormalizedQuestionBankSelection): Record<string, unknown>;
```

- [ ] Escrever testes backend para trim, caixa, valores vazios, `board = NULL`, subsubtópico sem subtópico e chaves determinísticas.
- [ ] Executar o arquivo de teste e confirmar falhas antes da implementação.
- [ ] Implementar normalização sem remover acentos dos nomes taxonômicos; usar apenas normalização de espaços/caixa para comparação e uma codificação segura na `selectionKey`.
- [ ] Fazer `buildSelectionWhere` representar os três escopos: tópico inteiro, subtópico inteiro e subsubtópico específico.
- [ ] Alterar o modal para permitir avançar da etapa do banco sem nenhuma seleção do acervo.
- [ ] Manter `subjects` como a estrutura local do monitor e criar `questionBankSelections` como coleção independente e opcional.
- [ ] Ao sincronizar o catálogo, mesclar por matéria/tópico normalizado sem apagar tópicos manuais com o mesmo nome.
- [ ] Criar teste frontend para os três cenários: próprio, acervo e misto.
- [ ] Executar os testes backend e frontend focados e confirmar aprovação.

Comando:

```bash
cd backend && node --import tsx --test src/modules/question-bank/services/__tests__/question-bank-selection.service.test.ts
cd frontend && node --test tests/monitor-question-bank-selection-contract.test.mjs
```

---

### Fase 2: Alterar schema e banco de dados

**Resultado:** o banco aceita seleções com perfil explícito e questões rastreáveis sem quebrar dados existentes.

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: migration SQL gerada pelo comando oficial do projeto em `backend/prisma/migrations/`
- Create: migration SQL aditiva em `backend/supabase/migrations/`
- Test: `backend/src/modules/question-bank/repositories/__tests__/question-bank-schema.contract.test.ts`

**Schema esperado:**

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

`Question` deve adicionar `questionBankItemId`, relação inversa em `QuestionBankItem`, FK `ON DELETE RESTRICT`, índice por origem e unicidade por `[monitorId, questionBankItemId]`, preservando múltiplos `NULL`.

- [ ] Verificar a versão do CLI Supabase e a convenção de migrations antes de criar arquivos, usando `supabase --help`, `supabase migration --help` e `supabase migration new question-bank-materialization`.
- [ ] Criar migration aditiva para as colunas, constraints, índices e FK.
- [ ] Atualizar Prisma e gerar o client.
- [ ] Adicionar teste de contrato confirmando nullable, FK restrict, unique por monitor e preservação de linhas existentes.
- [ ] Rodar `prisma validate`, geração e testes de schema.

Comandos:

```bash
cd backend && supabase --version
cd backend && npx prisma validate
cd backend && npx prisma generate
cd backend && node --import tsx --test src/modules/question-bank/repositories/__tests__/question-bank-schema.contract.test.ts
```

---

### Fase 3: Estender o contrato de criação do monitor

**Resultado:** o backend recebe zero ou mais seleções explícitas e consegue associá-las aos tópicos locais criados na mesma transação.

Esta fase trata apenas da seleção prévia do acervo. O upload posterior de bases de conhecimento não faz parte deste contrato e continua usando as rotas e serviços existentes de documentos.

**Files:**
- Modify: `backend/src/models/monitor.model.ts`
- Modify: `backend/src/repositories/monitor.repository.ts`
- Modify: `backend/src/services/monitor.service.ts`
- Modify: `backend/src/controllers/monitor.controller.ts` se necessário
- Test: testes unitários/contratuais de `monitor.model` e `monitor.repository`

**Payload:**

```ts
type CreateMonitorInput = {
  name: string;
  description?: string;
  subjects: Array<{
    name: string;
    topics: Array<{ name: string; definition?: string }>;
  }>;
  questionBankSelections?: QuestionBankSelectionInput[];
};
```

- [ ] Escrever testes de schema para seleção válida, ausência de seleção, array vazio, limites de strings e rejeição de `subsubtopic` sem `subtopic`.
- [ ] Fazer o teste de repositório verificar que a criação devolve o mapa entre `subject/topic` recebido e os IDs locais criados.
- [ ] Implementar a validação Zod e normalização antes da transação.
- [ ] Dentro da transação, criar as matérias/tópicos e persistir cada seleção no `MonitorTopic` correto por nome normalizado e contexto da matéria.
- [ ] Rejeitar somente seleções presentes que não tenham matéria/tópico correspondente no payload do monitor; aceitar payload sem seleções.
- [ ] Preservar o monitor em `DRAFT` e retornar as seleções salvas no resultado interno.
- [ ] Rodar os testes focados e o typecheck do backend.

---

### Fase 4: Implementar a materialização idempotente

**Resultado:** o serviço copia itens válidos do acervo para `questions` com rastreabilidade completa.

**Files:**
- Create: `backend/src/modules/question-bank/services/question-bank-materialization.service.ts`
- Create: `backend/src/modules/question-bank/services/__tests__/question-bank-materialization.service.test.ts`
- Modify: `backend/src/repositories/question.repository.ts` somente se for necessário extrair um persistidor reutilizável para o upsert do acervo

**Interfaces:**

```ts
export type MaterializeMonitorQuestionsInput = {
  teacherId: string;
  monitorId: string;
  selections: Array<{
    monitorTopicId: string;
    monitorSubjectId: string;
    selection: NormalizedQuestionBankSelection;
  }>;
};

export type MaterializationResult = {
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failures: Array<{ questionBankItemId?: string; reason: string }>;
};

export class QuestionBankMaterializationService {
  materialize(input: MaterializeMonitorQuestionsInput): Promise<MaterializationResult>;
}
```

- [ ] Escrever testes unitários com repositórios fake para: item válido, item sem alternativas, gabarito incompatível, item arquivado, item repetido por duas seleções, retry e dois monitores.
- [ ] Executar os testes e confirmar as falhas.
- [ ] Implementar a consulta do acervo por `examType`, `board`, `subject`, `topic` e escopo taxonômico.
- [ ] Deduplicar por `QuestionBankItem.id` antes do upsert.
- [ ] Validar alternativas e gabarito usando o formato real de `QuestionBankItem.alternatives`.
- [ ] Construir o snapshot de `metadata` com HTML, imagens, provedor, prova, banca, ano, URL, subtópico e subsubtópico.
- [ ] Fazer upsert por `sourceKey` com `status = APPROVED`, `needsReview = false`, origens externas e `completenessStatus = COMPLETE_FROM_SOURCE` somente quando válido.
- [ ] Garantir que falhas de um item sejam retornadas sem transformar esse item em questão aprovada.
- [ ] Executar os testes focados e confirmar aprovação.

Comando:

```bash
cd backend && node --import tsx --test src/modules/question-bank/services/__tests__/question-bank-materialization.service.test.ts
```

---

### Fase 5: Orquestrar criação e cópia no backend

**Resultado:** criar um monitor com seleções materializa automaticamente as questões locais.

A materialização ocorre somente para itens selecionados do acervo. Após essa criação, uploads de conhecimento e questões próprias continuam sendo feitos normalmente no workspace do monitor.

**Files:**
- Modify: `backend/src/services/monitor.service.ts`
- Modify: `backend/src/repositories/monitor.repository.ts`
- Modify: `backend/src/controllers/monitor.controller.ts` para resposta e erros públicos
- Test: testes de integração/contrato do endpoint `POST /api/v1/monitors`

- [ ] Escrever testes de endpoint com professor autenticado criando monitor próprio, monitor do acervo e monitor misto.
- [ ] No caso próprio, verificar monitor `DRAFT`, matérias/tópicos persistidos e zero seleções/cópias do acervo.
- [ ] No caso do acervo, verificar monitor `DRAFT`, seleções persistidas e cópias em `questions`.
- [ ] No caso misto, verificar que tópicos manuais e tópicos do acervo permanecem no mesmo monitor.
- [ ] Escrever teste de retry; chamar a materialização duas vezes e verificar uma única questão por item.
- [ ] Implementar a orquestração: criar árvore e seleções na transação, obter IDs locais, executar materialização e retornar resumo.
- [ ] Se a materialização falhar, manter o monitor em `DRAFT`, retornar erro estruturado e não marcar questões inválidas como `APPROVED`.
- [ ] Garantir que criação sem seleções continue funcionando exatamente como antes e não execute a materialização.
- [ ] Garantir que o monitor criado continue aceitando uploads de documentos e questões próprias pelas rotas existentes, sem exigir `questionBankItemId`.
- [ ] Rodar o teste do endpoint e `npm run typecheck` no backend.

Nota de implementação: nesta fase a materialização será síncrona, conforme a especificação aprovada. A separação para BullMQ/job persistido será uma evolução posterior, não deve ser antecipada neste lote.

---

### Fase 6: Conectar o modal existente ao contrato real

**Resultado:** a seleção visual do professor chega ao backend sem alterar a interface de matérias e tópicos do monitor.

**Files:**
- Modify: `frontend/src/modules/teacher/components/TeacherMonitorCreationModal.tsx`
- Modify: `frontend/src/modules/teacher/services/TeacherMonitorService.ts`
- Modify: testes de extração/contrato do modal existentes em `frontend/tests/`

- [ ] Escrever teste de contrato verificando que nenhuma seleção produz `questionBankSelections: []` e que selecionar perfil, matéria, tópico, subtópico e subsubtópico produz seleções canônicas.
- [ ] Alterar `MonitorDraft` para conter `questionBankSelections` sem remover `subjects`.
- [ ] Preservar a seleção em estado local; `syncCatalogToSubjects` continuará servindo apenas para montar a árvore visual do monitor.
- [ ] Emitir uma seleção por escopo canônico, preservando `examType`, `board`, `subject`, `topic`, `subtopic` e `subsubtopic`.
- [ ] Não usar o ID sintético exibido no catálogo como identidade de persistência.
- [ ] Enviar `questionBankSelections` no `TeacherMonitorService.createDraft`.
- [ ] Verificar os contratos de criação manual, somente do acervo e misto.
- [ ] Rodar testes frontend e typecheck.

Comandos:

```bash
cd frontend && npm test -- --test-name-pattern='monitor|question'
cd frontend && npm run typecheck
```

---

### Fase 7: Bloquear publicação até a materialização estar válida

**Resultado:** nenhum monitor com importação incompleta pode ser publicado por chamada direta ao backend.

**Files:**
- Modify: `backend/src/controllers/monitor.controller.ts`
- Modify: `backend/src/services/monitor.service.ts`
- Modify: `backend/src/repositories/monitor.repository.ts`
- Modify: `frontend/src/modules/teacher/components/monitor/MonitorWorkspace.tsx` apenas para refletir a resposta real do backend
- Test: testes de publicação backend e frontend

- [ ] Escrever teste que tenta atualizar monitor para `PUBLISHED` com seleção pendente ou falha e espera `409`/`422` estruturado.
- [ ] Escrever teste que permite publicação de monitor antigo sem seleções, desde que ele cumpra as regras antigas.
- [ ] Implementar validação server-side: monitor dono do professor, status permitido, seleções materializadas e nenhuma falha.
- [ ] Remover qualquer confiança exclusiva no `publishValidation` calculado no frontend.
- [ ] Atualizar a UI para mostrar o motivo retornado pelo backend sem liberar artificialmente o botão.
- [ ] Rodar testes de publicação e typecheck completo.

---

### Fase 8: Verificação dos consumidores e rollout

**Resultado:** o novo fluxo é validado sem regressão nos consumidores de `Question`.

**Files:**
- Modify/Create: testes focados em `backend/src/modules/student-question-attempts/`, desafios, simulados e relatórios conforme os contratos existentes
- Modify: documentação operacional do rollout, se necessário

- [ ] Criar uma cópia do acervo e confirmar `questionBankItemId`, `monitorId`, `subjectId` e `topicId` locais.
- [ ] Criar monitor somente próprio e confirmar que ele funciona sem `questionBankItemId` ou seleções do acervo.
- [ ] Criar monitor misto e confirmar que conteúdo próprio e do acervo coexistem.
- [ ] Criar questão manual e documental e confirmar `questionBankItemId = NULL`.
- [ ] Fazer upload de uma base de conhecimento após a criação e confirmar que o documento segue o pipeline existente, sem ser tratado como item do acervo.
- [ ] Responder uma cópia em prática e confirmar que a tentativa usa `Question.id`.
- [ ] Criar desafio diário e item de simulado usando a cópia.
- [ ] Confirmar relatório agrupando por monitor, matéria e tópico local.
- [ ] Confirmar mesmo item em dois monitores com dois `Question.id`.
- [ ] Confirmar que exclusão do item global referenciado é bloqueada.
- [ ] Rodar Prisma validate/generate, typecheck, testes backend focados, testes frontend e contratos existentes do monitor.
- [ ] Revisar migrations e registrar a ordem de deploy: banco aditivo, backend compatível, frontend conectado, validação de publicação.

Comandos finais:

```bash
cd backend && npm run prisma:validate
cd backend && npm run typecheck
cd backend && node --import tsx --test src/modules/question-bank/services/__tests__/question-bank-selection.service.test.ts src/modules/question-bank/services/__tests__/question-bank-materialization.service.test.ts src/modules/question-bank/repositories/__tests__/question-bank-schema.contract.test.ts
cd frontend && npm run typecheck
cd frontend && npm test
```
