# Otimização do carregamento do workspace do monitor

**Data:** 29/09/2026  
**Status:** especificação aprovada para planejamento e implementação  
**Escopo:** área do professor, rota `/professor/monitores/:monitorId`, frontend Next.js/React e endpoints Fastify/Prisma relacionados ao workspace.

## 1. Objetivo

Reduzir o tempo percebido e o custo real de carregamento do workspace de um monitor, preservando a experiência atual de edição, revisão de questões, flashcards, documentos, matérias, tópicos e configurações.

Ao abrir um monitor, o professor deve conseguir visualizar rapidamente o shell da página, o cabeçalho, a estrutura do monitor e a aba inicial. Dados volumosos devem ser carregados de forma incremental, com loading localizado, retry e estados vazios explícitos.

O carregamento não deve ficar bloqueado porque uma coleção secundária está lenta ou indisponível.

## 2. Sintomas e evidências atuais

`MonitorWorkspace` dispara, no mesmo efeito inicial, cinco requisições:

- `GET /api/v1/monitors/:monitorId`;
- `GET /api/v1/monitors/:monitorId/questions`;
- `GET /api/v1/monitors/:monitorId/flashcards`;
- `GET /api/v1/monitors/:monitorId/documents`;
- `GET /api/v1/teachers/me`.

O layout já executa `GET /api/v1/teachers/me` no `TeacherSessionGuard`. Portanto, o perfil do professor é buscado novamente no workspace.

O endpoint do monitor usa uma árvore profunda com `teacher: true`, matérias, tópicos, subtópicos, subsubtópicos, seleções do banco de questões, contagens e questões reportadas. Os endpoints de revisão carregam as coleções completas, sem paginação, e cada um localiza o professor separadamente.

Em desenvolvimento, os efeitos podem ser executados novamente pelo React Strict Mode, ampliando a quantidade de chamadas observada no navegador.

O backend atual não registra duração individual para esses quatro endpoints. Portanto, antes de otimizar uma consulta específica, a implementação deve adicionar métricas suficientes para separar:

1. tempo de autenticação e espera por conexão;
2. tempo de consulta Prisma/Postgres;
3. serialização e tamanho da resposta;
4. tempo de rede até o frontend;
5. tempo de renderização e transformação dos dados no cliente.

## 3. Metas

As metas devem ser medidas em ambiente local e em produção com o mesmo conjunto de dados, usando percentis quando houver amostra suficiente.

### 3.1 Metas de carregamento

- O shell visual do workspace deve aparecer sem aguardar questões, flashcards ou documentos.
- O monitor essencial deve estar disponível após uma única chamada de resumo/detalhe leve.
- Meta local, banco aquecido: `p95 <= 800 ms` para o detalhe essencial do monitor.
- Meta de produção, banco aquecido: `p95 <= 1.5 s` para o detalhe essencial do monitor.
- A primeira aba deve exibir skeleton localizado imediatamente e conteúdo assim que sua própria requisição terminar.
- Uma falha em uma coleção secundária não pode apagar o monitor nem impedir a navegação entre as outras abas.
- Ao trocar de aba, dados já carregados devem ser reutilizados sem nova requisição desnecessária.

### 3.2 Metas de eficiência

- Não repetir `/teachers/me` quando o perfil já estiver disponível no contexto do layout.
- Não carregar questões, flashcards e documentos completos antes de o professor solicitar a aba correspondente, salvo a aba inicial definida pelo produto.
- Toda coleção grande deve ter paginação, limite máximo e ordenação determinística.
- A resposta do detalhe do monitor deve conter somente campos necessários para o shell e a estrutura.
- Requisições obsoletas após troca de rota ou desmontagem devem ser abortadas ou ignoradas sem atualizar estado incorreto.

## 4. Fora de escopo

