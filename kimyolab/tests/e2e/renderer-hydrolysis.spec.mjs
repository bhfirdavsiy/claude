// P1.5 — the hydrolysis-medium reference renderer in real Chromium + IndexedDB, operated with the KEYBOARD ONLY
// (Tab, Space, arrow keys, Enter — no mouse calls anywhere in this file). Checks: registry path (not the legacy
// form), the correct flow completes, a wrong prediction is recorded as evidence and explained, predict-before-reveal
// in the UI, localized labels and text observations, aria-live, reduced motion, only modeled salts offered and an
// unmodeled salt failing closed, and 11.11 (simulation engine) through the same renderer.
import {test, expect} from '@playwright/test';
import {buildDist, startServer} from '../helpers/dist.mjs';

const RAW_CODE = /\b[A-Z][A-Z0-9]+(_[A-Z0-9]+)+\b/;
let server;
test.beforeAll(async () => { server = await startServer({publicRoot: buildDist()}); });
test.afterAll(async () => { await server?.close(); });

const store = (page) => page.evaluate(async () => {
  const {IndexedDbProgressStore} = await import('/app-preview/runtime/progress/indexeddb-store.js');
  const s = new IndexedDbProgressStore(indexedDB, 'kimyolab-runtime');
  return {attempts: await s.listAttempts(), evidence: await s.listEvidence(), progress: await s.listProgress()};
});

