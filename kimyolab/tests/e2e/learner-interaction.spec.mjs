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

test('9.23 crash regression: the medium is chosen from readable labels; wrong → "Noto‘g‘ri", correct → "To‘g‘ri", no crash', async ({page}) => {
  const errors = await open(page, 'practice.simulation.9.23.planned');
  const group = page.getByRole('group', {name: 'Muhit'});
  await expect(group.getByRole('radio')).toHaveCount(3);
  await expect(group.locator('label')).toHaveText(['Ishqoriy muhit', 'Kislotali muhit', 'Neytral muhit']);
  await choose(page, 'Muhit', 'Ishqoriy muhit');
  await expect(feedback(page)).toContainText('Noto‘g‘ri');
  await choose(page, 'Muhit', 'Kislotali muhit');
  await expect(feedback(page)).toContainText('To‘g‘ri');
  await expect(page.getByRole('link', {name: 'Mustahkamlashga o‘tish'})).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Amalni bajarib bo‘lmadi');
  expect(errors).toEqual([]);
});

test('enum answer (kinetics effect): readable options, correct answer completes', async ({page}) => {
  await open(page, 'practice.simulation.11.16.planned');
  const group = page.getByRole('group', {name: 'Reaksiya tezligiga ta’siri'});
  await expect(group.locator('label')).toHaveText(['Kamayadi', 'O‘zgarmaydi', 'Ortadi']);
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

test('keyboard only: Tab into the choice group, arrows to move, Enter to submit; empty submit is announced as an alert', async ({page}) => {
  await open(page, 'practice.simulation.9.23.planned');
  const form = page.locator('.kl-question').first();
  await form.getByRole('button').focus();
  await page.keyboard.press('Enter');                                // nothing chosen
  await expect(form.getByRole('alert')).toHaveText('Variantni tanlang.');
  await expect(form.getByRole('radio').first()).toBeFocused();       // focus returns to the group
  await page.keyboard.press('ArrowDown');                            // native radio group: arrow selects the next option
  await expect(form.getByRole('radio', {name: 'Kislotali muhit'})).toBeChecked();
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
    const model = await new ContentClient({baseUrl: '/content'}).loadPractice('practice.simulation.9.23.planned');
    const bare = {...model, localization: undefined};
    const session = new ReferencePracticeSession(bare, {now: () => '2026-01-01T00:00:00.000Z'});
    const root = document.createElement('div'); document.body.append(root);
    renderPractice(root, bare, session);
    const labels = [...root.querySelectorAll('.kl-choice')].map((x) => x.textContent.trim());
    return {labels, legend: root.querySelector('legend')?.textContent, html: root.innerHTML};
  });
  expect(result.labels).toEqual(['#1', '#2', '#3']);
  expect(result.legend).not.toBe('medium');
  for (const token of ['acidic', 'basic', 'neutral', 'medium']) expect(result.html).not.toContain(`>${token}<`);
});
