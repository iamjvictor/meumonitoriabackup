# Lint Debt Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Reduzir os warnings do frontend a zero e tornar o lint do backend executável, sem alterar o comportamento dos fluxos existentes.

**Architecture:** A limpeza será feita por regra, começando por alterações mecânicas e tipagem nas fronteiras de API. Correções de navegação, imagens e hooks serão isoladas e verificadas com typecheck, build e testes existentes. O backend receberá uma configuração ESLint flat mínima para TypeScript, sem incluir artefatos gerados.

**Tech Stack:** Next.js 16, React 19, TypeScript, ESLint 9, `eslint-config-next`, `typescript-eslint`, Vitest, Playwright, Node.js backend.

**Spec:** Spec 15 — Reduzir dívida de lint, descrita na solicitação do usuário.

## Global Constraints

- Preservar o comportamento de autenticação, ranking, chat, checkout e prática.
- Não aplicar `eslint --fix` globalmente em hooks ou navegação.
- Não usar `any` em novas fronteiras de API; substituir os usos existentes por tipos locais/DTOs quando o contrato puder ser identificado.
- Não migrar para `next/image` URLs dinâmicas sem revisar o suporte a imagens remotas.
- Manter testes e artefatos de teste fora do bundle de produção.

### Task 1: Baseline e configuração do lint do backend

**Files:**
- Create: `backend/eslint.config.mjs`
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`

- [ ] Registrar o baseline atual do frontend por regra e arquivo.
- [ ] Adicionar `eslint`, `@eslint/js`, `typescript-eslint` e `globals` como devDependencies do backend.
- [ ] Configurar ESLint flat para `src/**/*.ts`, ignorando `dist`, `node_modules`, arquivos de ambiente e scripts gerados.
- [ ] Ativar regras TypeScript seguras inicialmente como warnings para que a configuração seja adotada sem bloquear o backend legado.
- [ ] Rodar `npm run lint` no backend e confirmar que o binário é encontrado.

### Task 2: Remover imports, estados e variáveis não utilizados

**Files:**
- Modify: arquivos apontados por `@typescript-eslint/no-unused-vars`.

- [ ] Remover imports não utilizados e estados sem consumidores, preservando props e callbacks públicos.
- [ ] Incluir testes apenas quando a remoção tocar um fluxo observável.
- [ ] Rodar o lint do frontend e confirmar redução exclusiva dessa regra.

### Task 3: Tipar fronteiras de API e respostas externas

**Files:**
- Modify: `src/app/(student-app)/areadoaluno/pratica/page.tsx`
- Modify: `src/modules/student/components/StudentRightSidebar.tsx`
- Modify: `src/modules/teacher/components/monitor/MonitorWorkspace.tsx`
- Modify: `src/modules/teacher/services/TeacherMonitorService.ts`
- Modify: demais arquivos apontados por `no-explicit-any`.

- [ ] Criar tipos de resposta locais para monitores, questões, alternativas, flashcards, documentos e mensagens.
- [ ] Trocar `catch (err: any)` por `unknown` e normalizar mensagens com helper seguro.
- [ ] Substituir casts `as any` por guards ou tipos parciais explícitos.
- [ ] Rodar typecheck, testes unitários e lint após cada grupo de módulos.

### Task 4: Migrar imagens apropriadas para `next/image`

**Files:**
- Modify: componentes com `@next/next/no-img-element`.
- Modify: `next.config.ts` apenas se domínios remotos necessários forem identificados.

- [ ] Migrar imagens locais e avatares com URL conhecida para `next/image`, adicionando `width`, `height` ou `fill` e `sizes` quando necessário.
- [ ] Manter `<img>` somente para casos realmente incompatíveis, com justificativa local.
- [ ] Validar visualmente as páginas de storefront, professor, aluno, checkout e chat.
- [ ] Rodar build e Playwright.

### Task 5: Corrigir navegação interna e regras de hooks

**Files:**
- Modify: `src/app/(student-app)/areadoaluno/hooks/useFlashcardReview.ts`
- Modify: páginas e componentes com `window.location.href` interno.
- Modify: arquivos com `react-hooks/set-state-in-effect`, `exhaustive-deps` e `preserve-manual-memoization`.

- [ ] Usar `useRouter().push()` em handlers de Client Components para rotas internas.
- [ ] Preservar navegação completa apenas quando houver motivo técnico documentado.
- [ ] Remover efeitos derivados substituindo-os por valores derivados, inicialização lazy ou callbacks assíncronos apropriados.
- [ ] Corrigir dependências de hooks sem desabilitar a regra.
- [ ] Adicionar ou ajustar testes para autenticação expirada, carregamento, retry e salvamento.

### Task 6: Fechamento e política de zero warnings

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/eslint.config.mjs`
- Modify: `backend/eslint.config.mjs`

- [ ] Corrigir `alt-text`, `no-empty-object-type` e warnings residuais.
- [ ] Tornar `npm run lint` falhar com warnings residuais usando `--max-warnings=0` somente após a limpeza.
- [ ] Rodar frontend e backend lint, typecheck, build, testes unitários e E2E.
- [ ] Verificar o diff e garantir que nenhuma alteração não relacionada foi sobrescrita.
