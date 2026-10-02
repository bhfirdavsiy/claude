// P2.7 — accessibility regressions per learner UI family (the sweep measures every activity; these pin the specific
// failure modes found and fixed centrally in P2.7, plus the surfaces that are not activities: assessment UI and the
// learning-cycle navigation). Keyboard only, real Chromium, the portal (/kimyolab/) host.
import fs from 'node:fs';
import path from 'node:path';
import {test, expect} from '@playwright/test';
import {startHosts} from './host-scenarios.mjs';
import {cloneDist, resealContentPack, startServer} from '../helpers/dist.mjs';
import {tabTo, focusFacts, motion, reflow} from '../helpers/a11y.mjs';

let hosts;
test.beforeAll(async () => { hosts = await startHosts(); });
test.afterAll(async () => { await hosts?.close(); });
const open = async (page, logical) => { await hosts.portal.open(page, logical); await page.locator('.kl-practice-workspace button, .kl-practice-workspace input, main a').first().waitFor(); };
const state = () => ({issues: new Set(), focusStops: 0});
const feedback = (page) => page.locator('.kl-feedback[role="status"]');

test('legacy typed form: empty submit → localized role=alert bound to the field, aria-invalid, focus stays (no browser bubble)', async ({page}) => {
  await open(page, '/practice/practice.trainer.10.03.planned');
  const form = page.locator('.kl-question').first();
  const input = form.locator('input');
  const s = state();
  await tabTo(page, input, s);
  await page.keyboard.press('Enter');
  await expect(form.locator('[role=alert]')).toHaveText('Javobni kiriting.');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(await input.getAttribute('aria-describedby')).toBe(await form.locator('[role=alert]').getAttribute('id'));
  expect(await input.evaluate((el) => el === document.activeElement)).toBe(true);
  expect(s.issues.size).toBe(0);
});

test('legacy form: wrong answer → "✗ Noto‘g‘ri." as text, keyboard retry in the same attempt → "✓ To‘g‘ri." (non-colour verdict)', async ({page}) => {
  await open(page, '/practice/practice.trainer.10.03.planned');
  const input = page.locator('.kl-question input').first();
  const s = state();
  await tabTo(page, input, s);
  await page.keyboard.type('noto‘g‘ri-javob'); await page.keyboard.press('Enter');
  await expect(feedback(page)).toContainText('Noto‘g‘ri.');
  await expect(feedback(page)).toHaveAttribute('data-verdict', 'incorrect');
  await expect(feedback(page).locator('.kl-verdict-mark')).toHaveText('✗ ');
  await expect(feedback(page).locator('.kl-verdict-mark')).toHaveAttribute('aria-hidden', 'true');
  await expect(input).not.toHaveAttribute('aria-invalid', 'true');
  await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('4'); await page.keyboard.press('Enter');
  await expect(feedback(page)).toHaveAttribute('data-verdict', 'correct');
  await expect(feedback(page).locator('.kl-verdict-mark')).toHaveText('✓ ');
  await expect(page.getByRole('link', {name: 'Mustahkamlashga o‘tish'})).toBeVisible();
  expect((await focusFacts(page)).onBody).toBe(false);
});

test('legacy choice form: rapid arrow keys land on the intended option; the submit button is named by its question', async ({page}) => {
  await open(page, '/practice/practice.simulation.11.16.planned');
  const group = page.getByRole('group', {name: 'Reaksiya tezligiga ta’siri'});
  const s = state();
  await tabTo(page, group.getByRole('radio').first(), s, {group: true});
  await page.keyboard.press('Space');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowDown');   // no waits: 3 options, 5 presses → index 2
  await expect(group.getByRole('radio', {name: 'Ortadi', exact: true})).toBeChecked();
  const button = group.locator('xpath=ancestor::form').getByRole('button');
  await expect(button).toHaveAccessibleDescription('Reaksiya tezligiga ta’siri');
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await expect(feedback(page)).toContainText('To‘g‘ri');
});

