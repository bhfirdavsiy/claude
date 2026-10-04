// P2.13 — the periodic table and Element Hub in real Chromium on BOTH hosts (portal /kimyolab/ and the standalone file).
//   flag off      → /periodic does not exist (the learner app is unchanged), search has no element entries
//   table         → 118 cells from the canonical identity, f-block rows drawn apart with their period unchanged
//   deep link     → /periodic/Na opens the profile directly and survives a refresh; an unknown symbol is a notice
//   profile       → proven values only; gaps say so in plain Uzbek; no invented name or electron configuration
//   keyboard      → a cell is a link; Enter opens the profile (focus on its heading); Escape closes (focus back)
//   search        → by atomic number, symbol and localized name, through the existing learner search
//   accessibility → names, no duplicate ids, 320 px usable, 44 px targets, reduced motion
import {test, expect} from '@playwright/test';
import {startHosts} from './host-scenarios.mjs';
import {semantics, reflow, targetSizes, motion} from '../helpers/a11y.mjs';

const FLAG = '?ff=periodicTableV1';
const PAGE = '[data-periodic-page]';
const MISSING = 'Bu ma’lumot hali tasdiqlangan manbada mavjud emas.';
let hosts;
test.beforeAll(async () => { hosts = await startHosts(); });
test.afterAll(async () => { await hosts?.close(); });

for (const name of ['portal', 'standalone']) {
  test(`${name}: flag off → no periodic route and no element in search`, async ({page}) => {
    await hosts[name].open(page, '/periodic/Na');
    await expect(page.locator('h1')).toHaveText('Sahifa topilmadi');
    await expect(page.locator(PAGE)).toHaveCount(0);
    await hosts[name].open(page, '/search?q=Na');
    await expect(page.locator('.kl-search-results')).toBeVisible();
    await expect(page.locator('.kl-search-card .kl-kicker', {hasText: 'Element'})).toHaveCount(0);
  });

  test(`${name}: 118 canonical cells; deep link opens the profile and survives a refresh`, async ({page}) => {
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await hosts[name].open(page, `/periodic${FLAG}`);
    const cells = page.locator(`${PAGE} [data-periodic-table] a[data-symbol]`);
    await expect(cells).toHaveCount(118);
    expect(await cells.first().getAttribute('data-symbol')).toBe('H');
    expect(await cells.last().getAttribute('data-symbol')).toBe('Og');
    await expect(page.locator(`${PAGE} [data-symbol=Na]`)).toHaveAttribute('aria-label', 'Natriy, belgisi Na, atom raqami 11');
    // a symbol without a localized name is announced by symbol and number, never with a made-up name
    await expect(page.locator(`${PAGE} [data-symbol=Fe]`)).toHaveAttribute('aria-label', 'Belgisi Fe, atom raqami 26');
    await page.locator(`${PAGE} [data-symbol=Na]`).click();
    const profile = page.locator('[data-element-profile=Na]');
    await expect(profile).toBeVisible();
    await expect(profile.locator('h2')).toHaveText('Natriy (Na)');
    await expect(profile.locator('[data-field=period]')).toContainText('3');
    await expect(profile.locator('[data-field=group]')).toContainText('1');
    await expect(profile.locator('[data-field=config]')).toContainText('1s2 2s2 2p6 3s1');
    await expect(profile.locator('[data-field=mass]')).toHaveText(MISSING);
    await expect(profile.locator('[data-field=category]')).toHaveText(MISSING);
    await expect(profile.locator('[data-element-labs] a').first()).toBeVisible();
    await expect(profile.locator('[data-element-topics] a').first()).toHaveAttribute('href', /learn\/lu\./);
    // refresh on the deep link
    await page.reload();
    await expect(page.locator('[data-element-profile=Na] h2')).toHaveText('Natriy (Na)');
    expect(errors).toEqual([]);
  });

  test(`${name}: honest gaps — f-block period, no invented configuration, unknown symbol`, async ({page}) => {
    await hosts[name].open(page, `/periodic/La${FLAG}`);
    const la = page.locator('[data-element-profile=La]');
    await expect(la.locator('[data-field=period]')).toContainText('6');
    await expect(la.locator('[data-field=group]')).toContainText('guruh raqami berish qoidasi hali tasdiqlangan manbada yo‘q');
    await expect(la.locator('[data-field=config]')).toContainText('faqat atom raqami 1–36');
    await expect(la.locator('[data-field=name]')).toContainText('O‘zbekcha nomi hali kiritilmagan');
    await hosts[name].open(page, `/periodic/Cr${FLAG}`);
    await expect(page.locator('[data-element-profile=Cr] [data-field=config]')).toContainText('mutaxassis tekshiruvini kutmoqda');
    await hosts[name].open(page, `/periodic/Xx${FLAG}`);
    await expect(page.locator('[data-periodic-not-found]')).toContainText('Bunday belgili element yo‘q');
    await expect(page.locator(`${PAGE} [data-periodic-table] a[data-symbol]`)).toHaveCount(118);
  });

  test(`${name}: search by atomic number, symbol and name → the element profile`, async ({page}) => {
    for (const [q, title] of [['11', 'Natriy (Na)'], ['Na', 'Natriy (Na)'], ['kislorod', 'Kislorod (O)'], ['26', 'Fe']]) {
      await hosts[name].open(page, `/search${FLAG}&q=${encodeURIComponent(q)}`);
      await expect(page.locator('.kl-search-card').first().locator('h2')).toHaveText(title);
    }
    await page.locator('.kl-search-card').first().getByRole('link').click();
    await expect(page.locator('[data-element-profile=Fe]')).toBeVisible();
  });
}

