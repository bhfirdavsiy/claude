// P2.2 — the production build mounted under /kimyolab/ (portal simulation). Nothing may assume the product lives at
// `/`: deep links, refresh, back/forward, query strings, content, assets, practice navigation, storage and Web Lock
// namespaces, and a 404 outside the mount. This is readiness under a SIMULATED portal path, not a portal deployment.
import fs from 'node:fs';
import path from 'node:path';
import {test, expect} from '@playwright/test';
import {buildDist, startServer, rawRequest, repoRoot} from '../helpers/dist.mjs';

const BASE = '/kimyolab/';
let server;
test.beforeAll(async () => { server = await startServer({publicRoot: buildDist({basePath: BASE}), basePath: BASE}); });
test.afterAll(async () => { await server?.close(); });

/** Every same-origin request the page makes must stay inside the mount. */
function watchRequests(page) {
  const outside = []; const seen = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (u.origin === server.url) { seen.push(u.pathname); if (!u.pathname.startsWith(BASE)) outside.push(u.pathname); } });
  return {outside, seen};
}

test('/kimyolab/ opens; content pack, CSS, scripts and the approved logo load from inside the mount only', async ({page}) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const req = watchRequests(page);
  await page.goto(`${server.url}${BASE}`);
  await expect(page.locator('#app-main')).toContainText('Kimyo fanini');
  const logo = page.locator('.kl-brand-logo');
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((img) => img.naturalWidth)).toBe(1254);
  expect(await logo.getAttribute('src')).toBe(`${BASE}assets/brand/kimyolab-logo.webp`);
  await page.getByRole('link', {name: 'Mavzu studiyasi'}).first().click();
  await expect(page).toHaveURL(`${server.url}${BASE}curriculum`);
  await expect(page.locator('#app-main')).toContainText('7-sinf');
  expect(req.seen.some((p) => p === `${BASE}content/manifest.json`)).toBe(true);
  expect(req.seen.some((p) => p.startsWith(`${BASE}app-preview/`))).toBe(true);
  expect(req.outside).toEqual([]);
  // every in-app link points inside the mount
  const hrefs = await page.locator('a[data-kl-route]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.length).toBeGreaterThan(100);
  expect(hrefs.filter((h) => !h.startsWith(BASE))).toEqual([]);
  expect(errors).toEqual([]);
});

