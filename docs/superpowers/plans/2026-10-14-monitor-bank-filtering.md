# Monitor Bank Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make monitor catalog filtering, question counts, and saved taxonomy selections reflect only the exam boards the teacher selected and that actually contain each question topic.

**Architecture:** Extend the existing catalog response with profile IDs and per-profile counts at every taxonomy level. Add pure frontend helpers to filter/count that response and build bank-specific selections, then wire the modal to start with no selected profile, display identifiable profile names, and handle unavailable catalogs clearly.

**Tech Stack:** TypeScript, Fastify repository, Prisma raw SQL, React, Vitest, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-14-monitor-bank-filtering-design.md`

## Global Constraints

- Keep the existing catalog endpoint.
- The map is keyed by the same stable profile ID already returned in `examProfiles`, and only positive counts are included.
- Existing aggregate counts may remain for compatibility.
- A question row without a board continues to map to its exam type profile (for example, ENEM), following current profile ID generation.
- Do not change the question-bank schema or the persisted monitor-selection schema; each persisted selection already carries `examType` and `board`.
- If the backend catalog cannot load, show a clear unavailable state and do not offer fabricated fallback profiles or counts as live data.

## Review Focus

- Shared subject/topic across ENEM and FGV: each node reports separate counts; covered by Task 1 repository test.
- Profile-specific leaf absent from one of multiple selected boards: it is not displayed or saved for that board; covered by Task 2 filtering and builder tests.
- No selected profile: catalog is empty with an explanatory prompt and no accidental “Geral” provenance; covered by Task 3 modal test.
- A leaf shared by multiple selected boards: count is summed once per board and saved once per actual profile; covered by Task 2 tests.
- Catalog load failure or empty live catalog: no synthetic ENEM option/count is offered; covered by Task 3 modal test.

---

### Task 1: Preserve profile counts through backend taxonomy aggregation

**Files:**
- Modify: `backend/src/repositories/monitor.repository.ts` (`buildTaxonomyFromQuestionBank`)
- Test: `backend/src/repositories/__tests__/monitor.repository.question-bank-catalog.test.ts`

**Interfaces:**
- Produces `examProfileIds: string[]` and `questionCountsByProfile: Record<string, number>` on subjects, topics, subtopics, and subsubtopics in the catalog response. Keep the current aggregate count fields and profile IDs.

- [ ] **Step 1: Add a failing aggregation test**

Add `returns per-profile counts at every taxonomy level when taxonomy is shared` with two profiles sharing a subject/topic, one shared subtopic, and one profile-specific subtopic. Assert IDs, profile count maps, and current aggregate totals on all four levels.

- [ ] **Step 2: Run the repository test and confirm the new assertions fail**

Run from `backend/`: `node --import tsx --test src/repositories/__tests__/monitor.repository.question-bank-catalog.test.ts`

Expected: the existing profile identity test passes and the new test fails because taxonomy nodes do not expose per-profile counts.

- [ ] **Step 3: Add per-profile aggregation maps**

In `buildTaxonomyFromQuestionBank`, initialize each node with a profile count map and profile ID set. For each SQL row, increment those fields using the already-computed `profileId` and `rowCount`; serialize the sets as arrays and keep only positive map entries. Preserve the repository's existing unrelated local change to monitor subject/subtopic ordering.

- [ ] **Step 4: Run the repository test and backend typecheck**

Run the targeted Node test above and `npm run typecheck` from `backend/`.

Expected: both pass.

- [ ] **Step 5: Commit only Task 1 files**

Stage only `backend/src/repositories/monitor.repository.ts` and `backend/src/repositories/__tests__/monitor.repository.question-bank-catalog.test.ts`.

### Task 2: Add profile-aware frontend catalog helpers and selection builder

**Files:**
- Create: `frontend/src/modules/teacher/components/question-bank-catalog.ts`
- Modify: `frontend/src/modules/teacher/components/TeacherMonitorCreationModal.tsx` (remove in-file catalog interfaces and builder; import shared definitions)
- Test: `frontend/tests/unit/question-bank-catalog.test.tsx`

**Interfaces:**
- Consumes the Task 1 fields: `examProfileIds` and `questionCountsByProfile` at all taxonomy levels.
- Produces `getQuestionCountForProfiles(node, selectedProfileIds): number`, `filterQuestionBankCatalogByProfiles(subjects, selectedProfileIds): QuestionBankSubject[]`, and `buildQuestionBankSelections(input): QuestionBankSelectionDraft[]`.
- The builder emits one selection for each checked leaf and each selected profile listed on that leaf, resolving `examType` and `board` from the matching `ExamProfile`.

- [ ] **Step 1: Add failing helper tests**

Add tests named `filters subjects and taxonomy nodes to selected profiles`, `sums only selected profile counts`, and `builds selections only for profiles that contain a checked leaf`. Cover a leaf that exists only in FGV and a shared leaf present in ENEM and FGV.

- [ ] **Step 2: Run the helper test and confirm it fails**

Run from `frontend/`: `npm run test:unit -- tests/unit/question-bank-catalog.test.tsx`

Expected: FAIL because the helper module and functions do not exist.

- [ ] **Step 3: Implement the pure helpers and exported types**

Define the subject/topic/subtopic/subsubtopic types in the new module. Filter recursively using selected-profile counts; exclude unclassified nodes and zero-count branches. Keep the existing stable taxonomy IDs. Build selection provenance by intersecting each checked leaf's profile IDs with the selected profile IDs, not by pairing every selected leaf with every profile.

- [ ] **Step 4: Run helper tests and frontend typecheck**

Run `npm run test:unit -- tests/unit/question-bank-catalog.test.tsx` and `npm run typecheck` from `frontend/`.

Expected: both pass.

- [ ] **Step 5: Commit only Task 2 files**

Stage only the new helper, its test, and `TeacherMonitorCreationModal.tsx`.

### Task 3: Wire the monitor wizard to profile-aware filtering and clear states

**Files:**
- Modify: `frontend/src/modules/teacher/components/TeacherMonitorCreationModal.tsx`
- Modify: `frontend/src/modules/teacher/services/TeacherMonitorService.ts`
- Test: `frontend/tests/unit/TeacherMonitorCreationModal.test.tsx`

**Interfaces:**
- Consumes the profile-aware types and helpers from Task 2.
- Leaves persistence interfaces unchanged; the modal continues producing existing `QuestionBankSelectionDraft` objects with `subject`, `topic`, `examType`, `board`, `subtopic`, and `subsubtopic`.

- [ ] **Step 1: Add failing modal behavior tests**

Add tests named `starts with no exam profile selected`, `shows only counts for selected profiles`, `uses profile names in selected-profile summaries`, and `shows an unavailable state instead of a fabricated ENEM profile when catalog loading fails`. Drive the wizard through the existing tutorial and stepper, mock `getQuestionBankCatalog`, and assert the visible checkboxes, labels, counts, and unavailable state.

- [ ] **Step 2: Run the modal test and confirm the new assertions fail**

Run from `frontend/`: `npm run test:unit -- tests/unit/TeacherMonitorCreationModal.test.tsx`

Expected: FAIL on the initial ENEM selection and fabricated fallback profile behavior.

- [ ] **Step 3: Apply the helpers to the modal**

Set initial and reset `selectedExamProfiles` to `[]`; remove the synthetic `INITIAL_EXAM_PROFILES` ENEM entry; expose catalog load errors and render an unavailable state; render a prompt when no profiles are selected. Use the filtered tree as the source for active subject, displayed node counts, and selected question totals. Preserve checked IDs while switching profile filters, but count only visible, selected-profile questions. Use profile `name` for selected-profile chips and review labels, while retaining `badge` on the bank cards.

- [ ] **Step 4: Update the service response types**

Update `TeacherMonitorService.getQuestionBankCatalog()` return types to include the per-profile fields on each taxonomy level and keep existing aggregate count fields.

- [ ] **Step 5: Run modal, helper, and typecheck verification**

Run `npm run test:unit -- tests/unit/TeacherMonitorCreationModal.test.tsx tests/unit/question-bank-catalog.test.tsx` and `npm run typecheck` from `frontend/`.

Expected: both pass.

- [ ] **Step 6: Commit only Task 3 files**

Stage only `TeacherMonitorCreationModal.tsx`, `TeacherMonitorService.ts`, and `TeacherMonitorCreationModal.test.tsx`.

### Task 4: Cross-layer verification and diff review

**Files:**
- Review only: the files listed in Tasks 1–3.

- [ ] **Step 1: Run all focused backend and frontend tests**

Run the backend catalog test, then from `frontend/` run `npm run test:unit -- tests/unit/question-bank-catalog.test.tsx tests/unit/TeacherMonitorCreationModal.test.tsx`.

Expected: all focused tests pass.

- [ ] **Step 2: Run typechecks and inspect whitespace/diff**

Run `npm run typecheck` from `backend/` and `frontend/`; run `git diff --check` from the repository root. Inspect that existing unrelated working-tree changes remain untouched and only the intended file paths were staged.

Expected: both typechecks and diff check pass; no unrelated files are staged.

- [ ] **Step 3: Commit only the remaining Task 4 changes, if any**

Do not stage or commit unrelated workspace changes.
