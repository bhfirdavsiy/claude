# ADR-P2-013 — Content Studio MVP and the canonical authoring pipeline

- **Status:** accepted (P2.12). This is an MVP: an internal, local tool.
- **Principle:** one canonical content source → two separate interfaces.
  1. The Learner App.
  2. The Content Studio.

  The Studio is not a technical CMS, and it does not keep content of its own.
- **Rule:** "KimyoLab kontent yaratmaydi; tasdiqlangan kontentni taniydi va mos raqamli shaklda ishlatadi." The Studio parses and routes approved material structurally; it never writes chemistry, examples, explanations or decisions.
- **Not in scope:**
  - periodic table, substance passport, reaction explorer;
  - external-lab redesign, learner navigation redesign;
  - login, profile, progress, leaderboard;
  - IChO;
  - mass lab migration;
  - automatic textbook extraction;
  - runtime generative AI.

## 1. Audit first: what is reused

| Existing piece | How P2.12 uses it |
|---|---|
| Learner build roots: `src/{app,features,ui,domain,runtime,engines,integrations,renderers}` | `src/studio/` is outside them, so it can never enter a learner build. `src/authoring/` (P2.4) already works the same way. |
| `kimyolab.source-intake.v1` + `source:queue` / `source:apply`: governed source intake, human-only apply (ADR-P2-005) | The provenance of a textbook excerpt is a source-intake entry. |
| Offline workbench pattern: no network writes, files are only downloaded (ADR-P1-009, ADR-P2-005) | The Studio never writes canonical content. It downloads a publish candidate. |
| P2.11 pipeline: `classifyInstructionStep → resolveOperation → topic lab profile` | This is the lab-instruction lane. |
| Learner renderers: `renderDynamicLab` and the new `renderTextbookExcerpt` | The preview runs these exact modules. They are byte-identical to the learner build's modules (checked in the report). |
| Feature-flag convention `?ff=<name>` | `contentStudioV1` gates the Studio's entry page. |

## 2. Separate application layer

The Studio has its own build.

| Piece | Where |
|---|---|
| Build | `scripts/build-content-studio.ts` → `dist-studio/` (git-ignored) |
| Entry | `src/studio/ui/main.ts` |
| Modules | `app/**`: the runtime import closure of the entry. These are the Studio's own modules plus the shared learner and domain modules it reuses; no contract is duplicated. |
| Content | `content/**`: a byte copy of the built learner pack, loaded through the learner's own integrity-checked `ContentClient` |
| Data | `studio-data.json`: build-time data copied from the canonical sources (`kimyolab.content-studio-data.v1`) |

- **Page:** `lang="uz-Latn"`. The CSP has `default-src 'none'` and only `'self'` / `blob:` exceptions. There is no external origin.
- **Not in the learner build:**
  - no Studio module in `public/app-preview`, production, standalone, release or deploy;
  - no Studio route or navigation in the learner app;
  - no learner progress, profile or orchestrator module in the Studio closure;
  - the Studio catalog (`content-src/studio/content-studio.uz-latn.json`) is not in the learner content pack.
- **Serving:** `npm run studio:serve` binds to 127.0.0.1 only and accepts GET/HEAD only, with no path outside `dist-studio/`.
- **Authentication:** none exists, and none was invented. The Studio is not presented as a production admin system. `docs/DEPLOY.md` says it must never be uploaded.

## 3. Role first, renderer second

`src/studio/content-roles.ts` defines the roles: EXPLANATION, TEXTBOOK_EXCERPT, VISUAL, QUESTION, INTERACTIVE_TASK, PRACTICAL_ACTIVITY, LAB_INSTRUCTION, SAFETY, LEARNER_RESPONSE, ASSESSMENT.

- **The author chooses the role.** It is never guessed from words such as "tajriba", "elektroliz" or "amaliy ish".
- **The instruction parser** runs only on LAB_INSTRUCTION content.
- **Implemented lanes:** TEXTBOOK_EXCERPT and LAB_INSTRUCTION. All other roles are `not yet supported` and are named as such to the author.

## 4. Lane A — textbook excerpt

Flow: Sinf → Mavzu → Darslik PDF qismini yuklash → Ko‘rish → Tekshirish → Nashrga tayyorlash.

- **Input:** the author uploads an excerpt a human has already cut.
  - There is no page detection, cutting, OCR, AI extraction or mapping from a full book.
  - The original page range is optional; source and title metadata are kept.
- **What the machine checks** (`src/studio/pdf-excerpt.ts`):
  - the `%PDF-x.y` signature at byte 0 and `%%EOF` in the last KB;
  - no `/Encrypt`;
  - at most 20 MB;
  - active-content markers (`/JavaScript`, `/Launch`, `/EmbeddedFile`, …) are flagged for a human, and nothing is executed.
- **Safe file name:** no directory, no control characters, ASCII, `.pdf`.
- **Checksum:** SHA-256, computed by the machine and never shown to the author.
- **Rights:** publication rights are explicit. They stay `NOT_DOCUMENTED` until a human documents the basis; an upload is never assumed redistributable.
- **Learner view, "Darslikdan o‘qish"** (`src/features/textbook-excerpt/render.ts`):
  - the PDF loads only when the learner opens it, in the browser's own viewer, with a download fallback;
  - all labels come from the learner catalog;
  - the Studio preview uses this same renderer.
- **Fixtures:** tests and the report use a synthetic PDF (`scripts/lib/synthetic-pdf.ts`). No textbook excerpt is committed or published.

## 5. Lane B — lab instruction