- Reescrever o editor inteiro do monitor.
- Alterar regras de autorização ou permitir acesso a monitores de outro professor.
- Alterar o modelo pedagógico de questões, flashcards ou documentos.
- Introduzir uma biblioteca de gerenciamento de dados sem avaliar primeiro os hooks e serviços existentes.
- Remover o React Strict Mode como solução permanente.
- Fazer cache global persistente de conteúdo editável sem política de invalidação.
- Alterar o fluxo de upload e processamento assíncrono de documentos, exceto para refletir o status corretamente na aba de conhecimento.

## 5. Arquitetura-alvo

```text
TeacherSessionGuard / TeacherContext
        |
        v
MonitorWorkspaceShell
  ├─ detalhe essencial + estrutura
  ├─ aba Conhecimento  -> documentos paginados sob demanda
  ├─ aba Questões      -> questões paginadas sob demanda
  ├─ aba Flashcards    -> flashcards paginados sob demanda
  └─ aba Configurações -> dados já presentes; mutations com refresh seletivo
```

O carregamento será dividido em três níveis:

1. **Sessão compartilhada:** o layout valida a sessão e disponibiliza o perfil do professor para os filhos.
2. **Bootstrap leve do monitor:** uma resposta pequena entrega identidade, nome, descrição, imagem, status, matérias/tópicos e contagens resumidas.
3. **Conteúdo por aba:** cada coleção é consultada apenas quando necessária, com paginação e estado independente.

A implementação poderá manter endpoints separados se isso reduzir risco, mas deve preservar uma função de bootstrap única no frontend e evitar a barreira de `Promise.all` com todas as coleções. Um endpoint agregado de bootstrap é preferível quando permitir reduzir autenticação repetida e round trips sem retornar dados volumosos.

## 6. Contratos de API

### 6.1 Bootstrap do monitor

Opção preferencial:

```http
GET /api/v1/monitors/:monitorId/workspace
```

Resposta:

```json
{
  "data": {
    "monitor": {
      "id": "uuid",
      "name": "Monitor de Matemática",
      "description": "...",
      "detailedDescription": null,
      "avatarUrl": null,
      "status": "PUBLISHED",
      "allowPublishWithoutPaymentAccount": false,
      "subjects": [
        {
          "id": "uuid",
          "name": "Matemática",
          "position": 0,
          "topics": [
            { "id": "uuid", "name": "Funções", "position": 0, "subtopics": [] }
          ]
        }
      ],
      "counts": {
        "questions": 120,
        "flashcards": 40,
        "documents": 3,
        "reportedQuestions": 2
      }
    },
    "teacher": {
      "id": "uuid",
      "fullName": "João Victor",
      "avatarUrl": null
    }
  }
}
```

Regras:

- autorização por `request.user.id` e vínculo `monitor.teacher.userId`;
- nenhum campo completo de `teacher` deve ser exposto por conveniência;
- matérias, tópicos e subestruturas devem usar `select` explícito;
- contagens devem ser feitas pelo banco ou por consulta agregada, sem carregar as coleções para contar;
- a resposta não inclui questões, alternativas, explicações, flashcards, chunks ou conteúdo de documentos.

Se o endpoint agregado não for adotado, `GET /monitors/:monitorId` deve receber o mesmo contrato enxuto e o frontend deve usar a chamada existente como bootstrap.

### 6.2 Coleções paginadas

As três rotas devem aceitar:

```http
GET /api/v1/monitors/:monitorId/questions?page=1&pageSize=25&status=PENDING_REVIEW
GET /api/v1/monitors/:monitorId/flashcards?page=1&pageSize=25&status=PENDING_REVIEW
GET /api/v1/monitors/:monitorId/documents?page=1&pageSize=20
```

Contrato comum:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "total": 120,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

Regras:

