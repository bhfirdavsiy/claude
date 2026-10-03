# ADR-P2-009 — Installation readiness: one configuration surface, fail-closed tooling, measured separately

- **Status:** accepted (P2.8).
- **Goal:** development complete means only deployment remains. A technical specialist must not need to write application code, find hidden paths, reverse-engineer configuration or repair the build.
- **Not claimed:**
  - real portal integration;
  - real target-server installation;
  - product completeness: learning content, assessment, governance, the accessibility content blocks and the feedback debt stay separate.

## 1. Decisions

### 1.1 One configuration surface

- **The single input:** the mount path (`KIMYOLAB_BASE_PATH`, default `/kimyolab/`).
- **Derived values:** asset, content and API base, the IndexedDB name and the Web Locks prefix. They are never configured separately, so they cannot drift.
- **Optional input:** `KIMYOLAB_PORTAL_HOME_URL`.
- **Server-only values:** port, host, public root, partner secrets.
- **Where it lives:** the code-side table is `scripts/lib/deploy-config.ts` (`DEPLOY_SETTINGS`); the operator table is `docs/DEPLOY.md` §3.
- **The audit** (`reports/deployment-config-audit.json`) scans `src/`, `server/`, `server.mjs` and `index.html` with comments excluded, and fails on:
  - a hardcoded host or deployment path;
  - an environment variable read outside the declared surface;
  - an undocumented setting.

### 1.2 One deployment artefact

- **Build:** `npm run deploy:build` writes `dist-deploy/<mount>/` (upload its contents at the mount) and `dist-deploy/<mount>.manifest.json`.
- **Manifest contents:** every file with its sha256, the tree sha256, the content version and the resolved configuration.
- **Determinism:** no timestamp is written. The same commit and the same inputs give the same bytes.

### 1.3 Fail-closed preflight

`npm run deploy:preflight` runs 16 published checks (incl. `line-endings`, §5). It is read-only and never repairs anything.

