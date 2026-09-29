# Phase 1 Gate Report — Canonical Data + Source Ownership

**Branch:** `phase/1-canonical-data`  
**Date:** 2026-09-14  
**Spec:** KimyoLab v20 Master TT v2.1 FINAL IMPLEMENTATION SPEC

## Result

**GREEN for Phase 1 canonical-data scope.**

Phase 0 visual screenshot baseline remains deferred because the execution environment blocks automated Chromium navigation. The user instructed the implementation to continue after that blocker was disclosed. No screenshot evidence is claimed.

## Canonical migration

- Legacy theory input: **122**
- Legacy practice rows: **62**
- Reclassified/excluded practice placeholder: **11.1**
- Canonical LearningUnit: **122**
- Canonical TheoryActivity: **122**
- Canonical Concept: **331** (conservative migration; semantic case/name dedupe is not automatic)
- Canonical PracticeActivity: **133**
  - real migrated practice rows excluding 11.1: **61**
  - planned primary gap activities: **72**
- MappingLink total: **194**
- Required primary mappings: **122**
- Supporting mappings: **72**

No migrated activity is marked `ready`; legacy content availability is not treated as implementation readiness.

## XLSX migration importer

Importer reads the packaged XLSX directly and reproduced:

- `Nazariya-Amaliyot`: 122 data rows
- `Amaliyot-Nazariya`: 62 data rows
- required sheet names: 4/4

XLSX remains a migration/review input, not runtime truth.

## Mapping gate

```text
duplicateCanonicalIds = 0
unknownRefs = 0
forwardReverseMismatch = 0
schemaErrors = 0
orphanRequiredEntities = 0
```

## Schema gate

- Records validated against canonical JSON Schema documents: **903**
- Schema errors: **0**

## Runtime content pack

- Active version: `2026.09.1`
- Runtime files: **10**
- Grade chunks: **7, 8, 9, 10, 11**
- LearningUnit total across grade chunks: **122**
- Content checksum: `a2c73f4bfe463a41fade1543cada9ab96af4bbccd9f9b452fb1cfd17d9b29654`
- Determinism test: repeated legacy migration + pack build produces the same content checksum.
- Diagnostic `migration-report.json` is intentionally excluded from runtime pack.

## Fresh verification evidence

Command:

```bash
npm run phase1:verify
```

Result:

```text
20 tests
20 pass
0 fail
```

The sequence also reran migration, XLSX import, mapping validation, content-pack build and schema validation.

## Known non-blocking items carried forward

1. **ADR-001:** TT SLICE-01 says `7.02` experiment, but authoritative curriculum defines `7.02` as Simulation and `7.03` as the separation Experiment. Must be patched before Phase 5.
2. Phase 0 visual baseline is still not captured in this managed browser environment; must be obtained before the Phase 6 visual-regression gate.
3. Canonical Concept Registry intentionally preserves 331 legacy labels without semantic auto-merge. Concept dedupe/graph curation belongs to content review, not automatic migration.
4. Phase 1 uses Node 22 experimental type stripping for TypeScript build tooling because the isolated environment has no local Vite/Vitest/Zod dependency set. Product UI/toolchain migration remains later work; canonical artifacts and tests are executable now.

## Phase 2 entry condition

Phase 2 may begin from this branch/commit history without changing the legacy student UI.