- `pageSize` default pequeno e limitado por servidor; nunca aceitar valor ilimitado;
- ordenação determinística por `createdAt DESC, id DESC`;
- filtro de status deve ser validado por schema;
- `total` pode ser omitido ou substituído por `hasNextPage` se a contagem se tornar cara; a escolha deve ser consistente entre as três rotas;
- filtros e página fazem parte da chave do cache local do frontend;
- payloads continuam contendo somente campos utilizados pela aba, especialmente em fontes de questões e flashcards.

### 6.3 Observabilidade do backend

Cada endpoint deve emitir eventos estruturados com o mesmo `requestId`:

- `monitor.workspace_request_started`;
- `monitor.workspace_request_completed`;
- `monitor.workspace_request_failed`.

Campos mínimos:

```text
route, monitorId, userId, page, pageSize, statusFilter,
durationMs, dbDurationMs, responseBytes, resultCount, totalCount,
cacheHit, errorType
```

Nunca registrar conteúdo de questão, alternativas, documentos, tokens ou cookies.

O tempo Prisma deve ser medido por middleware/telemetria já existente ou por marcações no repositório, sem criar logs por linha retornada.

## 7. Estado de loading e experiência da interface

### 7.1 Princípios

- Loading global somente enquanto o bootstrap essencial está pendente.
- Loading de coleção somente dentro do painel/aba correspondente.
- Skeleton preserva a geometria final para reduzir layout shift.
- Conteúdo já carregado permanece visível durante refresh de página, filtro ou retry.
- Erro de uma aba não vira erro da página inteira.
- Toda tentativa de rede tem estado de erro com ação `Tentar novamente`.

### 7.2 Componentes

Reutilizar os componentes de loading existentes antes de criar novos. Onde já houver apenas `LoaderCircle` isolado, extrair componentes pequenos e consistentes para:

- `MonitorWorkspaceSkeleton`: shell, cabeçalho, sidebar e área inicial;
- `MonitorCollectionSkeleton`: tabela/lista paginada de questões, flashcards e documentos;
- `MonitorCollectionError`: mensagem curta, código interno não exposto e retry;
- `MonitorCollectionEmpty`: estado vazio contextual, com ação de criar/enviar quando aplicável;
- `MonitorInlineRefresh`: indicador discreto quando já existe conteúdo.

Os componentes devem aceitar `aria-busy`, `aria-live` quando necessário e texto acessível em português. Spinners não devem ser a única indicação de progresso.

### 7.3 Estados por fase

| Fase | Estado | Comportamento |
|---|---|---|
| Bootstrap | `loading` | mostra `MonitorWorkspaceSkeleton`; não dispara coleções volumosas |
| Bootstrap | `ready` | renderiza shell e aba inicial |
| Bootstrap | `error` | mostra erro de página com retry; não exibe conteúdo parcial inconsistente |
| Coleção | `idle` | aba ainda não solicitada |
| Coleção | `loading` | skeleton somente da aba |
| Coleção | `refreshing` | mantém dados atuais e mostra indicador discreto |
| Coleção | `ready` | lista, paginação ou empty state |
| Coleção | `error` | mantém dados anteriores, se existirem, e oferece retry |

Ao mudar de aba, o estado `idle` deve iniciar a busca. Ao voltar para uma aba já carregada, reutilizar os dados enquanto não houver mutation ou invalidação explícita.

## 8. Frontend e controle de requisições

### 8.1 Contexto de sessão

`TeacherSessionGuard` deve expor o resultado do perfil por contexto/provider, ou o layout deve passar os dados para o workspace. `MonitorWorkspace` não deve chamar `TeacherProfileService.getMyProfile()` se o perfil já estiver validado e disponível.

O guard continua responsável por redirecionar sessão inválida. O workspace não deve duplicar essa responsabilidade.

### 8.2 Serviço de dados

Criar uma camada de consulta do workspace com funções tipadas:

