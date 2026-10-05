# ADR-P2-015 — Substance Passport and Reaction Explorer

- **Status:** accepted (P2.14).
- **Flags:** `substancePassportV1` and `reactionExplorerV1`, both default off.
- **Baseline:** `d88bd6598e470da417c21c2b1bf887a36f496cbb` (the P2.13 merge). The clean-main gate was green.
- **Principles:** derive, don't duplicate; unknown ≠ no reaction; an existing model is not invented chemistry.
- **Architecture:** Element → Substance → Reaction → Topic → Lab, on **one** canonical knowledge graph shared with the P2.13 Element Hub.
- **Not in scope:**
  - external lab catalogue redesign, navigation overhaul;
  - AI chemistry, new chemistry records to raise coverage;
  - mass source acceptance, automated review;
  - a substance or reaction editor in the Content Studio;
  - login, dashboards, leaderboards, IChO.

## 1. Inventory (re-derived; `reports/substance-inventory.json`)

| Source | Finding | Classification |
|---|---|---|
| `species.json` + `SpeciesRegistry` | 84 species. Identity = id + (formula, phase, charge, variant, allotrope). 78 formulas parse; 6 "formulas" are names (`etanol`, `kraxmal`, …). 12 are charged. No formula is shared today | identity: `CANONICAL_IDENTITY`; phase/charge: `CANONICAL_MODEL_STATE` |
| species `hazards` / `properties` | 39 species carry hazard codes; no species has properties. The only source is `src.beta1.migration` (`INTERNAL_PROPOSAL`, `PROPOSED`) | `SOURCE_PENDING` / `GAP` — never shown as a reviewed fact |
| `reactions.json` + `ReactionMatcher` | 28 records, 0 explicit no-reaction records. One reagent set (C + O₂) has two records that differ by condition | `CANONICAL_MODEL_STATE`, not a human approval |
| `IonicEngine` + `solubility.json` | 12 dissociation rules, 8 insoluble formulas. `support()` is true for 5 reactions | dissociation: `CANONICAL_MODEL_STATE`; net ionic equation: `ENGINE_COMPUTED` |
| `condition-vocabulary.json` | 8 terms, 1 context, 4 dimensions; review pending | the only condition values a learner may state |
| element hub, mapping links, topic lab profiles, guided-step reaction map | the P2.13 relations | one graph (§3) |

## 2. Identity and routes

- A substance is a **canonical species**. Its route key is the species id without the `species.` namespace: `/substance/h2so4`.
- The mapping is a bijection: the build refuses an id outside the namespace or a duplicate key.
- A formula is never a route key, and a typed formula shared by two species asks the learner which one.
- The explorer is `/reactions?r=<key>&c=<dimension>:<value>`. Its state lives in the URL, so deep links, refresh and back all work.
- Portal: the server allow-list serves `/reactions` and `/substance/…`. Standalone: hash routes.

## 3. One canonical graph (`scripts/lib/chemistry-graph.ts`)

The Element Hub and the knowledge index are both views of `deriveChemistryGraph`. P2.13's hub was moved onto it; its pack file is byte-identical.

| Relation | Provenance |
|---|---|
| Element ↔ Substance / Reaction | `DERIVED_FROM_FORMULA` (canonical formula parser) |
| Substance ↔ Reaction | `REACTION_PARTICIPANT`: the participant formula resolves to **exactly one** species, and the record's phase (when stated) is that species' phase |
| Reaction ↔ Lab | guided-step reaction map |
| Substance ↔ Lab | topic lab profile shelf, or a lab reaction it takes part in (`via` names the chain) |
| Lab ↔ Topic | mapping links |

- No keyword, title or text matching, and nothing is inferred.
- Every relation is a participation. `PRIMARY` does not exist here; it needs an explicit, reviewed authored relation.
- `rxn.agno3-nacl` names `NaCl(aq)`, but the registry has NaCl only as a solid. The participant stays unresolved (`PHASE_NOT_IN_REGISTRY`) and the reaction is not linked to NaCl(s). This is a human decision, not a guess.

## 4. Knowledge index (`kimyolab.chemistry-knowledge.v1`, `knowledge/chemistry-knowledge.json`, 68 260 B)

The index is built at `content:pack` time by `scripts/lib/chemistry-knowledge.ts`. It carries only derived facts. Identity and records stay in `chemistry/*.json`, which the browser reads anyway.

