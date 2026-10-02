# KimyoLab — deployment guide (operator)

This guide is the executable install procedure. Every command below is run by `npm run deploy:drill` in a clean
environment and by CI on every change. If a step here fails, that is a defect: report it, do not work around it.

All commands run in the `kimyolab/` directory of the repository.

## 1. Prerequisites

| What | Version / value | Notes |
|---|---|---|
| Node.js | major **22** (from `kimyolab/.nvmrc`) | npm comes with Node; no global npm package is needed |
| OS | Linux (verified on ubuntu-24.04) or Windows (build + preflight verified on windows-2025) | |
| git | any recent | only for `deploy:drill` / `deploy:rollback-drill` |
| Chromium for Playwright | installed by `npx playwright install --with-deps chromium` | only for `deploy:smoke` and the drills, not for serving |
| Network | the npm registry during `npm ci` | serving needs no network; external laboratories are provider-hosted links |

## 2. Install, build, check (the documented sequence)

```sh
npm ci                     # exact dependencies from package-lock.json
npm run deploy:build       # → dist-deploy/kimyolab/  +  dist-deploy/kimyolab.manifest.json
npm run deploy:preflight   # read-only checks of the built artefact; exit 1 = do not deploy
npm run deploy:smoke       # real browser against the built artefact (needs Chromium, see §1)
```

`deploy:build` rebuilds the content pack and the browser modules from the committed sources and then writes the
artefact.

The same commit with the same configuration gives the same bytes **on Linux and on Windows**:
- `kimyolab/.gitattributes` turns off line-ending conversion on checkout;
- the preflight rejects CRLF in the artefact's text files;
- CI compares the Linux and the Windows manifests file by file (the `cross-platform-artifact` job);
- `deploy:preflight` also rebuilds once and compares.

## 3. Configuration

There is **one** input that you choose: the mount path. Everything else is derived from it, or is optional server
tuning. The code-side list is `scripts/lib/deploy-config.ts` (`DEPLOY_SETTINGS`). `reports/deployment-config-audit.json`
proves that the code reads nothing else.

| Setting | Kind | How it is supplied | Default |
|---|---|---|---|
| `basePath` | input | env `KIMYOLAB_BASE_PATH` for `deploy:build`, `deploy:preflight`, `deploy:smoke` and the bundled server | `/kimyolab/` |
| `portalHomeUrl` | input (optional) | env `KIMYOLAB_PORTAL_HOME_URL` for `deploy:build`: an https URL or a root-absolute path | none. Resolved at the host boundary, but no learner screen links to it yet. |
| `assetBase` | derived | never configured | `= basePath` |
| `contentBase` | derived | never configured | `= basePath + "content"` |
| `apiBase` | derived | never configured | `= basePath + "api/"` |
| `storageNamespace` | derived | never configured | `kimyolab@<basePath>`. IndexedDB `kimyolab@<basePath>.runtime`, Web Locks `kimyolab@<basePath>.attempt.` |
| `environment/mode` | — | there is one production build; no dev/prod switch exists | production |
| `publicDeploymentPath` | build output | derived from `basePath` | `dist-deploy/kimyolab/` |
| `contentManifestVersion` | build output | the content pack (`npm run content:pack`) | recorded in the manifest and in `reports/deployment-artifacts.json` |
| `PORT` / `HOST` | server | env, bundled Node server only | `4173` / `127.0.0.1` |
| `KIMYOLAB_PUBLIC_ROOT` | server | env, bundled Node server only | `./dist` → set to `dist-deploy/kimyolab` |
| `external-lab` secrets (`NOBOOK_*`) | server | server env only, never in the artefact | unset. The NOBOOK lab then reports "not configured". |

**Use the same `KIMYOLAB_BASE_PATH` for build, preflight, smoke and server.** If they differ, the preflight fails with
`DEPLOY_BASE_PATH_INVALID` / `DEPLOY_CONFIG_MISMATCH`.

### Other variables

