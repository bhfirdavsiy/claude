# ADR-P2-012 — Instruction-driven runtime expansion and the capability registry

- **Status:** accepted (P2.11). The guided dynamic lab stays behind the feature flag `guidedDynamicLabV1`, which is off by default.
- **Builds on:** ADR-P2-011 (guided dynamic lab). Its rules are unchanged:
  - extend, don't replace;
  - derive, don't duplicate;
  - migrate only after equivalence is proven, and then only by a human decision.
- **Unchanged and still canonical:**
  - the chemistry engines and their data;
  - every existing guided lab and runtime (`/practice/<id>`);
  - the progress formulas and weights.
- **Not in scope:**
  - mass migration;
  - Content Studio;
  - login, profiles, dashboards, rankings;
  - IChO;
  - new chemistry data;
  - release or pilot decisions.

## 1. The instruction is authoritative

A lab action exists only where the topic's own instruction (`legacyContent.steps`) contains it.

- **Mapping:**
  - A MAPPED operation may become an action.
  - An AMBIGUOUS or UNMAPPED operation gets **no family** (`null`) and is never guessed.
- **Nothing is invented from the instruction:**
  - Missing quantities, temperatures and times stay unspecified. 8.14 states only a mass ratio; that is recorded as the gap `QUANTITY_AS_RATIO`, not turned into a limit.
  - Apparatus, substances, reactions, observations and sequences are never invented, and extra pedagogical steps are never inferred.
- **Enforcement:** a test checks that every family a profile allows occurs among the instruction's mapped operations.

## 2. Capability registry (`src/domain/lab/capability-registry.ts`)

- **Identity:** `kimyolab.capability-registry.v1`, version `1.0.0`. Bump the version on any change of shape or resolution.
- **Built** by `buildCapabilityRegistry(data)`. It is **derived**, never hand-listed.

| Part | Derived from |
|---|---|
| `actions` | `LAB_ACTION_FAMILIES` (kind, domain handler, checker, apparatus) together with `HANDLER_SEMANTICS`, the runtime's own declaration of each handler's type and authorities. Each entry also records `requiresProfileAuthority`. |
| `authorities.ReactionMatcher` | Records, reactant sets with their condition tags, condition dimensions and observation kinds. |
| `authorities.IonicEngine` | Dissociation rules and insoluble formulas. |
| `authorities.ElectrolysisModel` | The modeled queries. |
| `authorities.SchoolLabModel` | Model ids, with scope `STEP_BOUND_ONLY`. These models have no reagent lists, so they never answer a free combination. |
| `authorities.QualitativeTest` | Tests, reagents and samples. |
| `species` | `SpeciesRegistry`: each formula with the authorities that know it. |

### Questions the registry answers

`resolveOperation(registry, operation, formulas)` answers *instruction operation → supported capability → runtime authority*. No engine is chosen by an author; there is no engine selector.

| Status | Meaning |
|---|---|
| SUPPORTED | A handler exists and an authority covers exactly the formulas written in the step. For ReactionMatcher this means a record with **exactly these reactants**. Knowing each formula separately is not enough: Cu + HCl gives AUTHORITY_REQUIRED. |
| AUTHORITY_AT_RUNTIME | A chemistry handler exists, but the step names no formula. Coverage is decided at run time from the substances actually present, and is **not** claimed here. |
| PROCEDURE_ONLY | A deterministic procedure; no chemistry is decided. |
| AUTHORITY_REQUIRED | A handler exists, but no authority of that handler covers the substances. It fails closed. |
| UNSUPPORTED_ACTION | No safe handler exists. |
| LEARNER_RESPONSE, CONTROL, SAFETY_RULE | Not chemistry transitions. compare / explain / infer / record / study are learner responses. |
| AMBIGUOUS, UNMAPPED | `family: null`. |

### Consistency and substances

- **Consistency:** `registryProblems()` reports a catalog family that has a handler but no declared semantics, or the reverse. It is tested to be `[]`.
- **Substances:** `resolveSubstance(registry, formula)` keeps an unknown formula explicit (`UNKNOWN_SUBSTANCE`). It never guesses a species from an Uzbek name.

### Toward Content Studio

The contracts support the future Content Studio pipeline, though the studio itself is not built: *yo‘riqnoma → operation extraction (`classifyInstructionStep`) → capability resolution (`resolveOperation`) → lab profile (`compileTopicLabProfiles`)*.

## 3. New handlers (`lab-runtime.ts`)

All new handlers are deterministic and replayable. A rejection never changes the state.

| Family | Type | Semantics |
|---|---|---|
| HEAT | CHEMISTRY, requires the `reaction-matcher` profile | Sets the container's heating level. The level comes from the profile's `limits.heating`, which must quote the instruction; otherwise the catalog default `heated` applies. ReactionMatcher then re-evaluates the contents under the new conditions. Under any other authority: `UNSUPPORTED_CHEMISTRY / HEATING_NOT_ORCHESTRATED`. Rejected with CONTAINER_EMPTY or ALREADY_HEATED. |
| STOP_HEAT | PROCEDURE | Back to room conditions. There is no cooling model and nothing is reversed. NOT_HEATED when the container is not heated. |
| SEAL | PROCEDURE | Marks the container sealed. ALREADY_SEALED when it already is. |
| TRANSFER | PROCEDURE | Moves the contents. Under a reaction-matcher profile the receiving container is re-evaluated. Rejected with SAME_CONTAINER or SOURCE_EMPTY. |
| PASS_GAS | CHEMISTRY, requires the `reaction-matcher` profile | Passes a gas an authority produced into another container, then re-evaluates that container. Rejected with NO_GAS_IN_SOURCE or TARGET_EMPTY; under another authority, GAS_REACTION_NOT_ORCHESTRATED. |
| COLLECT_GAS | PROCEDURE | Collects a gas that an authority produced, into a `gas-collection-vessel`. With several sources the learner must choose one (`from`); availability lists one option per source, never a guess. Rejected with NO_GAS_TO_COLLECT, NO_GAS_IN_SOURCE, GAS_SOURCE_REQUIRED or NOT_A_GAS_COLLECTION_VESSEL. |
| WAIT | PROCEDURE | Accepted with `NO_TIME_MODEL`; nothing changes. |

