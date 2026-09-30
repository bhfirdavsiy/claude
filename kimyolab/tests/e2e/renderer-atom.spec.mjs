// P1.4 — the atom-builder reference renderer in real Chromium + IndexedDB, operated with the KEYBOARD ONLY
// (no mouse calls anywhere in this file). Checks: registry path (not the legacy form), screen-reader summary,
// non-colour cues, reduced motion, evidence/completion parity with the pre-P1.4 baseline, and that a legacy
// (non-registry) activity is unaffected.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test, expect} from '@playwright/test';
import {buildDist, startServer} from '../helpers/dist.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/atom-legacy-baseline.json'), 'utf8'));
const RAW_CODE = /\b[A-Z][A-Z0-9]+(_[A-Z0-9]+)+\b/;
const SINGULAR = {protons: 'proton', neutrons: 'neytron', electrons: 'elektron'};
let server;
test.beforeAll(async () => { server = await startServer({publicRoot: buildDist()}); });
test.afterAll(async () => { await server?.close(); });

const store = (page) => page.evaluate(async () => {
  const {IndexedDbProgressStore} = await import('/app-preview/runtime/progress/indexeddb-store.js');
  const s = new IndexedDbProgressStore(indexedDB, 'kimyolab-runtime');
  return {attempts: await s.listAttempts(), evidence: await s.listEvidence(), progress: await s.listProgress()};
});

/** Tab from the top of the page to the named button, then press Enter — no pointer involved. */
async function pressWithKeyboard(page, name) {
  const target = page.getByRole('button', {name, exact: true});
  for (let i = 0; i < 40; i += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) { await page.keyboard.press('Enter'); return; }
    await page.keyboard.press('Tab');
  }
  throw new Error(`not reachable by Tab: ${name}`);
}

