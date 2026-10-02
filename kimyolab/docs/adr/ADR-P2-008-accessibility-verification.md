# ADR-P2-008 — Accessibility verification: measured through the real flow, fixed per family, never assumed

- **Status:** accepted (P2.7).
- **Before / after:**
  - before: the same sweep run against the P2.6 code (`2e80fd0`) — 145/145 launchable activities failed at least one check;
  - after: 140 VERIFIED, 5 BLOCKED_BY_CONTENT, 0 FAILED, 1 NOT_APPLICABLE;
  - learning units with `ACCESSIBILITY_UNVERIFIED`: 116 → 8.
- **Result:** see `reports/accessibility-gap-summary.json` (totals, families, affected units) and `reports/accessibility-verification.json` (one row per activity).
- **Not done:**
  - no human accessibility approval was created; the human-review count is 0;
  - no chemistry, label translation or colour description was authored;
  - no progress weight or formula changed; no learning-depth number moved because of accessibility.

## 1. Question

Before P2.7, 7 activities carried a *declared* accessibility contract (the registry renderers) and 138 legacy activities were `UNKNOWN`. Which learner interactions are actually usable with a keyboard, a screen reader, without colour, at 320 px / 200 % zoom / 200 % text and with reduced motion? And which failures are shared, so one fix covers many activities?

## 2. Decision

### 2.1 Measure every launchable activity in the browser, through the real flow

`tests/e2e/accessibility-sweep.spec.mjs` opens every launchable activity (145) in real Chromium on the `/kimyolab/` portal host. It then operates it **keyboard only** (Tab / Shift+Tab / arrows / Space / Enter / typing):

1. **Empty input:** submit with nothing entered. A localized `role=alert` must appear, be bound to its control, and focus must stay in the form.
2. **Wrong answer:** a well-formed wrong answer must produce a ✗ text verdict.
3. **Retry:** in the same attempt for forms; a fresh attempt for renderers.
4. **Complete:** the "next stage" link must appear.

On the finished state it then measures:

- reflow at 320 px, 375 px, 640 px (= 200 % zoom of a 1280 px window) and 200 % root text;
- 44 px targets;
- no running animation or transition under `prefers-reduced-motion: reduce`;
- accessible names, group semantics, heading structure, live regions and focus visibility at every focus stop.

The success path is the one the learning-depth solver already proves in node (`legacyCanSucceed` / `uiPathCanSucceed`). `scripts/lib/accessibility-plan.ts` only translates engine commands into UI operations (option **index**, step **index**, renderer data attribute). The plans are computed at run time and never written to disk, because they contain answers.

One representative per UI family is also run in the standalone single file. Its results must be **identical** to the portal: there is no host-specific accessibility behaviour.

### 2.2 The committed facts are re-measured on every verify

The browser facts are committed in `reports/accessibility-browser-evidence.json`. The same spec runs inside `npm run verify` (e2e gate) in compare mode, and any difference fails the build. `npm run a11y:sweep` rewrites the file after a deliberate change. A report therefore cannot claim more than the browser shows.

### 2.3 One state rule

`scripts/lib/accessibility-verification.ts` defines the states:

- **VERIFIED** (AUTOMATED_VERIFIED): every applicable check passes.
- **FAILED:** any check fails, or there is no evidence at all.
- **BLOCKED** (BLOCKED_BY_CONTENT): all checks pass, but the content lacks something only a person can author, such as a colour change recorded without its colour.
- **NOT_APPLICABLE:** the activity cannot be launched.

A check that cannot apply is never counted as a pass:

- **Empty input on step-only experiments:** there is no free input, so the check is `NOT_APPLICABLE`.
- **Wrong answer when the engine judges nothing:**
  - an out-of-order step that the engine accepts gets the note `STEP_ORDER_NOT_ENFORCED_BY_ENGINE`;
  - a non-target value that the engine records as progress gets the note `ENGINE_GIVES_NO_VERDICT_FOR_NON_TARGET_STATE`.

  This is a feedback-design fact that applies to every learner equally, so it is reported but not treated as an accessibility pass.