/** Tab until `locator` has focus (keyboard only). */
async function tabTo(page, locator) {
  for (let i = 0; i < 60; i += 1) {
    if (await locator.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('not reachable by Tab');
}
/** In a focused radio group, move with ArrowDown until `target` is checked. */
async function arrowTo(page, target) {
  for (let i = 0; i < 8; i += 1) {
    if (await target.isChecked()) return;
    await page.keyboard.press('ArrowDown');
  }
  throw new Error('radio not reachable with arrow keys');
}

async function open(page, id, lu) {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/practice/${id}?lu=${lu}`);
  const card = page.locator('[data-renderer="hydrolysis-medium@1.0.0"]');
  await expect(card).toBeVisible();
  return {card, errors};
}

/** keyboard: choose the salt, predict, add the indicator */
async function runTrial(page, card, saltLabel, mediumLabel) {
  const firstSalt = card.locator('[data-salt]').first();
  await tabTo(page, firstSalt);
  if (!(await firstSalt.isChecked())) await page.keyboard.press('Space');
  await arrowTo(page, card.getByRole('radio', {name: saltLabel, exact: true}));
  const firstMedium = card.locator('[data-medium]').first();
  await expect(firstMedium).toBeEnabled();
  await tabTo(page, card.locator('[data-medium]:checked, [data-medium]').first());
  if (!(await card.locator('[data-medium]:checked').count())) await page.keyboard.press('Space');
  await arrowTo(page, card.getByRole('radio', {name: mediumLabel, exact: true}));
  const reveal = card.locator('[data-action="add-indicator"]');
  await expect(reveal).toBeEnabled();
  await tabTo(page, reveal);
  await page.keyboard.press('Enter');
}

test('hydrolysis 9.14: keyboard-only correct flow completes; observation is text from the domain; aria-live; no motion', async ({page}) => {
  const {card, errors} = await open(page, 'practice.experiment.9.14', 'lu.9.06');
  await expect(page.locator('.kl-experiment-step')).toHaveCount(0);                    // not the legacy form
  // only the modeled salts, as formulas; localized medium labels
  await expect(card.locator('[data-salt]')).toHaveCount(4);
  for (const label of ['AlCl₃', 'Na₂CO₃', 'NaCl', 'NH₄Cl']) await expect(card.getByRole('radio', {name: label, exact: true})).toBeVisible();
  for (const label of ['Kislotali', 'Ishqoriy', 'Neytral']) await expect(card.getByRole('radio', {name: label, exact: true})).toBeDisabled();
  await expect(card.locator('[data-action="add-indicator"]')).toBeDisabled();
  await expect(card.locator('fieldset legend')).toHaveText(['1. Tuzni tanlang', '2. Muhitni oldindan ayting']);

  await runTrial(page, card, 'AlCl₃', 'Kislotali');
  await expect(card.locator('.kl-hydro__observation')).toHaveText('Indikator (lakmus) qizil tusga o‘tdi. Muhit kislotali.');
  await expect(card.locator('.kl-hydro__feedback')).toHaveText(/^✓ Bashoratingiz to‘g‘ri/);
  const status = card.locator('[role="status"][aria-live="polite"]');
  await expect(status).toContainText('Muhit kislotali. Bashoratingiz to‘g‘ri');
  await expect(status).toContainText('Maqsadga yetildi.');
  await expect(card.locator('.kl-hydro__goal-state')).toHaveAttribute('data-goal', 'reached');
  await expect(page.getByRole('link', {name: 'Mustahkamlashga o‘tish'})).toBeVisible();
  await expect(card.getByRole('radio', {name: 'Ishqoriy', exact: true})).toBeDisabled();     // locked after the reveal
  // reduced motion: nothing animates
  expect(await card.evaluate((el) => el.getAnimations({subtree: true}).length)).toBe(0);
  await expect(page.locator('main')).not.toHaveText(RAW_CODE);
  const saved = await store(page);
  const trial = saved.evidence.find((e) => e.type === 'answer' && e.selectedSalt === 'AlCl3');
  expect(trial).toMatchObject({predictedMedium: 'acidic', actualMedium: 'acidic', correct: true, predictedBeforeReveal: true, score: 1});
  expect(saved.attempts.map((a) => a.status)).toEqual(['completed']);
  expect(errors).toEqual([]);
});

test('hydrolysis 9.14: a wrong prediction is explained and kept as evidence; no completion', async ({page}) => {
  const {card} = await open(page, 'practice.experiment.9.14', 'lu.9.06');
  await runTrial(page, card, 'AlCl₃', 'Ishqoriy');
  await expect(card.locator('.kl-hydro__feedback')).toHaveAttribute('data-result', 'incorrect');
  await expect(card.locator('.kl-hydro__feedback')).toContainText('siz “ishqoriy” dedingiz, kuzatuv esa kislotali muhitni ko‘rsatdi');
  await expect(card.locator('[data-field="result"]')).toHaveText('✗ Noto‘g‘ri');
  await expect(page.getByRole('link', {name: 'Mustahkamlashga o‘tish'})).toHaveCount(0);
  const saved = await store(page);
  expect(saved.evidence.find((e) => e.type === 'answer')).toMatchObject({selectedSalt: 'AlCl3', predictedMedium: 'basic', actualMedium: 'acidic', correct: false, score: 0});
  expect(saved.attempts.map((a) => a.status)).toEqual(['in_progress']);
});

test('hydrolysis: an unmodeled salt fails closed and a different salt gives a different domain outcome', async ({page}) => {
  const {card} = await open(page, 'practice.experiment.9.14', 'lu.9.06');
  await runTrial(page, card, 'Na₂CO₃', 'Ishqoriy');
  await expect(card.locator('.kl-hydro__observation')).toHaveText('Indikator (lakmus) ko‘k tusga o‘tdi. Muhit ishqoriy.');
  // the browser build of the domain refuses a salt that is not modeled (no observation is invented)
  const verdict = await page.evaluate(async () => {
    const {HydrolysisModel} = await import('/app-preview/domain/chemistry/hydrolysis-model.js');
    const {evaluateHydrolysisTrials} = await import('/app-preview/domain/chemistry/hydrolysis-trial.js');
    const pointer = await (await fetch('/content/manifest.json')).json();
    const data = await (await fetch(`/content/${pointer.activeVersion}/chemistry/hydrolysis.json`)).json();
    const model = HydrolysisModel.from(data);
    const pick = evaluateHydrolysisTrials(model, 'AlCl3', [{type: 'selectSalt', payload: {salt: 'KNO3'}}]);
    const reveal = evaluateHydrolysisTrials(model, 'AlCl3', [{type: 'selectSalt', payload: {salt: 'KNO3'}}, {type: 'addIndicator'}]);
    return {pick: pick.rejected, reveal: reveal.rejected, observation: reveal.current.observation, trials: reveal.trials.length};
  });
  expect(verdict).toEqual({pick: 'HYDROLYSIS_NOT_MODELED', reveal: 'HYDROLYSIS_NO_SALT', observation: null, trials: 0});
});

test('hydrolysis 11.11 (simulation engine) runs through the same renderer with the keyboard', async ({page}) => {
  const {card} = await open(page, 'practice.simulation.11.11.planned', 'lu.11.11');
  await runTrial(page, card, 'NH₄Cl', 'Kislotali');
  await expect(card.locator('.kl-hydro__observation')).toHaveText('Indikator (lakmus) qizil tusga o‘tdi. Muhit kislotali.');
  await expect(card.locator('.kl-hydro__goal-state')).toHaveAttribute('data-goal', 'reached');
});
