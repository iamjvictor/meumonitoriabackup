# Autenticação e proteção de rotas

## Visão geral

O sistema separa duas responsabilidades:

```text
Autenticação → identifica o usuário
Autorização  → verifica o que esse usuário pode acessar
```

Estar autenticado não significa ter acesso a todos os monitores.

## Autenticação HTTP

O backend utiliza `authMiddleware`, localizado em:

```text
backend/src/middleware/auth.middleware.ts
```

O middleware:

1. lê o token `Bearer` do header `Authorization` ou o cookie `mm_access_token`;
2. rejeita a requisição sem token com `401 UNAUTHENTICATED`;
3. valida a sessão com o provedor de autenticação;
4. utiliza cache temporário em memória para sessões já validadas;
5. adiciona os dados do usuário em `request.user`.

O middleware responde apenas à pergunta: “quem é este usuário?”. Ele não valida assinatura ou matrícula em um monitor.

## Rotas protegidas atuais

As rotas protegidas utilizam `authMiddleware` no limite do próprio módulo:

| Rota | Autenticação | Autorização adicional |
|---|---|---|
| `GET /api/v1/session` | Obrigatória | Não aplicável; compõe dados de professor/aluno |
| `PUT /api/v1/student/profile` | Obrigatória | Não; o usuário altera o próprio perfil |
| `GET /api/v1/student/flashcards/random` | Obrigatória | Monitor precisa estar acessível ao usuário |
| `POST /api/v1/student/flashcards/:flashcardId/review` | Obrigatória | Acesso ao monitor do flashcard |
| `POST /api/v1/student/monitors/:monitorId/cancel` | Obrigatória | Opera sobre o vínculo do próprio aluno |
| Rotas de chat | Obrigatória | Usuário, monitor e matéria precisam formar escopo autorizado |

O antigo arquivo `backend/src/routes/protected.routes.ts` continua existindo apenas para a rota transversal `/session`. Perfil, acesso e flashcards foram extraídos para módulos verticais.

## Autorização de monitores

A autorização de acesso a monitor está em:

```text
backend/src/modules/student-access/
```

O `StudentAccessService` considera o monitor acessível quando pelo menos uma destas condições é verdadeira:

- existe assinatura ativa do aluno;
- existe matrícula ativa do aluno;
- o usuário autenticado é proprietário/professor do monitor.

Os repositórios Prisma ficam no adapter:

```text
student-access.repository.ts
```

As rotas não consultam Prisma diretamente. Elas recebem a identidade autenticada, chamam o controller/serviço e traduzem o resultado para HTTP.

## Fluxo de flashcards

```text
authMiddleware
   ↓
StudentFlashcardsRoutes
   ↓
StudentFlashcardsController
   ↓
StudentFlashcardsService
   ↓
StudentAccessService
   ↓
assinatura, matrícula ou propriedade do monitor
```

A revisão SRS e a seleção aleatória são executadas somente depois da autorização do monitor.

## Chat

O chat utiliza autorização própria para validar o escopo do usuário, monitor e matéria. O histórico da conversa permanece armazenado somente no Redis, conforme decisão atual do projeto.

## Pendência conhecida: registro interno do aluno

Um usuário pode estar autenticado no provedor de autenticação e ainda não possuir registro correspondente na tabela `student` do Prisma.

Anteriormente, algumas rotas de flashcards criavam esse registro automaticamente:

```text
usuário autenticado existe
        ↓
registro student não existe
        ↓
rota cria o perfil mínimo no Prisma
```

Após a modularização, o endpoint de perfil utiliza `upsert`, mas os módulos de acesso/flashcards atualmente podem retornar `STUDENT_NOT_FOUND` quando o registro interno não existe.

### Tratamento futuro

- [ ] Decidir se a criação automática deve ser preservada.
- [ ] Centralizar `get-or-create student` em um serviço de perfil/acesso.
- [ ] Evitar criação duplicada nas rotas de flashcards, chat ou monitor.
- [ ] Criar testes para usuário autenticado sem registro em `student`.
- [ ] Preservar uma resposta consistente caso a criação automática não seja permitida.

Essa pendência não altera a validação do token de autenticação; ela diz respeito apenas à sincronização entre a identidade autenticada e o perfil interno do aluno.
