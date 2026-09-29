# Phase 6A Gate Report — Product Shell / Learning Hub Foundation

**Branch:** `phase/6-product-ux`  
**Status:** TECHNICAL GREEN / ENVIRONMENT GATES OPEN  
**Scope:** student-facing application shell, Learning Hub model/rendering, versioned content client, canonical routes, design tokens, progressive fallback, Vite production contract.

## Implemented

- Canonical route parsing for `/`, `/learn/:learningUnitId`, `/progress`, `/search`.
- Versioned runtime `ContentClient` that reads `/content/manifest.json` and canonical grade/content chunks.
- Student-safe Learning Hub projection that omits coverage/lifecycle/approval/legacy/debug metadata.
- Semantic Home and Learning Hub renderers without unsafe `innerHTML`.
- Loading, error and not-found states.
- Sinco-derived CSS design tokens, focus states, responsive layout and reduced-motion handling.
- Progressive static hero in `app.html`.
- Development-server deep-link fallback and `/content/...` runtime mapping while `/source/` remains blocked.
- Vite configuration and package scripts as the production build contract.
- Environment-only Node type-strip browser-preview builder for local verification; this is not the production build replacement.
- Shared-filesystem test suites forced to `--test-concurrency=1` after a reproducible content-pack race was identified.

## Fresh verification — 2026-09-15

Command:

```bash
npm run phase6a:verify
```

Result: **exit code 0**.

### Full regression suite

```text
115 tests
115 pass
0 fail
```

### Phase 3 runtime suite

```text
24 tests
24 pass
0 fail
```

### Phase 4 engine suite

```text
12 tests
12 pass
0 fail
```

### Phase 5 reference-slice suite

```text
15 tests
15 pass
0 fail
```

### Phase 6 UI/source-contract suite

```text
11 tests
11 pass
0 fail
```

### Canonical/content gates

```text
duplicateCanonicalIds = 0
unknownRefs = 0
forwardReverseMismatch = 0
schemaErrors = 0
orphanRequiredEntities = 0
validatedRecords = 903
```

### Chemistry validator

```text
speciesRecords = 84
reactionRecords = 28
dissociationRules = 12
formulaErrors = 0
reactionBalanceErrors = 0
referenceErrors = 0
sourceErrors = 0
expertApproval = pending
```

## Root-cause fix recorded during Phase 6A

Initial Phase 6A full verification exposed nondeterministic failures in the content-pack determinism test. The root cause was Node's test runner executing filesystem-mutating suites concurrently against the same generated canonical/content-pack paths. The fix is at the test-runner boundary: all shared-filesystem integration suites now run with `--test-concurrency=1`, and `tests/test-runner-contract.test.mjs` prevents regression.

## Open gates / not claimed

1. **Actual `vite build`: OPEN — environment blocker.** The Vite binary is not installed and is not present in the local npm cache. The Node preview builder is verification-only and does not satisfy the production Vite build gate.
2. **Browser E2E / visual regression: OPEN — environment blocker.** Managed Chromium policy blocks local navigation in this environment.
3. **Automated axe/WCAG browser audit: OPEN.** Source-level accessibility contracts exist, but browser-level WCAG gate is not claimed.
4. **CHEM-033 chemistry expert approval: PENDING**, carried from Phase 2.

## Gate decision

Phase 6A source/runtime foundation is technically GREEN and may be used as the base for Phase 6B student practice/progress/search/worksheet work. Full Phase 6 remains OPEN until the environment-dependent build/browser/accessibility gates and remaining UX scope are satisfied.
