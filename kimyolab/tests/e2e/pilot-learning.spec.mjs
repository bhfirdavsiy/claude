// P1.2 — the pilot learning loop in real Chromium + IndexedDB: readiness, fallback, assessment and the
// learner-facing mastery UX, each checked against the canonical stored state.
import fs from 'node:fs';
import path from 'node:path';
import {test, expect} from '@playwright/test';
import {buildDist, cloneDist, resealContentPack, startServer} from '../helpers/dist.mjs';

const RAW_CODE = /\b[A-Z][A-Z0-9]+(_[A-Z0-9]+)+\b/;
let server; let approvedServer;

test.beforeAll(async () => {
  server = await startServer({publicRoot: buildDist()});
  // A re-sealed CLONE in which lu.9.15's items are approved (as a human review would make them). The committed
  // content keeps them pending — nothing is approved in the repository.
  const dist = await resealContentPack(cloneDist(), (packDir) => {
    const promptsFile = path.join(packDir, 'assessment', 'prompts.json');
    const prompts = JSON.parse(fs.readFileSync(promptsFile, 'utf8'));
    for (const item of prompts.items) item.review = {chemistry: 'approved', didactic: 'approved'};
    fs.writeFileSync(promptsFile, `${JSON.stringify(prompts, null, 2)}\n`);
    const readinessFile = path.join(packDir, 'activity-readiness.json');
    const readiness = JSON.parse(fs.readFileSync(readinessFile, 'utf8'));
    for (const unit of readiness.units) if (unit.learningUnitId === 'lu.9.15') unit.assessment = {status: 'AVAILABLE', reasons: []};
    // strict enforcement for one pending activity, to prove the URL cannot bypass the gate
    const pending = readiness.activities.find((a) => a.runtime === 'PENDING');
    pending.enforcement = 'strict';
    readiness.strictPendingForTest = pending.activityId;
    fs.writeFileSync(readinessFile, `${JSON.stringify(readiness, null, 2)}\n`);
  });
  approvedServer = await startServer({publicRoot: dist});
});
test.afterAll(async () => { await server?.close(); await approvedServer?.close(); });

const store = (page) => page.evaluate(async () => {
  const {IndexedDbProgressStore} = await import('/app-preview/runtime/progress/indexeddb-store.js');
  const s = new IndexedDbProgressStore(indexedDB, 'kimyolab-runtime');
  return {attempts: await s.listAttempts(), evidence: await s.listEvidence(), progress: await s.listProgress(), mastery: await s.exportSnapshot().then((x) => x.mastery)};
});

async function reflect(page) {
  for (const name of ['conceptReflection', 'practiceReflection', 'connectionReflection']) await page.locator(`textarea[name="${name}"]`).fill('Tushunchani o‘z so‘zlarim bilan izohladim.');
  await page.locator('input[name="confidence"][value="partial"]').check();
  await page.getByRole('button', {name: /Mustahkamlashni (yakunlash|yangilash)/}).click();
  await expect(page.locator('.kl-feedback').last()).toContainText('Mustahkamlash saqlandi');
}

