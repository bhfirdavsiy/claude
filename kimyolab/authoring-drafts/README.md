# authoring-drafts/

`npm run authoring:draft -- <taskId>` writes a **DRAFT** skeleton for one authoring task here. It is not canonical content.

- `author` and `set` are filled by a person. Tooling leaves every value `null` — it chooses no chemistry, mapping or release value.
- `npm run authoring:preview -- authoring-drafts/<taskId>.json` validates the draft and writes the patch to `authoring-output/`. That folder is not committed, and preview changes no content.
- `npm run authoring:apply -- authoring-drafts/<taskId>.json` is run only by a person. It is refused in CI and agent environments. It writes one allowlisted content file. After that, every earlier review of the content is **STALE** and needs a new review.
- Candidate drafts (`author-candidate`) are preview-only: the new reaction record is written by hand in a reviewed pull request.
