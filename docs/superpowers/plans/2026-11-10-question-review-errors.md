# Question Review Errors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return actionable 4xx errors for professor-correctable question-review input and log unexpected update failures with safe diagnostic context.

**Architecture:** Keep HTTP error mapping in `ContentReviewController`, and validate subject/topic ownership and approval prerequisites in `reviewQuestion`. A dedicated independent QA test file covers the response contract and unexpected-error logging.

**Tech Stack:** TypeScript, Fastify, Zod, Prisma, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-10-question-review-errors-design.md`

## Global Constraints

- Do not change the shared/global error handler contract.
- Never include submitted question text or the complete request body in logs or public errors.
- Preserve 404 for missing/out-of-scope question and 500 for unexpected infrastructure failures.
- Preserve existing successful response shape.

## Review Focus

- Invalid/missing approval fields must name the corrective field and avoid a generic 500 (AC-001, AC-002).
- Topic/subject IDs from another monitor must not be accepted or cause a database constraint failure (AC-002).
- Unexpected Prisma errors must be diagnosable in logs without echoing question content (AC-003).
- Not-found and successful update paths must keep their existing HTTP behavior (AC-004).

### Task 1: Implement question review error mapping

**Files:**
- Modify: `backend/src/controllers/content-review.controller.ts`
- Modify: `backend/src/repositories/content-review.repository.ts` (only `reviewQuestion` and directly related helpers)

**Interfaces:**
- Controller consumes the existing `reviewQuestion` interface and translates recognized domain errors into `AppError`.
- Repository returns the existing question record on success and `null` for missing/out-of-scope question.

- [ ] Add clear Zod field summaries and map known review-domain errors to user-safe 4xx `AppError`s.
- [ ] Ensure supplied subject/topic belongs to the route monitor and report invalid references as 422.
- [ ] Log unexpected failures with request/monitor/question IDs and technical cause; omit request body and question text.
- [ ] Run focused controller/repository tests and backend typecheck.

### Task 2: Independent QA coverage

**Files:**
- Create: `backend/src/controllers/__tests__/content-review.controller.errors.test.ts`
- Create: `backend/src/repositories/__tests__/content-review.question-scope.test.ts`

**Interfaces:**
- Tests call the controller with stubbed repository behavior and a Fastify-like request logger/reply.
- Tests do not modify production code.

- [ ] Cover malformed payload field messaging, each approval prerequisite, unknown topic/subject errors, unexpected repository exception logging, 404, and success contract.
- [ ] Cover topic/subject outside the current monitor being rejected before question persistence.
- [ ] Assert unexpected exception text and submitted question text do not appear in the public response/log metadata where prohibited.
- [ ] Run the new focused test file and report findings against AC-001 through AC-004.

## Validation

Expected commands: `cd backend && node --experimental-test-module-mocks --import tsx --test src/controllers/__tests__/content-review.controller.errors.test.ts src/repositories/__tests__/content-review.question-scope.test.ts` and `cd backend && npm run typecheck`.
