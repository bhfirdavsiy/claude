// P2.6 — the condition-prediction reference renderer in real Chromium + IndexedDB, operated with the KEYBOARD ONLY
// (Tab, Space, arrow keys, Enter — no mouse calls anywhere in this file). Checks: registry path (not the legacy form),
// 9.23 (beta2) and 11.18 / 11.20 (beta3) through ONE renderer, two conditions → two different domain outcomes, a wrong
// prediction kept as evidence, predict-before-reveal in the UI, no outcome in the DOM before the reveal, localized
// labels (no raw ids), aria-live summary, text verdicts (✓/✗), reduced motion, phone width, and retry as a NEW attempt.
import {test, expect} from '@playwright/test';
import {buildDist, startServer} from '../helpers/dist.mjs';

const RAW_CODE = /\b[A-Z][A-Z0-9]+(_[A-Z0-9]+)+\b/;
let server;
test.beforeAll(async () => { server = await startServer({publicRoot: buildDist()}); });
test.afterAll(async () => { await server?.close(); });

const store = (page) => page.evaluate(async () => {
  const {IndexedDbProgressStore} = await import('/app-preview/runtime/progress/indexeddb-store.js');
  const s = new IndexedDbProgressStore(indexedDB, 'kimyolab-runtime');
  return {attempts: await s.listAttempts(), evidence: await s.listEvidence()};
});

