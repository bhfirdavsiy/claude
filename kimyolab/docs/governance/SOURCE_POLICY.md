# Source provenance policy (P1.9)

Every content claim that can be approved must cite at least one **registered** source of an **acceptable** category. The registry is `content-src/source-registry.json`.

## Categories

| Category | Meaning |
|---|---|
| `CURRICULUM` | national / school curriculum document |
| `TEXTBOOK` | an identified school textbook (edition, page) |
| `OFFICIAL_STANDARD` | IUPAC, a state standard, an official terminology standard |
| `AUTHORITATIVE_REFERENCE` | a recognised reference work (handbook, encyclopaedia with an editor) |
| `LOCALIZATION_GLOSSARY` | an approved Uzbek terminology glossary (for display names only) |
| `INTERNAL_PROPOSAL` | internal migration sets, legacy app content of unknown origin, anything drafted by tooling |

## What is acceptable

| Claim kind | Acceptable categories |
|---|---|
| chemistry truth (reaction, condition, observation, solubility, hydrolysis, indicator, electrolysis) | CURRICULUM, TEXTBOOK, OFFICIAL_STANDARD, AUTHORITATIVE_REFERENCE |
| display translation (element / species names) | LOCALIZATION_GLOSSARY, CURRICULUM, TEXTBOOK, OFFICIAL_STANDARD |

`INTERNAL_PROPOSAL` is never enough on its own.

## Gate rules (never weakened)

- **FAIL** — a cited source that is not registered: `SOURCE_UNREGISTERED`.
- **FAIL** — an approval of a claim that cites no source: `APPROVED_WITHOUT_SOURCE`. This is unchanged from P1.7.
- **FAIL** — an approval of a claim whose sources are all unacceptable: `APPROVED_WITHOUT_ACCEPTABLE_SOURCE`.
- **FAIL** — a name provenance entry that disagrees with the catalog: `NAME_PROVENANCE_MISMATCH`.
- **PENDING** (not a CI failure) — a claim without acceptable provenance: `SOURCE_NOT_ACCEPTABLE`. This produces an `add-source` authoring task.

## Localized names are display translations

- Names are **not** chemistry truth. Their provenance is kept separately, in `content-src/locales/uz-latn/name-provenance.json`.
- Each entry has: `nameKey`, `locale`, `displayName`, `sourceRef`, `reviewStatus`.
- `sourceRef: null` means an `add-source` task is open and the name's approval cannot count yet.

## Classifying sources

- The categories in the registry were **proposed** conservatively from each source's own id, type and title. If the origin is undocumented, the source is `INTERNAL_PROPOSAL`.
- Today this makes only `src.curriculum.9.06` acceptable, so only the hydrolysis and indicator assertions can be approved as they stand.
- A source is reclassified, or a new one registered, by a person in a reviewed pull request, with evidence (edition, page, URL of the standard). Tooling never upgrades a category.
