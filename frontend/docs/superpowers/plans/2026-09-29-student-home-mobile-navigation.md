# Área do Aluno — Início Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o Início da Área do Aluno com navegação inferior acessível em celular/tablet, sem regressão da navegação e chat de desktop.

**Architecture:** Uma fonte tipada de verdade descreve os cinco destinos; a barra inferior a consome. Um shell compartilhado compõe sidebar desktop, conteúdo e barra mobile; nesta entrega, somente o Início o adota.

**Tech Stack:** Next.js 16.3, React 19, TypeScript, Tailwind CSS 4, lucide-react, Vitest/Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-student-mobile-experience-design.md`

## Global Constraints

- Mobile e tablet: barra inferior fixa com Início, Chat, Praticar, Ranking e Perfil; Praticar é central e destacado.
- Desktop (`lg` e acima): manter `StudentSidebar` e `StudentRightSidebar` existentes.
- Conteúdo não pode ficar oculto pela barra, inclusive em dispositivos com área segura inferior.
- Alvos de toque têm no mínimo 44px; destinos possuem ícone, rótulo visível e estado atual acessível.
- Reflow sem rolagem horizontal em 320px, 375px, 768px e 1024px.
- Alterações seguem TDD estrito: teste que falha pelo motivo esperado, implementação mínima, teste verde e regressão completa.

## Review Focus

- Em 320px, os cinco destinos e rótulos permanecem alcançáveis, sem overflow horizontal — Task 4.
- A barra não encobre a última ação do Início e respeita `safe-area-inset-bottom` — Tasks 3 e 4.
- Apenas uma aba possui estado visual ativo e `aria-current="page"` — Task 2.
- Praticar continua levando à rota `/areadoaluno/pratica` apesar do destaque — Tasks 2 e 4.
- Em 1024px, barra inferior não duplica as sidebars desktop — Task 4.

---

## File structure

- Create: `src/modules/student/components/student-navigation.ts` — modelo tipado dos cinco destinos e resolução do destino ativo.
- Create: `src/modules/student/components/StudentMobileNavigation.tsx` — barra inferior semântica e acessível.
- Create: `src/modules/student/components/StudentAppShell.tsx` — composição responsiva de sidebar, conteúdo, chat e barra mobile.
- Modify: `src/modules/student/components/index.ts` and `src/modules/student/index.ts` — exportar o shell.
- Modify: `src/app/(student-app)/areadoaluno/page.tsx` — migrar somente o Início ao shell.
- Create: `tests/unit/StudentMobileNavigation.test.tsx` and `tests/unit/StudentAppShell.test.tsx` — contratos de componente.
- Modify: `tests/e2e/critical-flows.spec.ts` — cenário autenticado para reflow e navegação real.

### Task 1: Modelo dos destinos mobile

**Files:**
- Create: `src/modules/student/components/student-navigation.ts`
- Test: `tests/unit/StudentMobileNavigation.test.tsx`

**Interfaces:**
- Produces: `StudentNavigationKey = 'home' | 'chat' | 'practice' | 'ranking' | 'profile'`; `studentMobileDestinations`; `resolveStudentNavigationKey(pathname: string): StudentNavigationKey`.

- [ ] **Step 1: Write the failing test**

Chamar `resolveStudentNavigationKey` com `/areadoaluno`, `/areadoaluno/pratica`, `/areadoaluno/ranking`, `/areadoaluno/perfil` e `/areadoaluno/chat`; esperar `home`, `practice`, `ranking`, `profile` e `chat`. Confirmar exatamente cinco destinos e `/areadoaluno/pratica` como item central destacado.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/StudentMobileNavigation.test.tsx`
Expected: FAIL porque o módulo/export ainda não existe.

- [ ] **Step 3: Implement the typed navigation model**

