# ADR-P2-010 — Learner feedback semantics: one taxonomy, no invented verdict, no imposed order

- **Status:** accepted (P2.9).
- **Scope:** the feedback debt P2.7 recorded:
  - 29 form simulations whose engine gave no wrong-answer verdict ("Natija saqlandi. Davom eting.");
  - 6 experiments whose steps are accepted in any order;
  - the quiz/reflection forms that left validation to the browser's own popup.
- **Not in scope:** colour descriptions (the 5 BLOCKED_BY_CONTENT activities), assessment banks, theory authoring, ru / uz-Cyrl localization, real deployment, animations, progress weights.

## 1. Audit first

`npm run feedback:semantics` audits the 35 activities from the configs, the content and the code contract. It writes:

| Output | Content |
|---|---|
| `reports/learner-feedback-semantics.json` | one row per activity: engine semantics, canonical-incorrect definition, declared order, what the learner hears, state, decision needed |
| `reports/feedback-semantics-expansion.json` | the technical changes, what each pending decision would unlock, bundle delta |
| `review-packets/feedback-semantics/` | one packet per activity that needs a human decision |

States:

- `SEMANTICS_CLEAR` — the engine already has canonical semantics.
- `TECHNICAL_FIX_ELIGIBLE` — fixable without any chemistry, didactic or procedural decision.
- `HUMAN_DECISION_REQUIRED` — the repository cannot answer.
- `CONTENT_REQUIRED` — content is missing.

**Result:** SEMANTICS_CLEAR 1, TECHNICAL_FIX_ELIGIBLE 0 (the eligible technical fixes are applied; see §3), HUMAN_DECISION_REQUIRED 34, CONTENT_REQUIRED 0.

## 2. Findings

### 2.1 28 generic simulations are target-only

- **What the engine knows:** the config holds only `initialState` and `targetState`. Evidence is written when the whole state equals the target (`src/runtime/beta1/router.ts`). There is no option set, no incorrect state and no field dependency.
- **Why a non-target value is not automatically wrong:** many non-target states are chemically valid. Examples:
  - `F` with `halogen` in 7.16;
  - the initial `Cu / low / conductor` of 9.20;
  - `graphite / layered` in 9.08.
- **Why labels cannot decide it:** inferring "wrong" from field names or labels would invent chemistry.
- **Decision:** they stay without a verdict, and the learner is now told so (§3). Each one has a packet asking which values, if any, are incorrect, and on which source.

### 2.2 11.16 was never verdict-less

- **The engine:** the kinetics engine (closed domain, model-computed effect) judges a wrong option INCORRECT with score 0.
- **Where the P2.7 note came from:** option order. `localeCompare(…,'uz')` gives a different order in Node (where the sweep plan is computed) and in Chromium (where the page renders), because the two ship different ICU data ("O‘zgarmaydi" vs "Ortadi"). The sweep's "wrong" probe therefore clicked the *correct* option.
- **Fix:** the product now orders choices by NFC lower-case code points, which is the same in every runtime.
- **Result:** the sweep now measures 11.16's wrong-answer announcement.

### 2.3 The 6 experiments are set-completion engines

- **What the engine knows:** completion when every required action was done once. No config, domain model or engine declares an order.
- **Why there is still a question:** the textbook steps and the numbered list *suggest* a sequence, but some steps (record / observe) might reasonably follow any order.
- **Decision:** the array position is not turned into an order. Each experiment has a packet asking whether an order is required, as dependencies with a reason.

### 2.4 Quiz and reflection validation was the browser's

- **What happened:** `required` radios and textareas without `novalidate` meant the browser's English, unannounced bubble answered an incomplete submission. The page's own "Barcha qismlarni to‘ldiring." was unreachable.
- **Fix:** see §3.

## 3. Decisions (technical, applied)

1. **One feedback taxonomy** (`src/runtime/shared/learner-input.ts`).
   - Categories: CORRECT, INCORRECT, VALID_INTERMEDIATE, UNSUPPORTED_INPUT, PROCEDURE_BLOCKED, SYSTEM_ERROR.
   - It is derived only from the existing engine result shapes, so no engine judges anything new.
   - The page shows catalog text per category (`ui.*`) and exposes `data-feedback`.
   - The CORRECT, INCORRECT and UNSUPPORTED_INPUT texts are unchanged.
2. **VALID_INTERMEDIATE** says "saved; not the final result yet".
   - It replaces "Natija saqlandi", which read like a result.
   - Target-only simulations also show a note: only the target state is checked, and other values are saved but not judged.
3. **PROCEDURE_BLOCKED.**
   - The experiment engine still rejects a step whose declared dependency is open, with the same status and code, no state change and no evidence.
   - It now also gives `reason: STEP_DEPENDENCY_UNMET`.
   - The learner hears "do the earlier step first" instead of "your input is invalid".
   - This applies to the beta1 scenarios, which already declare dependencies. None of the 6 audited experiments is affected.
