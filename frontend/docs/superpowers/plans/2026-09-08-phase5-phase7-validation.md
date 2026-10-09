# Phase 5 and Phase 7 Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete responsive visual validation and behavioral coverage for the critical student, chat, checkout, ranking, teacher, and monitor flows.

**Architecture:** Keep production behavior unchanged wherever possible. Extend the existing Vitest/Testing Library and Playwright harness with deterministic API/session fixtures, component tests for state transitions, and route-level smoke tests that exercise the real Next server.

**Tech Stack:** Next.js 16, React Testing Library, Vitest, Playwright, Chrome headless, existing frontend/backend APIs.

**Spec:** Approved chat design in the conversation on 2026-09-08.

## Global Constraints

- Tests must not depend on random data, real user credentials, or external AI providers.
- Responsive assertions must verify `document.documentElement.scrollWidth <= window.innerWidth`.
- Test states must cover loading, error, empty, retry, and expired session.
- Production code changes require a failing test first.

### Task 1: Deterministic test utilities and route fixture

**Files:**
- Create: `tests/unit/test-utils.tsx`
- Create: `tests/e2e/fixtures.ts`
- Modify: `vitest.config.ts`
- Modify: `playwright.config.ts`

- [ ] Add shared Testing Library providers and fetch helpers.
- [ ] Add Playwright API route stubs for session, ranking, practice, checkout, and chat.
- [ ] Verify the helpers compile before using them.

### Task 2: Testing Library coverage for dashboard, practice, ranking, checkout, and modals

**Files:**
- Create: `tests/unit/StudentFlowStates.test.tsx`
- Modify: existing unit tests only when a selector or fixture is required.

- [ ] Write failing tests for loading, API error, empty data, retry, expired session, subject selection, and modal keyboard controls.
- [ ] Run the focused test file and confirm expected failures.
- [ ] Implement only the smallest production changes needed for accessible state exposure and retry controls.
- [ ] Run the focused tests and the complete unit suite.

### Task 3: Testing Library coverage for chat subject changes and attachments

**Files:**
- Create: `tests/unit/StudentChatStates.test.tsx`
- Modify: `src/modules/student/components/StudentRightSidebar.tsx` only if behavior lacks testable controls.

- [ ] Write failing tests for chat loading/error/retry, subject switching, question attachment, and flashcard attachment.
- [ ] Verify the tests fail for the missing behavior.
- [ ] Implement the minimal accessible behavior and stable labels.
- [ ] Run chat tests and the full unit suite.

### Task 4: Playwright authenticated smoke flows and visual matrix

**Files:**
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `playwright.config.ts`
- Create: `tests/e2e/critical-flows.spec.ts`

- [ ] Add deterministic browser route fixtures for authenticated student, teacher, and monitor pages.
- [ ] Add smoke flows for login/session expiry, practice, chat, ranking, checkout, teacher profile, and monitor.
- [ ] Add screenshots at 375, 768, 1280, and 1920px, plus low-height and landscape cases.
- [ ] Assert no horizontal overflow and modal/sidebar containment.
- [ ] Run Chromium and mobile-viewport projects.

### Task 5: Accessibility and final verification

**Files:**
- Modify: relevant test files only.

- [ ] Assert accessible names, keyboard reachability, disabled states, and dialog close controls.
- [ ] Run frontend tests, unit tests, E2E tests, typecheck, lint, and build.
- [ ] Review the requirement checklist and report any environment-only limitations.
