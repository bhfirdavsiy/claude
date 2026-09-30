# What each review hash covers (P1.9)

Every human decision is pinned to a hash. Any change to a field inside the hash makes the old decision **STALE**, even a one-character text edit. There is no approval carry-forward.

Hashes use stable JSON: object keys are sorted, array order is kept, and no whitespace or Unicode normalization is applied. So changing `ё` to `yo`, adding a trailing space, or reordering options all count as changes.

| Decision | Hash | Covers | Excludes |
|---|---|---|---|
| Chemistry assertion review | `assertionHash` | `category` + the assertion's structured `data` (e.g. hydrolysis: salt, medium, **explanation**; names: name) + the **sorted** `sourceRefs` | who uses it (`affectedActivities`), review status fields |
| Candidate triage | `candidateHash` | the sorted reagent pair + the derived suggestion (basis, ion swaps) | activity usage |
| Assessment item review | `assessmentItemHash` | the whole item: prompt, options, key, explanation, concepts, outcomes, sources, version | `review`, `lifecycle` |
| Assessment packet evidence | `packetSha256` | the exact review packet the reviewer read | — |
| Activity approval (beta registers) | `computeReviewHash` | the whole activity record | `approvals` |
| Release decision | `releaseBasisHash` | `activityId` + `version` + `computeReviewHash(activity)` + the activity's practice config | the release register itself |
| Pilot sign-off | `pilotBasis` | every pilot check id with its verdict | check detail text |

Consequences:

- **Authoring apply:** any authoring patch changes one of these hashes. Earlier approvals become STALE (a stale chemistry approval FAILs the KB gate), and a new review is required.
- **Sources:** adding or changing a source changes an assertion hash, so the assertion must be reviewed again.
- **Release:** a release decision goes stale when the activity or its config changes, even if the content review is later approved again.
