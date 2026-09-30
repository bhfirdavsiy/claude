// P2.2 — the standalone presentation artifact is the SAME product through the embedded host: it runs from disk
// without a server, keeps pack integrity (fail-closed), uses the same route model (hash transport), shows the approved
// logo, and works at phone width. It is a delivery host, not a demo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {test, expect} from '@playwright/test';
import {STANDALONE_FILE} from './host-scenarios.mjs';

const url = () => pathToFileURL(STANDALONE_FILE).href;

test('standalone opens from disk; approved logo, hash deep link, back/forward, practice', async ({page}) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const network = []; page.on('request', (r) => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  await page.goto(`${url()}#/`);
  await expect(page.locator('#app-main')).toContainText('Kimyo fanini');
  const logo = page.locator('.kl-brand-logo');
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((img) => img.naturalWidth)).toBe(1254);
  expect((await logo.getAttribute('src')).startsWith('data:image/webp;base64,')).toBe(true);
  await page.getByRole('link', {name: 'Mavzu studiyasi'}).first().click();
  await expect(page).toHaveURL(/#\/curriculum$/);
  await page.goto(`${url()}#/learn/lu.7.12/guide`);
  await expect(page.getByRole('button', {name: /Nazariyani yakunlash/})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', {name: /Nazariyani yakunlash/})).toBeVisible();
  await page.getByRole('button', {name: /Nazariyani yakunlash/}).click();
  await expect(page).toHaveURL(/#\/learn\/lu\.7\.12\/practice$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/learn\/lu\.7\.12\/guide$/);
  await page.goForward();
  await expect(page).toHaveURL(/#\/learn\/lu\.7\.12\/practice$/);
  const hrefs = await page.locator('a[data-kl-route]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.filter((h) => !h.startsWith('#/'))).toEqual([]);
  expect(network).toEqual([]);                                   // internal content needs no server and no network
  expect(errors).toEqual([]);
});

test('standalone keeps pack integrity: a tampered embedded content file fails closed', async ({page}) => {
  const html = fs.readFileSync(STANDALONE_FILE, 'utf8');
  // swap two letters of a title inside the embedded grade-7 learning-units file (JSON stays valid; the checksum breaks)
  const file7 = html.indexOf('learning-units/grade-7.json":"');
  expect(file7).toBeGreaterThan(0);
  const at = html.indexOf('\\"title\\": \\"', file7) + '\\"title\\": \\"'.length;
  expect(at).toBeGreaterThan(file7);
  const tampered = `${html.slice(0, at)}${html[at + 1]}${html[at]}${html.slice(at + 2)}`;
  expect(tampered).not.toBe(html);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kl-tamper-')), 'KimyoLab_standalone.html');
  fs.writeFileSync(file, tampered);
  await page.goto(`${pathToFileURL(file).href}#/curriculum`);
  await expect(page.locator('#app-main')).toContainText('Kontent fayli tekshiruvdan o‘tmadi');
  await expect(page.locator('#app-main')).not.toContainText('7-sinf');
});

test('standalone at phone width: navigation, the P2.1 choice form and the verdict work', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 375, height: 740}, isMobile: true, hasTouch: true});
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url()}#/practice/practice.simulation.9.23.planned`);
  const form = page.locator('.kl-question').first();
  await form.getByRole('radio', {name: 'Kislotali muhit'}).tap();
  await form.getByRole('button').tap();
  await expect(page.locator('.kl-feedback[role="status"]')).toContainText('To‘g‘ri');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});
