# ADR-P2-014 — Periodic table and Element Knowledge Hub

- **Status:** accepted (P2.13). The feature is behind `periodicTableV1` (default off).
- **Principle:** extend, don't replace; derive, don't duplicate. Element identity has exactly one source.
- **Rule:** the system does not make up chemistry or names. A value without a source is shown as a gap.
- **Not in scope:** Substance Passport and Reaction Explorer (P2.14); extending the electron-configuration engine; authoring metadata or names; an element editor in the Content Studio.

## 1. Audit first

| Source | Finding | Decision |
|---|---|---|
| `src/domain/chemistry/periodic-table.ts` | 118 symbols in Z order; the formula parser and the atom model read it | stays the **only** identity source |
| `src/domain/chemistry/electron-configuration.ts` | fills orbitals in one fixed order, Z 1–36 only, no exception records; the P2.6 known-gap record names Z 24 and 29 | not extended; profile shows a value only inside the range and outside the known gaps |
| `content-src/locales/uz-latn/chemistry-elements.json` | 20 names, review `pending` | used as is; no name added or copied |
| `content-src/chemistry/species.json`, `reactions.json`, `guided-step-reaction-map.json`, topic lab profiles, `mapping-links.json` | the only relationship evidence | relations derived from these records only |
| legacy `data/elements.json` | 118 rows; f-block `period` 8 / 9 and `group` 4–17 are display positions; mass and category have no provenance | audited (`reports/legacy-periodic-parity.json`), never used as truth |
| legacy `periodic.html`, `js/periodic.js` | V19 page and script (category → colour) | `NOT_USED`; the legacy page stays as a fallback; the V20 route does not depend on it |
| learner search (`src/features/search`) | one index of topics and practice | extended with element entries; no second search |

## 2. Display layout ≠ chemical metadata

`src/domain/chemistry/periodic-layout.ts` places each cell in the 18-column grid:

| Value | Use |
|---|---|
| **Layout row** (1–7) | the main-table row band of a cell |
| **Layout column** (1–18) | the main-table column; none for the f-block (Z 57–71, 89–103) |
| **Display position** | rows 1–7; rows 9–10 for the f-block. A display row is never a period (La is drawn in row 9) |

The rule (row-closing atomic numbers 2, 10, 18, 36, 54, 86, 118; column filling) is **scientific periodic-table knowledge**. Canonical identity alone (`ELEMENT_SYMBOLS`) does not prove it. P2.13 therefore uses it **only to draw the table**.

**As a chemical period / group** the rule is one compact scientific assertion, `periodic.period-group-rule`. It is hashed over the whole rule (no 118 duplicated rows) and reviewed like any other claim (§3a).

**Closeout decision: Option B (fail closed).** The source registry has no eligible source: 5 sources, all `PROPOSED`, none human-accepted. So:
- the profile shows period and group as a gap ("Bu ma’lumot hali tasdiqlangan manbada mavjud emas.");
- the group and period filters are disabled with a note.

Once a registered, acceptable, human-accepted source is cited in `rules.periodGroup` and a chemistry reviewer approves the rule's current hash, the same rule becomes `REVIEWED`: values are shown, and the f-block group stays `F_BLOCK_GROUP_CONVENTION`. Legacy agreement with the unreviewed rule is `UNREVIEWED_MATCH`, never canonical.

## 3. Element metadata (`kimyolab.element-metadata.v1`)

- **File:** `content-src/periodic/element-metadata.json`, keyed by symbol, with no identity repeated.
- **Fields:** `relativeAtomicMass`, `category`, `oxidationStates`, `teachingDescription`. Each is `{value, sourceRefs}`, where `sourceRefs` are **registry ids only**.
- **Refused:** any other field, including `reviewStatus` and `title`. An unknown source id fails the build.
- **Period/group sources:** `rules.periodGroup.sourceRefs` holds the sources for the period/group rule (currently none).
- **Current state:** the file holds no entries. The repository has no source, so every authored field is the gap `SOURCE_REQUIRED`.

The hub carries only what a learner may see:

| Status | Meaning |
|---|---|
| `REVIEWED` | effective human approval on the claim's current hash **and** at least one eligible source; the source titles come from the registry |
| `COMPUTED` | a domain engine inside its proven range (`ENGINE_COMPUTED`, electron configuration) |
| `GAP` | with a reason: `SOURCE_REQUIRED`, `SOURCE_NOT_ELIGIBLE`, `REVIEW_PENDING`, `F_BLOCK_GROUP_CONVENTION`, `OUTSIDE_ENGINE_RANGE`, `ENGINE_KNOWN_GAP` |

An unreviewed claim never reaches the hub as a value.

## 3a. Scientific provenance and human review (closeout)

`scripts/lib/element-governance.ts` reuses the chemistry knowledge-base pattern (`kb-review.ts`) and the source policy (`source-policy.ts`).

- **Assertions.** Each claim is an assertion with a content hash over what is claimed plus the cited source ids. The assertions are: the period/group rule, each metadata field, each authored relation.
- **Decision register.** `content-src/periodic/element-reviews.json` (`kimyolab.element-reviews.v1`) records `assertionId`, `assertionHash`, `decision`, `reviewerId`, `reviewerRole`, `reviewedAt` and `comment`. Extra fields are refused.
- **Effective review.** It is the latest decision in the required role, checked against the **current** hash; an edited claim is `stale`.
- **Reviewers.** Automation identities (`isAutomationIdentity`) are refused, and tooling never writes a decision.
  - Chemistry role: scientific claims and substance/reaction relations.
  - Didactic role: topic/lab relations.