The learning-depth baseline and both P2.7 reports use this rule. The registry renderers' declared contracts are kept for reference (`rendererContract`), but they no longer decide anything.

### 2.4 Fix shared primitives, not activities

All fixes are in the five legacy primitives (`src/features/practice/render.ts`), one shared DOM helper, the four renderers' disabling logic, the learning-cycle navigation and the shared stylesheet. No activity-specific CSS or ARIA was added.

| Family / primitive | Failure found by the sweep | Central fix |
|---|---|---|
| Legacy typed forms (simulation, trainer, calculation) | `required` showed the browser's English bubble; the Uzbek `role=alert` never appeared and the error was not announced | `novalidate`; the localized alert plus `aria-invalid` |
| Several forms on one page | Identical button names ("Tekshirish" / "Qo‘llash") | Each button is described by its question label |
| Experiment steps | Every step button was "Bajarish"; the done step was `disabled`, so focus fell to `<body>`; a **rejected** out-of-order step was still disabled forever (dead end); invalid input went to a detached alert | Buttons named by their step; `aria-disabled` keeps focus; the step stays open when the engine rejects it; an in-page alert; `aria-current="step"`; the stage is a named group and its decoration is `aria-hidden` |
| Case | No visible labels (placeholder only); errors not bound | Visible labels; `aria-describedby` to the alert; `novalidate` |
| Registry renderers (atom, hydrolysis, ionic, condition) | A control disabled by a result (reveal, mix, check, −) dropped focus to `<body>` | `setDisabled()` (src/ui/components/dom.ts) hands focus to the next control or the result text |
| Verdict | Text only | The text stays the verdict; a decorative ✓/✗ (`aria-hidden`) is added |
| Unit hero | A long title word forced horizontal scroll at 320 px | `overflow-wrap:anywhere` |
| Site header | 200 % text pushed the navigation off-screen | The header and navigation wrap |
| Learning-cycle navigation | The current stage was visual only | `aria-current="step"` |
| Focus ring | A portal `*:focus{outline:none}` could erase it (`:where()` has zero specificity) | A `.kl-app` focus rule with real specificity |
| Option and checkbox targets | Shorter than 44 px | `min-height:44px` |

Reduced motion was already handled globally (P2.2). The sweep confirms it for every activity, and the families spec proves the check is real: the stage animates by default and stops under `reduce`. Later scroll-reveal work must use the same `@media (prefers-reduced-motion: reduce)` rule. No reveal animation was implemented.

### 2.5 Evidence for surfaces that are not activities

`tests/e2e/accessibility-families.spec.mjs` covers:

- the assessment UI (grouped options, keyboard, text result);
- the learning-cycle navigation;
- portal CSS reset resilience (focus ring, native radios, clickable labels, distinguishable done step, 44 px);
- rapid radio navigation;
- keyboard retry, wrong answer, empty input, a rejected step, 320 px and reduced motion.

The P2.6 hydrolysis/condition radio-race specs are unchanged.

## 3. What stays human

- **Human accessibility review** (a person with a screen reader and a keyboard) is `NOT_REVIEWED` for every activity. Automated verification does not replace it.
- **BLOCKED_BY_CONTENT activities** need a content author to describe the recorded colour change. The agent does not invent chemistry observations.
- **Assessment quiz:** it keeps the browser's native required-field validation (no new Uzbek literal was added). The message follows the browser language. This is a known limitation, and localization is human work.

## 4. Invariants

- MODEL_BASED: 7 activities / 9 units.
- Learning product and overall: unchanged by P2.7.
- Portal readiness: 13/13.
- Host parity: 11/11.
- Chemistry records and source, theory and assessment governance: unchanged.
- No new runtime dependency.
