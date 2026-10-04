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

## 2. Display position ≠ chemical period

`src/domain/chemistry/periodic-layout.ts` derives everything from Z:

| Value | How it is derived |
|---|---|
| **Chemical period** | from the period-closing atomic numbers (2, 10, 18, 36, 54, 86, 118) |
| **IUPAC group** | for the s-, p- and d-block, from the 18-column layout. The f-block (Z 57–71, 89–103) gets **no group number**: the La/Lu (Ac/Lr) convention has no reviewed source, so the field is the gap `F_BLOCK_GROUP_CONVENTION` |
| **Display position** | rows 1–7 hold the main table. Rows 9–10 hold the f-block: La is drawn in row 9 and stays period 6 |

The legacy f-block rows are reported as `DISPLAY_ONLY` and never become a period.

## 3. Element metadata (`kimyolab.element-metadata.v1`)

- **File:** `content-src/periodic/element-metadata.json`, keyed by symbol, with no identity repeated.
- **Authored fields:** `relativeAtomicMass`, `category`, `oxidationStates`, `teachingDescription`.
- **Each entry needs:** a typed value, at least one source reference and a review status set by a human. An invalid entry fails the content build.
- **Current state:** the file is empty, because the repository has no source for these values. Every authored field is the gap `SOURCE_REQUIRED`.

The Element Hub states each field as one of three kinds:

| Status | Meaning |
|---|---|
| `SOURCED` | authored with sources; review `pending` or `approved` |
| `DERIVED` | from Z by a domain rule (`DERIVED_FROM_Z`) or computed by a domain engine (`ENGINE_COMPUTED`); `NOT_REVIEWED` |
| `GAP` | not available; the reason is recorded |

## 4. Element Hub (`kimyolab.element-hub.v1`)

`scripts/lib/element-hub.ts` builds `periodic/element-hub.json` into the content pack. It is integrity-checked like every pack file. The client refuses a hub that does not carry exactly the canonical 118 identities in order. The learner page reads the hub and computes no chemistry.

The hub records these relations, each with its provenance:

| Relation | Kind | Provenance |
|---|---|---|
| Element → Substance | `PARTICIPATES` | `DERIVED_FROM_FORMULA`: the element is in the species formula (canonical formula parser); unparseable species texts are listed |
| Element → Reaction | `PARTICIPATES` | `DERIVED_FROM_FORMULA`: the element is in a participant formula |
| Element → Lab | — | `EXPLICIT_MAPPING`: a substance on the lab's topic-lab-profile shelf, or a reaction in the lab's guided-step reaction map. `via` names the evidence |
| Lab → Topic | — | `EXPLICIT_MAPPING` through `mapping-links.json`. The grade comes from the topic |
| `PRIMARY` / `RELATED` | `PRIMARY`, `RELATED` | `AUTHORED_RELATION` only, from `content-src/periodic/element-relations.json` with sources. None is authored yet |

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
| Filters | group, period, category, grade, has topic, has lab, all from the hub. The category filter is disabled with a note while no category is sourced. Matches are dimmed and also listed as text links, so colour is never the only signal |
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
| `element-metadata-coverage` | per field: sourced / derived / reviewed / gap with reasons |
| `element-localization-coverage` | canonical identity, localized names, reviewed names, missing symbols, legacy names (not copied) |
| `element-relationship-coverage` | elements with substances, reactions, labs, topics; formula-derived, explicit and authored counts; unparsed species |
| `legacy-periodic-parity` | per element and field: `CANONICAL_MATCH`, `DISPLAY_ONLY`, `SOURCE_REQUIRED`, `CONFLICT`, `NOT_USED`; layout and functional differences |
| `periodic-table-readiness` | flag, routes, coverage dimensions side by side (never one percentage), search, accessibility, bundle phase, isolation, human decisions, formal metrics |

Formal metrics are unchanged: LP 12.189 %, overall 47.313 %. The periodic table is reference infrastructure, and no formula input changed.
