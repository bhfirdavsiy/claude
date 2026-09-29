# Phase 2 Chemistry Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the UI-independent Chemistry Core required by KimyoLab Master TT v2.1: quantities/units, species registry, formula parser, molecular/redox balancing, typed observations, curated reaction knowledge base, condition-aware reaction matching, and ionic/solution chemistry.

**Architecture:** Chemistry code lives only under `src/domain/chemistry/` and has no DOM/UI dependency. Curated chemistry data lives under `content-src/chemistry/`, is validated by tests, and is copied into the versioned content pack. Unknown or ambiguous chemistry is never guessed: callers receive structured error codes.

**Tech Stack:** TypeScript executed by Node 24 `--experimental-strip-types`, Node test runner, JSON content files, BigInt rational arithmetic.

**Spec:** `docs/specs/KimyoLab_v20_Master_TT_v2.1_FINAL_IMPLEMENTATION_SPEC.md`

## Global Constraints

- Unknown chemistry MUST return `REACTION_NOT_MODELED`; it must never be invented.
- Ambiguous valid matches MUST return `REACTION_CONDITION_REQUIRED`.
- Formula parsing MUST support nested groups, hydrates, charge syntax, atom counting, malformed input detection, and bounded input length.
- Molecular balancing MUST be algorithmic, not a table of hard-coded answers.
- Redox balancing MUST support acidic/basic/neutral media within the explicitly supported school-curriculum subset.
- Content pack chemistry data MUST be versioned and checksum-protected.
- Production chemistry code MUST NOT depend on DOM, CSS, Sinco, or browser layout.

---

## File map

### Create
- `src/domain/chemistry/types.ts` — shared chemistry domain contracts and error codes.
- `src/domain/chemistry/rational.ts` — exact BigInt rational arithmetic.
- `src/domain/chemistry/quantity.ts` — unit conversion, tolerance, significant-figure helpers.
- `src/domain/chemistry/formula-parser.ts` — formula/charge parser.
- `src/domain/chemistry/equation-balancer.ts` — molecular equation balancing via null-space.
- `src/domain/chemistry/redox-balancer.ts` — medium-aware charge/atom balancing with bounded auxiliaries.
- `src/domain/chemistry/species-registry.ts` — immutable species lookup/validation.
- `src/domain/chemistry/reaction-matcher.ts` — condition-aware curated reaction resolution.
- `src/domain/chemistry/ionic-engine.ts` — dissociation/net-ionic generation for curated school scope.
- `content-src/chemistry/species.json`
- `content-src/chemistry/reactions.json`
- `content-src/chemistry/solubility.json`
- `content-src/chemistry/constants.json`
- `tests/phase2-quantity.test.mjs`
- `tests/phase2-formula.test.mjs`
- `tests/phase2-balancer.test.mjs`
- `tests/phase2-redox.test.mjs`
- `tests/phase2-species.test.mjs`
- `tests/phase2-reactions.test.mjs`
- `tests/phase2-ionic.test.mjs`
- `tests/phase2-property.test.mjs`
- `tests/chemistry-corpus/equations.json`
- `scripts/validate-chemistry.ts`
- `docs/gates/phase-2-gate-report.md`

### Modify
- `scripts/build-content-pack.ts` — include versioned chemistry files.
- `package.json` — add `chemistry:validate`, `test:property`, `test:corpus`, and `phase2:verify` commands.
- `docs/status/current-status.md` — Phase 2 status.
- `reports/traceability-phase2.csv` — Phase 2 requirement traceability.

---

### Task 1: Quantity and unit contracts

**Interfaces:**
- Produces `convertQuantity(quantity, targetUnit)`, `nearlyEqualQuantity(actual, expected, tolerance)`, `roundSignificant(value, figures)`.

- [ ] Write tests for mass/volume/temperature/pressure conversions, incompatible units, tolerance and significant figures.
- [ ] Run test and verify RED because module does not exist.
- [ ] Implement minimal typed unit table and conversion logic.
- [ ] Run targeted and full tests GREEN.
- [ ] Commit `feat: add chemistry quantity and precision core`.

### Task 2: Formula Parser

**Interfaces:**
- Produces `parseFormula(input): ParsedFormula` with `{atoms, charge, hydrateParts, normalized}`.
- Structured errors: `FORMULA_INVALID`, `FORMULA_SYNTAX_UNSUPPORTED`, `INPUT_TOO_LONG`.

- [ ] Write tests for `H2O`, `Ca(OH)2`, `Al2(SO4)3`, `CuSO4·5H2O`, `NH4+`, `SO4^2-`, `Fe^3+`, nested brackets, malformed formulas and max length.
- [ ] Verify RED.
- [ ] Implement tokenizer + recursive group parser + charge suffix parser.
- [ ] Verify targeted/full GREEN.
- [ ] Commit.

