# Phase 5 Reference Vertical Slices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build six verified vertical slices that exercise all five activity engines plus real reactive chemistry through the canonical LearningRunner flow.

**Architecture:** Hand-authored reference activity configs live under `content-src/activity-configs/` and are copied into the runtime content pack. Canonical migration applies a narrow override registry only after both legacy and planned activities are generated, so reference activities become `ready` without corrupting legacy source data. Runtime adapters translate deterministic reference-slice inputs into the existing engine contracts and return typed evidence to LearningRunner.

**Tech Stack:** Node 24, TypeScript strip-types, Node test runner, canonical JSON content pack, existing Phase 2 chemistry core, Phase 3 LearningRunner, Phase 4 engines.

**Spec:** `docs/specs/KimyoLab_v20_Master_TT_v2.1_FINAL_IMPLEMENTATION_SPEC.md`

## Global Constraints

- Unknown chemistry MUST return `REACTION_NOT_MODELED`; never infer products.
- Canonical relationships remain owned by `MappingLink`.
- Reference activities may become `ready`, but expert approval records remain pending unless actually reviewed.
- Runtime activity config must be content, not hard-coded into UI pages.
- Six verified reference slices: 7.03 experiment, 7.07 simulation, 7.11 trainer, 7.12 calculation, 7.18 case, 8.16 reactive experiment.

---

### Task 1: Reference content overrides and runtime pack

**Files:**
- Create: `content-src/activity-overrides.json`
- Create: `content-src/activity-configs/reference-slices.json`
- Modify: `scripts/migrate-legacy.ts`
- Modify: `scripts/build-content-pack.ts`
- Test: `tests/phase5-content.test.mjs`

**Interfaces:**
- Consumes: legacy migration output and planned activity generation.
- Produces: six `ready` canonical activities and a versioned reference-slice config pack.

- [ ] Write failing tests proving overrides apply to both legacy and planned activities after migration.
- [ ] Run tests and confirm RED.
- [ ] Implement post-generation override application and recursive `activity-configs/` pack copy.
- [ ] Run tests and confirm GREEN.

### Task 2: Experiment reference slices

**Files:**
- Create: `src/runtime/reference-slices/config.ts`
- Create: `src/runtime/reference-slices/experiment-adapter.ts`
- Test: `tests/phase5-experiment-slices.test.mjs`

**Interfaces:**
- Consumes: ExperimentEngine, ReactionMatcher, IonicEngine, reference config registry.
- Produces: typed evidence and serialized state for 7.03 and 8.16.

- [ ] Test 7.03 correct sequence and filter-before-dissolve rejection.
- [ ] Test 8.16 AgNO3 + NaCl precipitation, net ionic equation, and unknown pair rejection.
- [ ] Implement minimal adapters/evaluators.
- [ ] Verify GREEN.

### Task 3: Simulation, trainer, calculation, case slices

**Files:**
- Create: `src/runtime/reference-slices/simulation-adapter.ts`
- Create: `src/runtime/reference-slices/trainer-adapter.ts`
- Create: `src/runtime/reference-slices/calculation-adapter.ts`
- Create: `src/runtime/reference-slices/case-adapter.ts`
- Create: `src/runtime/reference-slices/index.ts`
- Test: `tests/phase5-learning-slices.test.mjs`

**Interfaces:**
- Consumes: Phase 4 engines and FormulaParser.
- Produces: deterministic 7.07, 7.11, 7.12, 7.18 executions.

- [ ] Write failing tests for each slice.
- [ ] Implement minimal engine adapters.
- [ ] Verify slice tests GREEN.

### Task 4: Canonical LearningRunner E2E

**Files:**
- Create: `src/runtime/reference-slices/repository.ts`
- Test: `tests/phase5-e2e.test.mjs`

**Interfaces:**
- Consumes: canonical LearningUnit/MappingLink/Theory/Practice data, PracticeRouter, LearningRunner, IndexedDbProgressStore.
- Produces: six end-to-end learning runs with persistence and reload restore.

- [ ] Write six failing E2E tests.
- [ ] Implement repository/router wiring.
- [ ] Verify `Theory → Practice → Evidence → Assessment → Mastery → Progress → Reload` for all six.

### Task 5: Gate and checkpoint

**Files:**
- Modify: `package.json`
- Create: `docs/gates/phase-5-gate-report.md`
- Modify: `docs/status/current-status.md`

- [ ] Add `test:reference-slices` and `phase5:verify` scripts.
- [ ] Run full `npm run phase5:verify` fresh.
- [ ] Record exact counts and known external blockers without overstating approval.
- [ ] Create Phase 5 checkpoint archive.
