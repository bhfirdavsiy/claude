// P2.2 — ONE set of learner scenarios run through BOTH hosts of the same product:
//   portal     — the production build mounted under /kimyolab/ (portal simulation, HTTP path host);
//   standalone — dist-standalone/KimyoLab_standalone.html opened from disk (embedded host, hash routes).
// Each scenario returns SEMANTIC outputs read from the learner's own IndexedDB (evidence, scores, completion,
// attempts, mastery) with host-specific identifiers (ids, timestamps, URLs) removed. Parity = these are equal.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {expect} from '@playwright/test';
import {buildDist, startServer, repoRoot} from '../helpers/dist.mjs';

export const PORTAL_BASE = '/kimyolab/';
export const STANDALONE_FILE = path.join(repoRoot, 'dist-standalone', 'KimyoLab_standalone.html');

/** The two hosts. `open(page, logical)` navigates to a LOGICAL app path; `dbName` is the host's storage namespace. */
export async function startHosts() {
  const portalServer = await startServer({publicRoot: buildDist({basePath: PORTAL_BASE}), basePath: PORTAL_BASE});
  if (!fs.existsSync(STANDALONE_FILE)) throw new Error('STANDALONE_BUILD_MISSING: run npm run standalone:build');
  const fileUrl = pathToFileURL(STANDALONE_FILE).href;
  return {
    portal: {name: 'portal', dbName: 'kimyolab@/kimyolab/.runtime', url: portalServer.url, open: (page, logical) => page.goto(`${portalServer.url}${PORTAL_BASE}${logical.replace(/^\//, '')}`)},
    standalone: {name: 'standalone', dbName: 'kimyolab-runtime', url: fileUrl, open: (page, logical) => page.goto(`${fileUrl}#${logical}`)},
    close: () => portalServer.close(),
  };
}

/** Semantic snapshot once the store has settled (evidence → attempt → progress → mastery are written in sequence). */
export async function semanticStore(page, dbName) {
  let previous = await readStore(page, dbName);
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(250);
    const next = await readStore(page, dbName);
    if (JSON.stringify(next) === JSON.stringify(previous)) return next;
    previous = next;
  }
  return previous;
}
/** Count that has stopped changing (lists render progressively). */
export async function stableCount(page, locator) {
  let previous = -1;
  for (let i = 0; i < 20; i += 1) { const n = await locator.count(); if (n === previous && n > 0) return n; previous = n; await page.waitForTimeout(200); }
  return previous;
}

/** Semantic read of the learner store (raw IndexedDB, no app module import → identical in both hosts). */
async function readStore(page, dbName) {
  const raw = await page.evaluate(async (name) => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open(name); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const all = (store) => new Promise((resolve) => {
      if (!db.objectStoreNames.contains(store)) return resolve([]);
      const r = db.transaction(store, 'readonly').objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => resolve([]);
    });
    const out = {evidence: await all('evidence'), attempts: await all('attempts'), progress: await all('progress'), mastery: await all('mastery')};
    db.close();
    return out;
  }, dbName);
  const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
  const sort = (xs) => xs.map((x) => JSON.stringify(x)).sort().map((x) => JSON.parse(x));
  return {
    evidence: sort(raw.evidence.map((e) => pick(e, ['activityId', 'contentVersion', 'type', 'evidenceClass', 'score', 'achieved', 'correct', 'accepted', 'targetId', 'stepId', 'questionId', 'observationKind', 'outcome', 'reagents', 'answerKind', 'response', 'selectedSalt', 'predictedMedium', 'actualMedium', 'observation']))),
    attempts: sort(raw.attempts.map((a) => pick(a, ['activityId', 'status', 'contentVersion']))),
    progress: sort(raw.progress.map((p) => pick(p, ['learningUnitId', 'status', 'contentVersion']))),
    mastery: sort(raw.mastery.map((m) => pick(m, ['learningUnitId', 'conceptId', 'state', 'band', 'mastered']))),
  };
}

const feedback = (page) => page.locator('.kl-feedback[role="status"]');

