# Phase 6 Gate Report — Product UX / Learning Hub

**Branch:** `phase/6-product-ux`  
**Status:** TECHNICAL GREEN / FULL PHASE GATE YELLOW (environment-dependent gates open)

## Product scope implemented

- Student-safe Home and Learning Hub shell.
- Canonical `/learn/:learningUnitId` deep links.
- Canonical `/practice/:practiceActivityId` deep links.
- Six Phase 5 reference activities connected to real verified engine adapters in the student practice workspace.
- Reactive experiment continues to use `ReactionMatcher` + `IonicEngine`; UI does not invent chemistry.
- Practice result persistence through Phase 3 IndexedDB progress contract.
- `/progress` student screen with resume links.
- `/search` local student search across canonical topics and practices.
- `/worksheet/:learningUnitId` printable, version-stamped worksheet derived from current Learning Hub content.
- Loading, error, empty and not-found states.
- Semantic controls, focus/reduced-motion/print CSS foundations.
- No unsafe `innerHTML` in Phase 6 renderers.
- Vite config/scripts remain the production build contract; Node type-strip preview remains environment-only.

## Fresh verification — 2026-09-15

Command:

```bash
npm run phase6:verify
```

Result: **exit code 0**.

### Full regression

```text
135 tests
135 pass
0 fail
```

### Phase 3 runtime

```text
24 tests
24 pass
0 fail
```

### Phase 4 engines

```text
12 tests
12 pass
0 fail
```

### Phase 5 reference slices

```text
15 tests
15 pass
0 fail
```

### Phase 6 UI/runtime source suite

```text
31 tests
31 pass
0 fail
```

### Canonical data gates

```text
LearningUnit = 122
TheoryActivity = 122
Concept = 331
PracticeActivity = 133
MappingLink = 194
Primary mappings = 122

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

## Production-build probe

```text
npm run vite:build
→ sh: 1: vite: not found
→ exit 127
```

The Vite executable is neither globally available nor present in `node_modules/.bin` in this environment. Therefore the production Vite build gate is **not claimed**.

## Full Phase 6 gates still open

1. **Production Vite build** — blocked by unavailable Vite dependency in the execution environment.
2. **Browser E2E / visual regression** — managed Chromium policy blocks local navigation in this environment.
3. **Automated browser WCAG/axe gate** — cannot be claimed without the browser automation environment.
4. **CHEM-033 external chemistry reviewer approval** — still pending from Phase 2.

## Gate decision

The Phase 6 code/product-flow implementation is technically GREEN under all available automated tests. The full Phase 6 release gate remains YELLOW until production build, browser visual/E2E and automated accessibility verification can run in a suitable environment. Phase 7 mass Beta1 expansion should not be declared released before those gates are satisfied or explicitly waived by the product owner.
