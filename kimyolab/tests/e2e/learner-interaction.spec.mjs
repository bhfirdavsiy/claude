// P2.1 — learner interaction reliability in real Chromium: the 9.23 crash regression, closed-domain answers as
// labelled choices (enum, internal polymer token, species), wrong/correct verdicts as TEXT, keyboard-only operation,
// invalid input announced with role=alert, the missing-label fallback, and no answer key / canonical token in the DOM.
import {test, expect} from '@playwright/test';
import {buildDist, startServer} from '../helpers/dist.mjs';

const RAW_CODE = /\b[A-Z][A-Z0-9]+(_[A-Z0-9]+)+\b/;
const LEAK = /correctAnswer|expectedToken|answerKey|data-correct|data-expected/i;
let server;
test.beforeAll(async () => { server = await startServer({publicRoot: buildDist()}); });
test.afterAll(async () => { await server?.close(); });

async function open(page, id) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/practice/${id}`);
  await expect(page.locator('.kl-question').first()).toBeVisible();
  return errors;
}
const feedback = (page) => page.locator('.kl-feedback[role="status"]');
async function choose(page, legend, label) {
  const group = page.getByRole('group', {name: legend});
  await group.getByRole('radio', {name: label, exact: true}).check();
  await group.locator('xpath=ancestor::form').getByRole('button').click();
}

// P2.6 changed this test: 9.23 is drawn by the condition-prediction renderer (ADR-P2-007), not the legacy choice form.
// The P2.1 regression it guards is unchanged — the medium is chosen from readable labels, a wrong prediction gives a
// ✗ verdict, the correct one completes, nothing crashes (keyboard-only coverage: tests/e2e/renderer-condition.spec.mjs).
test('9.23 crash regression: the medium is chosen from readable labels; wrong → "Noto‘g‘ri", correct → "To‘g‘ri", no crash', async ({page}) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/practice/practice.simulation.9.23.planned`);
  const card = page.locator('[data-renderer="condition-prediction@1.0.0"]');
  await expect(card.locator('[data-condition]')).toHaveCount(3);
  await expect(card.locator('fieldset').first().locator('label')).toHaveText(['Kislotali muhit', 'Ishqoriy muhit', 'Neytral muhit']);
  const trial = async (condition, outcome) => {
    await card.getByRole('radio', {name: condition, exact: true}).check();
    await card.getByRole('radio', {name: outcome, exact: true}).check();
    await card.locator('[data-action="reveal"]').click();
  };
  await trial('Ishqoriy muhit', 'Mn²⁺');
  await expect(card.locator('.kl-cond__feedback')).toContainText('noto‘g‘ri');
  await trial('Kislotali muhit', 'Mn²⁺');
  await expect(card.locator('.kl-cond__feedback')).toContainText('to‘g‘ri');
  await expect(page.getByRole('link', {name: 'Mustahkamlashga o‘tish'})).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Amalni bajarib bo‘lmadi');
  expect(errors).toEqual([]);
});

test('enum answer (kinetics effect): readable options, correct answer completes', async ({page}) => {
  await open(page, 'practice.simulation.11.16.planned');
  const group = page.getByRole('group', {name: 'Reaksiya tezligiga ta’siri'});
  // P2.9: was ['Kamayadi', 'O‘zgarmaydi', 'Ortadi'] (Chromium's localeCompare('uz') order). Choices are now ordered by
  // code points of the NFC lower-cased label — the same in every runtime (ADR-P2-010 §2.2)
  await expect(group.locator('label')).toHaveText(['Kamayadi', 'Ortadi', 'O‘zgarmaydi']);
  await choose(page, 'Reaksiya tezligiga ta’siri', 'Ortadi');
  await expect(feedback(page)).toContainText('To‘g‘ri');
});