/** Representative learner paths. Each: run(page, host) → extra observable facts (text), then the store is compared. */
export const SCENARIOS = [
  {id: 'home-to-curriculum', title: 'home → curriculum', async run(page, host) {
    await host.open(page, '/');
    await expect(page.locator('.kl-brand-logo')).toBeVisible();
    await page.getByRole('link', {name: 'Mavzu studiyasi'}).first().click();
    await expect(page.locator('#app-main')).toContainText('7-sinf');
    return {units: await stableCount(page, page.locator('#app-main a[data-kl-route^="/learn/"]'))};
  }},
  {id: 'unit-guide-practice', title: 'learning unit → guide → practice', async run(page, host) {
    await host.open(page, '/learn/lu.7.12/guide');
    await page.getByRole('button', {name: /Nazariyani yakunlash/}).click();
    await expect(page.locator('#app-main')).toContainText('Amaliyot');
    return {practiceLinks: await stableCount(page, page.locator('#app-main a[data-kl-route^="/practice/"]'))};
  }},
  {id: 'atom-builder', title: 'Atom Builder 7.07', async run(page, host) {
    await host.open(page, '/practice/practice.simulation.7.07.planned?lu=lu.7.07');
    for (const [particle, n] of [['proton', 6], ['neytron', 8], ['elektron', 6]]) {
      const b = page.getByRole('button', {name: `Bitta ${particle} qo‘shish`});
      for (let i = 0; i < n; i += 1) await b.click();
    }
    await expect(page.locator('.kl-atom__state [data-field="isotope"]')).toHaveText('Uglerod-14');
    return {isotope: await page.locator('.kl-atom__state [data-field="isotope"]').textContent()};
  }},
  {id: 'hydrolysis', title: 'Hydrolysis renderer 9.14', async run(page, host) {
    await host.open(page, '/practice/practice.experiment.9.14?lu=lu.9.06');
    const card = page.locator('[data-renderer="hydrolysis-medium@1.0.0"]');
    await card.getByRole('radio', {name: 'AlCl₃', exact: true}).check();
    await card.getByRole('radio', {name: 'Kislotali', exact: true}).check();
    await card.locator('[data-action="add-indicator"]').click();
    await expect(card.locator('.kl-hydro__observation')).toHaveText('Indikator (lakmus) qizil tusga o‘tdi. Muhit kislotali.');
    return {observation: await card.locator('.kl-hydro__observation').textContent()};
  }},
  {id: 'ionic', title: 'Ionic precipitation renderer 8.1', async run(page, host) {
    await host.open(page, '/practice/practice.experiment.8.1?lu=lu.8.16');
    const card = page.locator('[data-renderer="ionic-precipitation@1.0.0"]');
    await card.locator('select[data-slot="A"]').selectOption('species.agno3');
    await card.locator('select[data-slot="B"]').selectOption('species.nacl');
    await card.locator('[data-action="mix"]').click();
    await card.locator('[data-field="equation-input"]').fill('Cl- + Ag+ -> AgCl');
    await card.locator('[data-field="equation-input"]').press('Enter');
    await expect(card.locator('.kl-ionic__result')).toHaveText('✓ Tenglama to‘g‘ri.');
    return {observation: await card.locator('.kl-ionic__observation').textContent()};
  }},
  {id: 'manganese-9.23', title: 'P2.1 manganese 9.23 invalid + valid choice', async run(page, host) {
    await host.open(page, '/practice/practice.simulation.9.23.planned');
    const form = page.locator('.kl-question').first();
    await form.getByRole('button').click();
    await expect(form.getByRole('alert')).toHaveText('Variantni tanlang.');
    await form.getByRole('radio', {name: 'Ishqoriy muhit'}).check(); await form.getByRole('button').click();
    await expect(feedback(page)).toContainText('Noto‘g‘ri');
    await form.getByRole('radio', {name: 'Kislotali muhit'}).check(); await form.getByRole('button').click();
    await expect(feedback(page)).toContainText('To‘g‘ri');
    return {verdict: await feedback(page).textContent()};
  }},
  {id: 'static-check-form', title: 'legacy STATIC_CHECK form (trainer 7.4)', async run(page, host) {
    await host.open(page, '/practice/practice.trainer.7.4');
    const answer = page.locator('input[name="answer"]');
    await answer.fill('AlO'); await answer.press('Enter');
    await expect(feedback(page)).toContainText('Noto‘g‘ri');
    await answer.fill('Al2O3'); await answer.press('Enter');
    await expect(feedback(page)).toContainText('To‘g‘ri');
    return {verdict: await feedback(page).textContent()};
  }},
  {id: 'progress-persistence', title: 'progress persists across a reload', async run(page, host) {
    await host.open(page, '/practice/practice.trainer.7.4');
    const answer = page.locator('input[name="answer"]');
    await answer.fill('Al2O3'); await answer.press('Enter');
    await expect(feedback(page)).toContainText('To‘g‘ri');
    await host.open(page, '/progress');
    await page.reload();
    await expect(page.locator('#app-main')).toContainText('Natijalarim');
    // the semantic store is read AFTER the reload: the attempt/evidence/progress rows are what persisted
    return {heading: (await page.locator('#app-main h1').first().textContent())?.trim()};
  }},
];

/** Runs every scenario in a fresh browser context per host; returns per-scenario semantic outputs and errors. */
export async function runParity(browser, hosts, scenarios = SCENARIOS) {
  const rows = [];
  for (const scenario of scenarios) {
    const result = {id: scenario.id, title: scenario.title, hosts: {}};
    for (const host of [hosts.portal, hosts.standalone]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      let facts; let failure = null;
      try { facts = await scenario.run(page, host); } catch (e) { failure = String(e?.message ?? e).split('\n')[0]; }
      const semantic = failure ? null : await semanticStore(page, host.dbName);
      result.hosts[host.name] = {facts: facts ?? null, semantic, errors, failure};
      await context.close();
    }
    const [p, s] = [result.hosts.portal, result.hosts.standalone];
    result.status = !p.failure && !s.failure && !p.errors.length && !s.errors.length && JSON.stringify(p.semantic) === JSON.stringify(s.semantic) && JSON.stringify(p.facts) === JSON.stringify(s.facts) ? 'PASS' : 'FAIL';
    rows.push(result);
  }
  return rows;
}
