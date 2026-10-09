# Daily Challenge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement one random, non-repeating approved daily challenge per monitor, record each student's single answer as both a challenge participation and a normal question attempt, and expose monitor-scoped monthly ranking data.

**Architecture:** Add an isolated `src/modules/daily_challgens` module with controller, service, repository, models, scheduler and route registration. The module will reuse the existing Prisma client, authentication middleware and enrollment rules, while the worker owns the daily generation schedule and question-attempt persistence. The frontend will consume the new endpoints only after backend behavior is covered.

**Tech Stack:** TypeScript, Fastify 5, Prisma 7/PostgreSQL, existing auth middleware, existing worker process, Node test runner with `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-03-daily-challenge-design.md`

## Global Constraints

- Generate only `APPROVED` questions belonging to the target monitor.
- Select uniformly at random among questions never used by that monitor as a daily challenge.
- Generate one challenge per monitor per local date in `America/Sao_Paulo`.
- Keep the challenge available through `23:59:59` of its local date.
- Enforce one answer per student and challenge with a database constraint.
- Persist every challenge answer in both `student_question_attempts` and `daily_challenge_attempts` in one transaction.
- Calculate correctness in the backend from the persisted question; never trust the client.
- Ranking reads only correct rows from `daily_challenge_attempts` and is filtered by monitor and month.
- Do not repeat a question after the eligible pool is exhausted.
- Do not expose `correctAnswer` before submission.
- Do not change billing tables or the existing billing flow.

---

### Task 1: Lock the schema contract with failing tests

**Files:**
- Create: `backend/src/modules/daily_challgens/repositories/__tests__/daily-challenge.repository.test.ts`
- Create: `backend/src/modules/daily_challgens/services/__tests__/daily-challenge.service.test.ts`
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- The tests define the required models and service behavior before production implementation.
- Later tasks consume `DailyChallenge`, `StudentQuestionAttempt` and `DailyChallengeAttempt` Prisma models.

- [ ] **Step 1: Write failing schema-contract tests**

Assert that `schema.prisma` contains `DailyChallenge`, `StudentQuestionAttempt` and `DailyChallengeAttempt`, including the two daily-challenge uniqueness constraints and the student/challenge uniqueness constraint.

- [ ] **Step 2: Run the tests and verify the expected failure**

Run:

```bash
node --import tsx --test src/modules/daily_challgens/repositories/__tests__/daily-challenge.repository.test.ts
```

Expected: FAIL because the new Prisma models do not exist.

- [ ] **Step 3: Add the Prisma enums and models**

Add a `StudentQuestionAttemptMode` enum with `PRACTICE`, `DAILY_CHALLENGE` and `SIMULATED`, then add the three models with UUID ids, foreign keys, timestamps, indexes and the constraints from the spec. `DailyChallenge.questionId` references `Question` with restrictive deletion; attempts reference student, question and challenge.

- [ ] **Step 4: Generate the Prisma client and validate the schema**

Run:

```bash
npx prisma format
npx prisma validate
npx prisma generate
```

Expected: all commands succeed.

- [ ] **Step 5: Add the SQL migration**

Create a timestamped migration under `backend/prisma/migrations/` for the enum, tables, foreign keys, unique constraints and indexes. Keep the migration reversible by using explicit `DROP` statements only in the generated down documentation, not in the forward migration.

- [ ] **Step 6: Run the schema-contract tests again**

Expected: PASS.

### Task 2: Implement deterministic time and random selection domain logic

**Files:**
- Create: `backend/src/modules/daily_challgens/models/daily-challenge.model.ts`
- Create: `backend/src/modules/daily_challgens/services/daily-challenge-selection.service.ts`
- Create: `backend/src/modules/daily_challgens/services/__tests__/daily-challenge-selection.service.test.ts`

**Interfaces:**
- `getSaoPauloChallengeWindow(date: Date): { challengeDate: string; availableFrom: Date; availableUntil: Date }`
- `selectRandomUnusedQuestion<T>(questions: T[], random?: () => number): T | null`
- The repository will provide already-filtered approved and unused questions.

- [ ] **Step 1: Write failing time and selection tests**

Cover UTC-to-São-Paulo date conversion, inclusive day boundaries, approved-only input supplied by the repository, uniform random index behavior, empty candidates and no fallback repetition.

- [ ] **Step 2: Run the tests and verify they fail for missing functions**

Run:

```bash
node --import tsx --test src/modules/daily_challgens/services/__tests__/daily-challenge-selection.service.test.ts
```

- [ ] **Step 3: Implement the minimal pure functions**

Use `Intl.DateTimeFormat` with `timeZone: 'America/Sao_Paulo'` for the local date and calculate the UTC instants for the start and end of that local date. Select using `Math.floor(random() * candidates.length)` and return `null` for no candidates.

- [ ] **Step 4: Run the tests and verify they pass**

Expected: PASS with no database dependency.

### Task 3: Implement repository persistence and idempotent generation