Criar destino imutável `{ key, label, href, icon, prominent }`; reconhecer subrotas de Perfil como `profile` e a futura rota Chat como `chat`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/StudentMobileNavigation.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add tests/unit/StudentMobileNavigation.test.tsx src/modules/student/components/student-navigation.ts && git commit -m "feat: define student mobile navigation"`

### Task 2: Barra inferior acessível

**Files:**
- Create: `src/modules/student/components/StudentMobileNavigation.tsx`
- Modify: `src/modules/student/components/index.ts`
- Test: `tests/unit/StudentMobileNavigation.test.tsx`

**Interfaces:**
- Consumes: `StudentNavigationKey` e `studentMobileDestinations` da Task 1.
- Produces: `StudentMobileNavigation({ activeNav }: { activeNav: StudentNavigationKey }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

Renderizar com `activeNav="home"`; afirmar `navigation` “Navegação principal”, cinco links nomeados, Início com `aria-current="page"`, demais sem esse atributo e Praticar com URL `/areadoaluno/pratica`. Re-renderizar com `practice` e afirmar que apenas Praticar é atual. A mutação alvo é ativar dois destinos ou perder a rota da prática.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/StudentMobileNavigation.test.tsx`
Expected: FAIL porque o componente ainda não existe.

- [ ] **Step 3: Implement `StudentMobileNavigation`**

Usar `next/link` e ícones do modelo. Renderizar `<nav>` fixo apenas abaixo de `lg`, com alvos mínimos de 44px e padding inferior `env(safe-area-inset-bottom)`. O item `prominent` é distinto sem mudar ordem, nome ou URL.

- [ ] **Step 4: Run focused and unit regression tests**

Run: `npx vitest run tests/unit/StudentMobileNavigation.test.tsx && npm run test:unit`
Expected: PASS, sem warnings.

- [ ] **Step 5: Commit**

Run: `git add tests/unit/StudentMobileNavigation.test.tsx src/modules/student/components/StudentMobileNavigation.tsx src/modules/student/components/index.ts && git commit -m "feat: add student mobile navigation"`

### Task 3: Shell responsivo e migração do Início

**Files:**
- Create: `src/modules/student/components/StudentAppShell.tsx`
- Modify: `src/modules/student/components/index.ts`, `src/modules/student/index.ts`, `src/app/(student-app)/areadoaluno/page.tsx`
- Test: `tests/unit/StudentAppShell.test.tsx`

**Interfaces:**
- Consumes: Task 2, `StudentSidebar`, `StudentRightSidebar` e `StudentHeader` existentes.
- Produces: `StudentAppShell({ activeNav, header, children }: StudentAppShellProps): JSX.Element`.

- [ ] **Step 1: Write the failing test**

Renderizar o shell com conteúdo marcador e `activeNav="home"`; verificar marcador em `main`, navegação mobile disponível e região com reserva pública de espaço inferior da barra. A mutação alvo é remover a reserva e encobrir conteúdo.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/StudentAppShell.test.tsx`
Expected: FAIL porque o shell ainda não existe.

- [ ] **Step 3: Implement shell and migrate only `/areadoaluno`**

Renderizar sidebars apenas em `lg+`, barra apenas abaixo de `lg`, `main` sem largura mínima que provoque overflow e padding inferior com altura da barra mais safe area. Preservar hooks, modais, dados e callbacks existentes no Início.

- [ ] **Step 4: Run focused, type and unit verification**

Run: `npx vitest run tests/unit/StudentAppShell.test.tsx && npm run typecheck && npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add tests/unit/StudentAppShell.test.tsx src/modules/student/components/StudentAppShell.tsx src/modules/student/components/index.ts src/modules/student/index.ts 'src/app/(student-app)/areadoaluno/page.tsx' && git commit -m "feat: make student dashboard mobile ready"`

### Task 4: Browser test and responsive corrections

**Files:**
- Modify: `tests/e2e/critical-flows.spec.ts`

**Interfaces:**
- Consumes: `mockStudentSession` existente e shell da Task 3.
- Produces: cobertura browser real do contrato responsivo do Início.

- [ ] **Step 1: Write the failing test**

Com sessão simulada, abrir `/areadoaluno` em 320×640, 375×640, 768×900 e 1024×900. Em 320/375/768, confirmar cinco links visíveis, Início atual, Praticar navega, sem overflow. Em 1024, confirmar barra inferior invisível e sidebar desktop visível. A mutação alvo é duplicar navegações ou quebrar reflow.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/critical-flows.spec.ts --project=mobile --grep "student home mobile navigation"`
Expected: FAIL porque o cenário ainda não existe ou não satisfaz o contrato.

- [ ] **Step 3: Apply only corrections revealed by the browser test**

Não alterar APIs ou lógica de estudo; corrigir classes/layout do shell ou barra apenas quando a falha demonstrar overflow, cobertura de conteúdo ou breakpoint incorreto.

- [ ] **Step 4: Run browser matrix and full regression**

Run: `npx playwright test tests/e2e/critical-flows.spec.ts --project=mobile && npx playwright test tests/e2e/critical-flows.spec.ts --project=chromium && npm test && npm run test:unit && npm run typecheck && npm run lint`
Expected: PASS; registrar por nome qualquer falha preexistente.

- [ ] **Step 5: Commit**

Run: `git add tests/e2e/critical-flows.spec.ts && git commit -m "test: cover student home mobile navigation"`

## Final verification

- [ ] Executar `npm run test:all` e `npm run build`.
- [ ] Inspecionar screenshots Playwright nos quatro viewports: hierarquia, legibilidade, toque e ausência de conteúdo oculto.
- [ ] Confirmar que `next-env.d.ts` e `src/app/(student-app)/areadoaluno/planos/page.tsx`, já modificados, não entraram nos commits desta entrega.
