# Banco Próprio de Questões via EnemHub e QAPI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a primeira fase do banco próprio de questões do MeuMonitorAI, importando ENEM, FGV e Cesgranrio para uma única tabela central, com contrato comum, normalização, idempotência, validação e rastreabilidade.

**Architecture:** EnemHub e QAPI terão adapters independentes, mas ambos produzirão o mesmo contrato interno antes de persistir. Todas as questões serão gravadas em uma nova tabela neutra `question_bank_items`, sem professor ou monitor; o relacionamento com monitores ficará em uma fase posterior, sem duplicar o conteúdo.

**Tech Stack:** Backend TypeScript, Fastify, Prisma, PostgreSQL/Supabase, Zod, Node test runner com `tsx`, jobs/scripts existentes do backend.

**Spec:** Requisitos arquiteturais aprovados na conversa e registrados neste plano; não há documento de especificação separado solicitado.

## Status atual — 2026-09-11

- A tabela `public.question_bank_items` já foi criada no Supabase e validada com `subtopic` e `subsubtopic` nulos.
- O contrato Prisma/Zod, o repositório idempotente e a normalização de conteúdo já estão implementados.
- O adapter EnemHub já busca, pagina, filtra por matéria, normaliza a taxonomia e persiste na tabela central.
- O comando `npm run import:enemhub-subject -- --subject <matéria>` já suporta Matemática, Física, Biologia e Química, com `--dry-run`, `--max-pages` e `--year`.
- Contagens consultadas na API: Matemática 724, Física 234, Biologia 348 e Química 232.
- A base já recebeu os lotes executados; a conferência de cada matéria deve ser feita por SQL antes de marcar o lote como auditado.
- O próximo bloco de implementação é o adapter QAPI para FGV e Cesgranrio. A integração com monitores continua fora desta fase.

## Pendência de importação — 2026-10-07

- A importação da banca `CESPE CEBRASPE`, matéria `Língua Portuguesa`, está incompleta por limite de créditos da Quest API.
- Já foram persistidas **2.397 questões** em `public.question_bank_items`, sem rejeições registradas durante as páginas concluídas.
- A Quest API informou aproximadamente **5.737 questões** disponíveis para esse recorte; restam cerca de **3.340**.
- A continuação deve iniciar pela página **25**, somente para Português, para não gastar créditos em matérias fora do escopo:

  ```bash
  cd backend
  npm run import:questapi-cebraspe -- --only-subject "Língua Portuguesa" --resume-subject "Língua Portuguesa" --resume-page 25
  ```

- O importador usa `upsert` por `(provider, provider_question_id)`. Retomar na página indicada evita chamadas e atualizações desnecessárias; executar desde a página 1 não cria duplicatas.

## Global Constraints

- Todos os provedores salvam na mesma tabela e no mesmo formato interno.
- A primeira fase não altera a tabela `questions` nem o fluxo atual do professor/aluno.
- `subject` e `topic` são obrigatórios; `subtopic` e `subsubtopic` são opcionais e aceitam `NULL`.
- A IA atual continua recebendo matéria e tópico; não alterar prompts nesta fase.
- Nenhuma questão importada recebe `teacherId`, `monitorId`, `subjectId` ou `topicId` de monitor nesta fase.
- Chaves de API ficam somente no backend, em variáveis de ambiente; nunca em frontend, fixtures, migrations, commits ou logs.
- O payload externo bruto deve ser preservado sem credenciais.
- Repetir a mesma importação não pode criar duplicatas.
- Falhas de uma questão não podem apagar itens já persistidos.
- A execução real deve respeitar autenticação, limites e termos de uso de cada provedor.
- Imagens externas serão preservadas como URLs na primeira fase; download para Storage fica fora do escopo.

## Contexto do código atual

A tabela atual `questions` está ligada diretamente a `Teacher`, `Monitor`, `MonitorSubject`, `MonitorTopic`, tentativas, desafios e simulados. Ela é adequada ao conteúdo já organizado por um professor, mas não ao acervo central da plataforma. Portanto, criar uma tabela nova e manter o fluxo atual intacto.

Arquivos para consultar durante a implementação:

- `backend/prisma/schema.prisma`: modelos e enums atuais.
- `backend/src/repositories/content-review.repository.ts`: criação e revisão de questões do professor.
- `backend/src/repositories/document.repository.ts`: padrão de persistência e validação.
- `backend/src/models/content-review.model.ts`: padrão de schemas Zod.
- `backend/src/worker/services/question-extraction.service.ts`: pipeline existente de questões.
- `backend/package.json`: comandos de testes.