### Task 3: Exact rational arithmetic and molecular balancer

**Interfaces:**
- Produces `balanceEquation(input)` and `balanceSpecies(reactants, products)`.
- Returns smallest positive integer coefficients and formatted equation.

- [ ] Write tests for combustion, decomposition, polyatomic compounds, equations requiring coefficients > 9 and already-balanced inputs.
- [ ] Verify RED.
- [ ] Implement BigInt `Rational`, RREF/null-space solver, composition matrix.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 4: Redox Balancer

**Interfaces:**
- Produces `balanceRedox({reactants, products, medium})`.
- Supported medium: `acidic | basic | neutral`.

- [ ] Write tests for permanganate/iron in acid, dichromate/iodide in acid, and one basic-medium equation.
- [ ] Verify RED.
- [ ] Implement bounded auxiliary search using `H2O`, `H+`, `OH-` plus atom+charge conservation.
- [ ] Verify GREEN; unsupported/ambiguous cases must return explicit error rather than guess.
- [ ] Commit.

### Task 5: Species Registry and curated chemistry migration

**Interfaces:**
- Produces `SpeciesRegistry.from(records)`, `.byId()`, `.byFormula()`, `.requireByFormula()`.

- [ ] Write registry validation tests (duplicate id, duplicate identity, source/provenance fields, phase/charge).
- [ ] Verify RED.
- [ ] Extract prior 71-school-species dataset, normalize it to v2.1 schema and add source metadata placeholders as internal migrated sources.
- [ ] Implement immutable registry.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 6: Reaction KB and condition-aware matcher

**Interfaces:**
- Produces `ReactionMatcher.match(query): ReactionMatchResult`.
- Zero result => `REACTION_NOT_MODELED`; equal best matches => `REACTION_CONDITION_REQUIRED`.

- [ ] Write tests for AgNO3+NaCl precipitation, Zn+HCl, condition-required reactions, reactant order independence, phase mismatch and unknown pair.
- [ ] Verify RED.
- [ ] Normalize/migrate curated reaction records and conditions.
- [ ] Implement deterministic scoring/filtering order from CHEM-060.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 7: Ionic/Solution Engine

**Interfaces:**
- Produces `dissociateSpecies`, `netIonicEquation(reactionId)` for curated solution reactions.

- [ ] Write tests for `Ag+ + Cl- -> AgCl(s)`, `H+ + OH- -> H2O`, `Ba2+ + SO4^2- -> BaSO4(s)` and non-dissociating weak/solid species.
- [ ] Verify RED.
- [ ] Implement curated dissociation/solubility rules with no string-replacement shortcut.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 8: 200-equation corpus and property tests

**Interfaces:**
- Corpus file contains validated `{reactants, products, expectedCoefficients}` records.

- [ ] Generate a deterministic 200-case curriculum-scope corpus from expert-known seed equations plus stoichiometrically equivalent atom-balanced variants; mark generated cases as algorithm-regression corpus, not chemistry-validation evidence.
- [ ] Add corpus runner that asserts 100% coefficient correctness.
- [ ] Add parser property/fuzz tests for bounded random valid formulas and malformed inputs.
- [ ] Verify RED for corpus runner before fixture implementation, then GREEN.
- [ ] Commit.

### Task 9: Content pack integration and chemistry validator

**Interfaces:**
- `npm run chemistry:validate` writes `reports/chemistry-validation.json`.
- `npm run content:pack` includes `chemistry/*.json` and checksums.

- [ ] Write failing integration test for chemistry files in content pack and validator report.
- [ ] Verify RED.
- [ ] Implement validator and content pack inclusion.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 10: Phase 2 gate and traceability

- [ ] Add package scripts and traceability rows for CHEM-001..080 and Phase 2 tests.
- [ ] Run `npm run phase2:verify` fresh.
- [ ] Run full `npm test` fresh.
- [ ] Write `docs/gates/phase-2-gate-report.md` from actual outputs only.
- [ ] Update `docs/status/current-status.md`.
- [ ] Commit `docs: record phase 2 chemistry gate`.

## Phase 2 Stop Gate

Must all be true:
- Unit/quantity tests green.
- Formula parser unit + property tests green.
- Molecular equation corpus = 100% pass.
- Redox supported subset green; unsupported cases return structured error.
- Species Registry and curated reaction data validate.
- Ambiguous reactions require condition.
- Unknown reactions return `REACTION_NOT_MODELED`.
- Ionic tests green.
- Chemistry content pack checksums validate.
- No existing Phase 0/1 test regression.