test('direct deep link, refresh, back and forward, query strings', async ({page}) => {
  const req = watchRequests(page);
  await page.goto(`${server.url}${BASE}learn/lu.7.12/guide`);
  await expect(page.getByRole('button', {name: /Nazariyani yakunlash/})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', {name: /Nazariyani yakunlash/})).toBeVisible();
  await page.getByRole('button', {name: /Nazariyani yakunlash/}).click();
  await expect(page).toHaveURL(`${server.url}${BASE}learn/lu.7.12/practice`);
  const practice = page.locator('#app-main a[data-kl-route^="/practice/"]').first();
  const route = await practice.getAttribute('data-kl-route');
  await practice.click();
  await expect(page).toHaveURL(`${server.url}${BASE}${route.slice(1)}`);
  await page.reload();                                            // refresh on a practice deep link
  await expect(page.locator('#app-main')).not.toContainText('Sahifa topilmadi');
  await page.goBack();
  await expect(page).toHaveURL(`${server.url}${BASE}learn/lu.7.12/practice`);
  await page.goBack();
  await expect(page).toHaveURL(`${server.url}${BASE}learn/lu.7.12/guide`);
  await page.goForward();
  await expect(page).toHaveURL(`${server.url}${BASE}learn/lu.7.12/practice`);
  await page.goto(`${server.url}${BASE}search?q=atom`);
  await expect(page.locator('#app-main input[type="search"], #app-main input[name="q"]').first()).toHaveValue('atom');
  expect(req.outside).toEqual([]);
});

test('the server serves only the mount: /kimyolab → /kimyolab/, root paths and other prefixes are 404', async () => {
  expect((await rawRequest(server.url, '/kimyolab')).status).toBe(308);
  expect((await rawRequest(server.url, '/kimyolab')).headers.location).toBe(BASE);
  for (const outside of ['/', '/curriculum', '/learn/lu.7.12/guide', '/content/manifest.json', '/app-preview/app/bootstrap.js', '/assets/brand/kimyolab-logo.webp', '/other/', '/kimyolab-other/']) {
    expect((await rawRequest(server.url, outside)).status, outside).toBe(404);
  }
  for (const inside of [BASE, `${BASE}curriculum`, `${BASE}learn/lu.7.12/guide`, `${BASE}content/manifest.json`, `${BASE}assets/brand/kimyolab-logo.webp`]) {
    expect((await rawRequest(server.url, inside)).status, inside).toBe(200);
  }
});

test('storage and Web Lock namespaces are the mount’s own (no collision with a root deployment on the same origin)', async ({page}) => {
  await page.goto(`${server.url}${BASE}practice/practice.simulation.9.23.planned`);
  const form = page.locator('.kl-question').first();
  await form.getByRole('radio', {name: 'Kislotali muhit'}).check();
  await form.getByRole('button').click();
  await expect(page.locator('.kl-feedback[role="status"]')).toContainText('To‘g‘ri');
  const state = await page.evaluate(async () => ({
    databases: (await indexedDB.databases()).map((d) => d.name).sort(),
    locks: (await navigator.locks.query()).held.map((l) => l.name),
  }));
  expect(state.databases).toContain('kimyolab@/kimyolab/.runtime');
  expect(state.databases).not.toContain('kimyolab-runtime');
  expect(state.locks.length).toBeGreaterThan(0);
  for (const name of state.locks) expect(name.startsWith('kimyolab@/kimyolab/.attempt.')).toBe(true);
});

test('CSS isolation: KimyoLab styles do not restyle a host page; typical portal CSS does not break KimyoLab controls', async ({page, browser}) => {
  // (1) KimyoLab CSS on a foreign (portal) page without the .kl-app root changes nothing there
  const css = fs.readFileSync(path.join(repoRoot, 'src/ui/tokens/kimyolab.css'), 'utf8');
  await page.setContent('<html><body style="margin:8px"><a id="p" href="#">portal</a><button id="b">Portal</button><div id="d" style="padding:4px;width:100px">x</div></body></html>');
  const probe = () => page.evaluate(() => { const cs = (id) => getComputedStyle(document.getElementById(id)); return {bodyMargin: getComputedStyle(document.body).margin, bodyFont: getComputedStyle(document.body).fontFamily, bodyBg: getComputedStyle(document.body).backgroundColor, linkColor: cs('p').color, boxSizing: cs('d').boxSizing, width: document.getElementById('d').getBoundingClientRect().width, button: cs('b').backgroundColor}; });
  const before = await probe();
  await page.addStyleTag({content: css});
  expect(await probe()).toEqual(before);
  // (2) a typical portal reset/theme stylesheet loaded after KimyoLab keeps the learner's controls usable
  // (the KimyoLab CSP forbids inline styles; the test context bypasses CSP only to inject the simulated portal sheet)
  const portal = await (await browser.newContext({bypassCSP: true})).newPage();
  await portal.goto(`${server.url}${BASE}practice/practice.simulation.9.23.planned`);
  await portal.addStyleTag({content: '*{margin:0;padding:0;font-family:serif} a{color:#c00;text-decoration:underline} button{background:#eee;border:0;font-size:12px} input{border:1px solid #999} fieldset{border:0} legend{font-size:10px}'});
  const form = portal.locator('.kl-question').first();
  await expect(form.getByRole('radio', {name: 'Kislotali muhit'})).toBeVisible();
  await expect(form.getByRole('button')).toBeVisible();
  await form.getByRole('radio', {name: 'Kislotali muhit'}).check();
  await form.getByRole('button').click();
  await expect(portal.locator('.kl-feedback[role="status"]')).toContainText('To‘g‘ri');
  await portal.context().close();
});

test('no service worker is registered (and none could claim the portal root)', async ({page}) => {
  await page.goto(`${server.url}${BASE}`);
  await expect(page.locator('#app-main')).toContainText('Kimyo fanini');
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope))).toEqual([]);
});
