// deploy:smoke (P2.8) — post-install smoke of the BUILT deployment, in real Chromium:
//   path host  — the artefact dist-deploy/<mount>/ served by the bundled Node server at KIMYOLAB_BASE_PATH (default
//                /kimyolab/), or an already-deployed site when KIMYOLAB_SMOKE_URL is set (e.g. https://host/kimyolab/);
//   standalone — dist-standalone/KimyoLab_standalone.html opened from disk with ALL network blocked.
// Every check is published in reports/deployment-smoke.json; the command exits 1 on any failure. The answers the smoke
// gives are read from the artefact's own content pack (never typed in here): the smoke tests the build, not the source.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';
import {computeTreeHash} from './deploy-surface-hash.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (() => { const b = process.env.KIMYOLAB_BASE_PATH || '/kimyolab/'; return b.endsWith('/') ? b : `${b}/`; })();
const MOUNT_DIR = BASE.replace(/^\/|\/$/g, '') || 'root';
const ARTIFACT = path.join(root, 'dist-deploy', ...MOUNT_DIR.split('/'));
const STANDALONE = path.join(root, 'dist-standalone', 'KimyoLab_standalone.html');
const REPORT = path.join(root, 'reports', 'deployment-smoke.json');
const NAMESPACE = BASE === '/' ? 'kimyolab' : `kimyolab@${BASE}`;
const DB = BASE === '/' ? 'kimyolab-runtime' : `${NAMESPACE}.runtime`;
const LOCK_PREFIX = BASE === '/' ? 'kimyolab.attempt.' : `${NAMESPACE}.attempt.`;
const TRAINER = 'practice.trainer.8.01.planned';   // a legacy STATIC_CHECK trainer whose accepted answers are authored in its config
const MODEL = 'practice.simulation.7.07.planned';

const checks = [];
async function check(id, fn) {
  try { const detail = await fn(); checks.push({id, pass: true, ...(detail === undefined ? {} : {detail})}); }
  catch (e) { checks.push({id, pass: false, code: e.code ?? 'DEPLOY_SMOKE_FAILED', message: String(e.message ?? e).split('\n')[0].slice(0, 240)}); }
}
const fail = (code, message) => Object.assign(new Error(message), {code});
const expectText = async (page, selector, re, code) => {
  const loc = page.locator(selector);
  try { await loc.first().waitFor({timeout: 10_000}); } catch { throw fail(code, `${selector} did not render`); }
  for (let i = 0; i < 40; i += 1) { if (re.test(await loc.first().innerText())) return; await page.waitForTimeout(150); }
  throw fail(code, `${selector} does not contain ${re}`);
};

/** answers come from the ARTIFACT's content pack (the same files the browser loads) */
function packConfig(contentDir, activityId) {
  const pointer = JSON.parse(fs.readFileSync(path.join(contentDir, 'manifest.json'), 'utf8'));
  const dir = path.join(contentDir, path.dirname(pointer.manifest), 'activity-configs');
  for (const f of fs.readdirSync(dir)) { const all = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (all[activityId]) return all[activityId]; }
  throw fail('DEPLOY_CONTENT_MANIFEST_MISSING', `${activityId} has no config in the artefact`);
}

async function storeCounts(page, dbName) {
  return page.evaluate(async (name) => {
    const names = (await indexedDB.databases?.() ?? []).map((d) => d.name);
    if (!names.includes(name)) return {exists: false, names, evidence: 0, attempts: 0};
    const db = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const count = (s) => new Promise((res) => { if (!db.objectStoreNames.contains(s)) return res(0); const r = db.transaction(s, 'readonly').objectStore(s).count(); r.onsuccess = () => res(r.result); r.onerror = () => res(0); });
    const out = {exists: true, names, evidence: await count('evidence'), attempts: await count('attempts')};
    db.close(); return out;
  }, dbName);
}

async function completeAtom(page, target) {
  const card = page.locator('[data-renderer^="atom-builder"]');
  await card.waitFor({timeout: 10_000});
  for (const p of ['protons', 'neutrons', 'electrons']) {
    const plus = card.locator(`[data-particle="${p}"] button`).last();
    for (let i = 0; i < target[p]; i += 1) { await plus.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(40); }
  }
  await page.getByRole('link', {name: 'Mustahkamlashga o‘tish'}).waitFor({timeout: 10_000});
}

