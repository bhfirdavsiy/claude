# ADR-P2-011 — Guided dynamic lab: instruction-sourced actions, orchestrated chemistry, honest order

- **Status:** accepted (P2.10). Vertical slices only, behind the feature flag `guidedDynamicLabV1`, which is off by default.
- **Rules:** extend, don't replace; derive, don't duplicate; migrate only after equivalence is proven.
- **Unchanged and still canonical:**
  - Concept → LearningUnit → MappingLink → Theory/Practice;
  - the chemistry engines;
  - every existing guided lab and runtime (`/practice/<id>`);
  - the external labs.
- **Not in scope:**
  - mass migration;
  - login, profiles, results dashboards, streaks, rankings;
  - IChO content;
  - new chemistry data;
  - release or pilot decisions.

## 1. Audit first

`npm run lab:inventory` discovers every experiment from the repository and writes five reports.

| Report | Content |
|---|---|
| `reports/guided-dynamic-lab-inventory.json` | All 57 experiments. Each row has the instruction source, apparatus, substances, declared quantities, steps with their classified operations, observations, safety, grounding, runtime, renderer, order and guidance semantics, external labs (same learning unit, no role) and gaps. |
| `reports/lab-action-catalog.json` | 31 action families, each with an operation kind (§11), typed parameters, apparatus kinds, state preconditions, topic availability, domain handler, renderer, accessibility and coverage. Also the verb lexicon, the config action types and the unmapped operations. |
| `reports/topic-lab-profile-coverage.json` | PROFILED / PROFILE_CANDIDATE / BLOCKED per experiment, with blockers and non-blocking gaps by category (§11). |
| `reports/guided-dynamic-lab-readiness.json` | Flag, contracts, slices and their justification, counts, open human decisions, the definition-of-done check and the P2.10 bundle delta. |
| `reports/lab-migration-equivalence.json` | Old versus new on the same built pack, run by the generator itself. |

- **Results:**
  - 350 instruction operations: 348 mapped and 2 ambiguous, 0 unmapped. The ambiguous ones are "Kondensatni yig‘ing" (a liquid, not a gas) and "… ishlarini bajaring" (10.7: "carry out the work", which names no single operation). "qaratmang" is mapped as a SAFETY_RULE (§11).
  - 48 experiments run on the generic runtime, whose step order is the array position. That is reported as a gap (`ORDER_FROM_ARRAY_POSITION`), never as a declared order.
  - The six P2.9 order questions are carried forward unanswered.
- **How operations are classified:** the laboratory instruction (`legacyContent.steps`) is the pedagogical source of actions. A declared lexicon (`src/domain/lab/action-catalog.ts`) maps the imperative verbs found in those steps to a family.
  - An ambiguous verb is resolved only by its nearest object word ("apparatni yig‘ing" → SETUP_APPARATUS, "gazni yig‘ing" → COLLECT_GAS).
  - Anything else stays AMBIGUOUS or UNMAPPED_OPERATION, and the classification never decides chemistry.

## 2. Contracts

- **`kimyolab.topic-lab-profile.v1`** (`src/domain/lab/topic-lab-profile.ts`):
  - It holds the LU and activity, the instruction source, apparatus, substances, initial state, allowed families, limits, procedure (order mode + steps), observation targets, completion goal, guidance config, safety and the chemistry binding.
  - `chemistryTruth` is fixed to `false`: the profile never states an outcome.
  - The authored overlay (`content-src/topic-lab-profiles.json`) holds only what the repository does not already state. `compileTopicLabProfile()` derives everything else: instruction steps, safety text, source refs, learning units, versions, shelf, target reaction, electrolysis query and declared dependencies.
  - The pack ships the compiled `topic-lab-profiles.json`, validated at build time and integrity-checked by the content client. An invalid profile fails closed (`TOPIC_LAB_PROFILE_INVALID`).
- **`kimyolab.lab-state.v1`:** containers (contents, phases, temperature, pH, precipitates, gases, deposits), apparatus set up, electrical connections, observations, observed targets, completed procedure steps, the log of accepted actions, and the engine inputs.
  - Temperature and pH are `{modeled:false}` unless an authority sets them: no value is guessed.
  - Precipitates and electrode products reference the record that produced them.
- **`applyLabAction(state, action, topicProfile)`** (`src/domain/lab/lab-runtime.ts`) returns `nextState`, `chemistryEvents`, `observations`, `procedural`, `guidance`, `evidenceCandidate`, `unsupported` and `error`.
  - Every rejection happens at the domain boundary, in this order:
    1. `ACTION_UNKNOWN`;
    2. `UNSAFE_ACTION`;
    3. `ACTION_NOT_ALLOWED_IN_TOPIC`;
    4. `ACTION_UNSUPPORTED` (no handler);
    5. `PARAMETER_INVALID` (values only from the profile);
    6. `PROCEDURE_BLOCKED` (declared order);
    7. `APPARATUS_NOT_SET_UP`, `STATE_PRECONDITION_UNMET`, `QUANTITY_LIMIT`.
  - A rejected action never changes the state. The availability list (`availableActions`) uses the same precheck, so a hidden or disabled button is never the only guard.