### Reaction-matcher profiles (`chemistry.authority: 'reaction-matcher'`)

- **What is matched:** every pair of **learner-added** substances in a container is matched with `conditionPolicy: 'require-record-conditions'` under the container's **actual conditions**:
  - temperature: the heating level, or `room`;
  - ignition: `absent`;
  - any dimension the instruction declares for a present substance, such as `acid-concentration: dilute` from "suyultirilgan H2SO4".
  - Conflicting declarations are dropped, never resolved.
- **No chains:** products are recorded with the record that produced them, but they are never re-evaluated.
- **When a pair is re-matched:** a pair that is not modeled is re-evaluated only when the conditions change.
- **Gas:** a gas is a product whose species is gaseous **and** whose record has a gas observation.
- **Fail closed:** when nothing in contact is modeled, the physical action still happens, but the status is `unsupported` with the matcher's code and **no observation** is shown.
- **Grounding:** every ReactionMatcher observation is `MODEL_BASED`. A collected gas is `PROCEDURE`, and its identity comes from the record.

## 4. New slices

| Slice | Capability (different from 8.1, 11.2, 7.2) | Why |
|---|---|---|
| 7.10 metal + dilute acid | Contact reactions under conditions the instruction declares. The gas comes from the reaction record, and the learner chooses which source to collect from. **Cu + HCl has no record and fails closed, even when heated.** | It is the largest blocker family (HEAT, COLLECT_GAS), and its records `rxn.mg-h2so4` and `rxn.zn-hcl` match the instruction. |
| 8.14 ammonia | **Heating is the gate:** `rxn.nh4cl-caoh2` requires gentle heating, which the instruction states ("biroz qizdiring"). Before heating it reports REACTION_CONDITIONS_NOT_MET. Then seal, heat and collect. | A condition-gated reaction. The school lab model stays step-bound. |

### Recorded gaps (none of them is resolved by assumption)

- **7.10:**
  - TEST_NOT_OFFERED: the match-flame test has no safe handler;
  - CU_HCL_NOT_IN_REACTION_RECORDS;
  - RECORD_CHECKER_MISSING;
  - HEAT_SOURCE_NOT_NAMED;
  - APPARATUS_WITHOUT_OPERATION.
- **8.14:**
  - SCHOOL_MODEL_STEP_BOUND;
  - INSTRUCTION_MODEL_OBSERVATION_CONFLICT: the instruction says "oq tutun" while `rxn.nh3-hcl` records no visible change. This is a human decision;
  - QUANTITY_AS_RATIO;
  - HEAT_SOURCE_NOT_NAMED;
  - APPARATUS_NOT_DECLARED;
  - SAFETY_TEXT_EMPTY.

### Deliberately not implemented

TEST, SEPARATE, PREPARE_SUBSTANCE, BRING_NEAR, IGNITE, SETTLE and REPEAT have no safe general semantics yet. They stay `UNSUPPORTED_ACTION` blockers. This is a future gate (`P2.12+ capability expansion`, `decision: null`).

## 5. Coverage and reports (`npm run lab:inventory`)

The P2.10 reports are kept. Two new reports are added:

| Report | Content |
|---|---|
| `reports/capability-registry-coverage.json` | The registry, together with all 350 instruction operations resolved against it. |
| `reports/substance-model-coverage.json` | Instruction substance → species → authority, per experiment. 9.10's KI is `KNOWN_TO_OTHER_AUTHORITY`: a ReactionMatcher record knows it, but its bound ElectrolysisModel does not. It stays a blocker. |

### How coverage changed

- **Totals:** 53 → 51 BLOCKED, 1 PROFILE_CANDIDATE, 3 → 5 PROFILED (the two new slices). The `p211` block has before and after.
- **Lifted:** the `NO_DOMAIN_HANDLER` blockers for the new handlers are gone.
- **Still blocking:**
  - HEAT and PASS_GAS still block wherever no reaction-record authority evaluates them: `HANDLER_NEEDS_AUTHORITY:*`, 13 + 12 experiments;
  - nothing is unblocked by assumption.
- **Equivalence:** compared on 8 dimensions. 7.10 and 8.14 have EQUIVALENT record observations, but different completion and instruction. **No slice is MIGRATION_EQUIVALENT**, so the decision is KEEP_OLD_RUNTIME for all five.

### Bundle

`bundleDelta.delta` stays **cumulative since P2.9**, because the earlier phases' bound tests subtract exactly that value. `phases` splits it into P2.10 and P2.11.

## 6. Invariants

- Accessibility is 140 / 5 / 0 / 1.
- Learning product is 12.189 and overall is 47.313. The formula and weights are unchanged.
- No login, learner-visible progress, leaderboard or IChO.
- Nothing is persisted by the dynamic lab.
- No fake approval, fake model result or invented instruction action.
- The old runtimes are retained.
