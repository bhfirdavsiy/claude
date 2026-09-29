// P1.0 — the real practice page, in real Chromium + IndexedDB, goes through the canonical orchestrator.
import {test, expect} from '@playwright/test';
import {buildDist, startServer} from '../helpers/dist.mjs';

let server;
test.beforeAll(async () => { server = await startServer({publicRoot: buildDist()}); });
test.afterAll(async () => { await server?.close(); });

async function attempts(page) {
  return page.evaluate(async () => {
    const {IndexedDbProgressStore} = await import('/app-preview/runtime/progress/indexeddb-store.js');
    const store = new IndexedDbProgressStore(indexedDB, 'kimyolab-runtime');
    return {attempts: await store.listAttempts(), evidence: (await store.listEvidence()).length, progress: await store.listProgress()};
  });
}

test('several answers on one practice page = one attempt; leaving an unfinished page abandons it', async ({page}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/practice/practice.trainer.7.4`);
  const answer = page.locator('input[name="answer"]');
  await expect(answer).toBeVisible();
  for (const value of ['AlO', 'Al3O2', 'AlO2']) {
    await answer.fill(value);
    await answer.press('Enter');
    await expect(page.locator('.kl-feedback').first()).not.toHaveText('');
  }
  await expect.poll(async () => (await attempts(page)).attempts.length).toBe(1);
  const before = await attempts(page);
  expect(before.attempts[0].status).toBe('in_progress');
  expect(before.evidence).toBe(3);
  expect(before.progress[0].status).toBe('in_progress');

  await page.locator('a[href="/"]').first().click();
  await expect.poll(async () => (await attempts(page)).attempts[0].status).toBe('abandoned');
  expect(errors).toEqual([]);
});

test('a correct answer completes the attempt and the unit practice achievement', async ({page}) => {
  await page.goto(`${server.url}/practice/practice.trainer.7.4`);
  const answer = page.locator('input[name="answer"]');
  await answer.fill('Al2O3');
  await answer.press('Enter');
  await expect.poll(async () => (await attempts(page)).attempts.map((a) => a.status)).toEqual(['completed']);
  const state = await attempts(page);
  expect(state.progress[0].status).toBe('practice_complete');
});
