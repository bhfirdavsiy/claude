# Progress model (P2.0)

`reports/project-progress.json` is computed from the repository by `scripts/learning-depth.ts` (`npm run learning:depth`, which also runs in `content:validate`). Every percentage below has an explicit formula and published weights. It is **not** a marketing number. Changing a weight is a reviewed change to this file **and** to `WEIGHTS` in `scripts/learning-depth.ts` — a test keeps the two equal.

## 1. Dimension levels (per learning unit)

Each dimension is an ordered enum. Its normalized level is `index / (count − 1)`.

| Dimension | Levels (0 → 1) | How it is measured |
|---|---|---|
| theory | NONE · MINIMAL · STRUCTURED | STRUCTURED requires all four: a concept explanation of ≥ 300 characters, a worked example, a misconception check and a summary block. Otherwise a present theory is MINIMAL. |
| practice | NONE · STATIC_CHECK · GUIDED · MODEL_BASED | Best mapped activity the learner **can complete** through the real UI path (see §2). |
| assessment | NONE · DRAFT · REVIEW_PENDING · APPROVED | Assessment items of the unit, by governance lifecycle. |
| mastery | UNREACHABLE · PARTIAL · REACHABLE | The real rule `buildMasteryView` with the best possible evidence and today's assessment availability. PARTIAL means practice evidence is possible but MASTERED is not. |
| interaction | NONE · FORM · SCRIPTED · MODEL_INTERACTIVE | Best interaction of a completable activity. |
| governance | UNREVIEWED · REVIEW_PENDING · APPROVED · RELEASED | Human decisions only. Runtime availability is never a release. |

## 2. Activity classification

- **MODEL_BASED:** a registry renderer whose learner choices reach a domain model with **≥ 2 distinct modeled outcomes**. This is the black-swan evidence from `reports/reference-renderer-*.json`. A renderer without that evidence is counted as GUIDED (canned-animation guard).
- **GUIDED:** a prescribed multi-step sequence whose steps are grounded in domain state. That is either guided-lab hardening `CHEMISTRY_BASELINED_*` or a runtime that resolves a domain model. The learner makes no chemical choice.
- **STATIC_CHECK:** a form answer checked against one expected value (trainer, calculation, case rubric, one-field "simulation"), or a procedural click-through with no domain state.
- **NONE:** not routable, not launchable, or the learner cannot succeed.
- **CAN_SUCCEED:** the answer the rendered UI can send completes the activity with positive evidence. The value comes from the config, or else from the value the engine itself reports as expected (the domain model's answer). It is never a guess.
- **Robustness probe:** a plausible wrong input must give feedback, not crash the session.

## 3. Progress numbers

| Number | Formula |
|---|---|
| `foundationProgress` | passed foundation checks / all foundation checks. The 10 checks are: canonical routing, readiness compiles, renderer registry, chemistry KB gate not FAIL, pilot gate not FAIL, review workbench, authoring pipeline, release authority, every launchable activity CAN_SUCCEED, no crash on wrong input. |
| `learningCoverage` | mean over the 122 units of (theory + practice + assessment levels) / 3 |
| `modelBasedInteraction` | units with ≥ 1 completable MODEL_BASED activity / 122 |
| `assessmentCoverage` | units with an APPROVED (available) assessment / 122 |
| `governance` | (approved chemistry assertions + approved assessment items + content-approved activities) / (all assertions + items + activities) |
| `release` | activities with a current human RELEASE decision / 146 |
| `localization` | mean over target locales (uz-Latn, uz-Cyrl, ru) of units whose content exists in that locale / 122 |
| `learningProductProgress` | Σ weight × component, with **equal weights of 1/6**: learningCoverage, modelBasedInteraction, assessmentCoverage, governance, release, localization |
| `overallManagementEstimate` | **0.4 × foundationProgress + 0.6 × learningProductProgress** |

- The two main numbers are separate on purpose: the platform can be near 100 % while the learning product for 122 units is still low.
- `overallManagementEstimate` is only a management composite. Read the two numbers above it first.

## 4. What is deliberately NOT counted as progress

- runtime READY (technical launchability) as learning depth;
- a theory page as mastery;
- assessment item count as outcome coverage (outcome coverage is reported separately);
- provenance debt (`add-source`) as missing learning content — it is its own category, **PROVENANCE**;
- a pending review as a learning gap (reviews are in the **GOVERNANCE** category);
- a domain module's existence as UI coverage (engines report `browserExposed` / `rendererExposed` separately);
- legacy accessibility — **UNKNOWN**, never assumed PASS.

## 5. Work packages

`reports/p2-work-packages.json` lists each package's facts: affected units and activities, dependencies, blockers, machine work and human work. **There is no priority score.** A person chooses the order.