```ts
getMonitorWorkspace(monitorId: string, signal?: AbortSignal): Promise<MonitorWorkspaceData>
listQuestions(monitorId: string, query: CollectionQuery, signal?: AbortSignal): Promise<PaginatedResult<QuestionItem>>
listFlashcards(monitorId: string, query: CollectionQuery, signal?: AbortSignal): Promise<PaginatedResult<FlashcardItem>>
listDocuments(monitorId: string, query: CollectionQuery, signal?: AbortSignal): Promise<PaginatedResult<DocumentItem>>
```

Regras:

- normalizar respostas no serviço, não dentro de um grande render/effect;
- aceitar `AbortSignal`;
- deduplicar chamadas idênticas em voo;
- não iniciar uma segunda chamada apenas porque o componente foi renderizado novamente;
- tratar `AbortError` como encerramento normal, sem toast e sem estado de erro;
- invalidar somente a coleção afetada após criar, editar, aprovar, rejeitar ou excluir conteúdo;
- preservar o monitor bootstrap ao recarregar uma coleção.

### 8.3 React Strict Mode

O comportamento correto não depende de desligar Strict Mode. Effects devem ser idempotentes e usar abort/deduplicação. Testes de desenvolvimento devem confirmar que uma montagem seguida de desmontagem não deixa atualização tardia nem duas chamadas efetivas para o mesmo recurso.

### 8.4 Cache local

Usar cache em memória de escopo da página ou provider, com chave composta por:

```text
monitorId + collection + page + pageSize + filters
```

O cache deve ser invalidado após mutation e ao trocar de monitor. Não persistir conteúdo sensível em `localStorage` nesta fase.

## 9. Backend e persistência

### 9.1 Detalhe enxuto

Substituir `include: this.monitorTree` no caminho de leitura inicial por `select` específico para o workspace. O `monitorTree` completo pode permanecer para mutações que exigem retorno atualizado, mas não deve ser usado no GET inicial sem necessidade.

O campo `teacher: true` deve ser substituído por `teacher.select` mínimo ou removido quando o professor já for resolvido pela autorização.

### 9.2 Consultas de coleção

Cada repositório deve:

1. resolver e validar o professor uma vez;
2. consultar a coleção com `skip/take` ou cursor consistente;
3. selecionar somente propriedades utilizadas;
4. aplicar filtros e ordenação no banco;
5. retornar metadados de paginação;
6. registrar duração e contagem.

Quando a consulta de professor se tornar comum a várias chamadas do mesmo request, não criar uma transação ou cache global artificial. A otimização deve ser feita pelo contrato de bootstrap e pela redução de chamadas no frontend.

### 9.3 Índices

Antes de criar migration, medir `EXPLAIN ANALYZE` para os filtros reais. Avaliar índices compostos alinhados às consultas paginadas, especialmente:

- `questions(monitor_id, status, created_at, id)`;
- `flashcards(monitor_id, status, created_at, id)`;
- `monitor_documents(monitor_id, created_at, id)`.

Não adicionar índices apenas por intuição. Toda migration deve incluir justificativa, custo esperado e validação de plano.

## 10. Mutations e consistência

Depois de uma mutation de assunto, tópico, nome, descrição, questão, flashcard ou documento:

- atualizar o bootstrap local quando a resposta já contiver a entidade;
- caso contrário, invalidar apenas o bootstrap ou coleção necessária;
- não recarregar simultaneamente todas as coleções;
- manter o usuário na aba atual;
- mostrar loading no botão/linha afetada, não bloquear a página inteira.

Uploads de documentos continuam exibindo o estado de processamento na aba Conhecimento. O polling existente deve ser ativado somente enquanto houver documentos processando e deve cancelar o intervalo ao sair da página.

## 11. Testes obrigatórios

### 11.1 Frontend