test('pilot LU end-to-end: theory → practice → reflection → mastery → progress page, consistent with stored state', async ({page}) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/learn/lu.7.11/guide`);
  await page.getByRole('button', {name: 'Nazariyani yakunlash va amaliyotga o‘tish'}).click();
  await expect(page).toHaveURL(/\/learn\/lu\.7\.11\/practice/);
  await page.getByRole('link', {name: 'Faoliyatni boshlash'}).first().click();
  const answer = page.locator('input[name="answer"]');
  await answer.fill('Al2O3'); await answer.press('Enter');
  await expect.poll(async () => (await store(page)).attempts.map((a) => a.status)).toEqual(['completed']);
  await page.goto(`${server.url}/learn/lu.7.11/quiz`);
  await expect(page.locator('fieldset.kl-quiz-question')).toHaveCount(0);   // no objective items for this unit
  await reflect(page);
  // mastery panel on the stage-3 page (pilot) — refreshed after the submission
  const panel = page.locator('[data-mastery-band]').first();
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-mastery-band', 'DEVELOPING');
  await expect(panel).toContainText('O‘zlashtirish: Rivojlanmoqda');
  await expect(panel.locator('summary')).toHaveText('Nega?');

  await page.goto(`${server.url}/progress`);
  const card = page.locator('.kl-progress-card', {hasText: 'Kimyoviy formula va valentlik'});
  await expect(card.locator('.kl-progress-card__lesson')).toHaveText('Dars: Mustahkamlash bajarildi');
  const mastery = card.locator('[data-mastery-band]');
  await expect(mastery).toHaveAttribute('data-mastery-band', 'DEVELOPING');
  // accessible: text label + shape icon + ARIA + keyboard disclosure
  await expect(mastery.locator('[role="status"]')).toHaveAttribute('aria-label', 'O‘zlashtirish holati: rivojlanmoqda');
  await expect(mastery.locator('.kl-mastery__icon')).toHaveText('◐');
  await mastery.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(mastery.locator('details')).toHaveAttribute('open', '');
  await expect(mastery.locator('li').filter({hasText: 'test'}).first()).toBeVisible();
  // P1.2 closeout copy audit: without an assessment the learner is told mastery cannot be confirmed yet
  await expect(mastery.locator('li').filter({hasText: 'baholash (test) hali mavjud emas'})).toHaveCount(1);
  await expect(card).not.toContainText('O‘zlashtirilgan');
  const text = await card.innerText();
  expect(text).not.toMatch(/%|\d+[.,]\d+/);
  expect(text).not.toMatch(RAW_CODE);

  // canonical state behind the DOM
  const state = await store(page);
  expect(state.attempts.filter((a) => a.attemptType === 'assessment')).toEqual([]);
  expect(state.evidence.length).toBeGreaterThan(0);
  expect(state.evidence.every((e) => e.evidenceClass !== 'concept-assessment')).toBe(true);
  expect(state.mastery.length).toBeGreaterThan(0);
  expect(state.mastery.some((m) => m.status === 'mastered')).toBe(false);
  expect(errors).toEqual([]);
});

test('pending assessment (committed content): no objective test, reflection fallback with a plain-language notice, 0 assessment evidence', async ({page}) => {
  await page.goto(`${server.url}/learn/lu.9.15/quiz`);
  await expect(page.locator('fieldset.kl-quiz-question')).toHaveCount(0);
  const notice = page.locator('[data-quiz-state="pending"]');
  await expect(notice).toHaveText('Savollar mutaxassislar tekshiruvidan o‘tmoqda. Hozircha mulohaza yozing.');
  await reflect(page);
  const state = await store(page);
  expect(state.evidence.filter((e) => e.evidenceClass === 'concept-assessment')).toEqual([]);
  expect(state.attempts).toEqual([]);
  expect(await page.content()).not.toMatch(/ASSESSMENT_REVIEW_PENDING|CHEMISTRY_REVIEW_REQUIRED|correctOptionId/);
});

test('approved assessment (re-sealed fixture): test visible, no key in DOM, submit → attempt + evidence + mastery UX updated', async ({page}) => {
  await page.goto(`${approvedServer.url}/learn/lu.9.15/quiz`);
  const questions = page.locator('fieldset.kl-quiz-question');
  await expect(questions).toHaveCount(5);
  expect(await page.content()).not.toMatch(/correctOptionId|scoringRule/);
  const panel = page.locator('[data-mastery-band]').first();
  await expect(panel).toHaveAttribute('data-mastery-band', 'NOT_STARTED');
  for (const q of await questions.all()) await q.locator('input[type=radio]').first().check();
  await page.getByRole('button', {name: 'Javoblarni tekshirish'}).click();
  await expect(page.locator('.kl-feedback')).toContainText('Natija:');
  await expect(panel).not.toHaveAttribute('data-mastery-band', 'NOT_STARTED');
  const band = await panel.getAttribute('data-mastery-band');
  expect(['DEVELOPING', 'NEEDS_REVIEW']).toContain(band);   // one assessment + no practice can never be "mastered"
  const state = await store(page);
  expect(state.attempts.map((a) => [a.attemptType, a.status])).toEqual([['assessment', 'completed']]);
  expect(state.evidence.every((e) => e.evidenceClass === 'concept-assessment')).toBe(true);
  expect(state.mastery.length).toBeGreaterThan(0);
  const bandFromState = state.mastery.some((m) => m.status === 'needs_review') ? 'NEEDS_REVIEW' : 'DEVELOPING';
  expect(band).toBe(bandFromState);
  expect(await page.content()).not.toMatch(/correctOptionId|scoringRule/);
});

test('refused activities cannot be opened by URL and the learner sees a sentence, not a code', async ({page}) => {
  await page.goto(`${server.url}/practice/practice.simulation.10.4`);      // DISABLED (no route)
  await expect(page.locator('main')).toContainText('Bu faoliyat hozircha mavjud emas.');
  await expect(page.locator('input[name="answer"], .kl-practice-controls')).toHaveCount(0);
  expect(await page.locator('main').innerText()).not.toMatch(RAW_CODE);
  const readiness = await (await fetch(`${approvedServer.url}/content/2026.09.1/activity-readiness.json`)).json();
  await page.goto(`${approvedServer.url}/practice/${readiness.strictPendingForTest}`);   // PENDING under strict enforcement
  await expect(page.locator('main')).toContainText('Bu faoliyat hali tayyorlanmoqda. Tez orada ochiladi.');
  expect(await page.locator('main').innerText()).not.toMatch(RAW_CODE);
});
