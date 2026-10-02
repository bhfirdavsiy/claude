// P2.9 — learner feedback semantics through the REAL learner path in real Chromium, on BOTH hosts (portal /kimyolab/
// and the standalone file): the same category, the same text and the same completion on each.
//   form simulation 7.02 (target-only): empty → alert; non-target → VALID_INTERMEDIATE (no ✓/✗, no progress);
//                                       retry → target → CORRECT + next stage
//   ordered experiment 7.6 (declared dependencies): early step → PROCEDURE_BLOCKED, step stays open; retry in order →
//                                       completion
//   order-free experiment 10.3: any order accepted, the current-step marker never sits on a finished step
//   quiz / reflection: localized role=alert, aria-invalid, focus — never the browser's own popup
import fs from 'node:fs';
import path from 'node:path';
import {test, expect} from '@playwright/test';
import {cloneDist, resealContentPack, startServer} from '../helpers/dist.mjs';
import {startHosts} from './host-scenarios.mjs';

const WS = '.kl-practice-workspace';
const feedback = (page) => page.locator(`${WS} .kl-feedback[role=status]`);
let hosts;
test.beforeAll(async () => { hosts = await startHosts(); });
test.afterAll(async () => { await hosts?.close(); });

async function apply(page, formIndex, value) {
  const form = page.locator(`${WS} form.kl-simulation-control`).nth(formIndex);
  await form.locator('input').fill(value); await form.locator('button[type=submit]').click();
}

for (const name of ['portal', 'standalone']) {
  test(`${name}: target-only simulation 7.02 — empty, non-target (no verdict), retry, target, completion`, async ({page}) => {
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await hosts[name].open(page, '/practice/practice.simulation.7.02.planned');
    await expect(page.locator(`${WS} [data-feedback-semantics="target-only"]`)).toContainText('faqat maqsad holatini');
    // empty
    await page.locator(`${WS} form.kl-simulation-control`).first().locator('button[type=submit]').click();
    await expect(page.locator(`${WS} form.kl-simulation-control`).first().locator('[role=alert]')).toHaveText('Javobni kiriting.');
    // non-target: recorded, explicitly not judged, no next stage
    await apply(page, 0, 'mass');
    await expect(feedback(page)).toHaveAttribute('data-feedback', 'VALID_INTERMEDIATE');
    await expect(feedback(page)).toHaveAttribute('data-verdict', 'none');
    await expect(feedback(page)).not.toContainText(/✓|✗|to‘g‘ri/i);
    await expect(page.getByRole('link', {name: 'Mustahkamlashga o‘tish'})).toHaveCount(0);
    // retry in the same attempt → the target state
    await apply(page, 0, 'density'); await apply(page, 1, 'physical');
    await expect(feedback(page)).toHaveAttribute('data-feedback', 'CORRECT');
    await expect(feedback(page)).toContainText('✓');
    await expect(page.getByRole('link', {name: 'Mustahkamlashga o‘tish'})).toBeVisible();
    expect(errors).toEqual([]);
  });

  test(`${name}: ordered experiment 7.6 — early step blocked (not "wrong"), retry in order, completion`, async ({page}) => {
    await hosts[name].open(page, '/practice/practice.experiment.7.6');
    const buttons = page.locator(`${WS} .kl-experiment-step button`);
    await expect(buttons).toHaveCount(3);
    await buttons.nth(1).click();
    await expect(feedback(page)).toHaveAttribute('data-feedback', 'PROCEDURE_BLOCKED');
    await expect(page.locator(`${WS} .kl-experiment-panel [role=alert]`)).toHaveText('Bu qadam hali ochilmagan: avval undan oldingi qadamni bajaring.');
    await expect(buttons.nth(1)).not.toHaveAttribute('aria-disabled', 'true');   // the step stays open
    for (const i of [0, 1, 2]) { await buttons.nth(i).click(); await expect(buttons.nth(i)).toHaveAttribute('aria-disabled', 'true'); }
    await expect(feedback(page)).toHaveAttribute('data-feedback', 'CORRECT');
    await expect(page.getByRole('link', {name: 'Mustahkamlashga o‘tish'})).toBeVisible();
  });

  test(`${name}: order-free experiment 10.3 — any order accepted, current-step marker on the first open step`, async ({page}) => {
    await hosts[name].open(page, '/practice/practice.experiment.10.3');
    const rows = page.locator(`${WS} .kl-experiment-step`);
    await expect(rows.first()).toBeVisible();
    const n = await rows.count();
    await rows.nth(n - 1).locator('button').click();
    await expect(rows.nth(n - 1).locator('button')).toHaveAttribute('aria-disabled', 'true');
    await expect(feedback(page)).toHaveAttribute('data-feedback', 'VALID_INTERMEDIATE');
    await expect(rows.nth(0)).toHaveAttribute('aria-current', 'step');
    await expect(rows.nth(n - 1)).not.toHaveAttribute('aria-current', 'step');
    for (let i = 0; i < n - 1; i += 1) { await rows.nth(i).locator('button').click(); await expect(rows.nth(i).locator('button')).toHaveAttribute('aria-disabled', 'true'); }
    await expect(feedback(page)).toHaveAttribute('data-feedback', 'CORRECT');
    await expect(page.locator(`${WS} [aria-current=step]`)).toHaveCount(0);
  });
}