- **Sources.** Ids must resolve to `content-src/source-registry.json`. Title, category and acceptance come from the registry. *Eligible* means an acceptable category for a chemistry claim **and** `HUMAN_ACCEPTED` through the governed source intake. An `INTERNAL_PROPOSAL` or `PROPOSED` source never unlocks a field.
- **Current counts:** 0 decisions, 0 effectively reviewed claims. Nothing was invented.

## 4. Element Hub (`kimyolab.element-hub.v1`)

`scripts/lib/element-hub.ts` builds `periodic/element-hub.json` into the content pack. It is integrity-checked like every pack file. The client refuses a hub that does not carry exactly the canonical 118 identities in order. The learner page reads the hub and computes no chemistry.

The hub records these relations, each with its provenance:

| Relation | Kind | Provenance |
|---|---|---|
| Element → Substance | `PARTICIPATES` | `DERIVED_FROM_FORMULA`: the element is in the species formula (canonical formula parser); unparseable species texts are listed |
| Element → Reaction | `PARTICIPATES` | `DERIVED_FROM_FORMULA`: the element is in a participant formula |
| Element → Lab | — | `EXPLICIT_MAPPING`: a substance on the lab's topic-lab-profile shelf, or a reaction in the lab's guided-step reaction map. `via` names the evidence |
| Lab → Topic | — | `EXPLICIT_MAPPING` through `mapping-links.json`. The grade comes from the topic |
| `PRIMARY` / `RELATED` | `PRIMARY`, `RELATED` | `AUTHORED_RELATION` only, from `content-src/periodic/element-relations.json`. Each relation has `targetType` ∈ `SUBSTANCE` / `REACTION` / `TOPIC` / `LAB`, a `targetId` that exists in that canonical registry, and registry source ids. It reaches the learner only when effectively reviewed (§3a). None is authored yet |

`PARTICIPATES` is never promoted to `PRIMARY`. No keyword, title or text matching is used, and nothing is inferred.

## 5. Learner route

| Item | Behaviour |
|---|---|
| Routes | `/periodic` (table) and `/periodic/<symbol>` (profile deep link). An unknown symbol shows a notice on the page |
| Flag off | the route renders the existing "page not found" and search has no element entries, so the learner app is unchanged |
| Portal | the server allow-list serves the shell for `/periodic` and `/periodic/…`, so deep links and refresh work |
| Standalone | hash routes, so deep links and refresh work |
| Table | 118 cells, one per hub element, in Z order. Each cell is a link with a full accessible name: name (where the catalog has one), symbol, Z |
| f-block | placeholders at group 3 (display only) and an explanatory note |
| Profile | a non-modal dialog region. Focus goes to its heading; Escape closes it and focus returns to the cell. It shows proven values only. A gap is a natural Uzbek sentence (e.g. "Bu ma’lumot hali tasdiqlangan manbada mavjud emas."). The note under a value says how it is known (derived, computed, or the source). Related substances, reactions, topics and labs come with a one-line reason |
| Filters | grade, has topic, has lab (from the evidence-derived relations). Group, period and category work only on reviewed values; while there are none they are disabled with a note. Matches are dimmed and also listed as text links, so colour is never the only signal |
| Search | the existing search gets element entries when the flag is on. Atomic number, symbol and the localized name match exactly and rank first; a part of the name matches as text; an element without a name is found by symbol and Z. Results deep-link to the profile |
| Layout | from 960 px, an 18-column grid; narrower, the cells wrap in Z order with 48 px targets; a "Katta ko‘rinish" (projector) toggle |

## 6. Isolation

- No other learner feature imports the periodic feature.
- Nothing is written: no profile, attempt, evidence or progress.
- The Content Studio is unchanged; it has no element editor.

## 7. Reports (`npm run periodic:report`)

| Report | Content |
|---|---|
| `periodic-table-inventory` | every source and its role; legacy files `AUDITED` / `NOT_USED`; identity facts |
| `element-metadata-coverage` | learner-facing state per field (reviewed shown / computed shown / gap with reason); authored claims (source-eligible, effectively reviewed, pending, stale); the period/group rule (state, hash, unreviewed derivation not shown); computed engine fields |
| `element-localization-coverage` | canonical identity, localized names, reviewed names, missing symbols, legacy names (not copied) |
| `element-relationship-coverage` | elements with substances, reactions, labs, topics; formula-derived and explicit counts; authored claims and how many are effectively reviewed; unparsed species |
| `legacy-periodic-parity` | per element and field: `CANONICAL_MATCH` (identity only), `REVIEWED_MATCH`, `UNREVIEWED_MATCH`, `DISPLAY_ONLY`, `SOURCE_REQUIRED`, `CONFLICT`, `NOT_USED`. Comparisons are reported separately: identity conflicts, layout differences, against reviewed scientific data, against unreviewed derivations, against the unreviewed catalog, display-only, not assessable |
| `periodic-table-readiness` | flag, routes, coverage dimensions side by side (never one percentage), search, accessibility, bundle phase, isolation, human decisions, formal metrics |

Formal metrics are unchanged: LP 12.189 %, overall 47.313 %. The periodic table is reference infrastructure, and no formula input changed.