/** Tab until `locator` has focus (keyboard only). */
async function tabTo(page, locator) {
  for (let i = 0; i < 60; i += 1) {
    if (await locator.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('not reachable by Tab');
}
/** In a focused radio group, move with ArrowDown until `target` is checked (skips disabled options natively). */
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
  const card = page.locator('[data-renderer="condition-prediction@1.0.0"]');
  await expect(card).toBeVisible();
  return {card, errors};
}

/** keyboard: choose the condition, predict the outcome, reveal the model's result */
async function runTrial(page, card, conditionLabel, outcomeLabel) {
  // Tab enters a radio group on its checked option (or the first enabled one when none is checked)
  const checked = card.locator('[data-condition]:checked:not([disabled])');
  const entry = (await checked.count()) ? checked.first() : card.locator('[data-condition]:not([disabled])').first();
  await tabTo(page, entry);
  if (!(await checked.count())) await page.keyboard.press('Space');
  await arrowTo(page, card.getByRole('radio', {name: conditionLabel, exact: true}));
  await expect(card.locator('[data-outcome]').first()).toBeEnabled();
  await tabTo(page, card.locator('[data-outcome]').first());
  if (!(await card.locator('[data-outcome]:checked').count())) await page.keyboard.press('Space');
  await arrowTo(page, card.getByRole('radio', {name: outcomeLabel, exact: true}));
  const reveal = card.locator('[data-action="reveal"]');
  await expect(reveal).toBeEnabled();
  await tabTo(page, reveal);
  await page.keyboard.press('Enter');
}

test('9.23 (beta2): keyboard-only — wrong prediction is evidence, a different condition gives a different domain outcome, the target completes', async ({page}) => {
  const {card, errors} = await open(page, 'practice.simulation.9.23.planned', 'lu.9.23');
  await expect(page.locator('.kl-question')).toHaveCount(0);                              // not the legacy form
  await expect(card.locator('fieldset legend')).toHaveText(['1. Sharoitni tanlang', '2. Natijani oldindan ayting']);
  await expect(card.locator('[data-condition]')).toHaveCount(3);
  for (const label of ['Kislotali muhit', 'Ishqoriy muhit', 'Neytral muhit']) await expect(card.getByRole('radio', {name: label, exact: true})).toBeVisible();
  for (const label of ['Mn²⁺', 'MnO₂', 'MnO₄²⁻']) await expect(card.getByRole('radio', {name: label, exact: true})).toBeDisabled();
  await expect(card.locator('[data-action="reveal"]')).toBeDisabled();
  await expect(card).toContainText('Modda: MnO₄⁻');
  await expect(card.locator('.kl-cond__goal')).toContainText('«Kislotali muhit»');

  // basic medium, predicted Mn²⁺ → the model says MnO₄²⁻: a wrong prediction, recorded, no completion
  await runTrial(page, card, 'Ishqoriy muhit', 'Mn²⁺');
  await expect(card.locator('.kl-cond__observation')).toHaveText('Model natijasi: MnO₄²⁻.');
  await expect(card.locator('.kl-cond__feedback')).toHaveAttribute('data-result', 'incorrect');
  await expect(card.locator('.kl-cond__feedback')).toHaveText(/^✗ Bashoratingiz noto‘g‘ri: siz «Mn²⁺» dedingiz, model natijasi esa MnO₄²⁻/);
  await expect(card.locator('[data-field="verdict"]')).toHaveText('✗ noto‘g‘ri');
  // a revealed condition is marked "(sinab ko‘rilgan)" in its accessible name and stays checked while it is current
  await expect(card.getByRole('radio', {name: 'Ishqoriy muhit (sinab ko‘rilgan)', exact: true})).toBeChecked();
  await expect(page.getByRole('link', {name: 'Mustahkamlashga o‘tish'})).toHaveCount(0);

  // acidic medium (the target), predicted Mn²⁺ → a different domain outcome, correct, completes
  await runTrial(page, card, 'Kislotali muhit', 'Mn²⁺');
  await expect(card.locator('.kl-cond__observation')).toHaveText('Model natijasi: Mn²⁺.');
  await expect(card.locator('.kl-cond__feedback')).toHaveText('✓ Bashoratingiz to‘g‘ri: Mn²⁺.');
  await expect(card.getByRole('radio', {name: 'Ishqoriy muhit (sinab ko‘rilgan)', exact: true})).toBeDisabled();   // tried in this attempt
  await expect(card.locator('.kl-cond__trials li')).toHaveText([/^1-sinov: Ishqoriy muhit — bashorat Mn²⁺, model natijasi MnO₄²⁻ \(✗ noto‘g‘ri\)/, /^2-sinov: Kislotali muhit — bashorat Mn²⁺, model natijasi Mn²⁺ \(✓ to‘g‘ri\)/]);
  const status = card.locator('[role="status"][aria-live="polite"]');
  await expect(status).toContainText('Model natijasi: Mn²⁺. ✓ Bashoratingiz to‘g‘ri');
  await expect(status).toContainText('Maqsadga yetildi');
  await expect(card.locator('.kl-cond__goal-state')).toHaveAttribute('data-goal', 'reached');
  await expect(page.getByRole('link', {name: 'Mustahkamlashga o‘tish'})).toBeVisible();
  expect(await card.evaluate((el) => el.getAnimations({subtree: true}).length)).toBe(0);       // reduced motion: no motion at all
  await expect(page.locator('main')).not.toHaveText(RAW_CODE);
  for (const raw of ['acidic', 'basic', 'neutral']) await expect(card.locator('label', {hasText: new RegExp(`^${raw}$`)})).toHaveCount(0);

  const saved = await store(page);
  const answers = saved.evidence.filter((e) => e.type === 'answer');
  // the store lists evidence in its own key order: compare by question
  expect(answers.map(({questionId, response, correct, score}) => ({questionId, response, correct, score})).sort((a, b) => a.questionId.localeCompare(b.questionId))).toEqual([
    {questionId: 'condition:manganese-medium-product:acidic', response: 'Mn^2+', correct: true, score: 1},
    {questionId: 'condition:manganese-medium-product:basic', response: 'Mn^2+', correct: false, score: 0},
  ]);
  // one construction per engine result (immutable evidence): not achieved after trial 1, achieved after trial 2; the
  // store's listing order is not part of the contract, so compare as a set
  const constructions = saved.evidence.filter((e) => e.type === 'construction');
  expect(constructions.every((e) => e.targetId === 'manganese-acidic-trial')).toBe(true);
  expect(constructions.map((e) => `${e.achieved}:${e.score}`).sort()).toEqual(['false:0', 'true:1']);
  expect(saved.attempts.map((a) => a.status)).toEqual(['completed']);

  // retry: a NEW attempt; the finished attempt and its evidence stay as they were
  const retry = page.locator('[data-action="retry"]');
  await tabTo(page, retry); await page.keyboard.press('Enter');
  await expect(card.locator('.kl-cond__trials li')).toHaveCount(0);
  await expect(card.getByRole('radio', {name: 'Ishqoriy muhit', exact: true})).toBeEnabled();
  // the new attempt is recorded with its first trial
  await runTrial(page, card, 'Neytral muhit', 'MnO₂');
  await expect(card.locator('.kl-cond__trials li')).toHaveCount(1);
  const after = await store(page);
  expect(after.attempts.map((a) => a.status).sort()).toEqual(['completed', 'in_progress']);
  const ofFirst = (list) => list.filter((e) => e.attemptId === saved.attempts[0].attemptId).map((e) => JSON.stringify(e)).sort();
  expect(ofFirst(after.evidence)).toEqual(ofFirst(saved.evidence));
  expect(errors).toEqual([]);
});

test('predict-before-reveal and no leakage: the outcome is not in the DOM before the reveal; the reveal needs a prediction', async ({page}) => {
  const {card} = await open(page, 'practice.simulation.11.18.planned', 'lu.11.18');
  await expect(card).toContainText('Tizim: N₂ + 3H₂ ⇌ 2NH₃ (ammiak sintezi)');
  const first = card.locator('[data-condition]').first();
  await tabTo(page, first); await page.keyboard.press('Space');
  await arrowTo(page, card.getByRole('radio', {name: 'Bosimni oshirish', exact: true}));
  await expect(card.locator('[data-action="reveal"]')).toBeDisabled();                     // no prediction yet
  await expect(card.locator('.kl-cond__hint')).toHaveText('Natijani ko‘rishdan oldin bashorat qiling.');
  await expect(card.locator('.kl-cond__observation')).toHaveText('Model natijasi hali ko‘rsatilmagan.');
  const model = JSON.parse(await card.getAttribute('data-model'));
  expect(model.observation).toBeNull();
  expect(model.trials).toEqual([]);
  // the three options are the model's closed set in a fixed order, the same whichever is correct
  await expect(card.locator('[data-outcome]')).toHaveCount(3);
  await expect(card.locator('fieldset').nth(1).locator('label')).toHaveText(['Reaktantlar tomonga', 'Mahsulotlar tomonga', 'Siljimaydi']);
});

test('11.18 (beta3 equilibrium): two perturbations → two different modeled shifts; 11.20 (beta3 manganese) through the same renderer', async ({page}) => {
  let {card} = await open(page, 'practice.simulation.11.18.planned', 'lu.11.18');
  await runTrial(page, card, 'Haroratni oshirish', 'Mahsulotlar tomonga');
  await expect(card.locator('.kl-cond__observation')).toHaveText('Model natijasi: Reaktantlar tomonga.');
  await expect(card.locator('.kl-cond__feedback')).toHaveAttribute('data-result', 'incorrect');
  await runTrial(page, card, 'Bosimni oshirish', 'Mahsulotlar tomonga');
  await expect(card.locator('.kl-cond__observation')).toHaveText('Model natijasi: Mahsulotlar tomonga.');
  await expect(card.locator('.kl-cond__goal-state')).toHaveAttribute('data-goal', 'reached');

  ({card} = await open(page, 'practice.simulation.11.20.planned', 'lu.11.20'));
  await runTrial(page, card, 'Neytral muhit', 'MnO₂');
  await expect(card.locator('.kl-cond__observation')).toHaveText('Model natijasi: MnO₂.');
  await expect(card.locator('.kl-cond__goal-state')).toHaveAttribute('data-goal', 'pending');      // neutral is not the target
});

test('phone width: the condition renderer reflows without horizontal scroll and stays operable', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 375, height: 740}, isMobile: true, hasTouch: true, reducedMotion: 'reduce'});
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/practice/practice.simulation.9.23.planned?lu=lu.9.23`);
  const card = page.locator('[data-renderer="condition-prediction@1.0.0"]');
  await expect(card).toBeVisible();
  await runTrial(page, card, 'Kislotali muhit', 'Mn²⁺');
  await expect(card.locator('.kl-cond__goal-state')).toHaveAttribute('data-goal', 'reached');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});
