# Phase 4 Gate Report — Activity Engine Contracts

**Date:** 2026-09-15  
**Branch:** `phase/4-activity-engines`  
**Base:** `phase/3-learning-runtime` at `3dedaac`  
**Spec:** KimyoLab v20 Master TT v2.1 FINAL IMPLEMENTATION SPEC

## Fresh verification

Command:

```bash
npm test
npm run test:engines
```

Observed result:

```text
Full regression suite    88/88 PASS
Phase 4 engine suite     12/12 PASS
Failures                 0
```

The preceding `npm run phase4:verify` run also completed with exit code 0 and re-validated Phase 1 canonical data, Phase 2 technical chemistry, Phase 3 learning runtime, and the Phase 4 engine suite.

## Implemented deliverables

- Shared `EngineCapabilities` contract and major-version compatibility check.
- `ExperimentEngine` with dependency-aware required/optional/repeatable steps, structured accepted/invalid/unsafe action outcomes, typed evidence, serialization and restore.
- `SimulationEngine` with deterministic seed, reducer-driven state, typed evidence collection, serialization/restore/reset and capability metadata.
- `TrainerEngine` with attempt policy, specific feedback, hint ladder, retry/explanation flow, typed answer evidence and persistence-ready serialization.
- `CalculationEngine` with ordered step validation, rejection of final-number-only shortcuts, typed calculation evidence and serialization/restore.
- `CaseEngine` with evidence selection, decision, scientific-justification threshold, rubric scoring, typed transfer evidence and serialization/restore.
- Public engine surface in `src/engines/index.ts`.
- Phase 4 traceability report and engine-specific automated tests.

## Gate status

### Phase 4 technical stop gate: GREEN

All five engine families have isolated executable automated references and common serializable capability contracts.

## Carried-forward gates / explicit non-claims

- **CHEM-033 remains external Chemistry Reviewer approval YELLOW.** The technical chemistry core is green; scientific expert approval is not claimed.
- Phase 0 visual screenshot baseline remains blocked by managed-browser policy.
- ADR-001 reference-slice curriculum-ID conflict must be resolved before Phase 5 slice implementation. Canonical data will not be altered to match an incorrect specification ID.
- Phase 4 validates engine contracts, not final student UI; UI productization remains Phase 6.

## Known S0/S1

No automated Phase 4 S0/S1 defect is known from the fresh 88-test regression suite.

## Next gate

Phase 5 may begin only after canonical reference-slice IDs are audited and the ADR/spec amendment records the authoritative IDs.