async function pathHostSmoke(browser) {
  let server = null; let origin;
  const remote = process.env.KIMYOLAB_SMOKE_URL;
  if (remote) { const u = new URL(remote); origin = u.origin; }
  else {
    if (!fs.existsSync(path.join(ARTIFACT, 'index.html'))) throw fail('DEPLOY_BUILD_INCOMPLETE', `no artefact at dist-deploy/${MOUNT_DIR}/ — run npm run deploy:build`);
    const {createKimyoLabServer} = await import('../server/app.mjs');
    server = createKimyoLabServer({publicRoot: ARTIFACT, basePath: BASE, env: {}, logger: () => {}});
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    origin = `http://127.0.0.1:${server.address().port}`;
  }
  const at = (logical = '') => `${origin}${BASE}${logical.replace(/^\//, '')}`;
  const contentDir = path.join(ARTIFACT, 'content');
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  try {
    await check('home', async () => { await page.goto(at()); await expectText(page, '#app-main', /Kimyo fanini/, 'DEPLOY_SMOKE_HOME'); });
    await check('brand-asset', async () => {
      const ok = await page.locator('img.kl-brand-logo').evaluate((img) => img.complete && img.naturalWidth > 0);
      const r = await page.request.get(at('assets/brand/kimyolab-logo.webp'));
      if (!ok || r.status() !== 200 || !/image\/webp/.test(r.headers()['content-type'] ?? '')) throw fail('DEPLOY_BRAND_ASSET_MISSING', 'the brand logo did not load from the mount');
    });
    await check('content-loading', async () => {
      const r = await page.request.get(at('content/manifest.json'));
      if (r.status() !== 200) throw fail('DEPLOY_CONTENT_BASE_INVALID', `content manifest answered ${r.status()} at the mount`);
      return {activeVersion: (await r.json()).activeVersion};
    });
    await check('curriculum', async () => { await page.goto(at('curriculum')); await expectText(page, '#app-main', /7-sinf/, 'DEPLOY_SMOKE_CURRICULUM'); });
    await check('back-forward', async () => {
      await page.goto(at()); await expectText(page, '#app-main', /Kimyo fanini/, 'DEPLOY_SMOKE_HOME');
      await page.locator('a[data-kl-route="/curriculum"]').first().click(); await expectText(page, '#app-main', /7-sinf/, 'DEPLOY_SMOKE_HISTORY');
      await page.goBack(); await expectText(page, '#app-main', /Kimyo fanini/, 'DEPLOY_SMOKE_HISTORY');
      await page.goForward(); await expectText(page, '#app-main', /7-sinf/, 'DEPLOY_SMOKE_HISTORY');
      if (!page.url().startsWith(at('curriculum'))) throw fail('DEPLOY_SMOKE_HISTORY', 'history left the mount');
    });
    await check('deep-link', async () => { await page.goto(at('learn/lu.7.12/guide')); await expectText(page, '#app-main', /Molekula/, 'DEPLOY_SMOKE_DEEP_LINK'); });
    await check('theory', async () => { await expectText(page, '#app-main', /Nazariya/, 'DEPLOY_SMOKE_THEORY'); });
    await check('refresh', async () => { await page.reload(); await expectText(page, '#app-main', /Molekula/, 'DEPLOY_SMOKE_REFRESH'); });
    await check('query', async () => { await page.goto(at('search?q=atom')); const v = await page.locator('input[name="q"]').inputValue(); if (v !== 'atom') throw fail('DEPLOY_SMOKE_QUERY', 'the query string did not reach the page'); });
    await check('practice-static-check', async () => {
      const answer = String(packConfig(contentDir, TRAINER).acceptedAnswers?.[0] ?? '');
      await page.goto(at(`practice/${TRAINER}`));
      const input = page.locator('.kl-question input').first(); await input.waitFor({timeout: 10_000});
      await input.fill(answer); await input.press('Enter');
      await expectText(page, '.kl-feedback[role="status"]', /To‘g‘ri/, 'DEPLOY_SMOKE_PRACTICE');
    });
    await check('model-based-activity', async () => {
      await page.goto(at(`practice/${MODEL}`));
      const locks = await page.evaluate(async () => (await navigator.locks.query()).held.map((l) => l.name));
      await completeAtom(page, packConfig(contentDir, MODEL).target);
      return {locksHeld: locks};
    });
    await check('web-locks-namespace', async () => {
      await page.goto(at(`practice/${MODEL}`)); await page.locator('[data-renderer^="atom-builder"]').waitFor();
      const names = await page.evaluate(async () => (await navigator.locks.query()).held.map((l) => l.name));
      if (names.some((n) => n.startsWith('kimyolab') && !n.startsWith(LOCK_PREFIX))) throw fail('DEPLOY_STORAGE_NAMESPACE_COLLISION', `a lock outside ${LOCK_PREFIX}: ${names.join(', ')}`);
      return {held: names.filter((n) => n.startsWith(LOCK_PREFIX)).length, prefix: LOCK_PREFIX};
    });
    await check('storage-namespace', async () => {
      const s = await storeCounts(page, DB);
      if (!s.exists) throw fail('DEPLOY_STORAGE_NAMESPACE_COLLISION', `IndexedDB ${DB} was not created`);
      const foreign = s.names.filter((n) => /^kimyolab/.test(n) && n !== DB);
      if (foreign.length) throw fail('DEPLOY_STORAGE_NAMESPACE_COLLISION', `unexpected KimyoLab databases: ${foreign.join(', ')}`);
      return {database: DB};
    });
    await check('progress-persistence', async () => {
      const before = await storeCounts(page, DB);
      await page.goto(at('progress')); await page.reload();
      const after = await storeCounts(page, DB);
      if (before.evidence < 1 || after.evidence !== before.evidence) throw fail('DEPLOY_SMOKE_PROGRESS', `evidence before/after reload: ${before.evidence}/${after.evidence}`);
      return {evidence: after.evidence, attempts: after.attempts};
    });
    await check('service-worker', async () => { const n = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length); if (n) throw fail('DEPLOY_SERVICE_WORKER_PRESENT', `${n} service worker(s) registered`); });
    await check('outside-mount-404', async () => {
      if (BASE === '/') return {skipped: 'root mount'};
      const probes = ['/', '/index.html', '/content/manifest.json', '/assets/brand/kimyolab-logo.webp'];
      const statuses = {};
      for (const p of probes) statuses[p] = (await page.request.get(`${origin}${p}`)).status();
      if (Object.values(statuses).some((s) => s !== 404)) throw fail('DEPLOY_BASE_PATH_INVALID', `paths outside ${BASE} are served: ${JSON.stringify(statuses)}`);
      return statuses;
    });
    await check('no-page-errors', async () => { if (errors.length) throw fail('DEPLOY_SMOKE_PAGE_ERROR', errors[0]); });
  } finally { await context.close(); if (server) await new Promise((r) => server.close(r)); }
  return {target: remote ? 'KIMYOLAB_SMOKE_URL' : `dist-deploy/${MOUNT_DIR}/ via the bundled Node server`, mount: BASE, ...(remote ? {} : (() => { const m = JSON.parse(fs.readFileSync(path.join(root, 'dist-deploy', `${MOUNT_DIR.replaceAll('/', '_')}.manifest.json`), 'utf8')); return {artifactSha256: computeTreeHash(ARTIFACT).sha256, config: m.config, contentVersion: m.content.contentVersion}; })())};
}

