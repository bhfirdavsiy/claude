# Phase 2 Gate Report — Chemistry Foundation

**Date:** 2026-09-15  
**Branch:** `phase/2-chemistry-core`  
**Spec:** KimyoLab v20 Master TT v2.1 FINAL IMPLEMENTATION SPEC

## Automated verification

Command:

```bash
npm run phase2:verify
```

Fresh result:

```text
Canonical migration:
  LearningUnit           122
  TheoryActivity         122
  Concept                331
  PracticeActivity       133
  MappingLink            194
  Required primary       122

Mapping validator:
  duplicateCanonicalIds  0
  unknownRefs            0
  forwardReverseMismatch 0
  schemaErrors           0
  orphanRequiredEntities 0

Chemistry validator:
  speciesRecords         84
  reactionRecords        28
  dissociationRules      12
  formulaErrors          0
  reactionBalanceErrors  0
  referenceErrors        0
  sourceErrors           0
  unknownReactionPolicy  REACTION_NOT_MODELED

Content pack:
  contentVersion         2026.09.1
  files                  14
  checksum               d1a71dc6de0d53ae82c377270a38f5f6778bc1d33d30554c8f4633dbf1dfefef

Property tests            2/2 PASS
Technical corpus          200/200 PASS
Full regression suite     51/51 PASS
```

## Implemented Phase 2 deliverables

- Quantity / Unit / Precision core.
- FormulaParser with nested groups, hydrates, supported charges/isotope notation, bounded input and structured errors.
- Exact BigInt/Rational molecular EquationBalancer.
- Bounded acidic/basic/neutral RedoxBalancer.
- Typed Observation model.
- Curated Species Registry (84 records).
- Curated Reaction KB (28 records).
- Condition-aware ReactionMatcher.
- `REACTION_NOT_MODELED` and `REACTION_CONDITION_REQUIRED` trust boundary.
- Ionic/Solution Engine with structural spectator-ion cancellation.
- Versioned chemistry datasets inside runtime content pack.
- Chemistry validation CLI and machine-readable report.
- Deterministic parser property tests.
- 200-case molecular balancing technical regression corpus.

## Gate status

### Automated technical gate: GREEN

All automated Phase 2 technical checks listed in the phase gate pass.

### CHEM-033 full closure: PENDING EXTERNAL APPROVAL

The 200-case corpus is deliberately marked:

```json
{
  "kind": "algorithm-regression",
  "expertApproved": false
}
```

It proves balancing implementation regression behavior, not expert validation that every synthetic represented reaction is chemically valid. No expert approval is fabricated.

A separate 200-equation school-chemistry **review candidate corpus** is now prepared at `tests/chemistry-corpus/school-review-candidates.json`, with reviewer sheet `reports/CHEM-033-school-equations-review.csv`. All 200 candidates parse and atom-balance technically, but remain `chemicallyReviewed=false` and `expertApproved=false`.

Before CHEM-033 is marked fully closed, a Chemistry Reviewer must approve/correct 200 accepted equations and record reviewer metadata using `docs/approvals/CHEM-033-review-package.md`.

## Known defects / debt

- No automated Phase 2 S0/S1 defect found by current suite.
- External chemistry approval remains open.
- Phase 0 browser screenshot baseline remains blocked by managed-browser policy.
- ADR-001 reference-slice ID conflict remains for Phase 5.

## Decision required before Phase 3

Phase 3 may technically start on this Chemistry Core without changing it, but strict TT closure of CHEM-033 remains pending until Chemistry Reviewer approval is recorded.