test('internal polymer token and species: the learner picks a name, the canonical token never reaches the DOM', async ({page}) => {
  await open(page, 'practice.simulation.10.13.planned');
  await choose(page, 'Mahsulot', 'Polibutadienning takrorlanuvchi bo‘g‘ini');
  await expect(feedback(page)).toContainText('To‘g‘ri');
  const html = await page.content();
  for (const token of ['polybutadiene-repeat-unit', 'chloromethane', 'polystyrene-repeat-unit', 'brominated-addition-products']) expect(html).not.toContain(token);
  expect(html).not.toMatch(LEAK);
  await expect(page.locator('body')).not.toContainText(RAW_CODE);

  await open(page, 'practice.simulation.10.10.planned');
  const values = await page.locator('input[type="radio"]').evaluateAll((xs) => xs.map((x) => x.value));
  expect(values).toEqual(values.map((_, i) => String(i)));          // the DOM carries the option index only
  await choose(page, 'Mahsulot', 'Xlormetan');
  await expect(feedback(page)).toContainText('To‘g‘ri');
});

// P2.6 changed this test's subject from 9.23 (now the condition-prediction renderer) to 11.16, a remaining legacy
// choice form; the options are 'Kamayadi', 'O‘zgarmaydi', 'Ortadi', so the correct one is two arrow presses away.
// P2.9 changed the option order to 'Kamayadi', 'Ortadi', 'O‘zgarmaydi' (code-point order, ADR-P2-010 §2.2), so the
// correct one is now ONE arrow press away.
test('keyboard only: Tab into the choice group, arrows to move, Enter to submit; empty submit is announced as an alert', async ({page}) => {
  await open(page, 'practice.simulation.11.16.planned');
  const form = page.locator('.kl-question').first();
  await form.getByRole('button').focus();
  await page.keyboard.press('Enter');                                // nothing chosen
  await expect(form.getByRole('alert')).toHaveText('Variantni tanlang.');
  await expect(form.getByRole('radio').first()).toBeFocused();       // focus returns to the group
  await page.keyboard.press('ArrowDown');                            // native radio group: arrow selects the next option
  await expect(form.getByRole('radio', {name: 'Ortadi'})).toBeChecked();
  await page.keyboard.press('Enter');                                // implicit form submission
  await expect(feedback(page)).toContainText('To‘g‘ri');
  await expect(form.getByRole('alert')).toHaveText('');
});

test('text fields: a legacy typed field has a visible label; an empty answer gets a text alert, not a crash', async ({page}) => {
  const errors = await open(page, 'practice.simulation.7.02.planned');
  const input = page.getByLabel('Xossa', {exact: true});
  await expect(input).toBeVisible();
  await input.fill('   '); await input.press('Enter');
  await expect(page.getByRole('alert').first()).toHaveText('Javobni kiriting.');
  await input.fill('zichlik'); await input.press('Enter');          // localized free text → feedback, never a crash
  await expect(feedback(page)).not.toHaveText('');
  await expect(page.locator('body')).not.toContainText('Amalni bajarib bo‘lmadi');
  expect(errors).toEqual([]);
});

test('missing label fallback: without the catalog the page shows numbered generic labels, never a raw id (chemistry without a catalog: unit suite)', async ({page}) => {
  await page.goto(`${server.url}/`);
  const result = await page.evaluate(async () => {
    const {ContentClient} = await import('/app-preview/app/content-client.js');
    const {ReferencePracticeSession} = await import('/app-preview/features/practice/session.js');
    const {renderPractice} = await import('/app-preview/features/practice/render.js');
    // P2.6: subject changed from 9.23 (condition-prediction renderer now) to 11.16, a legacy single-choice simulation
    const model = await new ContentClient({baseUrl: '/content'}).loadPractice('practice.simulation.11.16.planned');
    const bare = {...model, localization: undefined};
    const session = new ReferencePracticeSession(bare, {now: () => '2026-01-01T00:00:00.000Z'});
    const root = document.createElement('div'); document.body.append(root);
    renderPractice(root, bare, session);
    const labels = [...root.querySelectorAll('.kl-choice')].map((x) => x.textContent.trim());
    return {labels, legend: root.querySelector('legend')?.textContent, html: root.innerHTML};
  });
  expect(result.labels).toEqual(['#1', '#2', '#3']);
  expect(result.legend).not.toBe('effect');
  for (const token of ['increase', 'decrease', 'no-change', 'effect']) expect(result.html).not.toContain(`>${token}<`);
});