async function standaloneSmoke(browser) {
  if (!fs.existsSync(STANDALONE)) { checks.push({id: 'standalone-opens', pass: false, code: 'DEPLOY_BUILD_INCOMPLETE', message: 'dist-standalone/KimyoLab_standalone.html is missing — run npm run standalone:build'}); return; }
  const context = await browser.newContext();
  // offline: everything except the file itself is refused
  await context.route('**/*', (route) => (route.request().url().startsWith('file:') || route.request().url().startsWith('data:') ? route.continue() : route.abort()));
  const page = await context.newPage();
  const url = pathToFileURL(STANDALONE).href;
  // the standalone embeds the same content pack as the artefact (its integrity is checked below and by the build)
  const pack = (() => { try { return packConfig(path.join(fs.existsSync(ARTIFACT) ? ARTIFACT : path.join(root, 'public'), 'content'), MODEL); } catch { return null; } })();
  try {
    await check('standalone-opens', async () => { await page.goto(`${url}#/`); await expectText(page, '#app-main', /Kimyo fanini/, 'DEPLOY_STANDALONE_FAILED'); });
    await check('standalone-brand-asset', async () => { if (!await page.locator('img.kl-brand-logo').evaluate((img) => img.complete && img.naturalWidth > 0)) throw fail('DEPLOY_BRAND_ASSET_MISSING', 'standalone logo did not render'); });
    await check('standalone-offline-flow', async () => {
      await page.goto(`${url}#/curriculum`); await expectText(page, '#app-main', /7-sinf/, 'DEPLOY_STANDALONE_FAILED');
      await page.goto(`${url}#/learn/lu.7.07/guide`); await page.reload(); await expectText(page, '#app-main', /Nazariya/, 'DEPLOY_STANDALONE_FAILED');
    });
    await check('standalone-model-based', async () => {
      if (!pack?.target) throw fail('DEPLOY_STANDALONE_FAILED', 'the embedded pack has no atom-builder target');
      await page.goto(`${url}#/practice/${MODEL}`); await page.reload();
      await completeAtom(page, pack.target);
    });
    await check('standalone-progress-persists', async () => {
      const before = await storeCounts(page, 'kimyolab-runtime');
      await page.reload(); const after = await storeCounts(page, 'kimyolab-runtime');
      if (before.evidence < 1 || after.evidence !== before.evidence) throw fail('DEPLOY_STANDALONE_FAILED', `evidence before/after reload: ${before.evidence}/${after.evidence}`);
      return {evidence: after.evidence};
    });
  } finally { await context.close(); }
  await check('standalone-integrity-fails-closed', async () => {
    const html = fs.readFileSync(STANDALONE, 'utf8');
    const file7 = html.indexOf('learning-units/grade-7.json":"');
    const at = html.indexOf('\\"title\\": \\"', file7) + '\\"title\\": \\"'.length;
    if (file7 < 0 || at <= file7) throw fail('DEPLOY_STANDALONE_FAILED', 'embedded pack layout not recognised');
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync((await import('node:os')).tmpdir()), 'kl-smoke-'));
    const file = path.join(tmp, 'KimyoLab_standalone.html');
    fs.writeFileSync(file, `${html.slice(0, at)}${html[at + 1]}${html[at]}${html.slice(at + 2)}`);
    const ctx = await browser.newContext(); const p = await ctx.newPage();
    try { await p.goto(`${pathToFileURL(file).href}#/curriculum`); await expectText(p, '#app-main', /tekshiruvdan o‘tmadi/, 'DEPLOY_CHECKSUM_MISMATCH'); }
    finally { await ctx.close(); fs.rmSync(tmp, {recursive: true, force: true}); }
  });
}