**Files:**
- Create: `backend/src/modules/daily_challgens/repositories/daily-challenge.repository.ts`
- Create: `backend/src/modules/daily_challgens/services/daily-challenge-generation.service.ts`
- Create: `backend/src/modules/daily_challgens/services/__tests__/daily-challenge-generation.service.test.ts`

**Interfaces:**
- `DailyChallengeRepository.findEligibleMonitors(): Promise<Array<{ id: string }>>`
- `DailyChallengeRepository.findChallengeByMonitorAndDate(monitorId: string, challengeDate: string)`
- `DailyChallengeRepository.findApprovedUnusedQuestions(monitorId: string): Promise<Array<{ id: string }>>`
- `DailyChallengeRepository.createChallenge(input): Promise<DailyChallenge>`
- `DailyChallengeGenerationService.generateForDate(now?: Date): Promise<GenerationSummary>`

- [ ] **Step 1: Write failing service tests**

Test one challenge per active monitor, approved-only filtering, any category/topic, exclusion of previously used questions, no eligible-question outcome, and safe reexecution when the challenge already exists.

- [ ] **Step 2: Run the tests and verify the expected failure**

Run:

```bash
node --import tsx --test src/modules/daily_challgens/services/__tests__/daily-challenge-generation.service.test.ts
```

- [ ] **Step 3: Implement repository queries**

Query active/published monitors, approved questions for each monitor, and used question ids through `daily_challenges`. Persist challenge creation with the database uniqueness constraints as the final idempotency guard.

- [ ] **Step 4: Implement the generation service**

For each monitor, derive the São Paulo date, skip an existing challenge, choose one unused approved question, persist it with `selectionStrategy = RANDOM_UNUSED_APPROVED`, and return counts for created, existing and unavailable monitors.

- [ ] **Step 5: Add structured logs**

Emit the generation events from the spec with `challengeDate`, `timezone`, `monitorId`, `questionId`, candidate count, `jobKey`, duration and error code. An exhausted monitor must emit `monitor.daily_challenge_no_eligible_question` and continue processing other monitors.

- [ ] **Step 6: Run the service tests**

Expected: PASS.

### Task 4: Implement challenge access and one-answer transaction

**Files:**
- Create: `backend/src/modules/daily_challgens/repositories/student-question-attempt.repository.ts`
- Create: `backend/src/modules/daily_challgens/services/daily-challenge-answer.service.ts`
- Create: `backend/src/modules/daily_challgens/models/daily-challenge-http.model.ts`
- Create: `backend/src/modules/daily_challgens/services/__tests__/daily-challenge-answer.service.test.ts`

**Interfaces:**
- `getCurrentChallenge(userId: string, monitorId: string, now?: Date)`
- `answerChallenge(userId: string, challengeId: string, input: { selectedAnswer: string; responseTimeMs?: number }, now?: Date)`
- Both methods resolve the student by authenticated user id and validate an active `student_enrollments` row.

- [ ] **Step 1: Write failing service tests**

Cover unauthenticated/unknown student at the controller boundary, missing enrollment, missing/expired challenge, hidden answer on GET, backend correctness calculation, one `student_question_attempts` row, one `daily_challenge_attempts` row, second-answer idempotency, and transaction rollback.

- [ ] **Step 2: Run the tests and verify the expected failure**

Run:

```bash
node --import tsx --test src/modules/daily_challgens/services/__tests__/daily-challenge-answer.service.test.ts
```

- [ ] **Step 3: Implement repository transaction methods**

Use one Prisma transaction for checking the challenge/student relationship, creating the general attempt, and creating the challenge attempt. Use `UNIQUE (daily_challenge_id, student_id)` to protect against concurrent submissions. Return the existing result for an already-answered challenge.

- [ ] **Step 4: Implement service validation and result mapping**

Calculate `isCorrect` from the question's persisted `correctAnswer`; copy monitor, subject/topic snapshot data where available; set server timestamps; accept but bound `responseTimeMs`; never accept student id, monitor id or correctness from the request body.

- [ ] **Step 5: Add answer logs**

Emit access, validation, attempt-created, participation-created, performance-update and failure events without logging tokens, full payloads or the correct answer before submission.

- [ ] **Step 6: Run the service tests**

Expected: PASS.

### Task 5: Add Fastify controllers, routes and ranking query

**Files:**
- Create: `backend/src/modules/daily_challgens/controllers/daily-challenge.controller.ts`
- Create: `backend/src/modules/daily_challgens/repositories/daily-challenge-ranking.repository.ts`
- Create: `backend/src/modules/daily_challgens/routes/daily-challenge.routes.ts`
- Create: `backend/src/modules/daily_challgens/daily-challgens.module.ts`
- Create: `backend/src/modules/daily_challgens/controllers/__tests__/daily-challenge.controller.test.ts`
- Modify: `backend/src/server.ts`

**Interfaces:**
- `GET /api/v1/student/monitors/:monitorId/daily-challenge`
- `POST /api/v1/student/daily-challenges/:challengeId/answer`
- `GET /api/v1/student/monitors/:monitorId/daily-challenge/ranking?month=YYYY-MM`