| Field | Learner status |
|---|---|
| composition | `DERIVED` (parser). A name instead of a formula → gap `FORMULA_NOT_PARSEABLE` |
| molar mass | `COMPUTED` only from atomic masses a human reviewed against an eligible source (P2.13). It is an exact decimal sum, with no rounding and no legacy masses. Today: gap `ATOMIC_MASS_NOT_REVIEWED` for all 78 parseable species |
| dissociation | `MODEL` (the solution rules). No rule → `DISSOCIATION_NOT_MODELED`, worded "Bu modda uchun ionlarga ajralish modeli hali mavjud emas." — never "does not dissociate" |
| hazards / properties | `REVIEWED` only with an eligible source **and** a review path. Neither exists, so: gap (`SOURCE_NOT_ELIGIBLE` / `SOURCE_REQUIRED`). Lab safety (profiles, practice notes) is unchanged |
| reaction observations | `MODEL` (the record's own). An observation the KB integrity check flags (6) → gap `OBSERVATION_REVIEW_REQUIRED` |
| net ionic equation | `COMPUTED` only where `IonicEngine.support(id)` is `supported:true` (5). Otherwise "Ionli tenglama modeli bu reaksiya uchun hali to‘liq emas." |
| reaction review | `REVIEWED` only with a chemistry decision on the current hash (`kb-review`, stale on edit, human reviewer) **and** an eligible source. Otherwise it is a model record, worded "Kimyo mutaxassisi uni hali tasdiqlamagan." Today: 28 model records, 0 reviewed |

**sourceRefs audit.** Species and reactions cite object-form refs (`{id,type,title}`). The adapter keeps only the id; title, category and acceptance come from the source registry. An unknown id stays `SOURCE_REQUIRED` and is never accepted.

## 5. Reaction Explorer semantics

The explorer calls the existing `ReactionMatcher` in the browser under the explicit `require-record-conditions` policy.

| Matcher result | Learner sees |
|---|---|
| a record whose conditions hold in what was **stated** | `MODELED_REACTION`: equation, type, conditions, observation, products (passport links), ionic equation, labs, topics, elements — only what the record gives |
| an explicit `no-reaction` record | `MODELED_NO_REACTION` (none exists today) |
| `REACTION_CONDITIONS_NOT_MET` | the conditions the records require, read from `ReactionMatcher.candidates()`, a read-only helper with the same formula+phase rule as `match()`. Nothing unstated is assumed |
| `REACTION_CONDITION_REQUIRED` | several records hold; the learner states a further condition |
| `REACTION_NOT_MODELED` | "Bu reagentlar uchun KimyoLab modelida hozircha yetarli ma’lumot yo‘q." and "Bu “reaksiya bormaydi” degani emas." |

- The query uses each canonical species' own phase; no phase is converted.
- An unknown condition value in a link is refused and the learner is told.
- An unknown tag on a record fails the build.
- **Coverage over all 3 486 species pairs:** 26 modeled, 0 explicit no-reaction, 3 460 not modeled.
- **Reachability:** 27 of 28 records are reachable from their own explorer link. `rxn.agno3-nacl` is the exception, for the phase gap in §3.

## 6. Learner UI, search, accessibility

- **Passport:** formula, composition (element links), ions, properties, safety data, reactions (explorer links), elements, topics, labs. A gap is a natural Uzbek sentence; no id, engine name, enum or hash is shown.
- **Explorer:**
  - reagents are a native checkbox list (each label carries its phase, so identity stays visible), or a typed formula;
  - conditions are selects from the vocabulary, defaulting to "Ko‘rsatilmagan";
  - the result is announced in a polite live region, errors in an assertive one, and focus moves to the result heading;
  - no drag; 44 px targets; one column at 320 px; observations as text.
- **Element Hub:** the element profile links its substances to the passport and its reactions to the explorer. The periodic feature receives link builders and never imports this feature.
- **Search:** the existing search gains substance entries (exact formula, localized name) and reaction entries (equation; formulas as text, so a substance's own formula ranks first). Kickers are "Modda" and "Reaksiya". The existing topic / activity kickers are unchanged so the flag-off app stays identical.

## 7. Isolation, performance, formal metrics

- **Flags off:** the routes render the existing "page not found" and there are no search entries.
- **Isolation:** no other learner feature or Studio module imports this feature, and nothing is written. A load failure stays on these pages.
- **Performance:** all chemistry is browser-local, the index is generated at build time, and the bundle phase is P2.14 (`reports/guided-dynamic-lab-readiness.json#bundleDelta.phases["P2.14"]`).
- **Formal metrics** are unchanged at LP 12.189 % and overall 47.313 %. No formula input changed; the roadmap now names P2.14, and the open bucket is P2.15+.

## 8. Reports (`npm run knowledge:report`, `--check`)

- `substance-inventory`
- `substance-passport-coverage`
- `reaction-explorer-coverage`
- `reaction-governance-coverage`
- `chemistry-knowledge-relations`
- `substance-reaction-readiness`

Each dimension is reported separately; no completion percentage is given.