test('atom-builder: registry renderer, keyboard only, live summary, text+shape cues, evidence and completion parity with the legacy baseline', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/practice/practice.simulation.7.07.planned?lu=lu.7.07`);
  const atom = page.locator('[data-renderer="atom-builder@1.0.0"]');
  await expect(atom).toBeVisible();
  await expect(page.locator('.kl-simulation-control, .kl-sim-state')).toHaveCount(0);   // not the legacy form
  const summary = atom.locator('[role="status"][aria-live="polite"]');
  // P1.4 closeout: Z = 0 is the explicit noElementYet construction step. The old copy ("element aniqlanmagan")
  // implied an unknown element, which was misleading — nothing is unknown, the learner has not placed a proton yet.
  await expect(summary).toHaveText(/^Element hali tanlanmagan: yadroga proton qo‘shing\./);
  await expect(atom.locator('[data-field="element"]')).toHaveText('Element hali tanlanmagan: yadroga proton qo‘shing.');
  await expect(atom.locator('.kl-atom__goal')).toContainText('Maqsad: Uglerod-14');

  // the same learner sequence as the recorded pre-P1.4 baseline, one key press per particle
  await page.keyboard.press('Tab');
  for (const [particle, delta] of baseline.sequence) {
    const before = await atom.locator(`[data-particle="${particle}"] output`).textContent();
    await pressWithKeyboard(page, `Bitta ${SINGULAR[particle]} ${delta > 0 ? 'qo‘shish' : 'ayirish'}`);
    await expect(atom.locator(`[data-particle="${particle}"] output`)).toHaveText(String(Number(before) + delta));
  }
  // screen-reader summary (plain language, no raw codes) and the text-state table
  await expect(summary).toHaveText('Uglerod-14. Neytral atom. 6 proton. 8 neytron. 6 elektron. Maqsadga yetildi.');
  await expect(atom.locator('[data-field="element"]')).toHaveText('C — Uglerod');
  await expect(atom.locator('[data-field="atomicNumber"]')).toHaveText('6');
  await expect(atom.locator('[data-field="massNumber"]')).toHaveText('14');
  await expect(atom.locator('[data-field="charge"]')).toHaveText('○ neytral atom');
  // goal status: text + shape + border style, never colour only
  const goal = atom.locator('.kl-atom__goal-state');
  await expect(goal).toHaveAttribute('data-goal', 'reached');
  await expect(goal).toHaveText(/^✓ Maqsadga yetildi/);
  expect(await atom.innerText()).not.toMatch(RAW_CODE);
  // reduced motion: the renderer has no motion at all
  expect(await atom.evaluate((el) => [el, ...el.querySelectorAll('*')].reduce((n, x) => n + x.getAnimations().length, 0))).toBe(0);
  expect(await atom.evaluate((el) => [el, ...el.querySelectorAll('*')].every((x) => getComputedStyle(x).transitionDuration.split(',').every((d) => parseFloat(d) === 0)))).toBe(true);
  // the renderer model is serializable and carries the schema
  const model = JSON.parse(await atom.getAttribute('data-model'));
  expect(model.schema).toBe('kimyolab.renderer.atom-state.v1');
  expect(model).toMatchObject({protons: 6, neutrons: 8, electrons: 6, atomicNumber: 6, massNumber: 14, charge: 0, symbol: 'C', isotopeLabel: 'Uglerod-14', goalReached: true});

  // completion comes from the domain result (engine evidence), shown only after the target is built
  await expect(page.getByRole('link', {name: 'Mustahkamlashga o‘tish'})).toBeVisible();
  // parity with the pre-P1.4 flow: attempt, progress and evidence are identical after normalization
  await expect.poll(async () => (await store(page)).attempts.map((a) => a.status)).toEqual(['completed']);
  const state = await store(page);
  expect(state.attempts.map((a) => ({activityId: a.activityId, learningUnitId: a.learningUnitId, status: a.status, attemptType: a.attemptType ?? 'practice'}))).toEqual(baseline.attempts);
  expect(state.progress.map((p) => ({learningUnitId: p.learningUnitId, status: p.status}))).toEqual(baseline.progress);
  const normalized = state.evidence.map(({id: _i, createdAt: _c, attemptId: _a, persistedAt: _p, recordedAt: _r, ...e}) => e).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  expect(normalized).toEqual(baseline.evidence);
  expect(errors).toEqual([]);
});

test('atom-builder: different particle counts give different chemistry (ion states), announced as text', async ({page}) => {
  await page.goto(`${server.url}/practice/practice.simulation.7.07.planned?lu=lu.7.07`);
  const atom = page.locator('[data-renderer="atom-builder@1.0.0"]');
  await expect(atom).toBeVisible();
  const add = async (particle, n) => { for (let i = 0; i < n; i += 1) { await atom.getByRole('button', {name: `Bitta ${SINGULAR[particle]} qo‘shish`}).focus(); await page.keyboard.press('Enter'); } await expect(atom.locator(`[data-particle="${particle}"] output`)).not.toHaveText('0'); };
  await add('protons', 8); await add('neutrons', 8); await add('electrons', 10);
  await expect(atom.locator('[role="status"]')).toHaveText('Kislorod-16. Manfiy ion (−2). 8 proton. 8 neytron. 10 elektron.');
  await expect(atom.locator('[data-field="charge"]')).toHaveText('⊖ manfiy ion (−2)');
  await expect(atom.locator('.kl-atom__goal-state')).toHaveAttribute('data-goal', 'pending');
  await expect(atom.locator('.kl-atom__goal-state')).toHaveText(/^○ Maqsad hali bajarilmagan/);
  await expect(page.getByRole('link', {name: 'Mustahkamlashga o‘tish'})).toHaveCount(0);   // no completion without the domain verdict
  const state = await store(page);
  expect(state.attempts.filter((a) => a.status === 'completed')).toEqual([]);   // (an evidence-less attempt is not persisted — P1.0)
  expect(state.progress.every((p) => p.status !== 'practice_complete')).toBe(true);
});

test('legacy activities are unaffected: a non-registry practice still uses the legacy renderer', async ({page}) => {
  await page.goto(`${server.url}/practice/practice.trainer.7.4`);
  await expect(page.locator('input[name="answer"]')).toBeVisible();
  await expect(page.locator('[data-renderer]')).toHaveCount(0);
  await page.locator('input[name="answer"]').fill('Al2O3');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', {name: 'Mustahkamlashga o‘tish'})).toBeVisible();
});
