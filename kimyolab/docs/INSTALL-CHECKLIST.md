# KimyoLab — install checklist (handoff)

Full procedure: `docs/DEPLOY.md`. Run everything in `kimyolab/`.

- [ ] Node major 22 (`node -v`; the expected version is in `.nvmrc`).
- [ ] `npm ci`
- [ ] Choose the mount. The default is `/kimyolab/`. Use the same `KIMYOLAB_BASE_PATH` in every command below.
- [ ] `npm run deploy:build` produces `dist-deploy/kimyolab/` and `dist-deploy/kimyolab.manifest.json`.
- [ ] `npm run deploy:preflight` passes all checks (`✓` on every line, exit code 0).
- [ ] `npx playwright install --with-deps chromium`, then `npm run deploy:smoke` passes.
- [ ] Upload the **contents** of `dist-deploy/kimyolab/` to the location served at `/kimyolab/`.
- [ ] Web server:
  - files under `/kimyolab/` are served as they are;
  - other `/kimyolab/…` paths fall back to `/kimyolab/index.html`;
  - security headers as in DEPLOY.md §5.
- [ ] `KIMYOLAB_SMOKE_URL=https://<host>/kimyolab/ npm run deploy:smoke` passes against the installed site.
- [ ] Keep the previous release directory and its manifest for rollback (DEPLOY.md §7).
- [ ] Record the installation:
  - artefact sha256 from `dist-deploy/kimyolab.manifest.json`;
  - smoke result;
  - date and operator.

A failure prints a `DEPLOY_*` code with the fix (DEPLOY.md §6). Do not edit the artefact by hand.