test('keyboard: Tab to a cell, Enter opens the profile, Escape closes it and returns focus', async ({page}) => {
  await hosts.portal.open(page, `/periodic${FLAG}`);
  await expect(page.locator(`${PAGE} [data-periodic-table] a[data-symbol]`)).toHaveCount(118);
  await page.locator('#kl-periodic-has-lab').focus();
  let reached = false;
  for (let i = 0; i < 20 && !reached; i += 1) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => document.activeElement?.getAttribute('data-symbol') === 'H'); }
  expect(reached).toBe(true);
  for (let i = 0; i < 10; i += 1) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-symbol'))).toBe('Na');
  const outline = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; });
  expect(outline).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-element-profile=Na]')).toBeVisible();
  await expect(page.locator('#kl-element-title')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-element-profile]')).toHaveCount(0);
  await expect(page.locator(`${PAGE} [data-symbol=Na]`)).toBeFocused();
});

test('filters: group and lab filters from the hub; the result is text, not colour only', async ({page}) => {
  await hosts.portal.open(page, `/periodic${FLAG}`);
  await page.locator('#kl-periodic-group').selectOption('17');
  await expect(page.locator('[data-periodic-status]')).toHaveText('Mos elementlar: 6 ta');
  await expect(page.locator('[data-periodic-matches] li')).toHaveCount(6);
  await expect(page.locator('#kl-periodic-category')).toBeDisabled();
  await expect(page.locator('#kl-periodic-category-note')).toContainText('bu saralash hozircha ishlamaydi');
  await page.locator('#kl-periodic-has-lab').check();
  const n = await page.locator('[data-periodic-matches] li').count();
  expect(n).toBeGreaterThan(0); expect(n).toBeLessThan(6);
  // the filter survives opening a profile
  await page.locator('[data-periodic-matches] a').first().click();
  await expect(page.locator('[data-element-profile]')).toBeVisible();
  await expect(page.locator('#kl-periodic-group')).toHaveValue('17');
  await page.locator('[data-periodic-reset]').click();
  await expect(page.locator('[data-periodic-status]')).toHaveText('');
});

test('accessibility: names, ids, 320 px, 44 px targets, reduced motion', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.setViewportSize({width: 320, height: 800});
  await hosts.portal.open(page, `/periodic/Na${FLAG}`);
  await expect(page.locator('[data-element-profile=Na]')).toBeVisible();
  const s = await semantics(page, PAGE);
  expect(s.unnamed).toEqual([]); expect(s.duplicateIds).toBe(0); expect(s.positiveTabindex).toBe(0); expect(s.h1).toBe(1);
  const r = await reflow(page, PAGE);
  expect(r.horizontalScroll).toBe(false); expect(r.clipped).toBe(0); expect(r.overlaps).toBe(0);
  expect(await targetSizes(page, 44, PAGE)).toEqual([]);
  const cellHeights = await page.locator(`${PAGE} [data-periodic-table] a[data-symbol]`).evaluateAll((as) => as.map((a) => a.getBoundingClientRect().height).filter((h) => h < 44).length);
  expect(cellHeights).toBe(0);
  expect(await motion(page)).toEqual({running: 0, transitions: 0});
  await page.locator('[data-periodic-projector]').click();
  await expect(page.locator('[data-periodic-projector]')).toHaveAttribute('aria-pressed', 'true');
});
