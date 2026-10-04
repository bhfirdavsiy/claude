// P1.6 — the ionic-precipitation reference renderer in real Chromium + IndexedDB, operated with the KEYBOARD ONLY
// (Tab, arrow keys, typing, Enter — no mouse calls anywhere in this file). Flows: a valid precipitation from the
// learner's own reagent choice to a correct net ionic equation; a different pair giving a different domain result;
// a wrong equation (evidence, no completion); an unmodeled pair failing closed; reduced motion; no raw codes.
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

async function tabTo(page, locator) {
  for (let i = 0; i < 60; i += 1) {
    if (await locator.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('not reachable by Tab');
}
/** keyboard: focus the <select> and move with the arrow keys until the reagent is chosen */
async function chooseReagent(page, card, slot, speciesId) {
  const select = card.locator(`select[data-slot="${slot}"]`);
  await tabTo(page, select);
  const values = await select.locator('option').evaluateAll((os) => os.map((o) => o.value));
  for (let i = 0; i < 12; i += 1) {
    const current = await select.inputValue();
    if (current === speciesId) return;
    // P2.12: after a mix the card re-renders and the <select> can lose focus between the Tab and the arrow key, so the
    // key went to the page and nothing moved (P2.12 verify, the "different pair" test). Keyboard focus is re-established
    // with Tab (never by clicking or programmatic selection) before every press.
    if (!(await select.evaluate((el) => el === document.activeElement))) await tabTo(page, select);
    await page.keyboard.press(values.indexOf(speciesId) > values.indexOf(current) ? 'ArrowDown' : 'ArrowUp');
    // P2.11: was a bare loop. On a slow CI runner (pull request #27, verify on 5d9566d) the value was read again before
    // the arrow key had moved the selection, so the next press overshot the target and the loop ran out. Each press now
    // waits for the selection to move (a press that moved nothing is retried by the loop); the keyboard path and the
    // expected reagents are unchanged.
    await expect.poll(() => select.inputValue(), {timeout: 2000}).not.toBe(current).catch(() => {});
  }
  throw new Error(`reagent not reachable with the keyboard: ${speciesId}`);
}
async function mixPair(page, card, a, b) {
  await chooseReagent(page, card, 'A', a);
  await chooseReagent(page, card, 'B', b);
  const mix = card.locator('[data-action="mix"]');
  await expect(mix).toBeEnabled();
  await tabTo(page, mix);
  await page.keyboard.press('Enter');
}
async function writeEquation(page, card, text) {
  const input = card.locator('[data-field="equation-input"]');
  await expect(input).toBeEnabled();
  await tabTo(page, input);
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}
async function open(page) {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/practice/practice.experiment.8.1?lu=lu.8.16`);
  const card = page.locator('[data-renderer="ionic-precipitation@1.0.0"]');
  await expect(card).toBeVisible();
  return {card, errors};
}

test('ionic 8.1: keyboard-only — learner-chosen pair → observation → correct net ionic equation → complete', async ({page}) => {
  const {card, errors} = await open(page);
  await expect(page.locator('.kl-experiment-step')).toHaveCount(0);                          // not the legacy script
  await expect(card.locator('select[data-slot="A"] option')).toHaveCount(8);                 // placeholder + shelf
  await expect(card.locator('[data-action="mix"]')).toBeDisabled();
  await expect(card.locator('[data-field="equation-input"]')).toBeDisabled();
  await mixPair(page, card, 'species.agno3', 'species.nacl');
  const observation = card.locator('.kl-ionic__observation');
  await expect(observation).toHaveAttribute('data-reaction-state', 'modeled-reaction');
  await expect(observation).toHaveText('AgNO₃ + NaCl: Oq cho‘kma hosil bo‘ldi.');              // colour as a word
  await expect(card.getByLabel('3. Qisqa ionli tenglama')).toBeVisible();                     // labelled field
  await writeEquation(page, card, 'Cl- + Ag+ -> AgCl');                                        // order differs from IonicEngine
  await expect(card.locator('.kl-ionic__result')).toHaveText('✓ Tenglama to‘g‘ri.');
  await expect(card.locator('.kl-ionic__goal-state')).toHaveAttribute('data-goal', 'reached');
  await expect(card.locator('[role="status"][aria-live="polite"]')).toContainText('Maqsadga yetildi.');
  await expect(page.getByRole('link', {name: 'Mustahkamlashga o‘tish'})).toBeVisible();
  expect(await card.evaluate((el) => el.getAnimations({subtree: true}).length)).toBe(0);      // reduced motion: static
  await expect(page.locator('main')).not.toHaveText(RAW_CODE);
  const saved = await store(page);
  expect(saved.evidence.filter((e) => e.observationKind === 'ionic-mixing').map((e) => [e.reagents, e.outcome])).toEqual([[['species.agno3', 'species.nacl'], 'reaction']]);
  expect(saved.evidence.find((e) => e.answerKind === 'net-ionic-equation')).toMatchObject({response: 'Cl- + Ag+ -> AgCl', correct: true, score: 1});
  expect(saved.attempts.map((a) => a.status)).toEqual(['completed']);
  expect(errors).toEqual([]);
});

test('ionic 8.1: a different pair gives a different modeled reaction; its equation is checked against its own reaction', async ({page}) => {
  const {card} = await open(page);
  await mixPair(page, card, 'species.zncl2', 'species.naoh');
  await expect(card.locator('.kl-ionic__observation')).toHaveText('ZnCl₂ + NaOH: Oq cho‘kma hosil bo‘ldi.');
  await writeEquation(page, card, 'Zn2+ + OH- -> Zn(OH)2');                                   // coefficient missing
  await expect(card.locator('.kl-ionic__result')).toHaveAttribute('data-result', 'incorrect');
  await writeEquation(page, card, 'Zn²⁺ + 2OH⁻ → Zn(OH)₂↓');                                   // Unicode notation
  await expect(card.locator('.kl-ionic__result')).toHaveText('✓ Tenglama to‘g‘ri.');
  await expect(card.locator('.kl-ionic__goal-state')).toHaveAttribute('data-goal', 'pending'); // not the target reaction
  const saved = await store(page);
  // the store lists evidence by id (not by time): compare as a set
  expect(saved.evidence.filter((e) => e.answerKind === 'net-ionic-equation').map((e) => `${e.reactionId}:${e.correct}`).sort()).toEqual(['rxn.zncl2-naoh:false', 'rxn.zncl2-naoh:true']);
});

test('ionic 8.1: a wrong equation for the target is evidence, not completion; syntax problems get help, not a verdict', async ({page}) => {
  const {card} = await open(page);
  await mixPair(page, card, 'species.agno3', 'species.nacl');
  await writeEquation(page, card, 'Ag+ + NO3- -> AgNO3');
  await expect(card.locator('.kl-ionic__result')).toHaveText(/^✗ Tenglama noto‘g‘ri/);
  await writeEquation(page, card, 'Ag+ Cl- AgCl');
  await expect(card.locator('.kl-ionic__result')).toHaveText('Tenglamada bitta strelka (->) bo‘lishi kerak.');
  await expect(page.getByRole('link', {name: 'Mustahkamlashga o‘tish'})).toHaveCount(0);
  const saved = await store(page);
  expect(saved.evidence.filter((e) => e.answerKind === 'net-ionic-equation').map((e) => [e.response, e.correct, e.score])).toEqual([['Ag+ + NO3- -> AgNO3', false, 0]]);
  expect(saved.attempts.map((a) => a.status)).toEqual(['in_progress']);
});

test('ionic 8.1: an unmodeled pair fails closed — no invented reaction, never "no reaction", no chemistry evidence', async ({page}) => {
  const {card} = await open(page);
  await mixPair(page, card, 'species.agno3', 'species.nano3');
  const observation = card.locator('.kl-ionic__observation');
  await expect(observation).toHaveAttribute('data-reaction-state', 'not-modeled');
  await expect(observation).toHaveText('AgNO₃ + NaNO₃: bu juftlik modelda yo‘q — natija ko‘rsatilmaydi. Bu “reaksiya bormaydi” degani emas.');
  await expect(card.locator('[data-field="equation-input"]')).toBeDisabled();
  // conditions matter: NaCl + H2SO4 needs concentrated acid and heating in the KB → not modeled for this mix
  await mixPair(page, card, 'species.nacl', 'species.h2so4');
  await expect(observation).toHaveAttribute('data-reaction-state', 'not-modeled');
  const saved = await store(page);
  expect(saved.evidence.filter((e) => e.type === 'observation')).toEqual([]);
});