Referências dos provedores:

- EnemHub: `https://platform.enemhub.com.br/`, endpoint `GET /v1/enem/questions`.
- QAPI: `https://qapi.otunac.com/`, filtros de banca, matéria, página e tamanho.

## Contrato interno comum

Todos os adapters devem retornar este formato antes do repositório:

```ts
export type QuestionBankProvider = 'ENEMHUB' | 'QAPI';
export type QuestionBankExamType = 'ENEM' | 'CONCURSO';

export type NormalizedQuestionBankItem = {
  provider: QuestionBankProvider;
  providerQuestionId: string;
  externalId: string | null;
  examType: QuestionBankExamType;
  examName: string;
  board: string | null;
  institution: string | null;
  examYear: number | null;
  subject: string;
  topic: string;
  subtopic: string | null;
  subsubtopic: string | null;
  taxonomyPath: string[];
  statementHtml: string;
  statementText: string;
  alternatives: Array<{
    providerId: string | null;
    label: string;
    text: string;
    isCorrect: boolean;
  }>;
  correctAnswer: string;
  difficulty: string | null;
  sourceUrl: string | null;
  imageUrls: string[];
  rawPayload: unknown;
  sourceFetchedAt: Date;
};

export type NormalizedProviderPage = {
  items: NormalizedQuestionBankItem[];
  page: number;
  pageSize: number;
  total: number | null;
  hasNextPage: boolean;
};

export type ProviderPageInput = {
  page: number;
  pageSize: number;
  year?: number;
  board?: string;
  subject?: string;
  subjectId?: string;
};

export type PageImportReport = {
  page: number;
  received: number;
  created: number;
  updated: number;
  rejected: number;
  failed: number;
};

export type QuestionBankImportReport = {
  provider: QuestionBankProvider;
  pagesProcessed: number;
  itemsReceived: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsRejected: number;
  itemsFailed: number;
  lastPage: number;
};

export type ImportRun = {
  id: string;
  provider: QuestionBankProvider;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  currentPage: number;
};

export type QuestionBankQualityReport = {
  provider: QuestionBankProvider | 'ALL';
  total: number;
  byExam: Record<string, number>;
  byBoard: Record<string, number>;
  bySubject: Record<string, number>;
  byTopic: Record<string, number>;
  withoutSubtopic: number;
  withoutSubsubtopic: number;
  rejected: number;
  duplicateContentHashes: number;
};
```

Regras:

- `subject` e `topic` nunca podem chegar vazios ao repositório.
- `subtopic` e `subsubtopic` podem ser `null`.
- A taxonomia tem no máximo três camadas após a matéria: o primeiro nível vai para `topic`, o segundo para `subtopic` e o restante, quando existir, é preservado em `subsubtopic` usando ` > `.
- `taxonomyPath` preserva o caminho detalhado da fonte.
- No EnemHub, `subject.id` é tratado como ID da classificação do provedor, não como ID de matéria interna.
- `statementHtml` preserva conteúdo rico sanitizável; `statementText` serve para hash, busca e processamento.
- Alternativas usam `label` no formato `A`, `B`, `C`, `D`, `E`.
- `correctAnswer` contém a mesma label da alternativa correta.

## Modelo de dados da tabela central

Criar `question_bank_items`, separada de `questions`:

```text
id UUID primary key
provider text not null
provider_question_id text not null
external_id text null
exam_type text not null
exam_name text not null
board text null
institution text null
exam_year integer null
subject text not null
topic text not null
subtopic text null
subsubtopic text null
taxonomy_path jsonb not null
statement_html text not null
statement_text text not null
alternatives jsonb not null
correct_answer text not null
difficulty text null
source_url text null
image_urls jsonb not null
raw_payload jsonb not null
content_hash text not null
explanation text null
explanation_status text not null
status text not null
source_fetched_at timestamptz not null
created_at timestamptz not null
updated_at timestamptz not null
```

Regras e índices:

- unicidade em `(provider, provider_question_id)`;
- índices em `(exam_type, board, subject, topic, status)`, `(provider, exam_year)` e `content_hash`;
- `subject` e `topic` com `NOT NULL`;
- `subtopic` e `subsubtopic` nullable;
- JSONB para taxonomia, alternativas, imagens e payload original;
- `status` separado de `explanation_status`.