| Area | Checks |
|---|---|
| Configuration | config, config-match |
| Completeness | build-complete, content-manifest, forbidden-files |
| Integrity | artifact-checksum, content-integrity (the browser's own pack checks), brand-asset, line-endings |
| Paths | base-path, root-asset-leak, content-base |
| Isolation | storage-namespace (co-hosted mounts), service-worker, external-dependency |
| Reproducibility | reproducible-build (rebuild and compare) |

- **Failure output:** every failure gives a `DEPLOY_*` code, a message and a fix, with repository-relative paths only. A path outside the repository is shown by its last two segments.
- **Self-check:** Installation Readiness re-checks this on a deliberately broken copy.

### 1.4 Real-browser post-install smoke

`npm run deploy:smoke` checks the built artefact served by the bundled server at the mount, or a live site via `KIMYOLAB_SMOKE_URL`:

- home, brand asset, content loading, curriculum;
- back/forward, deep link, theory, refresh, query;
- a legacy STATIC_CHECK practice and a MODEL_BASED activity, with answers read from the artefact's own content pack;
- Web Locks and IndexedDB namespace, progress persistence;
- no service worker, 404 outside the mount, no page errors.

It also runs the standalone file with all network blocked: opens, brand, offline flow, model-based activity, progress persists, and a tampered pack fails closed.

### 1.5 Rollback drill with real artefacts

`npm run deploy:rollback-drill`:

1. Resolves the previous known-good mainline release (`scripts/lib/rollback-baseline.ts`, §5) and builds it with that commit's own builder, for the same mount.
2. Promotes the previous and the current artefact through the existing `scripts/release-registry.ts`.
3. Serves current and records learner evidence in one browser profile.
4. Rolls back and smokes, then restores and smokes.
5. Learner evidence is unchanged throughout, and the restored bytes are identical.

The P0 `rollback-drill.ts` used placeholder bundles. It stays as the registry-bookkeeping drill.

### 1.6 Clean-environment drill

`npm run deploy:drill` sets up:

- repository files only (tracked and new, never ignored);
- a fresh HOME and npm prefix, so no global package is available;
- a minimal PATH.

It then runs exactly the documented commands (`npm ci`, `deploy:build`, `deploy:preflight`, `deploy:smoke`) and requires:

- the generated `public/` is byte-identical to the committed one;
- the artefact contains no absolute path of the build machine.

### 1.7 CI reproducibility

- **Runners:** pinned to `ubuntu-24.04` and `windows-2025`; no `*-latest` label remains.
- **Actions:** checkout, setup-node and upload-artifact are on **v7**, and download-artifact (used by the cross-platform comparison job) on **v8**. Each `action.yml` declares `runs.using: node24`, verified against the official repositories (tag commit and date recorded in `scripts/lib/ci-workflow.ts`).
- **Node versions:** the GitHub Action runtime (node24) is unrelated to the application Node version, which still comes only from `kimyolab/.nvmrc` (22, unchanged).
- **Observed environment:** every job records it with `npm run ci:environment` (uploaded and shown in the job summary) and fails on a Node-major mismatch.
- **Windows:** the Windows job now also runs `deploy:build` and `deploy:preflight` from a Windows path.
- **Deployment steps:** after `npm run verify`, the Linux job runs build, preflight, smoke, rollback drill, clean drill and `deploy:readiness --strict`.

### 1.8 Installation Readiness

- **What it is:** 24 explicit checks, `percent = passed / total`, with the status rule from PROGRESS_MODEL §12.
- **Stale evidence:** evidence about a different artefact sha256 fails.
- **CI result** is not claimed by repository code. `ci-gate-configured` checks only that the workflow runs the gate steps; the live CI result is the PR's external merge gate (§5).

## 2. Measured result

- **Installation Readiness:** 24/24 — `READY_IN_SIMULATION`.
- **External acceptance records:** 0, so `READY_FOR_DEPLOYMENT` is not claimed.
- **Before P2.8:**
  - no deploy build, preflight, deployment smoke or clean drill existed;
  - the rollback drill used placeholder bundles;
  - CI ran on `ubuntu-latest` / `windows-latest` with v4 (Node-20 runtime) actions.

  Most of the 24 checks could not have been evaluated.

## 3. Findings fixed in P2.8

- **Path leak:** an operator message named a path outside the repository relative to the repository root (`../../../../tmp/...`). This leaks the machine's directory layout. Now only the last two segments are shown.
- **Content integrity reuse:** `validateContentPackIntegrity` could only check the committed pack. It now takes a content directory, so the preflight runs the same check on the artefact.

## 4. Not changed

- Learner runtime code: 0 new modules.
- Progress weights and formulas.
- Chemistry, learning content, accessibility states and feedback semantics. The 29 + 6 feedback facts are recorded for P2.9.

## 5. Closeout corrections (before merge)

- **Cross-platform bytes.** The Windows CI build of the same head produced a different artefact: sha256 `e2735f34…` and 4,484,312 bytes, against `f61f1cca…` and 4,436,101 bytes on Linux.
  - The content-pack checksum also differed, so the inputs differed.
  - Cause: the Windows runner's git (`core.autocrlf=true`) checked LF text out as CRLF, and raw-copied text (sources, pack files) carried CR into the artefact.
  - Fix: `kimyolab/.gitattributes` `* -text`. Every file is checked out exactly as committed, binaries included.
  - The preflight now has a 16th check, `line-endings` (`DEPLOY_LINE_ENDINGS_NONCANONICAL`).
  - A new CI job, `cross-platform-artifact`, downloads both manifests and requires the same tree sha256, file count and per-file sha256 map (`scripts/compare-deploy-manifests.mjs`).
  - The hash calculation was not relaxed.
- **Rollback baseline.**
  - `HEAD^1` was wrong on a branch with 2+ commits. The committed report also named `2e80fd0` without saying why.
  - `scripts/lib/rollback-baseline.ts` now picks the baseline: an explicit ref first, else merge-base with the mainline, else, on main itself, the first parent. It then walks the mainline first-parent chain to the first commit whose artefact (built by its own builder) differs.
  - The full SHA and the walk are reported.
  - CI uses `fetch-depth: 0`. A pull_request checkout was still observed shallow below the merge base (the walk saw one commit), so the workflow completes the mainline history explicitly (`git fetch --unshallow`).
  - A shallow clone is reported as such (`DEPLOY_ROLLBACK_SOURCE_MISSING: The clone is shallow…`), and every resolver failure carries its facts: refs, SHAs and the walk.
  - On this branch the merge-base `f11c799` builds the same artefact as the current one, because P2.8 changes no learner code, so the baseline is `2e80fd0`.
- **Evidence currency.** `evidence-current` now also requires matching configuration, matching content version, and a rollback baseline equal to the resolver's choice.
- **CI semantics.** The generated "CI green" sentence was removed. `ciGateConfigured` lists the steps the workflow runs; that is a repository fact. The live CI result stays an external merge gate. `READY_IN_SIMULATION` is local or simulated only.
- **Target acceptance is fail-closed.**
  - `scripts/lib/target-acceptance.ts` defines the schema and the rules: this artefact, a non-local HTTPS origin, a human actor, PASS/PASS, ACCEPTED.
  - An agent writes only `docs/deploy/acceptance-template.json`.
  - Negative tests cover: empty, wrong sha, wrong mount, localhost, private IP, http, automation actor, bot or agent identity, missing or failed smoke, pending decision, stale content version.
- **Installation Readiness:** 24 checks (added `ci-gate-configured`).

## 6. P2.9 addendum — content revision

- The preflight has 17 checks: `content-revision` was added (ADR-P2-010 §7).
- The deployment artefact serves the pack at `content/<contentVersion>/<contentRevision>/`. Only those URLs are immutable.
- The rollback drill adds the step `immutable-urls-stable`.
- The semantic `contentVersion` is unchanged.