const browser = await chromium.launch(process.env.CHROME_BIN ? {executablePath: process.env.CHROME_BIN} : {});
let target = null;
try {
  target = await pathHostSmoke(browser).catch((e) => { checks.push({id: 'path-host', pass: false, code: e.code ?? 'DEPLOY_SMOKE_FAILED', message: String(e.message).split('\n')[0]}); return null; });
  await standaloneSmoke(browser);
} finally { await browser.close(); }
const report = {
  schema: 'kimyolab.deployment-smoke.v1',
  semantics: 'Post-install smoke of the BUILT deployment (scripts/deploy-smoke.mjs). Answers come from the artefact content pack. Network-dependent external laboratories are not exercised.',
  target, standalone: 'dist-standalone/KimyoLab_standalone.html (network blocked)',
  status: checks.every((c) => c.pass) ? 'PASS' : 'FAIL', summary: {checks: checks.length, pass: checks.filter((c) => c.pass).length}, checks,
};
fs.mkdirSync(path.dirname(REPORT), {recursive: true});
fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
for (const c of checks) console.log(`${c.pass ? '✓' : '✗'} ${c.id}${c.pass ? '' : ` — ${c.code}: ${c.message}`}`);
console.log(`deploy:smoke ${report.status} (${report.summary.pass}/${report.summary.checks})`);
if (report.status !== 'PASS') process.exitCode = 1;
