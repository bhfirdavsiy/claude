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

## 6. P2.1 — interaction measurement (ADR-P2-002)

- **A choice UI is not a model.** Turning a closed-domain field into labelled options changes neither `depth` nor `modelBasedInteraction`: a STATIC_CHECK stays STATIC_CHECK.
- **Untranslated answer token.** A field counts when the learner must TYPE an identifier-like token. It does not count when:
  - the field is a choice;
  - the value is a generic trainer's authored `acceptedAnswers` (Uzbek learner answers).
- **Raw-id label.** A label counts as raw when it matches the P2.0 id-like rule, or when it is exactly the id or its mechanical humanization (`replaceAll('-',' ')`, camelCase split).
- `reports/interaction-reliability.json` compares with the P2.0 baseline it cites (commit `41029a7`). It never edits that baseline.

## 7. P2.3 — theory depth rule (ADR-P2-004)

- A unit's theory is **STRUCTURED** only when a human-authored entry in `content-src/theory-structured/` meets both conditions:
  - it is complete: explanation of at least 300 characters, at least one worked example, at least one misconception check, and a summary;
  - every block cites a registered source of an acceptable category.
- Legacy `explanationBlocks` are MINIMAL whatever their block types are. The P2.0 block-type heuristic was removed.
- These never count as STRUCTURED:
  - templates, placeholders, empty packet slots;
  - unsourced entries;
  - incomplete entries (the build rejects them).
- Review state is reported in `reports/theory-depth-audit.json`. It is separate from depth: an approval does not make theory deeper, and depth does not approve it.

## 8. P2.4 — governed authoring is infrastructure, not progress (ADR-P2-005)

- `reports/theory-authoring-status.json` reports per-unit authoring/review state (not started, draft, ready for review, chemistry-reviewed, didactic-reviewed, approved, changes requested, missing source, stale review), source counts and blockers. It is a **separate** report, not an input of the formula.
- Working drafts (`authoring-drafts/theory/`), source intake entries, pending or partial reviews, empty packets and the workbench itself never change a percentage. Only canonical content that satisfies the existing rules (for theory: §7, now also dual-review APPROVED via the governed apply) can.
- No weight was changed.

## 9. P2.5 — MODEL_BASED is judged per activity (ADR-P2-006)

- A registry renderer counts as MODEL_BASED only with black-swan evidence **for that activity**. For the reaction-mixing renderer, the activity's own shelf must reach at least two distinct modeled outcomes in the real domain, and only observations that pass the KB integrity check count. A newly bound activity cannot inherit the reference activity's evidence.
- `reports/model-interaction-expansion.json` lists every candidate with its facts and reasons. It is a separate report, not a formula input.
- P2.5 converted 0 activities. MODEL_BASED stays at 4 activities and 6 learning units, and no weight was changed.
