// deploy:rollback-drill (P2.8) — a rollback drill with REAL deployment artefacts (the P0 drill in
// scripts/rollback-drill.ts only exercises the registry pointer with placeholder bundles):
//   previous known-good = the previous MAINLINE release (scripts/lib/rollback-baseline.ts: KIMYOLAB_ROLLBACK_FROM, else
//                         the mainline commit this branch is based on, walking back to the first one whose artefact
//                         differs), built with ITS OWN builder for the same mount;
//   current             = dist-deploy/<mount>/ (npm run deploy:build).
// Both go through the existing release registry (scripts/release-registry.ts: promote / rollback). One browser profile
// stays open on one origin the whole time, so learner storage is the real thing:
//   current serves → learner completes a model-based activity → ROLLBACK → previous serves (smoke) → learner evidence
//   still there → RESTORE → current serves (smoke) → evidence still there.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {promoteRelease, rollbackRelease, readCurrentRelease} from './release-registry.ts';
import {computeTreeHash} from './deploy-surface-hash.ts';
import {resolveRollbackBaseline} from './lib/rollback-baseline.ts';
import {createCommitBuilder} from './lib/commit-artifact.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (() => { const b = process.env.KIMYOLAB_BASE_PATH || '/kimyolab/'; return b.endsWith('/') ? b : `${b}/`; })();
const MOUNT_DIR = BASE.replace(/^\/|\/$/g, '') || 'root';
const CURRENT = path.join(root, 'dist-deploy', ...MOUNT_DIR.split('/'));
const DB = BASE === '/' ? 'kimyolab-runtime' : `kimyolab@${BASE}.runtime`;
const MODEL = 'practice.simulation.7.07.planned';
const steps = [];
const step = (id, pass, detail) => { steps.push({id, pass, ...(detail === undefined ? {} : {detail})}); if (!pass) throw Object.assign(new Error(`${id} failed`), {code: 'DEPLOY_ROLLBACK_FAILED', detail}); };
const git = (args, cwd = root) => spawnSync('git', args, {cwd, encoding: 'utf8'});

function withManifest(dir, releaseId) {
  const tree = computeTreeHash(dir);   // the artefact itself, before the registry's release-manifest.json is added
  fs.writeFileSync(path.join(dir, 'release-manifest.json'), `${JSON.stringify({releaseId, sha256: tree.sha256, fileCount: tree.fileCount}, null, 2)}\n`);
  return {sha256: tree.sha256, fileCount: tree.fileCount};
}

