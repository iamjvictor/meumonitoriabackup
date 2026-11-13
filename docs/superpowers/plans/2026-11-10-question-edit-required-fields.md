# Question Edit Required Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require complete question content before saving edits while making the explanation optional, with visual feedback before any frontend request.

**Architecture:** A pure frontend validator is shared by the edit handler and update service, so invalid data gets field-level feedback and cannot reach `fetch`. The backend validates the effective merged question fields for content edits and approvals, while retaining status-only moderation calls.

**Tech Stack:** Next.js Client Components, React, TypeScript, Vitest, Fastify, Zod, Prisma, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-10-question-edit-required-fields.md`

## Global Constraints

- Preserve status-only moderation calls such as bulk approval/rejection.
- Require exactly five non-empty alternatives labeled A–E, following the existing approval rule.
- Never require an explanation to save or approve a question.
- Keep existing success response shapes.

## Review Focus

- Missing statement, alternative, or answer key is shown inline and blocks network submission (AC-005).
- Direct API content edits cannot persist incomplete question state (AC-006).
- Missing, null, or empty explanation does not prevent a valid edit/approval (AC-007).
- Status-only actions and valid edits preserve existing behavior (AC-008).

### Task 1: Enforce required fields in the API

**Files:**
- Modify: `backend/src/repositories/content-review.repository.ts` (`reviewQuestion` only)
- Modify: `backend/src/controllers/content-review.controller.ts` (domain message mapping only)

**Interfaces:**
- Keep the existing `reviewQuestion` signature and null-on-not-found behavior.
- Expected errors remain domain `Error`s mapped by the controller to `AppError` 422.

- [ ] Add repository tests for empty effective statement, alternatives, and answer key, including absent/empty explanation success.
- [ ] Validate effective stored plus incoming values on content edits and approvals; validate answer key against available alternatives.
- [ ] Remove explanation as an approval prerequisite; preserve topic and alternatives requirements.
- [ ] Run focused repository/controller tests and backend typecheck.

### Task 2: Validate and display errors in the editor

**Files:**
- Create: `frontend/src/modules/teacher/services/question-review-validation.ts`
- Modify: `frontend/src/modules/teacher/components/monitor/MonitorWorkspace.tsx` (edit save guard and error visibility state)
- Modify: `frontend/src/modules/teacher/components/monitor/MonitorQuestionsReviewTab.tsx` (inline field feedback)
- Modify: `frontend/src/modules/teacher/services/TeacherMonitorService.ts` (block invalid content edits before `fetch`)

**Interfaces:**
- `validateQuestionReviewDraft(draft)` returns field errors for statement, each alternative and answer key; it does not inspect or require explanation.
- Status-only service requests skip content validation.

- [ ] Add tests proving missing required data fails validation and valid data with empty explanation passes.
- [ ] Add tests proving invalid content updates do not call `fetch`, while status-only requests still can.
- [ ] Show inline error text and invalid styling after save is attempted; clear errors as fields are corrected.
- [ ] Run focused frontend unit tests and typecheck.

## QA Test Files

QA owns tests only and writes/runs them before production edits:

- `backend/src/controllers/__tests__/content-review.controller.errors.test.ts`
- Create: `backend/src/repositories/__tests__/content-review.required-fields.test.ts`
- Create: `frontend/tests/unit/QuestionReviewValidation.test.tsx`
- Create: `frontend/tests/unit/MonitorQuestionsReviewValidation.test.tsx`

## Validation

Expected focused commands:

- `cd backend && node --experimental-test-module-mocks --import tsx --test src/controllers/__tests__/content-review.controller.errors.test.ts src/repositories/__tests__/content-review.required-fields.test.ts`
- `cd backend && npm run typecheck`
- `cd frontend && npx vitest run tests/unit/QuestionReviewValidation.test.tsx tests/unit/MonitorQuestionsReviewValidation.test.tsx`
- `cd frontend && npm run typecheck`