## 3. Chemistry is orchestrated, never invented

| Authority | Used for |
|---|---|
| `evaluateIonicMixing` (ReactionMatcher + IonicEngine + SpeciesRegistry) | Precipitation. It is recomputed from the accumulated engine actions, so the state never duplicates engine truth. |
| `ElectrolysisModel.resolve(query)` | Electrode products. |
| `IonicEngine.dissociate` (solubility data) | Dissolution of a declared solute. |
| The instruction's own sentence (`INSTRUCTION_TEXT`) | The purely procedural observations of 7.2: turbid mixture, clear filtrate, crystals. No filtration or evaporation model exists. The observation is labelled with its step, as the existing adapter's `filtrate → crystals` observation already was. |

- **Not modeled → `UNSUPPORTED_CHEMISTRY`:** no observation, nothing shown as happening. Examples:
  - a pair without a reaction record;
  - three solutions in one tube;
  - an electrolysis query without a record;
  - a solute without a dissociation rule.

## 4. Order: STRICT only where declared

| Mode | Meaning | Used by |
|---|---|---|
| STRICT / DEPENDENCY_GRAPH | Declared dependencies are enforced (`PROCEDURE_BLOCKED`, reason `STEP_DEPENDENCY_UNMET`). | 7.2: the dependencies are exactly `config.scenario.steps[].dependencies`. |
| FLEXIBLE | No order declared; state preconditions only. | 8.1 (a problem set over a reagent shelf). |
| HUMAN_DECISION_REQUIRED | The order question is open. No dependency is allowed, and the decision carries no preselected answer and points to its P2.9 packet. | 11.2. |

- Array position is never turned into an order; the validator rejects dependencies in an unordered profile.
- State preconditions are physical facts of the lab state, not order. Examples: two solutions before mixing; electrolyte, electrodes and power before current; an insoluble solid before filtering.

## 5. Guidance 1–4

| Level | Shows |
|---|---|
| 1 | The goal. |
| 2 | Which action families can run now. |
| 3 | The instruction's next action, or the unordered remaining actions when the order is not declared. |
| 4 | The instruction sentence behind that action, and why blocked steps are blocked. |

- Guidance never contains an observation result or an answer: `revealsAnswer:false`, and a unit test checks there is no equation.
- Each action option is classified as **recommended / possible / unavailable / unsupported / procedural-dependency**.

## 6. Learner flow and UI

- **Route:** `/dynamic-lab/<activityId>?ff=guidedDynamicLabV1`.
  - Flag off → a notice and the classic route.
  - No profile → the same notice.
