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

## Governed source intake (P2.4, ADR-P2-005)

A new textbook, standard or reference is registered through intake, not by editing the registry by hand:

1. A person submits `content-src/source-intake/<sourceId>.json` (schema `kimyolab.source-intake.v1`): title, publisher/authority, edition/year, language, category, bibliographic data, whether page/section citations are possible, the local document hash if a copy exists, and their own identity (`submittedBy`). The workbench **Manbalar** tab produces this file.
2. Tooling validates the metadata, computes the document hash and detects duplicates (same id, same document hash, same title + authority + edition + year). It never declares a source authoritative.
3. A human reviewer who is not the submitter records a decision (`approved` / `changes-requested` / `rejected`) on the entry's **current hash** and names the category they accept. Approval counts only if the accepted category equals the claimed one. Any metadata edit makes the decision stale. Automation identities cannot decide.
4. A person runs `npm run source:apply -- <intake.json>`. It is refused in CI and agent environments, and it refuses anything not APPROVED or duplicated. The registry record carries `classification: HUMAN_ACCEPTED`, `submittedBy`, `acceptedBy`, `acceptedAt` and the reviewed hash.

The five existing entries keep `classification: PROPOSED`. Reclassifying them is still a reviewed human change.
