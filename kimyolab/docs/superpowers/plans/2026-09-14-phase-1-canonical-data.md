# Phase 1 Canonical Data + Source Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use test-driven-development for behavioral changes and verification-before-completion before gate claims.

**Goal:** Replace the legacy dual-mapping JSON model with a single canonical content source, stable IDs, derived relation views, reproducible XLSX import, validators, and versioned runtime content packs without changing the student UI.

**Architecture:** `content-src/` becomes the only hand-authored canonical source. Legacy JSON and XLSX are migration/import inputs only. `MappingLink` is the only authoritative LearningUnit↔Theory↔Practice relation; all reverse/forward views are derived. Runtime content is generated into `public/content/<contentVersion>/` and checksumed.

**Tech Stack:** Node.js 22 built-ins, TypeScript executed with `--experimental-strip-types`, Node test runner, JSON Schema contracts, ZIP/XML XLSX reader using system `unzip` for migration tooling.

**Spec:** `docs/specs/KimyoLab_v20_Master_TT_v2.1_FINAL_IMPLEMENTATION_SPEC.md` — DATA-001..014, VER-001..003, ID-001..005, PIPE-001..003, VAL-001..003, Phase 1.

## Global Constraints

- No student UI redesign in Phase 1.
- Canonical IDs are explicit and stable; titles never regenerate IDs.
- `MappingLink` is the only canonical relation authority.
- `11.1` placeholder is not migrated as a PracticeActivity.
- Existing practice content may migrate as `planned`; migrated content is not automatically `ready`.
- XLSX and legacy JSON are migration inputs, never runtime truth.
- Every behavioral change follows RED → GREEN → REFACTOR.

---

### Task 1: Canonical contract test harness

**Files:**
- Create: `tests/phase1-content.test.mjs`
- Create: `schemas/*.schema.json`
- Create: `src/domain/content/types.ts`

**Produces:** canonical entity field contracts and a failing test that requires generated canonical source files.

- [ ] Write tests asserting required schemas and canonical output locations do not yet exist.
- [ ] Run tests and verify RED.
- [ ] Add minimal TypeScript contracts and JSON Schema documents.
- [ ] Re-run tests to GREEN.
- [ ] Commit.

### Task 2: Stable ID and canonical migration

**Files:**
- Create: `scripts/migrate-legacy.ts`
- Create: `src/domain/content/ids.ts`
- Generate: `content-src/manifest.json`, `content-src/aliases.json`, `content-src/concepts.json`, `content-src/learning-units.json`, `content-src/theory-activities.json`, `content-src/practice-activities.json`, `content-src/mapping-links.json`

**Interfaces:**
- `canonicalLearningUnitId(legacyId: string): string`
- `canonicalTheoryId(legacyId: string): string`
- `canonicalPracticeId(type: PracticeType, legacyOrTheoryId: string, planned?: boolean): string`

- [ ] Add tests for stable IDs, counts, `11.1` exclusion, and no duplicate canonical IDs.
- [ ] Verify RED.
- [ ] Implement minimal migration.
- [ ] Generate canonical source.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 3: MappingLink authority and validators

**Files:**
- Create: `scripts/validate-content.ts`
- Create: `scripts/validate-mapping.ts`
- Create: `src/domain/content/validate.ts`
- Create: `reports/mapping-validation.json`

**Produces:** validator result with `duplicateCanonicalIds=0`, `unknownRefs=0`, `forwardReverseMismatch=0`, `schemaErrors=0`, `orphanRequiredEntities=0`.

- [ ] Write failing validator tests including a deliberate broken fixture.
- [ ] Verify RED.
- [ ] Implement validation and derived forward/reverse mapping comparison.
- [ ] Verify valid canonical source GREEN and broken fixture FAILS correctly.
- [ ] Commit.

### Task 4: XLSX migration importer

**Files:**
- Create: `scripts/import-xlsx.ts`
- Create: `src/domain/content/xlsx-reader.ts`
- Test: `tests/phase1-xlsx.test.mjs`

**Produces:** normalized migration snapshot from workbook sheets without making XLSX authoritative runtime data.

- [ ] Write a failing test against the actual workbook expecting sheet names and 122/62 baseline row counts.
- [ ] Verify RED.
- [ ] Implement bounded ZIP/XML reader using `unzip -p` and workbook/shared-string parsing.
- [ ] Normalize the two mapping sheets.
- [ ] Verify counts and representative IDs.
- [ ] Commit.

### Task 5: Versioned content pack builder

**Files:**
- Create: `scripts/build-content-pack.ts`
- Create: `src/domain/content/checksum.ts`
- Generate: `public/content/manifest.json`, `public/content/<version>/**`
- Test: `tests/phase1-pack.test.mjs`

- [ ] Write failing tests for content manifest, file checksums, and grade chunking.
- [ ] Verify RED.
- [ ] Implement pack builder.
- [ ] Verify all checksums and grade chunks.
- [ ] Commit.

### Task 6: Phase 1 gate and traceability

**Files:**
- Create: `reports/traceability-phase1.csv`
- Create: `docs/gates/phase-1-gate-report.md`
- Modify: `docs/status/current-status.md`
- Modify: `package.json`

- [ ] Add exact Phase 1 commands to package scripts.
- [ ] Run full legacy + Phase 1 verification fresh.
- [ ] Generate validation report and traceability.
- [ ] Record remaining migration debt without marking activities ready.
- [ ] Commit gate evidence.
