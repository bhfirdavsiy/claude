# Phase 0 Baseline + Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use test-driven-development for behavioral changes and verification-before-completion before any gate claim.

**Goal:** Freeze the current KimyoLab v20 Sinco behavior, establish measurable regression baselines, and close the known static-server S0 exposure issues without changing product behavior.

**Architecture:** Keep the legacy Sinco application intact as the regression reference. Harden only the local static server, and record route/data/asset/performance baselines as immutable Phase 0 evidence. No canonical-data or engine migration starts in this phase.

**Tech Stack:** Node.js built-in test runner, Node HTTP server, static HTML/CSS/JS, Git worktree.

**Spec:** `docs/specs/KimyoLab_v20_Master_TT_v2.1_FINAL_IMPLEMENTATION_SPEC.md` — Phase 0, SEC-001..004, PERF-001.

## Global constraints
- Existing useful v19/Sinco functions must remain inventoried before migration.
- No product UI redesign in Phase 0.
- Security behavior changes require failing regression tests first.
- Known traversal must be closed before Phase 1.
- Phase 0 gate cannot be green without visual baseline evidence.

---

### Task 1: Freeze baseline repository

**Files:** repository history only.

- [x] Copy the current Sinco build to a separate product repository.
- [x] Commit the untouched baseline on `main`.
- [x] Create isolated branch/worktree `phase/0-baseline-security`.
- [x] Run legacy contract tests and record 5/5 baseline.

### Task 2: Reject sibling-prefix path traversal

**Files:**
- Modify: `server.mjs`
- Create/Modify: `tests/security.test.mjs`

- [x] Write a regression test requesting an encoded `../phase-0-secret.txt` sibling whose path shares the web-root prefix.
- [x] Verify RED: old server returns HTTP 200.
- [x] Replace string-prefix containment with `path.relative` containment.
- [x] Verify GREEN and run full tests.

### Task 3: Block source artifacts

**Files:**
- Modify: `server.mjs`
- Modify: `tests/security.test.mjs`

- [x] Write a test for `/source/KimyoLab_v20_nazariya_amaliyot_mapping.xlsx`.
- [x] Verify RED: old behavior exposes the XLSX with HTTP 200.
- [x] Return 404 for the internal `source/` subtree.
- [x] Verify GREEN and run full tests.

### Task 4: Survive malformed URL encodings

**Files:**
- Modify: `server.mjs`
- Modify: `tests/security.test.mjs`

- [x] Write a test for malformed percent encoding and a follow-up healthy request.
- [x] Verify RED: old server terminates the request/process path with `ECONNRESET`.
- [x] Catch URI decode errors and return HTTP 400.
- [x] Verify GREEN and run full tests.

### Task 5: Capture measurable baseline

**Files:**
- Create: `reports/performance/baseline.json`
- Create: `reports/performance/http-baseline.csv`
- Create: `reports/inventory/routes.json`
- Create: `reports/inventory/features.md`
- Create: `docs/releases/phase-0-baseline.md`
- Create: `docs/architecture/browser-matrix.md`

- [x] Record repository/asset/data payload sizes.
- [x] Record local HTTP timing sample.
- [x] Inventory product routes and v19 regression features.
- [ ] Capture desktop/mobile visual screenshots.

### Task 6: Phase 0 gate

- [ ] Run fresh full tests.
- [ ] Verify security regressions.
- [ ] Confirm visual baseline files exist.
- [ ] Write gate result in `docs/status/current-status.md`.
- [ ] Merge only after all Phase 0 gate requirements are satisfied.
