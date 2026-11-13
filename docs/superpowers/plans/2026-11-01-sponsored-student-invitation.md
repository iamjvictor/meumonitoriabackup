# Convite de aluno patrocinado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emitir links seguros para vagas patrocinadas, apresentar os detalhes ao aluno e permitir criar a conta pelo convite.

**Architecture:** O backend cria tokens aleatórios de 32 bytes, armazena somente SHA-256 e os valida contra vaga paga ativa antes de expor dados ou criar conta. A página Next.js consome endpoints públicos e usa o e-mail retornado pelo servidor como campo bloqueado; o endpoint de ativação deriva o e-mail da vaga, cria a conta estudante e resgata a vaga. O envio do e-mail não faz parte desta alteração.

**Tech Stack:** Fastify, Prisma/PostgreSQL, Supabase Auth, Next.js 16 App Router, React, Vitest e Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-01-sponsored-student-invitation-design.md`

## Global Constraints

- Token deve ser aleatório de 32 bytes, valer 30 dias e ser persistido somente como hash SHA-256.
- O backend determina e-mail, professor, monitor, período e estado da vaga; nunca confiar nesses valores enviados pelo navegador.
- Só vaga `PAID_UNCLAIMED` de lote `ACTIVE` e com período vigente pode receber/resolver convite.
- A ativação cria papel `student`, vincula a vaga para o mesmo e-mail normalizado e não exige CPF ou telefone.
- O envio de e-mail está fora de escopo.
- Preservar alterações preexistentes no checkout e demais arquivos não atribuídos.

## Review Focus

- Expiração, token adulterado, token desconhecido e link reemitido: teste no caso de uso público.
- Vaga não paga, lote cancelado/revogado ou período encerrado: teste no repositório e endpoint.
- E-mail alterado no request de ativação: rejeitar campo extra; e-mail vem da vaga.
- E-mail já cadastrado: manter a vaga disponível e orientar login sem duplicar usuário.
- Reemissão e ativação repetidas/concorrentes: apenas um token ativo e um resgate; retries não duplicam conta nem acesso.

---

### Task 1: Emissão e validação de convites no backend

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202611010002_sponsored_seat_invitations/migration.sql`
- Create: `backend/src/modules/payments/application/commands/sponsored-seat-invitation.use-case.ts`
- Create: `backend/src/modules/payments/infrastructure/persistence/sponsored-seat-invitation.repository.ts`
- Create: `backend/src/modules/payments/http/sponsored-seat-invitation.controller.ts`
- Modify: `backend/src/modules/payments/payments.module.ts`
- Modify: `backend/src/modules/payments/http/payments.routes.ts`
- Modify: `backend/src/server.ts` (somente registrar rota pública e rate limits)
- Modify: `backend/src/config/env.ts`
- Create: `backend/src/modules/payments/__tests__/sponsored-seat-invitation.use-case.test.ts`
- Create: `backend/src/modules/payments/__tests__/sponsored-seat-invitation.database.test.ts`

**Interfaces:**
- `POST /api/v1/teachers/me/sponsored-batches/:batchId/seats/:seatId/invitation` — professor autenticado; usa `PUBLIC_FRONT_URL` como origem de `/convite/aluno#token=...` e retorna `{ data: { url, expiresAt } }`.
- `GET /api/v1/student/sponsored-seat-invitations/resolve` — público; token no header `X-Sponsored-Invitation-Token`; retorna `{ data: { email, teacherName, monitorName, interval: 'MONTHLY'|'ANNUAL', startsAt: ISOString, endsAt: ISOString } }`.
- `POST /api/v1/student/sponsored-seat-invitations/activate` — público; token no header `X-Sponsored-Invitation-Token`, corpo estrito `{ name, password }`; deriva o e-mail da vaga e retorna `{ data: { userId, email, role: 'student', accessToken, claimedCount, monitorIds } }`, além de emitir cookies de sessão.
- Token de 32 bytes em base64url; persistir somente hash SHA-256 e validade; reemitir invalida o token anterior. Emissão exige propriedade do lote e vaga elegível. O token trafega no fragmento do link e em header, nunca no caminho/query/body ou logs.

- [ ] **Step 1: Write failing unit tests** para token desconhecido, vencido, vaga inelegível, professor errado, reemissão invalida o anterior e ativação fixa o e-mail do banco.
- [ ] **Step 2: Run unit tests and verify they fail** com `cd backend && node --import tsx --test src/modules/payments/__tests__/sponsored-seat-invitation.use-case.test.ts`.
- [ ] **Step 3: Implement schema, migration, repository, use case, controller and route contracts**; não editar `payment-event.repository.ts`.
- [ ] **Step 4: Write database tests** para lote mensal/anual ativo, hash-only, reemissão e retries sem duplicar resgate.
- [ ] **Step 5: Run focused tests and backend typecheck** (`npm run typecheck`); database tests may run only against an isolated test database, never the shared production `DATABASE_URL`.

### Task 2: Página de convite e criação de conta

**Files:**
- Create: `frontend/src/app/convite/aluno/page.tsx`
- Create: `frontend/src/modules/student/components/SponsoredSeatInvitationPage.tsx`
- Create: `frontend/src/modules/student/services/sponsored-seat-invitation.service.ts`
- Create: `frontend/tests/unit/SponsoredSeatInvitationPage.test.tsx`

**Interfaces:**
- Fragmento `#token=<token>`; página chama endpoints públicos da Task 1 enviando o token em header.
- Formulário coleta nome, senha, confirmação e aceite dos termos; e-mail vem da resposta da API e fica `readOnly`.
- Cadastro chama `POST /api/v1/student/sponsored-seat-invitations/activate` com token no header; sessão segue o padrão `mm_access_token`, `mm_user_role`, `mm_user_info` e `notifyAuthStateChanged`.
- Conta existente oferece login por `/?login=true&redirect=/areadoaluno`; o resgate usa o fluxo atual de `StudentContext`.

- [ ] **Step 1: Write failing UI tests** para dados do convite, e-mail bloqueado, senha inválida, estados inválido/expirado/utilizado e chamada de ativação.
- [ ] **Step 2: Run the focused test and verify it fails** (`cd frontend && npx vitest run tests/unit/SponsoredSeatInvitationPage.test.tsx`).
- [ ] **Step 3: Implement service and responsive invitation page** com estados carregando, convite inválido, erro de rede, conta existente e sucesso.
- [ ] **Step 4: Run focused tests, frontend typecheck and lint on touched files.**

### Task 3: Revisão independente e consolidação

**Files:**
- Review all files from Tasks 1 and 2; QA may create tests only under `backend/src/modules/payments/__tests__/` and `frontend/tests/unit/`.
- Update: `docs/superpowers/specs/2026-11-01-sponsored-student-invitation-test-plan.md`
- Update: `docs/superpowers/specs/2026-11-01-sponsored-student-invitation-validation.md`

- [ ] **Step 1: Run independent backend and frontend QA scenarios** from the test plan, including multiple seats and existing-account path.
- [ ] **Step 2: Review the diff for security, concurrency, accessibility, mobile layout and plaintext token leakage.**
- [ ] **Step 3: Fix Critical/Important findings and rerun affected tests.**
- [ ] **Step 4: Record AC → test → result and remaining deployment/migration requirements.**