Estados:

```text
QuestionBankItemStatus: IMPORTED | VALIDATED | READY | REJECTED
QuestionBankExplanationStatus: NOT_REQUESTED | QUEUED | PROCESSING | GENERATED | FAILED
```

`READY` significa que estrutura, gabarito, matéria e tópico passaram na validação. Não exige explicação gerada.

## Fora do escopo

- Não inserir itens na tabela atual `questions`.
- Não criar ainda `monitor_question_links`.
- Não alterar onboarding, `MonitorSubject`, `MonitorTopic` ou prompts da IA.
- Não gerar explicação dentro da chamada síncrona de importação.
- Não baixar imagens para o Supabase Storage.
- Não criar endpoints públicos para alunos.

### Task 1: Definir contrato e fixtures dos provedores

**Files:**
- Create: `backend/src/modules/question-bank/models/question-bank.model.ts`
- Create: `backend/src/modules/question-bank/providers/enemhub/enemhub.fixtures.ts`
- Create: `backend/src/modules/question-bank/providers/qapi/qapi.fixtures.ts`
- Test: `backend/src/modules/question-bank/models/__tests__/question-bank.model.test.ts`

**Interfaces:** Produz `NormalizedQuestionBankItem`, schemas Zod e fixtures sem segredos.

- [x] **Step 1: Escrever testes que rejeitam subject/topic vazios e aceitam subtopic/subsubtopic nulos.**
- [x] **Step 2: Testar alternativa correta, `taxonomyPath`, imagens vazias e payload JSON.**
- [x] **Step 3: Rodar `cd backend && node --import tsx --test src/modules/question-bank/models/__tests__/question-bank.model.test.ts`; esperar FAIL por módulo inexistente.**
- [x] **Step 4: Implementar tipos, enums locais e schemas Zod explícitos; não usar schema genérico como contrato final.**
- [x] **Step 5: Adicionar fixture EnemHub com `subject.name`, `subject.area`, `correctAlternative` e alternativas; adicionar fixture QAPI com `materia`, `assunto`, banca e gabarito.**
- [x] **Step 6: Rodar o teste novamente; esperar PASS.**
- [ ] **Step 7: Commitar com `git add backend/src/modules/question-bank && git commit -m "feat: define question bank import contract"`.**

### Task 2: Criar migration, Prisma model e repositório central