- **Collision check:**
  - `KIMYOLAB_CO_HOSTED_MOUNTS` (preflight, optional) is a comma list of other KimyoLab mounts on the same origin.
  - The preflight fails with `DEPLOY_STORAGE_NAMESPACE_COLLISION` if one of them would share learner storage with this mount.
- **Smoke against a live site:** `KIMYOLAB_SMOKE_URL=https://<host>/kimyolab/ npm run deploy:smoke` checks an installed site instead of the local artefact.
- **Rollback drill:** `KIMYOLAB_ROLLBACK_FROM` is the git ref of the previous known-good release, and it always wins. Without it, `scripts/lib/rollback-baseline.ts` resolves the baseline:
  - on a branch, it starts at the mainline commit the branch is based on (merge-base with `KIMYOLAB_MAINLINE_REF`, default `origin/main`);
  - on main, it starts at the first parent;
  - it then walks back along the mainline to the first commit whose artefact differs from the current one.

  The baseline must be on the mainline, and the drill reports its full SHA. Use a full clone (CI: `fetch-depth: 0` plus an explicit `git fetch --unshallow` when the checkout is still shallow). A shallow clone fails with a message that says so.
- **Optional server tuning** (bundled server only): `KIMYOLAB_SESSION_RATE_LIMIT`, `KIMYOLAB_STATUS_RATE_LIMIT`, `KIMYOLAB_ALLOWED_ORIGINS`.

## 4. What to upload

Upload the **contents** of `dist-deploy/kimyolab/` so that they are served at `/kimyolab/`:

```
dist-deploy/kimyolab/index.html            →  https://<host>/kimyolab/index.html   (entry document)
dist-deploy/kimyolab/app-preview/…          →  https://<host>/kimyolab/app-preview/…
dist-deploy/kimyolab/content/…              →  https://<host>/kimyolab/content/…
dist-deploy/kimyolab/assets/…               →  https://<host>/kimyolab/assets/…
```

- **Manifest:** keep `dist-deploy/kimyolab.manifest.json` with your release records. It lists every file with its sha256.
- **Artefact facts:** file count, total size, tree sha256 and content version are in `reports/deployment-artifacts.json`.
- **Do not edit the artefact.** Any change after the build fails the preflight with `DEPLOY_CHECKSUM_MISMATCH`.

The standalone presentation file (`dist-standalone/KimyoLab_standalone.html`, `npm run standalone:build`) is the same
product as one offline HTML file. It is not a server deployment.

## 5. Web server requirement

The requirement is the same whatever server you use:

1. Files under `/kimyolab/` are served as they are. Use `Content-Type` by extension; `.js` must be `text/javascript`.
2. Any other path under `/kimyolab/` that is not a file serves `/kimyolab/index.html` with status 200. These are app routes such as `/kimyolab/learn/lu.7.12/practice` or `/kimyolab/practice/<id>` (deep links and refresh).
3. Requests **outside** `/kimyolab/` are not part of KimyoLab.
4. Send the same security headers as the bundled server (`server/app.mjs`): `Content-Security-Policy` (self only), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.

### The verified server: the bundled Node server

`npm run deploy:smoke` and CI use this one.

```sh
KIMYOLAB_PUBLIC_ROOT=dist-deploy/kimyolab KIMYOLAB_BASE_PATH=/kimyolab/ PORT=4173 HOST=0.0.0.0 npm start
```

It serves only the artefact, only under the mount (everything outside answers 404), with the security headers above.

### EXAMPLES only, not verified by CI and not the official TRM configuration

Adapt them to the portal's real server and confirm them with `KIMYOLAB_SMOKE_URL=… npm run deploy:smoke`.

```nginx
# nginx — EXAMPLE
location /kimyolab/ {
    alias /srv/kimyolab/;                     # = contents of dist-deploy/kimyolab/
    try_files $uri /kimyolab/index.html;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy no-referrer;
}
```

```apache
# Apache — EXAMPLE
Alias /kimyolab/ /srv/kimyolab/
<Directory /srv/kimyolab/>
    FallbackResource /kimyolab/index.html
    Header set X-Content-Type-Options nosniff
    Header set Referrer-Policy no-referrer
</Directory>
```