test('experiment: step buttons named by their step; out-of-order step is rejected AND stays open; focus never falls to <body>', async ({page}) => {
  await open(page, '/practice/practice.experiment.10.1');
  const buttons = page.locator('.kl-experiment-step button');
  const names = await buttons.evaluateAll((xs) => xs.map((b) => b.getAttribute('aria-labelledby').split(' ').map((id) => document.getElementById(id).textContent).join(' ')));
  expect(new Set(names).size).toBe(names.length);
  expect(names[0]).toMatch(/^Bajarish 1\. /);
  await expect(page.locator('.kl-experiment-step').first()).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('.kl-experiment-stage')).toHaveAttribute('role', 'group');
  await expect(page.locator('.kl-experiment-vessel')).toHaveAttribute('aria-hidden', 'true');
  const s = state();
  // step 2 before step 1: announced, and the step can still be done afterwards (it was disabled forever before P2.7)
  await tabTo(page, buttons.nth(1), s); await page.keyboard.press('Enter');
  const announcedText = await page.locator('.kl-practice-workspace [role=status], .kl-practice-workspace [role=alert]').allTextContents();
  expect(announcedText.join(' ')).toMatch(/urinib ko‘ring|Noto‘g‘ri/);
  await expect(buttons.nth(1)).not.toHaveAttribute('aria-disabled', 'true');
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    await tabTo(page, buttons.nth(i), s); await page.keyboard.press('Enter');
    await expect(buttons.nth(i)).toHaveAttribute('aria-disabled', 'true');
    expect((await focusFacts(page)).onBody, `focus kept after step ${i + 1}`).toBe(false);
  }
  await expect(page.getByRole('link', {name: 'Mustahkamlashga o‘tish'})).toBeVisible();
});

test('case: visible labels for every field; empty decision answered by the localized feedback, not a browser bubble', async ({page}) => {
  await open(page, '/practice/practice.case.10.11');
  for (const name of ['Qaroringiz', 'Ilmiy asos', 'Xulosa']) await expect(page.getByLabel(name, {exact: true})).toBeVisible();
  const s = state();
  await tabTo(page, page.getByRole('button', {name: 'Qarorni tekshirish'}), s);
  await page.keyboard.press('Enter');
  await expect(feedback(page)).not.toHaveText('');
  expect((await focusFacts(page)).inWorkspace).toBe(true);
});

test('reduced motion: an experiment stage animates normally and stops under prefers-reduced-motion: reduce', async ({page}) => {
  await open(page, '/practice/practice.experiment.10.1');
  await page.evaluate(() => document.querySelector('.kl-experiment-stage').classList.add('is-active'));
  await page.waitForTimeout(100);
  expect((await motion(page)).running).toBeGreaterThan(0);          // the check is real: motion exists by default
  await page.emulateMedia({reducedMotion: 'reduce'}); await page.waitForTimeout(100);
  expect(await motion(page)).toEqual({running: 0, transitions: 0});
});

test('320 px: a long unit title wraps instead of forcing horizontal scroll', async ({page}) => {
  await page.setViewportSize({width: 320, height: 800});
  await open(page, '/practice/practice.trainer.10.03.planned');
  expect((await reflow(page)).horizontalScroll).toBe(false);
});

test('renderer: a control disabled by a result hands focus on (hydrolysis reveal → result text), never to <body>', async ({page}) => {
  await open(page, '/practice/practice.experiment.9.14');
  const s = state();
  const card = page.locator('.kl-practice-workspace');
  await tabTo(page, card.locator('[data-salt]').first(), s, {group: true});
  const target = card.locator('[data-salt="AlCl3"]');
  for (let i = 0; i < 6 && !(await target.isChecked()); i += 1) { await page.keyboard.press(i === 0 ? 'Space' : 'ArrowDown'); await page.waitForTimeout(80); }
  await tabTo(page, card.locator('[data-medium]').first(), s, {group: true}); await page.keyboard.press('Space'); await page.waitForTimeout(100);
  await tabTo(page, card.locator('[data-action="add-indicator"]'), s); await page.keyboard.press('Enter');
  await expect(card.locator('[data-action="add-indicator"]')).toBeDisabled();
  const f = await focusFacts(page);
  expect(f.onBody).toBe(false);
  expect(await page.evaluate(() => document.activeElement.className)).toContain('kl-hydro__feedback');
});

