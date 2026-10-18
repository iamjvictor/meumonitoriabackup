# Monitor bank filtering and question counts

## Goal

Make the selected exam boards in the teacher monitor wizard control the catalog shown in the question-bank step, the question counts displayed there, and the exam provenance saved for each selected topic. Start with no board selected so the wizard never implies ENEM or another board was chosen automatically.

## Current behavior and causes

- `TeacherMonitorCreationModal` initializes and resets `selectedExamProfiles` to `['enem']`.
- `MonitorRepository.getQuestionBankCatalog()` groups rows by board and exam type to produce profile totals, but merges rows from different profiles into shared subject/topic/subtopic nodes. Those nodes expose aggregate question counts and only subjects expose the set of profile IDs.
- The frontend filters whole subjects by their profile IDs. It cannot filter a shared topic's count by profile because the response does not preserve profile-specific counts at each node.
- `buildQuestionBankSelections()` writes each checked leaf once for every selected profile. A leaf present for only one of several selected boards is therefore saved against all selected boards.
- The summary uses `profile.badge`, which can be a generic label such as “OFICIAL”, instead of the selected profile's identifying name.

## Intended experience

1. The wizard opens with no exam board selected. The profile list and its totals remain visible when the live catalog is available, and the teacher explicitly chooses one or more profiles.
2. The summary chips identify each selection by the profile name (for example, “Fundação CESGRANRIO”). A classification badge may remain on the profile card, but it is not used as the sole identity in the summary.
3. The catalog step lists only subjects and taxonomy nodes that have questions in the selected profiles. Counts represent only those profiles. Selecting a subset of profiles updates the counts and visible taxonomy accordingly.
4. When a taxonomy leaf is selected, saved question-bank selections include only selected profiles that actually have questions for that leaf. If several selected profiles share a leaf, the selection is associated with each of those profiles.
5. With no selected profile, the catalog step explains that a profile must be selected and shows no profile-agnostic question counts. Existing manually created monitor subjects remain unaffected.

## Data contract

Extend the catalog response so every taxonomy node (subject, topic, subtopic, and subsubtopic) retains its contributing profile IDs and a per-profile question count map. The map is keyed by the same stable profile ID already returned in `examProfiles`, and only positive counts are included. Existing aggregate counts may remain for compatibility, but the wizard must calculate visible counts from the selected profile IDs and must not treat a missing profile association as belonging to every profile.

The profile identity remains composed from normalized `exam_type` and `board`, consistent with the profile IDs returned today. Profile names are presentation labels only; stored `examType` and `board` values continue to use the catalog profile record.

## Frontend behavior

- Use an empty array for initial and reset selection state. Remove the fabricated local ENEM profile/count fallback; if the live catalog cannot load, show a clear unavailable state rather than a selectable profile with a synthetic count.
- Derive visible subjects and nodes from intersection with selected profile IDs. Empty `examProfileIds` means the node is unclassified and is excluded from the bank-filtered catalog.
- Derive row, subject, and summary counts by summing each selected profile's count at the corresponding node. Keep the selected topic IDs across filter changes where they still exist, and ensure hidden topics do not contribute to the current selected-count total.
- Build persisted `questionBankSelections` from each checked leaf's profile IDs intersected with the selected profiles, rather than taking a Cartesian product of leaves and selected profiles.
- Use the selected profile's `name` in selection chips and review summaries; keep `badge` for the card's category/classification badge.
- Show an inline prompt in the catalog step while no profile is selected, so an empty choice cannot create ambiguous “Geral” selections.

## Backend behavior

Keep the existing catalog endpoint. While aggregating the current SQL rows, collect per-profile counts and profile ID sets on every taxonomy node before converting the maps to response arrays. Do not change the question-bank schema or the persisted monitor-selection schema; each persisted selection already carries `examType` and `board`.

## Error and compatibility handling

- A question row without a board continues to map to its exam type profile (for example, ENEM), following current profile ID generation.
- If the backend catalog cannot load, show a clear unavailable state and do not offer fabricated fallback profiles or counts as live data.
- API clients that ignore the new per-profile fields can continue using aggregate fields. The monitor wizard itself requires per-profile fields to report bank-scoped counts accurately.

## Verification

- Backend unit tests: a shared subject/topic across ENEM and a board such as FGV returns distinct counts and profile IDs at each taxonomy level.
- Frontend unit tests: no profile is selected initially or after reset; selecting one profile hides unrelated nodes and uses its count; selecting two profiles sums counts without misattributing a leaf; summary chips use profile names.
- Selection-builder tests: a leaf contributes persisted selections only for profiles that contain that leaf, including the case where multiple selected boards share it.
- Run affected backend and frontend tests and typechecks; inspect the final diff to ensure existing local changes are preserved.

## Scope boundaries

This work does not change how question items are imported, deduplicated, served to students, or materialized into monitor content. It changes catalog aggregation metadata and how the monitor wizard filters, counts, labels, and records selected bank taxonomy.
