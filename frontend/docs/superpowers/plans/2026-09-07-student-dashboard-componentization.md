# Student Dashboard Componentization Implementation Plan

> **For agentic workers:** Execute task-by-task with TDD and preserve the current rendered UI.

**Goal:** Componentize `src/app/(student-app)/areadoaluno/page.tsx` without changing its visual output or behavior.

**Architecture:** Keep route-local dashboard components, hooks, and a service under `areadoaluno/`. Move the existing JSX and data responsibilities without redesigning them. The route page becomes a composition layer while `StudentSidebar`, `StudentHeader`, and `StudentRightSidebar` remain existing shared module components.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Node test runner.

**Spec:** `/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/analisefrontendPENDENTE.md` — Fase 3.

## Global Constraints

- Do not change text, classes, colors, spacing, ordering, breakpoints, or visual states.
- Keep the original page available as the behavior reference during extraction.
- Service owns dashboard API calls; components do not build API URLs directly.
- Run `npm test` and `npm run typecheck` after each extraction unit.
- Any failing regression test must be fixed in production code, not weakened.

### Task 1: Define regression contracts and service boundaries

**Files:**
- Create: `tests/student-dashboard-componentization.test.mjs`
- Create: `src/app/(student-app)/areadoaluno/services/student-dashboard.service.ts`

- [ ] Write tests requiring route-local service, components, hooks, and preservation markers.
- [ ] Run the focused test and confirm RED.
- [ ] Add typed service functions for the five existing dashboard calls/actions.
- [ ] Run focused tests and typecheck.

### Task 2: Extract data hooks

**Files:**
- Create: `src/app/(student-app)/areadoaluno/hooks/useStudentDashboard.ts`
- Create: `src/app/(student-app)/areadoaluno/hooks/useDailyChallenge.ts`
- Create: `src/app/(student-app)/areadoaluno/hooks/useFlashcardReview.ts`

- [ ] Move existing effect/state behavior into hooks without changing return data.
- [ ] Keep loading, cancellation, error, and modal transitions identical.
- [ ] Run tests and typecheck.

### Task 3: Extract visual sections

**Files:**
- Create: `src/app/(student-app)/areadoaluno/components/DashboardChallengeSection.tsx`
- Create: `src/app/(student-app)/areadoaluno/components/DashboardStudyActions.tsx`
- Create: `src/app/(student-app)/areadoaluno/components/DashboardPerformanceSection.tsx`
- Create: `src/app/(student-app)/areadoaluno/components/DashboardAgentsSection.tsx`
- Create: `src/app/(student-app)/areadoaluno/components/DailyChallengeModal.tsx`
- Create: `src/app/(student-app)/areadoaluno/components/FlashcardReviewModal.tsx`

- [ ] Move JSX verbatim, preserving classes and callbacks.
- [ ] Keep component props explicit and serializable where possible.
- [ ] Run tests and typecheck after each section.

### Task 4: Reduce the route page to composition

**Files:**
- Modify: `src/app/(student-app)/areadoaluno/page.tsx`
- Modify: `tests/student-dashboard-phase3.test.mjs`

- [ ] Replace inline sections with route-local component imports.
- [ ] Keep sidebar/header/chat composition unchanged.
- [ ] Assert the page is an orchestrator and no longer owns API calls.
- [ ] Run `npm test`, `npm run typecheck`, focused lint, and `git diff --check`.

### Task 5: Visual and behavior handoff

- [ ] Compare className/text/order markers against the original page.
- [ ] Document any browser validation limitation.
- [ ] Run the full test suite and final typecheck.
