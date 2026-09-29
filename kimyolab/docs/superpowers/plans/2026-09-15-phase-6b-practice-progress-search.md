# Phase 6B Practice, Progress, Search and Worksheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use TDD and execute task-by-task with fresh verification.

**Goal:** Connect the verified Phase 5 reference activities to student-facing practice screens, persist/resume progress, and add student search plus worksheet/print flows.

**Architecture:** Browser UI consumes the versioned content pack through `ContentClient`. A pure `ReferencePracticeSession` bridges student inputs to the existing Phase 5 engine adapters; rendering stays thin and semantic. Progress is exposed through a browser service wrapping the Phase 3 IndexedDB contract. Search and worksheet models are pure data projections.

**Spec:** `docs/specs/KimyoLab_v20_Master_TT_v2.1_FINAL_IMPLEMENTATION_SPEC.md`

## Global constraints
- No duplicated chemistry or scoring logic in UI.
- `/practice/:practiceActivityId` is canonical and deep-linkable.
- Student view models must not expose lifecycle/approval/mapping/legacy/debug metadata.
- Reference practices must execute existing engines, not UI-only imitations.
- Progress save failures must remain explicit.
- Print/worksheet must be semantic HTML and not require a separate answer-key cache.

### Task 1 — Practice route and content model
- Add canonical practice route.
- Add `ContentClient.loadPractice()` with version/config/chemistry payload required by existing adapters.
- Add source/server deep-link tests.

### Task 2 — Reference practice session
- Build session/controller over the existing reference-slice router.
- Preserve action history and rerun deterministic engines to produce typed evidence and serializable state.
- Test all five families plus reactive chemistry.

### Task 3 — Student practice renderer
- Render type-specific controls and structured feedback.
- Keep semantic controls and keyboard-compatible buttons/fields.
- Do not use unsafe HTML.

### Task 4 — Progress/resume UI
- Wrap Phase 3 `IndexedDbProgressStore` for browser usage.
- Save activity serialized state and learning-unit progress.
- Render progress summary and resume links.

### Task 5 — Search and worksheet/print
- Build locale-aware lightweight student search over canonical learning units/practices/concepts.
- Generate worksheet model from current Learning Hub data and version stamp it.
- Add print stylesheet and route integration.

### Task 6 — Phase 6B gate
- Run full regression and Phase 6 suites serially.
- Record actual Vite/browser/a11y environment gates separately; do not fake them.
