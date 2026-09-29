# KimyoLab v20 — Phase 0 Baseline

**Baseline commit:** `4aa2aac` — `chore: freeze KimyoLab v20 Sinco baseline`

## Legacy contract baseline

Before Phase 0 changes:

```text
npm test
5 tests / 5 pass / 0 fail
```

Covered only:
- 122 theory records;
- 62 practice records;
- one theory mapping sample;
- one enriched practice sample;
- 118 elements;
- basic Sinco class presence.

This is not a product acceptance suite.

## Repository baseline

From `reports/performance/baseline.json`:

- files: 404 (excluding Git internals at measurement time);
- root HTML pages: 33;
- images: 277;
- repository: ~24.35 MB;
- images: ~16.19 MB;
- vendor assets: ~3.04 MB;
- custom CSS aggregate: ~277.8 KB raw;
- custom JS aggregate at initial audit: ~27.9 KB raw.

Core data payloads:
- curriculum: 130,225 B raw / 19,308 B gzip;
- practices: 115,046 B raw / 17,762 B gzip;
- elements: 17,005 B raw / 2,388 B gzip.

Homepage currently references 10 script files and 3 stylesheet files before later optimization.

## Local HTTP baseline

`reports/performance/http-baseline.csv` records five localhost samples for `/`, `/curriculum.html`, `/lab.html`, `/periodic.html`.

These numbers measure the local static server only and must not be interpreted as LCP/CLS/INP.

## Security baseline and fixes

### Reproduced vulnerability

Encoded sibling-prefix traversal returned external file content with HTTP 200 before the fix.

### Added regression protections

- path containment is based on `path.relative`, not `startsWith(root)`;
- `source/` artifacts are not served;
- malformed percent-encoded request paths return HTTP 400 without taking down the server request flow.

## Visual baseline

OPEN due to the execution environment's managed Chromium URL block policy. See `reports/visual-regression/baseline/README.md`.

## Phase 0 state

- Baseline repository freeze: PASS
- Legacy tests: PASS
- Known static-server traversal: FIXED with regression test
- Internal `source/` exposure: FIXED with regression test
- Malformed-URL crash path: FIXED with regression test
- Static/HTTP performance baseline: RECORDED
- Route/feature inventory: RECORDED
- Browser screenshots: BLOCKED BY ENVIRONMENT

**Gate:** YELLOW — Phase 1 must not be merged until visual baseline evidence is supplied or an explicit Phase 0 visual-baseline waiver is approved.

## Execution waiver note — 2026-09-14

Automated visual baseline remained blocked by the managed Chromium policy in this environment. After this limitation was disclosed, the user explicitly instructed the project to continue. Development therefore proceeded on a descendant branch without claiming that visual baseline evidence exists. Visual capture remains mandatory before the Phase 6 visual-regression gate.