- **One page with four sections (Maqsad → Amal → Kuzatish → Nega?), not a slideshow.**
  - Mobile-first: select an object → choose an action → configure its parameters (container, the instruction's quantity, the equation text).
  - No drag; every control is a button, select or input with a catalog name.
  - Results go to a polite live region and focus moves to them.
  - Observations are text, never colour alone.
  - It reflows at 320 px and has no animation.
- **Allowed but not recommended** actions run and show their consequence (another reagent pair; observing before current → "no process"). Out-of-topic actions are offered under "Ko‘rsatmada yo‘q amallar" only so the learner hears why not.
- **RESET** returns the profile's initial state. `replay(profile, actionLog)` reproduces the state exactly (unit test), with no reverse chemistry.
- **Nothing is persisted:** no attempt, evidence, progress or mastery. Evidence candidates have `persisted:false` and are discarded.
- **Text:** 160 new `ui.dlab-*` catalog keys (uz-Latn). Hard-coded Uzbek literals stay at 155.

## 7. Vertical slices (justification)

| Slice | Why this experiment |
|---|---|
| **8.1** (precipitation) | The only learner-chosen reagent shelf over reaction records. A precipitate forms, but FILTER is not in its instruction. |
| **11.2** (gas) | The one electrolysis record (CuCl2, aq, inert) is exactly what its config queries, and its text does not contradict it. **9.10 is not used:** its instruction connects a copper anode (active) and electrolyses KI, neither of which is modeled. |
| **7.2** (multi-step, thermal) | The only experiment with declared dependencies: seven steps over dissolution, filtration and evaporation, with the instruction's 20 ml limit. |

## 8. Equivalence and migration

`reports/lab-migration-equivalence.json` compares, per dimension: instruction, chemistry result, observations, safety, completion, evidence, accessibility, portal/standalone parity.

- **Result:** no slice is `MIGRATION_EQUIVALENT`. In every slice:
  - evidence differs (candidates only);
  - accessibility is NOT_PROVEN by the P2.7 sweep (the route has its own e2e checks).
- **Where the slices differ from the old runtime:**
  - 11.2 completes differently: the old runtime completes in any order without filling the cell.
  - 7.2 now consults the solubility data.
  - 8.1's chemistry result and completion are EQUIVALENT (same engine outcomes for the same choices).
- **Decision: KEEP_OLD_RUNTIME for all three.** Even an equivalent slice would only become eligible for a human migration decision.

## 9. External labs

- The 23 experiments that share a learning unit with an external lab list it with its provider, status and mode.
- PRIMARY / SUPPLEMENTARY / EXPLORE is prepared as a field (`proposedRole: null`) and **not assigned**: there is no evidence beyond the shared learning unit.

## 10. Consequences

- **The pack gains `topic-lab-profiles.json`.** `contentRevision` changes because the pack bytes change. `contentVersion` stays `2026.09.1`, and no activity version, review target or approval record changes (ADR-P2-009 addendum).
- **The server serves `/dynamic-lab/` as an app route.** Under `/kimyolab/`, every path that is not a file already falls back to the SPA (DEPLOY.md).
- **Bundle:** +6 learner modules (feature flags, four lab domain modules, the page). The exact bytes are in `guided-dynamic-lab-readiness.json#bundleDelta`. Earlier phases' bound checks subtract this recorded delta.

## 11. Closeout: instruction scope and action taxonomy

### 8.1 instruction scope

- `WASH` was allowed in 8.1 although the profile itself recorded `ACTION_FROM_RUNTIME_NOT_INSTRUCTION`. The instruction neither contains nor authorizes it.
- It is removed: `WASH` → `ACTION_NOT_ALLOWED_IN_TOPIC` (domain boundary). It is offered only under "Ko‘rsatmada yo‘q amallar", so the learner hears why not.
- **Retry:** one attempt mixes one pair per tube (two tubes). To test another pair, the learner uses the lab-level **RESET** (`runtime.reset(profile)` = `createLabState`). It restores the initial state and is never chemistry.
- The old runtime's "any number of pairs per attempt" convenience is not reproduced. The equivalence run uses RESET before the third pair; chemistry result and completion stay EQUIVALENT.

### Operation kinds (`src/domain/lab/action-catalog.ts`)

| Kind | Families | Needs |
|---|---|---|
| `STATE_ACTION` | SETUP_APPARATUS, ADD_SUBSTANCE, TRANSFER, MIX, HEAT, STOP_HEAT, EVAPORATE, FILTER, SETTLE, SEPARATE, PASS_GAS, COLLECT_GAS, SEAL, IGNITE, BRING_NEAR, ELECTRIC_CURRENT, WAIT, PREPARE_SUBSTANCE, WASH, REPEAT | A domain/procedure handler, else `ACTION_UNSUPPORTED`. REPEAT is here because the only use (8.6) means "repeat the procedure with CuCl2"; a restart is RESET. |
| `OBSERVATION_ACTION` | OBSERVE, TEST | Inspects an existing state or event; never produces an outcome. |
| `LEARNER_RESPONSE` | COMPARE, INFER, RECORD, EXPLAIN, STUDY, SELECT | A **checker**, else `LEARNER_RESPONSE_CHECKER_MISSING`, never judged. Only RECORD has one (net ionic equation, ionic-mixing topics). |
| `CONTROL` | RESET, CONTINUE | Lab-level; never a topic action. |
| `SAFETY_RULE` | SAFETY_PROHIBITION ("qaratmang") | A prohibition in the text, carried as a safety note; never an action. |

- The validator refuses a profile that offers a CONTROL or SAFETY_RULE family (`FAMILY_NOT_A_TOPIC_ACTION`).

### Coverage reclassification

| | Before (`b59e640`) | After |
|---|---|---|
| PROFILED | 3 | 3 |
| PROFILE_CANDIDATE | 0 | 1 (9.14) |
| BLOCKED | 54 | 53 |

- **Blockers** (state/observation handler missing; chemistry authority missing; instruction substance not modeled; unmapped or ambiguous operation; content required) are separated from **gaps** (LEARNER_RESPONSE_CHECKER_MISSING, HUMAN_DECISION_REQUIRED, SAFETY_RULE).
- **Learner responses no longer block:** 26 rows that counted a learner response as a missing handler now report a checker gap.
- **Open order questions are gaps:** HUMAN_DECISION_REQUIRED. A profile can carry that mode, as 11.2 does.
- **Narrower authority rule:** a missing chemistry authority now blocks only composition-changing state actions.
- **Stricter checks found blockers the first pass missed:**
  - a task that names no operation while the config supplies none (8.2, 8.5, 9.11, 9.17, …) → CONTENT_REQUIRED;
  - a guided step that changes composition without a reaction record or model (7.11 step 3);
  - an instruction substance the authority does not know (9.10: KI).
- **Count:** BLOCKED barely changed (54 → 53). The classification is more truthful, not more permissive. Nothing was profiled by reclassification.

### Black-swan line

- Every lab observation carries `grounding` (`observationGrounding`):
  - `MODEL_BASED` only for ReactionMatcher, ElectrolysisModel or IonicEngine;
  - `INSTRUCTION_TEXT` for the instruction's own sentence;
  - `PROCEDURE` for a procedural fact.
- The "Nega?" source line and the readiness report keep them apart. A unit test proves that an instruction-derived observation is never MODEL_BASED.

### Readiness

- "Migration equivalence proven for a slice" is no longer a P2.10 Definition-of-Done item: zero migrations is an allowed P2.10 outcome.
- It is now the future gate **P2.11 migration gate** (`futureGates`, `decision: null`).