4. **Current-step marker.** `aria-current=step` moves to the first step not done. Before, it moved to the DOM neighbour of the step just done, which could point at a finished step when the engine accepts any order.
5. **Choice order.** NFC lower-case code points instead of `localeCompare(…,'uz')` (§2.2). Only the order of options changes: values, evidence and correctness do not.
6. **Quiz and reflection.**
   - The forms use `novalidate`, with a localized `role=alert` that lists the unanswered questions or incomplete parts (`ui.quiz-unanswered`, `ui.reflection-incomplete`).
   - Those questions or parts get `aria-invalid`, and focus moves to the first one.
   - The learning-hub model carries the two validation templates from the catalog (not the whole catalog).

## 4. Evidence and scoring

- No evidence id, score, `targetId`, config version or scoring version changed. Every row has `evidenceSemanticsChanged: false` and `scoringChanged: false`.
- An intermediate state writes no evidence and no progress.
- When a human decision adds incorrect states or step dependencies, that change follows the ADR-P1-006 rule: config version 2.0.0 and new evidence ids, so old evidence is never read as the same scoring context.
- No UI module writes mastery.
- **Review surface:** the CHEM-033 review surface includes `content-src/locales/uz-latn/learner-interaction.json`, so the five new `ui.*` strings change its hash. No approval existed (`APPROVAL_PENDING`), so nothing was invalidated and no approval was touched.

## 5. Invariants measured

- **Accessibility:** 140 VERIFIED / 5 BLOCKED_BY_CONTENT / 0 FAILED / 1 NOT_APPLICABLE (re-measured).
- **11.16:** its wrong-answer check is now measured instead of noted.
- **Portal and standalone:** identical feedback on both (`tests/e2e/feedback-semantics.spec.mjs` runs every flow on both hosts).
- **Progress:** learning product 12.189, overall 47.313, weights unchanged.
- **Bundle delta:** see `reports/feedback-semantics-expansion.json#bundleDelta` (no new learner module: the taxonomy lives in the existing `learner-input.ts`).

## 6. Rejected alternatives

- **Treat every non-target value as INCORRECT.** This would invent chemistry: many are true statements about another substance.
- **Enforce the array order of `requiredActions`.** The order was never declared, so this would impose a procedure from data layout.
- **Keep the browser's validation.** It is unlocalized, unannounced, and bypassed the page's own messages.

## 7. Content revision: semantic version vs deploy/cache identity

### Finding

The rollback drill failed between main and this branch. The five new catalog strings change the bytes of `locales/uz-latn/learner-interaction.json`, but the pack keeps `contentVersion` `2026.09.1`, and the server cached every `/content/2026.09.1/…` file as `immutable` for a year. As a result:

- After an upgrade or a rollback, a returning learner's browser mixes a cached file of one pack with the manifest of the other.
- The integrity check then fails closed and shows an error page, in both directions.
- The content version has never changed since the baseline. Every earlier content change was exposed to the same problem; it had simply never been deployed.

### Decision (taken by a human; options were presented, none pre-chosen)

The semantic version is **not** bumped and immutable caching is **not** weakened. Instead the two identities are separated.

- **`contentVersion` stays semantic** (`2026.09.1`). Activity versions, pending review targets, approval records and evidence are untouched: changed deployment bytes are not a content release.
- **`contentRevision` is the deploy/cache identity:** the first 16 hex of the pack's canonical aggregate checksum, which covers every file's path, sha256 and size (`src/runtime/compatibility/release-pointer.ts`).
- **Layout.** The deployment artefact serves the pack at `content/<contentVersion>/<contentRevision>/` (`scripts/lib/content-revision.ts`, applied by `deploy:build`). The pointer `content/manifest.json` names that exact directory, and the client verifies that the revision is the hash of the pack it receives.
- **Caching.** Only revision-qualified URLs are immutable (`server/app.mjs`; the nginx and Apache EXAMPLES in DEPLOY.md). The pointer, the manifests and any semantic-only pack path are revalidated.
- **Deploy and rollback** switch the pointer, and with it the whole pack, in one step. The rollback drill runs the real registry switch and adds `immutable-urls-stable`: no immutable URL serves different bytes in the two releases.
- **Fail-closed preflight check 17, `content-revision`:**
  - `DEPLOY_CONTENT_REVISION_INVALID` — the revision is not derived from the pack hash, an unlisted or edited file sits under the revision directory, or an un-revisioned copy or a source-layout pointer is present.
  - `DEPLOY_IMMUTABLE_URL_REUSED` — with `KIMYOLAB_PREVIOUS_ARTIFACT`, an immutable URL of the previous release serves different bytes.
- **Source build unchanged.** It keeps the semantic layout (`public/content/<version>/`), and the bundled server never caches that layout as immutable.

### Measured

- Preflight 17/17, smoke 23/23, rollback drill PASS (baseline: main), including `immutable-urls-stable`.
- Unit tests: layout, five fail-closed cases, honest new revision versus forged reuse, and the client rejecting a forged revision.
- HTTP surface test: the revision path is immutable, the pointer and manifests are `no-cache`, and no un-revisioned copy is served.