test.describe('quiz and reflection validation', () => {
  let server;
  test.beforeAll(async () => {
    // the same re-sealed CLONE as the pilot spec: lu.9.15's items approved only in the copy, never in the repository
    const dist = await resealContentPack(cloneDist(), (packDir) => {
      const promptsFile = path.join(packDir, 'assessment', 'prompts.json');
      const prompts = JSON.parse(fs.readFileSync(promptsFile, 'utf8'));
      for (const item of prompts.items) item.review = {chemistry: 'approved', didactic: 'approved'};
      fs.writeFileSync(promptsFile, `${JSON.stringify(prompts, null, 2)}\n`);
      const readinessFile = path.join(packDir, 'activity-readiness.json');
      const readiness = JSON.parse(fs.readFileSync(readinessFile, 'utf8'));
      for (const unit of readiness.units) if (unit.learningUnitId === 'lu.9.15') unit.assessment = {status: 'AVAILABLE', reasons: []};
      fs.writeFileSync(readinessFile, `${JSON.stringify(readiness, null, 2)}\n`);
    });
    server = await startServer({publicRoot: dist});
  });
  test.afterAll(async () => { await server?.close(); });

  test('quiz: unanswered questions → localized alert listing them, aria-invalid, focus on the first; no browser popup', async ({page}) => {
    let dialogs = 0; page.on('dialog', (d) => { dialogs += 1; void d.dismiss(); });
    await page.goto(`${server.url}/learn/lu.9.15/quiz`);
    const questions = page.locator('fieldset.kl-quiz-question');
    await expect(questions).toHaveCount(5);
    await expect(page.locator('form.kl-reinforcement-form')).toHaveAttribute('novalidate', '');
    await questions.nth(1).locator('input[type=radio]').first().check();
    await page.getByRole('button', {name: 'Javoblarni tekshirish'}).click();
    const alert = page.locator('form.kl-reinforcement-form [role=alert]');
    await expect(alert).toHaveText('Javob berilmagan savollar: 1, 3, 4, 5. Har bir savolga bitta javob tanlang.');
    await expect(questions.nth(0)).toHaveAttribute('aria-invalid', 'true');
    await expect(questions.nth(1)).not.toHaveAttribute('aria-invalid', 'true');
    await expect(questions.nth(0).locator('input[type=radio]').first()).toBeFocused();
    expect(await page.evaluate(() => document.querySelector('form.kl-reinforcement-form').checkValidity())).toBe(false);   // the browser WOULD have objected
    for (const q of await questions.all()) await q.locator('input[type=radio]').first().check();
    await page.getByRole('button', {name: 'Javoblarni tekshirish'}).click();
    await expect(alert).toHaveText('');
    await expect(page.locator('.kl-feedback')).toContainText('Natija:');
    expect(dialogs).toBe(0);
  });

  test('reflection: incomplete parts → localized alert, aria-invalid, focus; complete → saved', async ({page}) => {
    await page.goto(`${server.url}/learn/lu.7.11/quiz`);
    await expect(page.locator('fieldset.kl-quiz-question')).toHaveCount(0);
    await page.locator('textarea[name="conceptReflection"]').fill('Tushunchani o‘z so‘zlarim bilan izohladim.');
    await page.locator('textarea[name="practiceReflection"]').fill('qisqa');
    await page.getByRole('button', {name: /Mustahkamlashni (yakunlash|yangilash)/}).click();
    const alert = page.locator('form.kl-reinforcement-form [role=alert]');
    await expect(alert).toContainText('2. Amaliyot natijasini yozing; 3. Bog‘lanishni tushuntiring; Mavzuni qanchalik tushundingiz?');
    await expect(alert).toContainText('kamida 8 belgidan');
    await expect(page.locator('textarea[name="practiceReflection"]')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('textarea[name="conceptReflection"]')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('textarea[name="practiceReflection"]')).toBeFocused();
    for (const n of ['practiceReflection', 'connectionReflection']) await page.locator(`textarea[name="${n}"]`).fill('Kuzatuvni nazariya bilan bog‘ladim.');
    await page.locator('input[name="confidence"][value="partial"]').check();
    await page.getByRole('button', {name: /Mustahkamlashni (yakunlash|yangilash)/}).click();
    await expect(alert).toHaveText('');
    await expect(page.locator('.kl-feedback').last()).toContainText('Mustahkamlash saqlandi');
  });
});