**Files:**
- Create: `backend/supabase/migrations/20260910120000_create_question_bank_items.sql`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/modules/question-bank/repositories/question-bank.repository.ts`
- Create: `backend/src/modules/question-bank/repositories/prisma-question-bank.persistence.ts`
- Test: `backend/src/modules/question-bank/repositories/__tests__/question-bank.repository.test.ts`

**Interfaces:**

- `upsertNormalized(input: NormalizedQuestionBankItem)`
- `findByProviderQuestionId(provider, providerQuestionId)`
- `countByProvider(provider)`
- `listImportFailures(provider, limit)`

- [x] **Step 1: Escrever testes para criação, atualização idempotente, subtopic/subsubtopic nulos e isolamento por provider.**
- [x] **Step 2: Rodar o teste focado e confirmar FAIL.**
- [x] **Step 3: Criar a migration sem alterar `questions`; incluir constraints, índices e timestamps.**
- [x] **Step 4: Adicionar `QuestionBankItem` ao Prisma com `@@map("question_bank_items")` e campos snake_case mapeados.**
- [x] **Step 5: Implementar upsert pela chave `provider + providerQuestionId`; atualizar payload e normalização sem duplicar.**
- [x] **Step 6: Rodar `cd backend && npx prisma validate` e os testes do repositório; esperar PASS.**
- [ ] **Step 7: Commitar com `git add backend/prisma backend/supabase/migrations backend/src/modules/question-bank/repositories && git commit -m "feat: add central question bank table"`.**

### Task 3: Implementar normalização comum de conteúdo e taxonomia

**Files:**
- Create: `backend/src/modules/question-bank/services/question-bank-content.service.ts`
- Test: `backend/src/modules/question-bank/services/__tests__/question-bank-content.service.test.ts`

**Interfaces:**

- `normalizeDifficulty(value): string | null`
- `splitTaxonomyPath(value): string[]`
- `extractImageUrls(html): string[]`
- `sanitizeQuestionHtml(html): string`
- `htmlToPlainText(html): string`
- `computeQuestionContentHash(input): string`

- [x] **Step 1: Testar ENEM com área de dois níveis e de três níveis; preservar caminho completo em `taxonomyPath`, além de aceitar `subtopic` e `subsubtopic` nulos.**
- [x] **Step 2: Testar concurso com `materia → subject`, `assunto → topic` e `subtopic = null`, `subsubtopic = null`.**
- [x] **Step 3: Testar HTML, imagens, entidades, fórmulas textuais e remoção de scripts/handlers inseguros.**
- [x] **Step 4: Implementar normalização sem depender de Prisma ou HTTP.**
- [x] **Step 5: Garantir que o hash seja determinístico e represente somente o conteúdo normalizado, permitindo detectar duplicatas entre provedores.**
- [x] **Step 6: Rodar os dois arquivos de teste focado; esperar PASS.**
- [ ] **Step 7: Commitar com `git add backend/src/modules/question-bank/services && git commit -m "feat: normalize external question content"`.**

Mapeamento EnemHub:

```text
providerQuestionId ← id
externalId         ← externalId
examYear           ← year
examName           ← exam.name
institution        ← exam.institution
subject            ← subject.name
topic              ← primeiro segmento de subject.area
subtopic           ← segundo segmento, quando existir
subsubtopic        ← segmentos restantes unidos por ` > `, quando existirem
taxonomyPath       ← subject.area.split(' > ')
correctAnswer      ← correctAlternative
alternatives       ← alternatives[].letter/text/isCorrect
```

Mapeamento QAPI:

```text
examType     ← CONCURSO
board        ← banca
subject      ← materia
topic        ← assunto
subtopic     ← null quando não houver campo confiável
subsubtopic  ← null quando não houver campo confiável
taxonomyPath ← [assunto]
```

### Task 4: Implementar cliente e adapter EnemHub

**Files:**
- Create: `backend/src/modules/question-bank/providers/enemhub/enemhub.client.ts`
- Create: `backend/src/modules/question-bank/providers/enemhub/enemhub.adapter.ts`
- Create: `backend/src/scripts/import-enemhub-math.ts` (CLI parametrizada por matéria)
- Test: `backend/src/modules/question-bank/providers/enemhub/__tests__/enemhub.client.test.ts`
- Test: `backend/src/modules/question-bank/providers/enemhub/__tests__/enemhub.adapter.test.ts`
- Modify: `backend/.env.example`

**Interfaces:**

- `EnemHubPage` é o tipo interno do payload bruto do cliente, definido no próprio `enemhub.client.ts`.
- `listQuestions(input: { year?: number; subjectId?: string; page: number; limit: number }): Promise<EnemHubPage>`
- `fetchPage(input: ProviderPageInput): Promise<NormalizedProviderPage>`

- [ ] **Step 1: Completar testes de header `X-API-Key`, paginação, timeout, JSON inválido, 401/403 e 429 com `fetch` mockado.**
- [x] **Step 2: Testar que o adapter produz o contrato comum sem importar Prisma.**
- [ ] **Step 3: Adicionar no `.env.example`: `ENEMHUB_API_BASE_URL`, `ENEMHUB_API_KEY` e `ENEMHUB_PAGE_SIZE`.**
- [x] **Step 4: Implementar cliente com timeout, retry limitado para falhas transitórias e respeito a `Retry-After`; nunca retry infinito.**
- [x] **Step 5: Implementar paginação até `meta.total` ou página vazia.**
- [x] **Step 6: Rodar testes focados e esperar PASS.**
- [ ] **Step 7: Commitar com `git add backend/src/modules/question-bank/providers/enemhub backend/.env.example && git commit -m "feat: add EnemHub question adapter"`.**

Implementação operacional já disponível:

```bash
cd backend
npm run import:enemhub-subject -- --subject Matemática
npm run import:enemhub-subject -- --subject Física
npm run import:enemhub-subject -- --subject Biologia
npm run import:enemhub-subject -- --subject Química
```

O importador usa `--dry-run`, `--max-pages` e `--year`, filtra a matéria pelo payload recebido e continua seguro para reexecução por causa do upsert.

### Task 5: Implementar cliente e adapter QAPI para FGV e Cesgranrio

**Files:**
- Create: `backend/src/modules/question-bank/providers/qapi/qapi.client.ts`
- Create: `backend/src/modules/question-bank/providers/qapi/qapi.adapter.ts`
- Test: `backend/src/modules/question-bank/providers/qapi/__tests__/qapi.client.test.ts`
- Test: `backend/src/modules/question-bank/providers/qapi/__tests__/qapi.adapter.test.ts`
- Modify: `backend/.env.example`

**Interfaces:**

- `QapiPage` é o tipo interno do payload bruto do cliente, definido no próprio `qapi.client.ts`.
- `listQuestions(input: { board?: string; subject?: string; page: number; size: number }): Promise<QapiPage>`
- `fetchPage(input: ProviderPageInput): Promise<NormalizedProviderPage>`

- [ ] **Step 1: Ler `https://qapi.otunac.com/` e registrar no teste o contrato real de autenticação, paginação e campos da questão.**
- [ ] **Step 2: Escrever fixtures e testes para banca FGV, banca CESGRANRIO, matéria, assunto e ausência de subtópico.**
- [ ] **Step 3: Adicionar `QAPI_BASE_URL`, `QAPI_API_KEY`, `QAPI_ACCESS_TOKEN` e `QAPI_PAGE_SIZE` no `.env.example`; usar somente o mecanismo exigido pela documentação atual.**
- [ ] **Step 4: Implementar um único adapter parametrizado por banca; não duplicar código para FGV e Cesgranrio.**
- [ ] **Step 5: Validar que matéria e assunto ausentes não geram item READY.**
- [ ] **Step 6: Rodar testes focados e esperar PASS.**
- [ ] **Step 7: Commitar com `git add backend/src/modules/question-bank/providers/qapi backend/.env.example && git commit -m "feat: add QAPI question adapter"`.**