test('portal CSS reset: focus ring, native radios, clickable labels, distinguishable done steps and 44 px targets survive', async ({browser}) => {
  const context = await browser.newContext({bypassCSP: true});
  const page = await context.newPage();
  const hostile = '*{margin:0;padding:0;font-family:serif} *:focus{outline:none} a,button,input{outline:0} button{background:#eee;border:0;font-size:12px;min-height:0} label{display:inline} fieldset{border:0} legend{font-size:10px}';
  await open(page, '/practice/practice.simulation.11.16.planned');
  await page.addStyleTag({content: hostile});
  const group = page.getByRole('group', {name: 'Reaksiya tezligiga ta’siri'});
  const s = state();
  await tabTo(page, group.getByRole('radio').first(), s, {group: true});
  expect((await focusFacts(page)).visible).toBe(true);
  await group.getByText('Ortadi', {exact: true}).click();                       // the label is clickable
  await expect(group.getByRole('radio', {name: 'Ortadi', exact: true})).toBeChecked();
  const option = await group.locator('label').first().boundingBox();
  expect(option.height).toBeGreaterThanOrEqual(44);
  await tabTo(page, group.locator('xpath=ancestor::form').getByRole('button'), s);
  expect((await focusFacts(page)).visible).toBe(true);
  await open(page, '/practice/practice.experiment.10.1');
  await page.addStyleTag({content: hostile});
  const first = page.locator('.kl-experiment-step button').first();
  await tabTo(page, first, s); await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-disabled', 'true');
  await expect(first).toContainText('Bajarildi');                                 // done = text, not colour
  expect([...s.issues]).toEqual([]);
  await context.close();
});

test('assessment UI (production pack): the pending notice is a note and the reflection fallback is labelled and keyboard-reachable', async ({page}) => {
  await hosts.portal.open(page, '/learn/lu.9.15/quiz');
  await expect(page.getByRole('note')).toBeVisible();
  const fields = page.locator('.kl-reinforcement-form textarea');
  await expect(fields.first()).toBeVisible();
  const unnamed = await fields.evaluateAll((xs) => xs.filter((x) => !(x.labels?.length || x.getAttribute('aria-label') || x.getAttribute('aria-labelledby'))).length);
  expect(unnamed).toBe(0);
  const s = state();
  await tabTo(page, fields.first(), s);
  expect((await focusFacts(page)).onBody).toBe(false);
});

test('assessment UI (objective quiz, review-approved fixture pack): grouped options, keyboard answers, result announced as text', async ({page}) => {
  // the objective quiz is reachable only for approved items (lu.9.15 is review-pending in the real pack); the same
  // fixture technique as assessment-runtime.spec.mjs marks the items approved in a resealed COPY of the pack
  const dist = await resealContentPack(cloneDist(), (packDir) => {
    const file = path.join(packDir, 'assessment', 'prompts.json');
    const prompts = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const item of prompts.items) item.review = {chemistry: 'approved', didactic: 'approved'};
    fs.writeFileSync(file, `${JSON.stringify(prompts, null, 2)}\n`);
  });
  const server = await startServer({publicRoot: dist});
  try {
    await page.goto(`${server.url}/learn/lu.9.15/quiz`);
    const questions = page.locator('fieldset.kl-quiz-question');
    await expect(questions.first()).toBeVisible();
    const n = await questions.count();
    const s = state();
    for (let i = 0; i < n; i += 1) {
      await expect(questions.nth(i).locator('legend')).not.toHaveText('');
      await tabTo(page, questions.nth(i).locator('input[type=radio]').first(), s, {group: true});
      await page.keyboard.press('Space');
      await page.waitForTimeout(250);   // the focus ring transitions in (.2s) — measure it once drawn
      expect((await focusFacts(page)).visible, `question ${i + 1}: focus visible`).toBe(true);
    }
    await tabTo(page, page.getByRole('button', {name: 'Javoblarni tekshirish'}), s);
    await page.keyboard.press('Enter');
    await expect(page.locator('.kl-feedback[role="status"]')).toContainText(/Natija: \d+\/\d+/);
  } finally { await server.close(); }
});

test('learning-cycle navigation: named landmark, current stage announced with aria-current, reachable by keyboard', async ({page}) => {
  await hosts.portal.open(page, '/learn/lu.7.12/practice');
  const nav = page.getByRole('navigation', {name: 'Mavzuni o‘rganish bosqichlari'});
  await expect(nav).toBeVisible();
  await expect(nav.locator('[aria-current="step"]')).toHaveCount(1);
  await expect(nav.locator('[aria-current="step"]')).toContainText('Amaliyot');
  const s = state();
  await tabTo(page, nav.getByRole('link').first(), s);
  await page.waitForTimeout(250);   // .kl-cycle-step transitions every property (.2s): measure the drawn ring
  expect((await focusFacts(page)).visible).toBe(true);
});