- workspace renderiza skeleton sem esperar questões, flashcards e documentos;
- bootstrap bem-sucedido renderiza cabeçalho e estrutura;
- abrir a aba de questões faz uma única requisição paginada;
- voltar à aba de questões reutiliza cache;
- erro em questões não remove monitor nem impede abrir documentos;
- retry da coleção refaz somente a coleção;
- troca rápida de monitor não permite resposta antiga sobrescrever o novo monitor;
- `AbortError` não aparece como erro para o usuário;
- Strict Mode não gera atualizações após unmount nem duplicação efetiva de requests;
- loading inicial usa `MonitorWorkspaceSkeleton` e loading de coleção usa `MonitorCollectionSkeleton`;
- empty state, erro e loading têm atributos acessíveis básicos.

### 11.2 Backend

- professor só acessa monitor próprio;
- bootstrap não retorna questões, flashcards, documentos ou campos indevidos do professor;
- contagens do bootstrap correspondem ao banco;
- paginação respeita `pageSize` máximo;
- ordenação é estável entre páginas;
- filtro de status é validado;
- respostas incluem metadados de paginação corretos;
- endpoint continua retornando 404/403 conforme o contrato atual para monitor inexistente ou não pertencente;
- logs de duração não expõem conteúdo sensível;
- índices propostos são validados por plano de consulta antes da migration.

### 11.3 Performance

Criar uma medição reproduzível com:

- monitor pequeno;
- monitor com muitas questões/flashcards;
- monitor com documentos em processamento;
- banco aquecido e primeira conexão;
- Strict Mode habilitado.

Registrar para cada cenário: número de requests, duração de cada endpoint, bytes de resposta, tempo até bootstrap, tempo até primeira aba útil e memória/CPU quando disponível.

## 12. Critérios de aceite

1. Abrir a rota não espera o carregamento completo das três coleções para mostrar o workspace.
2. `/teachers/me` não é chamado pelo workspace quando o layout já fornece o perfil.
3. O GET inicial do monitor não carrega conteúdo volumoso nem o objeto completo do professor.
4. Questões, flashcards e documentos carregam sob demanda e com paginação.
5. Cada aba possui loading, empty state, erro e retry próprios.
6. Uma falha secundária não derruba a página inteira.
7. Troca de monitor/aba não permite race condition visual.
8. A quantidade de requests efetivas em desenvolvimento não aumenta por causa de Strict Mode.
9. Logs permitem identificar endpoint, banco, serialização e tamanho de resposta.
10. Testes frontend/backend e typecheck passam.
11. A medição antes/depois demonstra redução do tempo até o conteúdo útil e do volume inicial transferido.

## 13. Sequenciamento recomendado

### Fase 1 — Medir e proteger comportamento

- adicionar métricas de duração e tamanho;
- capturar waterfall atual;
- cobrir bootstrap, erros, abort e Strict Mode;
- confirmar componentes de loading existentes que podem ser reutilizados.

### Fase 2 — Separar carregamento no frontend

- remover busca duplicada do perfil;
- introduzir estados por fase e por coleção;
- carregar conteúdo sob demanda;
- adicionar abort/deduplicação/cache em memória.

### Fase 3 — Enxugar contratos do backend

- criar ou adaptar bootstrap leve;
- adicionar paginação e selects mínimos;
- validar autorização e contagens;
- medir novamente sem migration inicialmente.

### Fase 4 — Banco e acabamento

- analisar planos de consulta;
- criar somente índices comprovados;
- revisar payloads e acessibilidade;
- executar testes de performance e comparar metas.

## 14. Decisões em aberto para o plano de implementação

- escolher entre adaptar `GET /monitors/:monitorId` ou criar `GET /monitors/:monitorId/workspace`; a escolha deve considerar compatibilidade com consumidores atuais;
- definir se a paginação usará página/offset ou cursor; página/offset é aceitável para a primeira entrega se o volume medido não exigir cursor;
- confirmar quais componentes de loading existentes serão extraídos antes de criar novos;
- definir o limite inicial de `pageSize` por coleção com base nos payloads medidos.

Essas decisões não alteram o objetivo nem os critérios de aceite e devem ser fechadas no plano de implementação, antes do código.