### Task 6: Generalizar porta de provider, orquestrador e CLI de importação

O importador EnemHub parametrizado por matéria já cobre a operação atual. Esta tarefa permanece para substituir o script específico por uma CLI única de todos os providers, incluindo dry-run, retomada e filtros comuns.

**Files:**
- Create: `backend/src/modules/question-bank/services/question-bank-provider.port.ts`
- Create: `backend/src/modules/question-bank/services/question-bank-import.service.ts`
- Test: `backend/src/modules/question-bank/services/__tests__/question-bank-import.service.test.ts`
- Create: `backend/src/scripts/import-question-bank.ts`

**Interfaces:**

- `QuestionBankProviderPort.fetchPage(input: ProviderPageInput): Promise<NormalizedProviderPage>`
- `QuestionBankImportService.import(input: QuestionBankImportInput): Promise<QuestionBankImportReport>`
- `QuestionBankImportService.importPage(input: QuestionBankImportInput): Promise<PageImportReport>`

Entrada da importação:

```ts
export type QuestionBankImportInput = {
  provider: 'ENEMHUB' | 'QAPI';
  year?: number;
  board?: string;
  subject?: string;
  startPage?: number;
  maxPages?: number;
  dryRun?: boolean;
};
```

- [ ] **Step 1: Escrever testes com provider fake para duas páginas, repetição, dry-run, rejeição de item e limite de páginas.**
- [ ] **Step 2: Implementar a porta sem campos específicos dos provedores.**
- [ ] **Step 3: Implementar o fluxo item a item: normalizar, validar, calcular hash, fazer upsert, contar e continuar.**
- [ ] **Step 4: Implementar relatório com páginas, recebidas, criadas, atualizadas, rejeitadas e falhas.**
- [ ] **Step 5: Implementar CLI com exemplos:**

```bash
cd backend
node --import tsx src/scripts/import-question-bank.ts --provider ENEMHUB --year 2023 --dry-run --max-pages 1
node --import tsx src/scripts/import-question-bank.ts --provider QAPI --board FGV --dry-run --max-pages 1
node --import tsx src/scripts/import-question-bank.ts --provider QAPI --board CESGRANRIO --dry-run --max-pages 1
```

- [ ] **Step 6: Exigir filtro ou limite explícito no primeiro uso não-dry-run; nunca imprimir segredos.**
- [ ] **Step 7: Rodar testes focados e commit com `git add backend/src/modules/question-bank backend/src/scripts/import-question-bank.ts && git commit -m "feat: orchestrate question bank imports"`.**

