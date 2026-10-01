// P2.3 — structured theory in real Chromium. MINIMAL legacy theory keeps rendering; a STRUCTURED entry (a TEST
// FIXTURE with self-describing, non-chemistry text, injected into a CLONED dist and re-sealed so pack integrity still
// holds) renders through the structured renderer under the portal mount: heading hierarchy, landmarks, text labels,
// keyboard, phone width, 320 px reflow, reduced motion. The shipped pack contains no structured theory.
import fs from 'node:fs';
import path from 'node:path';
import {test, expect} from '@playwright/test';
import {buildDist, cloneDist, resealContentPack, startServer} from '../helpers/dist.mjs';
import {structuredFixture, FIXTURE_SOURCE} from '../fixtures/structured-theory.fixture.mjs';

const BASE = '/kimyolab/';
let plain; let fixture;
test.beforeAll(async () => {
  plain = await startServer({publicRoot: buildDist({basePath: BASE}), basePath: BASE});
  const dist = cloneDist(buildDist({basePath: BASE}));
  const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content-src/source-registry.json'), 'utf8'));
  const source = registry.sources.find((s) => s.id === FIXTURE_SOURCE);
  await resealContentPack(dist, (packDir) => {
    fs.writeFileSync(path.join(packDir, 'theory-structured.json'), `${JSON.stringify({schema: 'kimyolab.structured-theory-pack.v1', entries: [structuredFixture()], sources: [{id: source.id, category: source.category, title: source.title}]}, null, 2)}\n`);
  });
  fixture = await startServer({publicRoot: dist, basePath: BASE});
});
test.afterAll(async () => { await plain?.close(); await fixture?.close(); });

test('MINIMAL legacy theory still renders (every real unit today)', async ({page}) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${plain.url}${BASE}learn/lu.9.06/guide`);
  const theory = page.locator('[data-theory-depth="MINIMAL"]');
  await expect(theory).toBeVisible();
  await expect(theory.locator('p').first()).not.toHaveText('');
  await expect(page.locator('[data-theory-depth="STRUCTURED"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('STRUCTURED theory: semantic sections, heading order, text labels, sources, review note', async ({page}) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto(`${fixture.url}${BASE}learn/lu.9.06/guide`);
  const theory = page.locator('[data-theory-depth="STRUCTURED"]');
  await expect(theory).toBeVisible();
  // heading hierarchy: the stage h2, then one h3 per section, h4 per example
  expect(await page.locator('main h1, main h2, main h3, main h4').evaluateAll((hs) => hs.map((h) => h.tagName).join(','))).toMatch(/H1.*H2,H3,H3,H4,H3,H3,H3/);
  for (const name of ['Tushuntirish', 'Ishlangan misollar', 'Keng tarqalgan xato tushunchalar', 'Xulosa', 'Manbalar']) {
    await expect(page.getByRole('region', {name})).toBeVisible();          // labelled landmark per section
  }
  const f = structuredFixture();
  await expect(page.getByRole('region', {name: 'Tushuntirish'})).toContainText(f.explanation.text.split('\n\n')[0]);
  const example = page.getByRole('group', {name: '1-misol'});
  await expect(example.locator('ol li')).toHaveText(f.workedExamples[0].solutionSteps);
  await expect(example).toContainText(`Javob: ${f.workedExamples[0].answer}`);
  const mis = page.getByRole('region', {name: 'Keng tarqalgan xato tushunchalar'});
  await expect(mis).toContainText(`Xato fikr: ${f.misconceptions[0].statement}`);     // meaning in text, not colour
  await expect(mis).toContainText(`To‘g‘risi: ${f.misconceptions[0].correction}`);
  await expect(page.getByRole('region', {name: 'Xulosa'}).locator('li')).toHaveText(f.summary.points);
  await expect(page.getByRole('region', {name: 'Manbalar'})).toContainText('Grade 9 curriculum');
  await expect(page.getByRole('note')).toHaveText('Bu nazariya mutaxassislar tekshiruvida.');   // not approved → said so
  expect(await theory.evaluate((el) => el.getAnimations({subtree: true}).length)).toBe(0);
  expect(errors).toEqual([]);
});

test('STRUCTURED theory: keyboard reaches the next step after the content; reflows at 320 px and on a phone', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 320, height: 640}});
  const page = await context.newPage();
  await page.goto(`${fixture.url}${BASE}learn/lu.9.06/guide`);
  await expect(page.locator('[data-theory-depth="STRUCTURED"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const next = page.getByRole('button', {name: /Nazariyani yakunlash/});
  for (let i = 0; i < 80 && !(await next.evaluate((el) => el === document.activeElement)); i += 1) await page.keyboard.press('Tab');
  await expect(next).toBeFocused();
  await context.close();
  const phone = await browser.newContext({viewport: {width: 375, height: 740}, isMobile: true, hasTouch: true});
  const p2 = await phone.newPage();
  await p2.goto(`${fixture.url}${BASE}learn/lu.9.06/guide`);
  await expect(p2.getByRole('region', {name: 'Xulosa'})).toBeVisible();
  expect(await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await phone.close();
});

test('a malformed structured entry in the pack is not rendered as STRUCTURED (fail closed to MINIMAL)', async ({page}) => {
  const dist = cloneDist(buildDist({basePath: BASE}));
  await resealContentPack(dist, (packDir) => {
    fs.writeFileSync(path.join(packDir, 'theory-structured.json'), `${JSON.stringify({schema: 'kimyolab.structured-theory-pack.v1', entries: [structuredFixture({misconceptions: []})], sources: []}, null, 2)}\n`);
  });
  const server = await startServer({publicRoot: dist, basePath: BASE});
  try {
    await page.goto(`${server.url}${BASE}learn/lu.9.06/guide`);
    await expect(page.locator('[data-theory-depth="MINIMAL"]')).toBeVisible();
    await expect(page.locator('[data-theory-depth="STRUCTURED"]')).toHaveCount(0);
  } finally { await server.close(); }
});
