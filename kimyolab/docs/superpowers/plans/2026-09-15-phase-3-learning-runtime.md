# Phase 3 Learning Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the engine-independent KimyoLab learning runtime: typed evidence, assessment scoring, mastery v1, progress reduction and IndexedDB persistence, practice routing, remediation, and a minimal end-to-end Learning Runner.

**Architecture:** Phase 3 consumes canonical Phase 1 content and Phase 2 domain contracts but does not depend on UI or concrete activity engines. The Practice Router talks to small engine adapters; the Learning Runner resolves canonical content, executes a registered adapter, collects typed evidence, runs assessment/mastery, and persists progress through a storage abstraction whose browser implementation uses IndexedDB.

**Tech Stack:** TypeScript, Node 24 type stripping, Node test runner, browser IndexedDB API behind an injected factory.

**Spec:** `docs/specs/KimyoLab_v20_Master_TT_v2.1_FINAL_IMPLEMENTATION_SPEC.md`

## Global Constraints

- `Evidence.value: unknown` is prohibited; evidence must be a discriminated union.
- Activity completion is not mastery.
- Mastery v1 must implement the TT weights, minimum-evidence rules and thresholds.
- Progress writes must never fail silently.
- IndexedDB access must be isolated behind a runtime store and support reload/restore.
- Practice routing must return `ACTIVITY_NOT_READY` for non-ready activities and must not know concrete engine internals.
- Runtime modules must not depend on DOM/CSS/Sinco.
- CHEM-033 external chemistry approval remains pending; Phase 3 may technically proceed without changing Chemistry Core.

---

## File map

### Create
- `src/runtime/evidence/types.ts` — discriminated evidence union and runtime validator.
- `src/domain/assessment/scoring.ts` — assessment aggregation and weak-concept detection.
- `src/domain/mastery/mastery.ts` — mastery v1 scoring and status rules.
- `src/runtime/progress/types.ts` — progress/mastery persistence contracts.
- `src/runtime/progress/reducer.ts` — deterministic progress transitions and migration.
- `src/runtime/progress/indexeddb-store.ts` — IndexedDB persistence adapter.
- `src/runtime/practice-router/router.ts` — practice type to engine adapter registry.
- `src/runtime/remediation/router.ts` — evidence/reason to remediation target mapping.
- `src/runtime/learning-runner/runner.ts` — minimal canonical learning orchestration.
- `tests/helpers/fake-indexeddb.mjs` — minimal test-only IndexedDB implementation.
- `tests/phase3-evidence.test.mjs`
- `tests/phase3-assessment.test.mjs`
- `tests/phase3-mastery.test.mjs`
- `tests/phase3-progress.test.mjs`
- `tests/phase3-indexeddb.test.mjs`
- `tests/phase3-router.test.mjs`
- `tests/phase3-remediation.test.mjs`
- `tests/phase3-learning-runner.test.mjs`
- `reports/traceability-phase3.csv`
- `docs/gates/phase-3-gate-report.md`

### Modify
- `package.json` — add Phase 3 verification scripts.
- `docs/status/current-status.md` — record Phase 3 state.

---

### Task 1: Typed Evidence contract

**Produces:** `Evidence`, `EvidenceClass`, `validateEvidence(evidence)`.

- [ ] Write failing tests for all six evidence discriminators, required version metadata, score bounds and unknown discriminator rejection.
- [ ] Run targeted test and verify RED.
- [ ] Implement the minimal discriminated union and runtime validator.
- [ ] Run targeted/full tests GREEN.
- [ ] Commit.

### Task 2: Assessment scoring

**Produces:** `scoreAssessment(input): AssessmentResult`.

- [ ] Write failing tests for 0..100 score, concept aggregation, weak concepts and remediation IDs.
- [ ] Verify RED.
- [ ] Implement deterministic scoring from typed evidence only.
- [ ] Verify GREEN and commit.

### Task 3: Mastery v1

**Produces:** `computeConceptMastery(input): ConceptMastery`.

- [ ] Write failing tests for no evidence, minimum evidence, class weights, recent evidence weighting, thresholds, transfer-required behavior and conflicting evidence.
- [ ] Verify RED.
- [ ] Implement TT v1 algorithm with scoring version metadata.
- [ ] Verify GREEN and commit.

### Task 4: Progress reducer and migration

**Produces:** `createProgress`, `reduceProgress`, `migrateProgressRecord`.

- [ ] Write failing tests for not_started→in_progress→practice_complete→assessment_complete/mastered/needs_review and v0 migration.
- [ ] Verify RED.
- [ ] Implement deterministic reducer and idempotent migration.
- [ ] Verify GREEN and commit.

### Task 5: IndexedDB persistence

**Produces:** `IndexedDbProgressStore` with progress/evidence/assessment/mastery methods.

- [ ] Write failing tests using test-only fake IndexedDB for save/reload/restore and unavailable-IDB structured failure.
- [ ] Verify RED.
- [ ] Implement injected IndexedDB adapter and `PROGRESS_SAVE_FAILED`/`PROGRESS_LOAD_FAILED` errors.
- [ ] Verify GREEN and commit.

### Task 6: Practice Router

**Produces:** `PracticeRouter.register(type, adapter)` and `.run(activity, context)`.

- [ ] Write failing tests for all five types, ready check, missing adapter and output forwarding.
- [ ] Verify RED.
- [ ] Implement minimal registry contract.
- [ ] Verify GREEN and commit.

### Task 7: Remediation Router

**Produces:** `routeRemediation(reason)`.

- [ ] Write failing tests for concept/visual/procedure/formula/equation/calculation/reasoning routes.
- [ ] Verify RED.
- [ ] Implement static typed mapping.
- [ ] Verify GREEN and commit.

### Task 8: Minimal Learning Runner

**Produces:** `LearningRunner.run(learningUnitId, context)`.

- [ ] Write failing synthetic end-to-end test resolving a canonical unit/mapping/theory/practice fixture, practice evidence, assessment evidence, mastery, persistence and reload.
- [ ] Verify RED.
- [ ] Implement repository interfaces and minimal orchestration without concrete engine code.
- [ ] Verify targeted/full GREEN.
- [ ] Commit.

### Task 9: Phase 3 gate

- [ ] Add `test:runtime` and `phase3:verify` scripts.
- [ ] Add Phase 3 traceability rows.
- [ ] Run `npm run phase3:verify` fresh.
- [ ] Write gate report from actual output only.
- [ ] Update current status and commit.

## Phase 3 Stop Gate

Must all be true:
- typed evidence rejects invalid/unversioned data;
- assessment scores deterministic;
- mastery v1 thresholds/minimum-evidence rules pass;
- progress migration is idempotent;
- IndexedDB store round-trips state across store instances;
- practice router respects lifecycle readiness;
- remediation mapping passes;
- synthetic LearningUnit → Practice → Evidence → Assessment → Mastery → Save → Reload flow passes;
- no Phase 0/1/2 regression.