- [ ] **Step 1: Write failing HTTP contract tests**

Test authentication, enrollment access, GET response without `correctAnswer`, valid POST, duplicate POST, expired POST, and ranking isolation by monitor/month.

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
node --import tsx --test src/modules/daily_challgens/controllers/__tests__/daily-challenge.controller.test.ts
```

- [ ] **Step 3: Implement controller error mapping**

Map domain errors to the existing API convention: `401` for missing session, `403` for missing enrollment, `404` for missing challenge, `409` for conflicting submission when applicable, `422` for expired/invalid answer and `500` for unexpected failures.

- [ ] **Step 4: Register the module under the student API prefix**

Register the module routes from `server.ts` without changing billing routes or the legacy subscription projection.

- [ ] **Step 5: Implement ranking aggregation**

Aggregate only correct `daily_challenge_attempts`, join `daily_challenges` for monitor/date, filter by the requested São Paulo month and return student id, display name/email-safe label, score and participation count. Do not include practice or simulated attempts.

- [ ] **Step 6: Run HTTP tests**

Expected: PASS.

### Task 6: Schedule generation in the worker

**Files:**
- Create: `backend/src/modules/daily_challgens/services/daily-challenge-scheduler.service.ts`
- Create: `backend/src/modules/daily_challgens/services/__tests__/daily-challenge-scheduler.service.test.ts`
- Modify: `backend/src/worker.ts`

**Interfaces:**
- `startDailyChallengeScheduler(onGenerate?: () => Promise<void>): { stop(): void }`
- Scheduler invokes generation at the next `00:00 America/Sao_Paulo`, survives one generation failure, and can be stopped during worker shutdown.

- [ ] **Step 1: Write failing scheduler tests**

Test calculation of the next local midnight, invocation at the boundary, timer cleanup, and failure logging without terminating the document worker.

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
node --import tsx --test src/modules/daily_challgens/services/__tests__/daily-challenge-scheduler.service.test.ts
```

- [ ] **Step 3: Implement scheduler without a new dependency**

Use a one-shot `setTimeout` recalculated after each run instead of a fixed 24-hour interval, so DST and São Paulo date boundaries remain correct. The scheduler should call the generation service and reschedule even after an error.

- [ ] **Step 4: Integrate startup and shutdown**

Start the scheduler from `worker.ts`, log readiness, keep document processing independent, and call `stop()` before closing BullMQ, Redis and Prisma.

- [ ] **Step 5: Run scheduler tests**

Expected: PASS.

### Task 7: Replace practice mocks with backend integration

**Files:**
- Modify: `frontend/src/app/(student-app)/areadoaluno/pratica/page.tsx`
- Modify: `frontend/src/app/(student-app)/areadoaluno/page.tsx`
- Create or modify: `frontend/src/modules/student/services/StudentLearningService.ts`

- [ ] **Step 1: Add frontend service tests or typed contract fixtures**

Cover loading the current challenge, sending an answer with credentials, showing the returned result, and preventing a second submission in the UI.

- [ ] **Step 2: Replace fixed challenge/question data**

Load the monitor and current challenge from the backend, preserve the existing palette, hide the correct answer until submission, and show the expired/no-challenge states from the API.

- [ ] **Step 3: Connect the challenge action from the dashboard**

The dashboard must link to the current challenge route/state rather than displaying fixed “1 de 3” or streak values. Do not implement streak in this plan.

- [ ] **Step 4: Run frontend typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

### Task 8: Full verification and documentation update

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/superpowers/specs/2026-09-03-daily-challenge-design.md`

- [ ] **Step 1: Update PRD contradictions**

Record that the daily challenge is one question per monitor, that it is non-repeating and random among approved questions, and that ranking is monitor-scoped and based only on daily challenge attempts. Keep streak/constancy and flashcard spaced repetition explicitly outside this implementation.

- [ ] **Step 2: Run focused backend tests**

```bash
npm run typecheck
node --import tsx --test src/modules/daily_challgens/**/__tests__/*.test.ts
```

- [ ] **Step 3: Run the existing backend test suite relevant to billing and protected routes**

Run the existing service/repository tests that cover billing, authentication and subscriptions. Expected: no regressions and no billing schema changes.

- [ ] **Step 4: Validate Prisma and migration status**

```bash
npx prisma validate
npx prisma generate
npx prisma migrate deploy
```

- [ ] **Step 5: Perform a manual end-to-end check**

Verify from logs that generation creates one challenge, GET returns the same question for two enrolled students, each answer creates one general attempt and one challenge attempt, duplicate answer does not duplicate rows, and ranking excludes practice answers.

## Self-review checklist

- All spec rules have a corresponding implementation task.
- No task changes billing behavior.
- The database, not only application code, enforces idempotency and one answer.
- No eligible question is silently repeated.
- Time calculations use `America/Sao_Paulo` rather than the server timezone.
- The plan keeps constancy, streak, flashcard SRS and weighted ranking out of scope.
