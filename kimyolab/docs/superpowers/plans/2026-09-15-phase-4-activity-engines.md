# Phase 4 Activity Engines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build five reusable, UI-independent activity engine contracts with serializable state and isolated executable references: Experiment, Simulation, Trainer, Calculation, and Case.

**Architecture:** Each engine is a pure/domain-oriented state machine under `src/engines/<type>/`. UI rendering is deliberately absent. Engine sessions expose deterministic state transitions, structured invalid/unsafe outcomes where applicable, typed Evidence emission, serialization/restore, and capability metadata. Phase 5 will bind real curriculum configs and UI adapters to these contracts.

**Tech Stack:** TypeScript, Node 24 type stripping, Node test runner, existing typed Evidence and Chemistry Core contracts.

**Spec:** `docs/specs/KimyoLab_v20_Master_TT_v2.1_FINAL_IMPLEMENTATION_SPEC.md`

## Global Constraints

- Engines MUST NOT depend on DOM/CSS/Sinco.
- Every engine MUST have serializable state or explicitly deterministic reconstructability.
- Evidence emitted by engines MUST pass the Phase 3 typed Evidence validator.
- Engine errors/outcomes MUST be structured; unknown chemistry MUST still respect the Phase 2 trust boundary.
- The engine layer MUST NOT embed curriculum-specific 7.02/7.07/etc content; those belong to Phase 5 configs.
- Capabilities MUST declare keyboard/touch/offline/reducedMotion/lowEndFallback/serializable.

---

## File map

### Create
- `src/engines/shared/types.ts` — common capabilities, session and compatibility contracts.
- `src/engines/experiment/types.ts`
- `src/engines/experiment/engine.ts`
- `src/engines/simulation/engine.ts`
- `src/engines/trainer/engine.ts`
- `src/engines/calculation/engine.ts`
- `src/engines/case/engine.ts`
- `tests/phase4-experiment.test.mjs`
- `tests/phase4-simulation.test.mjs`
- `tests/phase4-trainer.test.mjs`
- `tests/phase4-calculation.test.mjs`
- `tests/phase4-case.test.mjs`
- `tests/phase4-engine-smoke.test.mjs`
- `reports/traceability-phase4.csv`
- `docs/gates/phase-4-gate-report.md`

### Modify
- `package.json` — Phase 4 scripts.
- `docs/status/current-status.md` — Phase 4 status.

---

### Task 1: Shared engine contracts

- [ ] Write failing smoke contract test for common capabilities and config-version compatibility.
- [ ] Implement `EngineCapabilities`, `EngineCompatibilityResult`, and `checkEngineCompatibility`.
- [ ] Verify GREEN and commit.

### Task 2: ExperimentEngine

**Produces:** `ExperimentEngine`, scenario/state/action contracts.

- [ ] Write failing tests for dependency-aware required steps, accepted/invalid/unsafe actions, repeatable steps, evidence emission, serialize/restore.
- [ ] Verify RED.
- [ ] Implement generic step/state reducer with injected action evaluator and no chemistry guessing.
- [ ] Verify GREEN and commit.

### Task 3: SimulationEngine

**Produces:** `StatefulSimulationEngine<State,Action>`.

- [ ] Write failing tests for deterministic seed, dispatch, evidence collection, serialization, restore, reset, capabilities.
- [ ] Verify RED.
- [ ] Implement reducer-based generic simulation session.
- [ ] Verify GREEN and commit.

### Task 4: TrainerEngine

**Produces:** question/attempt/hint/retry/explanation state machine.

- [ ] Write failing tests for correct answer, wrong answer, attempt count, hint ladder, retry, explanation policy, evidence.
- [ ] Verify RED.
- [ ] Implement generic validator-driven trainer session.
- [ ] Verify GREEN and commit.

### Task 5: CalculationEngine

**Produces:** ordered calculation-step validator with unit/tolerance support delegated to step validators.

- [ ] Write failing tests for step order, invalid step, accepted step, completion, evidence, serialization.
- [ ] Verify RED.
- [ ] Implement config-driven calculation session.
- [ ] Verify GREEN and commit.

### Task 6: CaseEngine

**Produces:** evidence selection → decision → justification → reflection/rubric state machine.

- [ ] Write failing tests for required evidence, decision, justification threshold, rubric score, completion and Evidence output.
- [ ] Verify RED.
- [ ] Implement generic case session.
- [ ] Verify GREEN and commit.

### Task 7: Five-engine smoke gate

- [ ] Write a failing isolated smoke test instantiating all five engine families with minimal configs.
- [ ] Verify RED before final adapters/exports.
- [ ] Make all five executable with typed evidence and serializable state.
- [ ] Verify targeted/full GREEN.
- [ ] Add traceability and gate report from fresh results.
- [ ] Commit.

## Phase 4 Stop Gate

Must all be true:
- all five engine families instantiate and execute in isolation;
- each engine emits valid typed Evidence where completion produces evidence;
- ExperimentEngine supports structured invalid/unsafe outcomes and dependency-aware steps;
- SimulationEngine is deterministic/serializable;
- TrainerEngine implements attempt/hint/retry/explanation flow;
- CalculationEngine validates ordered steps without relying on final-number-only scoring;
- CaseEngine requires scientific justification before completion;
- engine compatibility/capabilities contracts pass;
- no Phase 0–3 regression.