### Task 7: Adicionar checkpoint, retomada e observabilidade

**Files:**
- Create: `backend/supabase/migrations/20260910121000_create_question_bank_import_runs.sql`
- Create: `backend/src/modules/question-bank/models/question-bank-import-run.model.ts`
- Create: `backend/src/modules/question-bank/repositories/question-bank-import-run.repository.ts`
- Test: `backend/src/modules/question-bank/repositories/__tests__/question-bank-import-run.repository.test.ts`
- Modify: `backend/src/modules/question-bank/services/question-bank-import.service.ts`

**Interfaces:**

- `start(input): Promise<ImportRun>`
- `checkpoint(runId, input): Promise<void>`
- `finish(runId, input): Promise<void>`
- `fail(runId, input): Promise<void>`

- [ ] **Step 1: Testar criação da execução, checkpoint, retomada, falha e concorrência do mesmo filtro.**
- [ ] **Step 2: Criar `question_bank_import_runs` com provider, snapshot de filtros, status, página atual, contadores e timestamps.**
- [ ] **Step 3: Integrar checkpoint por página e retomada com `--start-page` ou `runId`; repetir a última página é seguro por causa do upsert.**
- [ ] **Step 4: Emitir eventos `monitor.question_bank_import_started`, `monitor.question_bank_import_page_completed`, `monitor.question_bank_item_rejected`, `monitor.question_bank_import_completed` e `monitor.question_bank_import_failed`.**
- [ ] **Step 5: Garantir que logs não contenham Authorization, API key, payload completo ou enunciado inteiro.**
- [ ] **Step 6: Rodar testes de checkpoint e importação; esperar PASS; commit com `git add backend/src/modules/question-bank backend/supabase/migrations && git commit -m "feat: checkpoint question bank imports"`.**

### Task 8: Relatório de qualidade e execução controlada

**Files:**
- Create: `backend/src/scripts/report-question-bank.ts`
- Test: `backend/src/modules/question-bank/services/__tests__/question-bank-quality-report.test.ts`
- Create: `backend/docs/question-bank-import-runbook.md`

**Interfaces:** `generate(input): Promise<QuestionBankQualityReport>` e CLI somente leitura para relatórios.

- [ ] **Step 1: Testar totais por provider, exame, banca, matéria, tópico, status e subtópico.**
- [ ] **Step 2: Testar relatório de duplicidades por chave do provider e `contentHash`.**
- [ ] **Step 3: Testar contagem de itens com HTML que referencia imagem, alternativas inválidas, gabarito ausente e questões rejeitadas.**
- [ ] **Step 4: Implementar relatório JSON sem alterar dados.**
- [ ] **Step 5: Executar dry-run de uma página do EnemHub e uma página da QAPI para FGV e Cesgranrio.**
- [ ] **Step 6: Conferir manualmente HTML, texto, imagens, alternativas, gabarito, matéria, tópico, subtopic/subsubtopic nulos quando aplicável e ausência de segredos nos logs.**
- [ ] **Step 7: Importar o lote aprovado usando filtros e checkpoints; registrar os `runId` e relatórios no runbook.**
- [ ] **Step 8: Rodar os testes focados e commitar com `git add backend/src/scripts/report-question-bank.ts backend/src/modules/question-bank/services/__tests__/question-bank-quality-report.test.ts backend/docs/question-bank-import-runbook.md && git commit -m "docs: add question bank import runbook"`.**

## Critérios de aceite

- EnemHub e QAPI persistem na mesma `question_bank_items`.
- FGV e Cesgranrio usam o mesmo adapter QAPI parametrizado.
- `subject` e `topic` são obrigatórios; `subtopic` e `subsubtopic` aceitam `NULL`.
- Repetir uma importação não cria duplicatas.
- Payload, classificação, gabarito e URLs de imagem são preservados.
- Questões inválidas são rejeitadas com motivo rastreável.
- Importações podem ser retomadas.
- A tabela `questions`, o professor, o monitor e a IA atual permanecem sem alteração.
- Existe relatório de qualidade antes de qualquer integração com monitores.

## Próxima fase separada

Após validar o acervo, criar uma especificação própria para relacionar `question_bank_items` a `Monitor`, `MonitorSubject` e `MonitorTopic`. Essa fase decidirá o vínculo sem duplicar enunciado, alternativas, gabarito ou explicação e integrará prática, simulados e aproveitamento.