## 6. After installing: smoke

```sh
KIMYOLAB_SMOKE_URL=https://<host>/kimyolab/ npm run deploy:smoke
```

A failed install shows up as a `✗` line with a `DEPLOY_*` code, and the command exits 1. `reports/deployment-smoke.json` lists every check. The most common codes:

| Code | Meaning | Fix |
|---|---|---|
| `DEPLOY_BUILD_INCOMPLETE` | the artefact or a required file is missing | rebuild with `npm run deploy:build`; upload the whole directory |
| `DEPLOY_CONTENT_MANIFEST_MISSING` | `content/manifest.json` is not where the app looks | keep `content/` inside the mount |
| `DEPLOY_CHECKSUM_MISMATCH` | a file differs from the manifest | rebuild; never edit the artefact |
| `DEPLOY_BASE_PATH_INVALID` | the artefact was built for another mount, or paths outside the mount are served | the same `KIMYOLAB_BASE_PATH` everywhere |
| `DEPLOY_ASSET_BASE_INVALID` | a URL points outside the mount | rebuild; report it if it persists |
| `DEPLOY_CONTENT_BASE_INVALID` | content is not reachable at `<mount>content/` | check the server alias / fallback (§5) |
| `DEPLOY_STORAGE_NAMESPACE_COLLISION` | two mounts would share learner storage | give each deployment its own mount |
| `DEPLOY_SERVICE_WORKER_PRESENT` | a service worker is shipped or registered | remove it; KimyoLab ships none |
| `DEPLOY_EXTERNAL_DEPENDENCY` | the shell loads from another origin | remove or vendor it |
| `DEPLOY_NOT_REPRODUCIBLE` | the artefact is not the build of this commit | rebuild from the commit you deploy |
| `DEPLOY_CONFIG_MISMATCH` | build and current configuration differ | use the same `KIMYOLAB_*` values |
| `DEPLOY_LINE_ENDINGS_NONCANONICAL` | text files contain CRLF (an EOL-converting checkout) | check out with the repository `.gitattributes` and rebuild |

## 7. Rollback

1. Keep each released artefact as `releases/<id>/` (the contents of `dist-deploy/kimyolab/` plus its manifest).
2. To roll back, point the server's document root for `/kimyolab/` at the previous release and run the smoke. This is the same operation as `scripts/release-registry.ts` (`promote` / `rollback`).
3. Learner data is not part of the artefact. It lives in each learner's browser under the mount's namespace, so a rollback never deletes it. `npm run deploy:rollback-drill` proves this with real artefacts:
   - it builds the previous commit for the same mount, serves current, records learner evidence, rolls back, smokes, restores and smokes;
   - the evidence is unchanged after each step (`reports/deployment-rollback-drill.json`).
4. Do not change the mount path in a rollback. A different mount is a different storage namespace, so learners would not see their data.

## 8. Readiness

```sh
npm run deploy:drill        # clean environment: repository files only, fresh HOME / npm prefix, the commands of §2
npm run deploy:readiness    # Installation Readiness: every check, its evidence, passed/total
```

`reports/installation-readiness.json` is a separate metric. It does not enter the learning-product formula.

- **`READY_IN_SIMULATION`:** every check passes on the simulated `/kimyolab/` mount and in the clean drill.
- **`READY_IN_SIMULATION`** is a local, simulated result. It does not include a remote CI result: live CI success is the PR's external merge gate.
- **`READY_FOR_DEPLOYMENT`:** also needs a **valid** target-server acceptance record in `docs/deploy/acceptance/`, written by a human operator. Copy `docs/deploy/acceptance-template.json` to start one.
  - A record counts only when:
    - it names this exact artefact sha256, content version and mount;
    - the target is a real non-local HTTPS origin;
    - the actor is a human, not a bot, CI or agent identity;
    - preflight and smoke are both `PASS`;
    - the decision is `ACCEPTED`.
  - Anything else does not count.
  - None exists yet. No real portal integration is claimed.
