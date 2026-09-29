# Phase 5 Gate Report — 6 Reference Vertical Slices

**Date:** 2026-09-15  
**Branch:** `phase/5-reference-slices`  
**Technical gate:** GREEN

## Scope delivered

Six canonical vertical slices are executable through the Phase 3 `LearningRunner` and Phase 4 engine contracts:

| Learning Unit | Canonical practice | Engine | Reference behavior |
|---|---|---|---|
| `lu.7.03` | `practice.experiment.7.2` | Experiment | Salt purification: dissolve → filter → evaporate → observe |
| `lu.7.07` | `practice.simulation.7.07.planned` | Simulation | Atom Builder: 6p/8n/6e → Carbon-14 |
| `lu.7.11` | `practice.trainer.7.4` | Trainer | Valency → formula, specific feedback + retry |
| `lu.7.12` | `practice.calculation.7.5` | Calculation | H2SO4 relative mass, ordered steps, final 98 |
| `lu.7.18` | `practice.case.7.14` | Case | Air-pollution evidence → decision → scientific justification |
| `lu.8.16` | `practice.experiment.8.1` | Experiment + Chemistry Core | AgNO3 + NaCl precipitation and net ionic equation |

## Canonical-ID correction

The earlier specification label `7.02 — Experiment` is not treated as authoritative data. Canonical curriculum data maps the separation experiment to `lu.7.03` / `practice.experiment.7.2`. No source data was rewritten to force the outdated label.

## Content architecture

- Hand-authored implementation configs live in `content-src/activity-configs/reference-slices.json`.
- `content-src/activity-overrides.json` marks only the six implemented reference activities `ready` and attaches canonical concept IDs/accessibility profiles.
- Overrides are applied after both legacy and planned activities are materialized, preventing the planned `7.07` simulation from being patched before it exists.
- Activity configs are copied into the versioned runtime content pack and contribute to the pack checksum.

## Reactive chemistry evidence

The `lu.8.16` reference experiment exercises:

- curated `ReactionMatcher`;
- `rxn.agno3-nacl`;
- typed white-precipitate observation;
- `IonicEngine` net ionic equation `Ag+ + Cl- → AgCl(s)`;
- explicit `REACTION_NOT_MODELED` for an unmodeled reactant pair.

No product inference is performed for unknown chemistry.

## Fresh verification evidence

### Full regression

Command:

```bash
node --experimental-strip-types --test tests/*.test.mjs
```

Result:

```text
103 tests
103 pass
0 fail
```

### Phase 5 reference suite

Command:

```bash
npm run test:reference-slices
```

Result:

```text
15 tests
15 pass
0 fail
```

### Full phase chain

Command:

```bash
npm run phase5:verify
```

Result: exit code `0`.

The command reran canonical migration/import, mapping validation, chemistry validation, content-pack build, schema validation, property/corpus tests, full regression, Phase 3 runtime, Phase 4 engines and Phase 5 slices.

### Canonical/content gates during the fresh run

```text
LearningUnit             122
TheoryActivity           122
Concept                  331
PracticeActivity         133
MappingLink              194
Primary mappings         122

duplicateCanonicalIds   0
unknownRefs              0
forwardReverseMismatch   0
schemaErrors             0
orphanRequiredEntities   0
```

Chemistry validator:

```text
speciesRecords           84
reactionRecords          28
dissociationRules        12
formulaErrors            0
reactionBalanceErrors    0
referenceErrors          0
sourceErrors             0
```

## External/non-Phase-5 items still open

1. **CHEM-033 expert approval** — technical 200-case corpus/review package exists, but external Chemistry Reviewer approval has not been claimed.
2. **Phase 0 visual screenshot baseline** — browser policy blocked automated screenshots in the execution environment; the waiver remains documented.
3. Phase 6 product UI/UX is not part of this gate. The reference slices currently prove runtime/engine behavior, not finished student-facing visual design.

## Gate decision

**Phase 5 technical gate: PASS / GREEN.**

The six reference slices prove the required end-to-end architecture:

```text
Canonical LearningUnit
→ Theory
→ Correct engine family
→ Typed Evidence
→ Assessment
→ Mastery
→ IndexedDB Progress
→ Reload restore
```

Proceed to **Phase 6 — Product UX / Learning Hub**.
