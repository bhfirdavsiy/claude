# authoring-drafts/

`npm run authoring:draft -- <taskId>` writes a **DRAFT** skeleton for one authoring task here. It is not canonical content.

- `author` and `set` are filled by a person. Tooling leaves every value `null` — it chooses no chemistry, mapping or release value.
- `npm run authoring:preview -- authoring-drafts/<taskId>.json` validates the draft and writes the patch to `authoring-output/`. That folder is not committed, and preview changes no content.
- `npm run authoring:apply -- authoring-drafts/<taskId>.json` is run only by a person. It is refused in CI and agent environments. It writes one allowlisted content file. After that, every earlier review of the content is **STALE** and needs a new review.
- Candidate drafts (`author-candidate`) are preview-only: the new reaction record is written by hand in a reviewed pull request.

## authoring-drafts/theory/ (P2.4)

`npm run theory:import -- <packet.json>` stores a structured-theory packet exported from the workbench (**Nazariya** tab) as `theory/<learningUnitId>.json`. It is a working draft: never packed, never canonical, never counted as progress. `reports/theory-authoring-status.json` reads it. When every block is dual-review APPROVED, a person runs `npm run theory:apply -- <packet.json>` to write the canonical entry.
