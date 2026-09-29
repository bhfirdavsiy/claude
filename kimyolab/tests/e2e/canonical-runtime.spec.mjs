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

// P1.0 closeout §5 — abandonment must not depend on an ideal SPA navigation. Unload handlers cannot
// guarantee an async IndexedDB write, so refresh/close are covered by boot-time recovery (Web Locks
// tell a dead page's attempt from one another tab still owns).
async function answerOnce(page) {
  const answer = page.locator('input[name="answer"]');
  await expect(answer).toBeVisible();
  await answer.fill('AlO');
  await answer.press('Enter');
  await expect(page.locator('.kl-feedback').first()).not.toHaveText('');
  await expect.poll(async () => (await attempts(page)).attempts.filter((a) => a.status === 'in_progress').length).toBe(1);
}
const spaNavigate = (page, url) => page.evaluate((u) => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, url);
const statuses = async (page) => (await attempts(page)).attempts.map((a) => a.status).sort();

test('browser Back and Forward (SPA history) abandon the unfinished attempt; Forward opens a new attempt', async ({page}) => {
  await page.goto(`${server.url}/`);
  await spaNavigate(page, '/practice/practice.trainer.7.4');
  await answerOnce(page);
  await page.goBack();
  await expect.poll(() => statuses(page)).toEqual(['abandoned']);
  await page.goForward();
  await answerOnce(page);
  expect(await statuses(page)).toEqual(['abandoned', 'in_progress']);
  await page.goBack();
  await expect.poll(() => statuses(page)).toEqual(['abandoned', 'abandoned']);
});

test('page refresh: the attempt of the dead page lifetime is recovered as abandoned on the next boot', async ({page}) => {
  await page.goto(`${server.url}/practice/practice.trainer.7.4`);
  await answerOnce(page);
  await page.reload();
  // the reloaded practice page opens a fresh session (lazy: no attempt until the first answer)
  await expect.poll(() => statuses(page)).toEqual(['abandoned']);
});

test('tab close and window close: recovered on next boot; an attempt owned by another open tab is untouched', async ({context}) => {
  const tabA = await context.newPage();
  await tabA.goto(`${server.url}/practice/practice.trainer.7.4`);
  await answerOnce(tabA);
  // another tab boots while A is still open: A's attempt must NOT be abandoned
  const tabB = await context.newPage();
  await tabB.goto(`${server.url}/`);
  await tabB.waitForTimeout(300);
  expect(await statuses(tabB)).toEqual(['in_progress']);
  // tab close
  await tabA.close();
  // window close: a popup window with its own practice attempt
  const [popup] = await Promise.all([tabB.waitForEvent('popup'), tabB.evaluate((u) => window.open(u, '_blank', 'popup'), `${server.url}/practice/practice.trainer.7.4`)]);
  const popupAnswer = popup.locator('input[name="answer"]');
  await expect(popupAnswer).toBeVisible();
  await popupAnswer.fill('AlO');
  await popupAnswer.press('Enter');
  // the popup's own boot already recovered closed tab A's attempt; the popup owns a new one
  await expect.poll(() => statuses(popup)).toEqual(['abandoned', 'in_progress']);
  await popup.close();
  // next boot
  await tabB.reload();
  await expect.poll(() => statuses(tabB)).toEqual(['abandoned', 'abandoned']);
});
