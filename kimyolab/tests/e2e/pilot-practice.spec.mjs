// P1.3 — the primary practice of every pilot unit in real Chromium + IndexedDB, via the learner's own
// controls: the attempt completes, the lesson records the practice, and the progress page shows lesson and
// mastery as separate indicators — never "mastered" without an approved assessment.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test, expect} from '@playwright/test';
import {buildDist, startServer} from '../helpers/dist.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const units = JSON.parse(fs.readFileSync(path.join(root, 'content-src/learning-units.json'), 'utf8'));
const title = (id) => units.find((u) => u.id === id).title;
const RAW_CODE = /\b[A-Z][A-Z0-9]+(_[A-Z0-9]+)+\b/;
let server;
test.beforeAll(async () => { server = await startServer({publicRoot: buildDist()}); });
test.afterAll(async () => { await server?.close(); });

const store = (page) => page.evaluate(async () => {
  const {IndexedDbProgressStore} = await import('/app-preview/runtime/progress/indexeddb-store.js');
  const s = new IndexedDbProgressStore(indexedDB, 'kimyolab-runtime');
  return {attempts: await s.listAttempts(), evidence: await s.listEvidence(), progress: await s.listProgress(), mastery: await s.exportSnapshot().then((x) => x.mastery)};
});

const PILOT_PRACTICES = [
  {
    learningUnitId: 'lu.7.12', activityId: 'practice.calculation.7.5',
    solve: async (page) => {
      // H2SO4: 2·1, 1·32, 4·16, Mr = 98 — typed into each step form
      // P2.1: the step fields were labelled with their raw ids ("h contribution"); they now carry the localized labels
      // of the learner-interaction catalog (step.<id>) — same fields, same values, readable names
      for (const [label, value] of [['Vodorod hissasi', '2'], ['Oltingugurt hissasi', '32'], ['Kislorod hissasi', '64'], ['Jami (Mr)', '98']]) {
        const input = page.getByLabel(label, {exact: true});
        await input.fill(value); await input.press('Enter');
        await expect(page.locator('.kl-feedback').first()).not.toHaveText('');
      }
    },
  },
  {
    learningUnitId: 'lu.7.07', activityId: 'practice.simulation.7.07.planned',
    solve: async (page) => {
      // C-14: 6 protons, 8 neutrons, 6 electrons — with the keyboard, one particle at a time
      // (P1.4: the atom is drawn by the RendererRegistry's atom-builder renderer)
      for (const [particle, n] of [['proton', 6], ['neytron', 8], ['elektron', 6]]) {
        const button = page.getByRole('button', {name: `Bitta ${particle} qo‘shish`});
        for (let i = 0; i < n; i += 1) { await button.focus(); await page.keyboard.press('Enter'); }
      }
      await expect(page.locator('.kl-atom__state [data-field="isotope"]')).toHaveText('Uglerod-14');
    },
  },
  {
    learningUnitId: 'lu.9.15', activityId: 'practice.experiment.9.10',
    solve: async (page) => {
      const steps = page.locator('.kl-experiment-step');
      await expect(steps).toHaveCount(3);
      for (let i = 0; i < 3; i += 1) {
        await steps.nth(i).getByRole('button', {name: 'Bajarish'}).click();
        await expect(steps.nth(i).getByRole('button')).toHaveText('Bajarildi');
      }
    },
  },
];

for (const pilot of PILOT_PRACTICES) {
  test(`pilot ${pilot.learningUnitId}: /learn/${pilot.learningUnitId}/practice → ${pilot.activityId} completes; progress shows lesson and mastery separately`, async ({page}) => {
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${server.url}/learn/${pilot.learningUnitId}/practice`);
    await page.getByRole('link', {name: 'Faoliyatni boshlash'}).first().click();
    await expect(page).toHaveURL(new RegExp(`/practice/${pilot.activityId.replaceAll('.', '\\.')}(\\?|$)`));
    await pilot.solve(page);
    await expect(page.getByRole('link', {name: 'Mustahkamlashga o‘tish'})).toBeVisible();
    await expect.poll(async () => (await store(page)).attempts.map((a) => [a.activityId, a.status])).toEqual([[pilot.activityId, 'completed']]);
    const state = await store(page);
    expect(state.progress.find((p) => p.learningUnitId === pilot.learningUnitId).status).toBe('practice_complete');
    expect(state.evidence.length).toBeGreaterThan(0);
    expect(state.evidence.every((e) => e.evidenceClass !== 'concept-assessment')).toBe(true);
    expect(state.mastery.some((m) => m.status === 'mastered')).toBe(false);

    await page.goto(`${server.url}/progress`);
    const card = page.locator('.kl-progress-card', {hasText: title(pilot.learningUnitId)});
    await expect(card.locator('.kl-progress-card__lesson')).toHaveText('Dars: Amaliyot bajarildi');
    const mastery = card.locator('[data-mastery-band]');
    await expect(mastery).toHaveAttribute('data-mastery-band', 'DEVELOPING');
    await expect(mastery.locator('[role="status"]')).toHaveAttribute('aria-label', 'O‘zlashtirish holati: rivojlanmoqda');
    const text = await card.innerText();
    expect(text).not.toContain('O‘zlashtirilgan');
    expect(text).not.toMatch(/%|\d+[.,]\d+/);
    expect(text).not.toMatch(RAW_CODE);
    expect(errors).toEqual([]);
  });
}
