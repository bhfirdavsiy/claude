// P1.1 — objective assessment in real Chromium + IndexedDB. The pack is a re-sealed clone in which the pilot
// items of lu.9.15 are approved (the committed content keeps them pending, so production shows reflection).
import fs from 'node:fs';
import path from 'node:path';
import {test, expect} from '@playwright/test';
import {cloneDist, resealContentPack, startServer} from '../helpers/dist.mjs';

let server;
test.beforeAll(async () => {
  const dist = await resealContentPack(cloneDist(), (packDir) => {
    const file = path.join(packDir, 'assessment', 'prompts.json');
    const prompts = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const item of prompts.items) item.review = {chemistry: 'approved', didactic: 'approved'};
    fs.writeFileSync(file, `${JSON.stringify(prompts, null, 2)}\n`);
  });
  server = await startServer({publicRoot: dist});
});
test.afterAll(async () => { await server?.close(); });

// globals the app added (vs. a pristine window) must not hold key material
const keyInGlobals = (page) => page.evaluate(() => {
  const frame = document.createElement('iframe'); document.body.append(frame);
  const pristine = new Set(Object.keys(frame.contentWindow)); frame.remove();
  const added = Object.keys(window).filter((k) => !pristine.has(k));
  let dump = ''; for (const k of added) { try { dump += JSON.stringify(window[k]) ?? ''; } catch { /* non-serialisable */ } }
  return {added, leaks: /correctOptionId|scoringRule/.test(dump + document.documentElement.outerHTML)};
});

const store = (page) => page.evaluate(async () => {
  const {IndexedDbProgressStore} = await import('/app-preview/runtime/progress/indexeddb-store.js');
  const s = new IndexedDbProgressStore(indexedDB, 'kimyolab-runtime');
  return {attempts: await s.listAttempts(), evidence: await s.listEvidence(), progress: await s.listProgress()};
});

test('the rendered quiz exposes no answer key (DOM, globals, page-load network) and submission goes through the evaluator', async ({page}) => {
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/learn/lu.9.15/quiz`);
  const questions = page.locator('fieldset.kl-quiz-question');
  await expect(questions).toHaveCount(5);

  // UI confidentiality: nothing about the key in the DOM, in window globals, or in what the page loaded
  const html = await page.content();
  expect(html).not.toMatch(/correctOptionId|scoringRule|data-correct/);
  const appGlobals = await keyInGlobals(page);
  expect(appGlobals.leaks).toBe(false);
  expect(appGlobals.added.filter((k) => /key|answer|assessment/i.test(k))).toEqual([]);
  expect(requests.some((u) => u.endsWith('/assessment/keys.json'))).toBe(false);

  // answer: first option everywhere (some right, some wrong — the UI does not know which)
  for (const q of await questions.all()) await q.locator('input[type=radio]').first().check();
  await page.getByRole('button', {name: 'Javoblarni tekshirish'}).click();
  await expect(page.locator('.kl-feedback')).toContainText('Natija:');
  expect(requests.some((u) => u.endsWith('/assessment/keys.json'))).toBe(true);

  const state = await store(page);
  expect(state.attempts.map((a) => [a.attemptType, a.status])).toEqual([['assessment', 'completed']]);
  expect(state.evidence.length).toBeGreaterThan(0);
  expect(state.evidence.every((e) => e.evidenceClass === 'concept-assessment' && e.attemptId === state.attempts[0].id)).toBe(true);
  expect(state.evidence.some((e) => e.correct === false)).toBe(true);
  expect(JSON.parse(state.progress[0].activityStates['cycle.assessment']).complete).toBe(true);
  // results are marked per item without ever revealing which option was right
  expect(await page.locator('fieldset[data-result]').count()).toBe(5);
  expect(await page.content()).not.toMatch(/correctOptionId/);
  // after submission the key pack was fetched for evaluation — it still did not land in globals or the DOM
  expect((await keyInGlobals(page)).leaks).toBe(false);

  // a second submission on the same page is a retry: a NEW attempt, the first one is untouched
  const first = state.attempts[0];
  await page.getByRole('button', {name: 'Javoblarni tekshirish'}).click();
  await expect.poll(async () => (await store(page)).attempts.length).toBe(2);
  const after = await store(page);
  expect(after.attempts.find((a) => a.id === first.id)).toEqual(first);
  expect(errors).toEqual([]);
});

// P1.2: C1 is enabled for the pilot (lu.9.15 is a pilot unit). The previous invariant ("no mastery on the
// progress page") was a P1.1 deferral, not a product rule. What must hold now: the lesson indicator and the
// mastery indicator are separate, mastery is a band (never a number), and one assessment alone is never "mastered".
test('progress page shows lesson and mastery separately after assessment; mastery is a band, never "mastered" from one test', async ({page}) => {
  await page.goto(`${server.url}/learn/lu.9.15/quiz`);
  const questions = page.locator('fieldset.kl-quiz-question');
  await expect(questions).toHaveCount(5);
  for (const q of await questions.all()) await q.locator('input[type=radio]').first().check();
  await page.getByRole('button', {name: 'Javoblarni tekshirish'}).click();
  await expect(page.locator('.kl-feedback')).toContainText('Natija:');
  await page.goto(`${server.url}/progress`);
  const card = page.locator('.kl-progress-card').first();
  await expect(card.locator('.kl-progress-card__lesson')).toHaveText('Dars: Test topshirildi');
  const mastery = card.locator('[data-mastery-band]');
  await expect(mastery).toBeVisible();
  expect(await mastery.getAttribute('data-mastery-band')).not.toBe('MASTERED');
  await expect(page.locator('main')).not.toContainText('O‘zlashtirilgan');
  expect(await card.innerText()).not.toMatch(/%|\d+[.,]\d+/);
});