async function evidenceCount(page) {
  return page.evaluate(async (name) => {
    const names = (await indexedDB.databases()).map((d) => d.name);
    if (!names.includes(name)) return 0;
    const db = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const n = await new Promise((res) => { const r = db.transaction('evidence', 'readonly').objectStore('evidence').count(); r.onsuccess = () => res(r.result); r.onerror = () => res(-1); });
    db.close(); return n;
  }, DB);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kimyolab-rollback-'));
let report;
try {
  if (!fs.existsSync(path.join(CURRENT, 'index.html'))) throw Object.assign(new Error(`no current artefact at dist-deploy/${MOUNT_DIR}/ — run npm run deploy:build`), {code: 'DEPLOY_BUILD_INCOMPLETE'});
  const currentSha = computeTreeHash(CURRENT).sha256;
  const buildCommit = createCommitBuilder(root, tmp, BASE);
  const baseline = resolveRollbackBaseline(root, {differs: (commit) => buildCommit(commit).sha256 !== currentSha});
  const previous = buildCommit(baseline.commit);
  const currentCopy = path.join(tmp, 'current-artifact');
  fs.cpSync(CURRENT, currentCopy, {recursive: true});
  const prevHash = withManifest(previous.dir, 'previous'); const curHash = withManifest(currentCopy, 'current');
  const registry = path.join(tmp, 'registry');
  promoteRelease(registry, 'previous', previous.dir);
  promoteRelease(registry, 'current', currentCopy);
  step('registry-promote', readCurrentRelease(registry).activeRelease === 'current', readCurrentRelease(registry));

  const {createKimyoLabServer} = await import('../server/app.mjs');
  let server = null; let port = 0;
  const serveActive = async () => {
    if (server) await new Promise((r) => server.close(r));
    const active = readCurrentRelease(registry).activeRelease;
    server = createKimyoLabServer({publicRoot: path.join(registry, 'releases', active), basePath: BASE, env: {}, logger: () => {}});
    await new Promise((r) => server.listen(port, '127.0.0.1', r));
    port = server.address().port;
    return active;
  };
  const browser = await chromium.launch(process.env.CHROME_BIN ? {executablePath: process.env.CHROME_BIN} : {});
  const context = await browser.newContext();
  const page = await context.newPage();
  const at = (logical = '') => `http://127.0.0.1:${port}${BASE}${logical}`;
  const see = async (logical, text, label) => {
    await page.goto(at(logical));
    for (let i = 0; i < 60; i += 1) { if ((await page.locator('#app-main').innerText().catch(() => '')).includes(text)) return; await page.waitForTimeout(150); }
    throw Object.assign(new Error(`${label}: "${text}" not shown at ${BASE}${logical}`), {code: 'DEPLOY_ROLLBACK_FAILED'});
  };
  const smoke = async (label) => {
    await see('', 'Kimyo fanini', `${label} home`);
    await see('curriculum', '7-sinf', `${label} curriculum`);
    await see('learn/lu.7.12/guide', 'Nazariya', `${label} deep link`); await page.reload(); await page.locator('#app-main h1').first().waitFor({timeout: 10_000});
    const manifest = await page.request.get(at('content/manifest.json'));
    step(`${label}-smoke`, manifest.status() === 200, {served: readCurrentRelease(registry).activeRelease});
  };
  try {
    step('serve-current', (await serveActive()) === 'current');
    await smoke('current');
    // the learner works on the current build
    const target = JSON.parse(fs.readFileSync(path.join(CURRENT, 'content', JSON.parse(fs.readFileSync(path.join(CURRENT, 'content', 'manifest.json'), 'utf8')).manifest.replace('manifest.json', 'activity-configs/reference-slices.json')), 'utf8'))[MODEL].target;
    await page.goto(at(`practice/${MODEL}`));
    const card = page.locator('[data-renderer^="atom-builder"]'); await card.waitFor({timeout: 10_000});
    for (const p of ['protons', 'neutrons', 'electrons']) { const plus = card.locator(`[data-particle="${p}"] button`).last(); for (let i = 0; i < target[p]; i += 1) { await plus.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(40); } }
    await page.getByRole('link', {name: 'Mustahkamlashga o‘tish'}).waitFor({timeout: 10_000});
    await page.waitForTimeout(500);
    const evidence = await evidenceCount(page);
    step('learner-evidence-recorded', evidence > 0, {evidence});

    rollbackRelease(registry);
    step('rollback-pointer', readCurrentRelease(registry).activeRelease === 'previous', readCurrentRelease(registry));
    step('serve-previous', (await serveActive()) === 'previous');
    await smoke('previous');
    const afterRollback = await evidenceCount(page);
    step('evidence-kept-after-rollback', afterRollback === evidence, {before: evidence, after: afterRollback});

    rollbackRelease(registry);   // previous ⇄ current: the restore is the same, audited operation
    step('restore-pointer', readCurrentRelease(registry).activeRelease === 'current', readCurrentRelease(registry));
    step('serve-restored', (await serveActive()) === 'current');
    await smoke('restored');
    const afterRestore = await evidenceCount(page);
    step('evidence-kept-after-restore', afterRestore === evidence, {before: evidence, after: afterRestore});
    const servedHash = computeTreeHash(path.join(registry, 'releases', 'current'), ['release-manifest.json']).sha256;
    step('restored-bytes-identical', servedHash === computeTreeHash(CURRENT).sha256, {sha256: servedHash});
  } finally { await context.close(); await browser.close(); if (server) await new Promise((r) => server.close(r)); }
  report = {status: 'PASS', previous: {commit: baseline.commit, resolution: {method: baseline.method, mainline: baseline.mainline, mergeBase: baseline.mergeBase, walked: baseline.walked}, builder: 'that commit\'s own scripts/build-production.ts', ...prevHash}, current: {source: `dist-deploy/${MOUNT_DIR}/`, ...curHash}};
} catch (e) {
  report = {status: 'FAIL', code: e.code ?? 'DEPLOY_ROLLBACK_FAILED', message: String(e.message).split('\n')[0], ...(e.detail ? {detail: e.detail} : {})};
} finally { fs.rmSync(tmp, {recursive: true, force: true}); }

const out = {
  schema: 'kimyolab.deployment-rollback-drill.v1',
  semantics: 'Real-artefact rollback drill (scripts/deploy-rollback-drill.mjs): current → previous known-good → restore through the release registry, one browser profile on one origin. Learner storage is never touched by a rollback (it lives in the browser under the mount namespace, not in the artefact).',
  mount: BASE, storage: DB, ...report, steps,
  audit: {
    'scripts/rollback-drill.ts (P0)': 'registry pointer drill with placeholder bundles ("one"/"two"): proves promote/rollback bookkeeping only; kept, superseded for deployment by this drill',
    'scripts/release-registry.ts': 'reused unchanged: promote copies the artefact into releases/<id>, rollback only switches the pointer to the previous release',
    'scripts/rollback.ts': 'content-root rollback (release pointer of the content pack); unrelated to the served artefact',
  },
};
fs.writeFileSync(path.join(root, 'reports', 'deployment-rollback-drill.json'), `${JSON.stringify(out, null, 2)}\n`);
for (const s of steps) console.log(`${s.pass ? '✓' : '✗'} ${s.id}`);
console.log(`deploy:rollback-drill ${out.status}${out.code ? ` — ${out.code}: ${out.message}` : ''}`);
if (out.status !== 'PASS' && out.detail) console.log(`  facts: ${JSON.stringify(out.detail)}`);
if (out.status !== 'PASS') process.exitCode = 1;