Flow: Sinf → Mavzu → Yo‘riqnomani kiritish → Tizim tekshiradi → Ko‘rib chiqish → Laboratoriya ko‘rinishi.

- **Input:** the author types the instruction, or starts from the topic's canonical instruction. The canonical instruction is copied, never written back.
- **Analysis:** `analyzeInstruction` classifies each step and resolves every operation with the P2.11 `resolveOperation`.
  - The author never picks an engine, a handler, a family or an authority.
  - Ambiguous verbs keep `family: null`.
  - Learner responses and safety statements are never chemistry.
  - Nothing omitted from the instruction is asked for: no temperature, time, quantity, apparatus, colour or observation.
- **Preview** (`previewProfile`):
  - **PROFILE_PREVIEW:** the topic's canonical profile exists and the draft is its instruction. The profile is re-derived from the draft text, with the completion scope recomputed, and drawn by the learner dynamic-lab renderer.
  - **INSTRUCTION_CHANGED:** the instruction differs. No profile is silently reused; the expert must re-author it.
  - **NO_PROFILE:** the topic has no lab view yet. The Studio does not improvise one.
- **What the preview shows in plain Uzbek:** partial scope (`PARTIAL_INSTRUCTION`), uncovered operations, missing models, and the 8.14 source conflict. The conflict stays `SOURCE_CONFLICT_REVIEW_REQUIRED`.
- **Round trip** (`reports/content-studio-lab-roundtrip.json`): 7.10 and 8.14 passed through the Studio. All six dimensions are equal:
  - operations;
  - trial scope;
  - capability resolution;
  - completion scope;
  - gaps;
  - chemistry: the same actions give the same lab state.

## 6. Draft (`kimyolab.content-studio-draft.v1`)

- **Contents:** role, target learning unit, provenance (author upload / canonical instruction / author text, plus the author's name), payload, validation, preview, review and publish state.
- **Revision:** the content revision is a hash of role + target + provenance + payload. It is hidden from the author.
- **Binding:** a check or a preview counts only for the revision it was made on. An edit requires both again.
- **Review state:** always `NOT_REVIEWED`. The Studio never marks anything reviewed.

## 7. Validation

Five statuses: READY, ATTENTION_REQUIRED, UNSUPPORTED, MISSING_INFORMATION, SOURCE_CONFLICT.

- **Findings** carry an internal code and a uz-Latn message.
- **Validation creates no facts.** "Qizdiring" does not make it ask for a temperature, and "Rang o‘zgarishini kuzating" does not make it ask for a colour. A missing model is reported as missing.

## 8. Publish boundary: "Nashrga tayyorlash"

The browser cannot write canonical content. A "Nashr qilish" button would be fake, so there is none. The last screen downloads a **deterministic publish candidate** (`kimyolab.studio-publish-candidate.v1`): sorted keys, a revision hash, and the PDF in base64 with its checksum. The same draft gives byte-identical bytes.

**Textbook excerpt.** The candidate carries:
- a valid `kimyolab.source-intake.v1` entry (`status: draft`, `reviews: []`, `submittedBy` = the author's own name). It is consumed by `source:queue → human review → source:apply`;
- the excerpt record.

**Lab instruction.** The candidate carries the instruction, the analysis, the preview state and the completion scope, for the chemistry and didactic reviewers.

**Checks.** `npm run studio:check -- <file>` re-verifies a candidate in any environment and writes nothing. It checks:
- the revision;
- the file checksums;
- the embedded source intake;
- that human gates and review are not preset.

**Still needed for one-click publish:**
- a human-only excerpt apply command;
- a rights register for excerpts;
- a learner hub entry point for published excerpts;
- a human-only apply command for instruction drafts;
- profile authoring for instructions without a lab profile.

## 9. Author-facing language

- **Catalog:** every Studio string is in `content-src/studio/content-studio.uz-latn.json`.
- **Coverage:** every key the Studio uses exists.
- **No technical concepts:** the report scans every label for JSON, schema, ids, engine and handler names, hashes, revisions, branches, CI and internal codes; there are 0. The e2e applies the same scan to the live Studio UI.
- **Fixed replacements:**
  - `PROFILE_VALIDATION_FAILED` → "Laboratoriya ma’lumotlari to‘liq emas.";
  - `UNSUPPORTED_CHEMISTRY` → "Bu jarayon uchun kimyoviy model hali mavjud emas.";
  - `ACTION_NOT_IN_INSTRUCTION_SCOPE` → "yo‘riqnoma bu amalni shu tajriba uchun ko‘rsatmagan".

## 10. Accessibility

- Every control has a label that states "majburiy" or "ixtiyoriy" in text.
- Errors are `role=alert` and bound to the fields (`aria-describedby`, `aria-invalid`), and focus moves to the first field to fix.
- The current stage is marked with `aria-current`, never by colour alone.
- Verified: 320 px reflow, 44 px targets, no motion, keyboard only (e2e).
- The learner invariant stays 140 / 5 / 0 / 1.

## 11. Reports

| Report | Content |
|---|---|
| `reports/content-studio-readiness.json` | Architecture and boundary, roles, both lanes step by step, validation categories, preview parity, publish boundary, localization coverage, Studio bundle, governance blockers, formal metrics. Statuses are always one of `implemented`, `preview only`, `human review required`, `not yet supported`. |
| `reports/content-studio-lab-roundtrip.json` | The 7.10 / 8.14 round trip. |
| `reports/guided-dynamic-lab-readiness.json#bundleDelta.phases["P2.12"]` | The learner bundle growth: one module, the excerpt renderer, which is not yet linked from a learner route. |
