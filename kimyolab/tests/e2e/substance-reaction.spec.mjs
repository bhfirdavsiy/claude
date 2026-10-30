// P2.14 — Substance Passport and Reaction Explorer in real Chromium on BOTH hosts (portal /kimyolab/ and the
// standalone file).
//   flags off      → /substance/… and /reactions do not exist; search has no substance or reaction entries
//   passport       → /substance/<key> deep link + refresh; identity from the registry; composition from the parser;
//                    molar mass / hazards / unmodeled ions are honest gaps in plain Uzbek; links to elements, reactions
//   explorer       → the ReactionMatcher decides: modeled reaction, condition required (never assumed), not modeled
//                    (never "no reaction"); ionic equation only where supported; deep link + refresh
//   element hub    → element profile → passport; passport → element profile; passport → explorer
//   search         → substances by formula / name, reactions by formula, through the existing learner search
//   accessibility  → keyboard, result announced (polite) + errors (assertive), focus on the result, 320 px, 44 px
import {test, expect} from '@playwright/test';
import {startHosts} from './host-scenarios.mjs';
import {semantics, reflow, targetSizes, motion} from '../helpers/a11y.mjs';

const FF = '?ff=substancePassportV1,reactionExplorerV1,periodicTableV1';
const PASSPORT = '[data-substance-page]';
const EXPLORER = '[data-explorer-page]';
const MISSING = 'Bu ma’lumot hali tasdiqlangan manbada mavjud emas.';
const NOT_MODELED = 'Bu reagentlar uchun KimyoLab modelida hozircha yetarli ma’lumot yo‘q.';
let hosts;
test.beforeAll(async () => { hosts = await startHosts(); });
test.afterAll(async () => { await hosts?.close(); });

/** what a learner sees of a page, without host-specific URLs (portal / standalone parity) */
const visibleText = (page, sel) => page.locator(sel).evaluate((n) => n.innerText.replace(/\s+/g, ' ').trim());

const parity = {};
for (const name of ['portal', 'standalone']) {
  test(`${name}: flags off → no passport or explorer route, no substance or reaction in search`, async ({page}) => {
    await hosts[name].open(page, '/substance/nacl');
    await expect(page.locator('h1')).toHaveText('Sahifa topilmadi');
    await expect(page.locator(PASSPORT)).toHaveCount(0);
    await hosts[name].open(page, '/reactions?r=agno3&r=nabr');
    await expect(page.locator('h1')).toHaveText('Sahifa topilmadi');
    await hosts[name].open(page, '/search?q=NaCl');
    await expect(page.locator('.kl-search-results')).toBeVisible();
    await expect(page.locator('.kl-search-card .kl-kicker', {hasText: /^(Modda|Reaksiya)$/})).toHaveCount(0);
  });

  test(`${name}: passport deep link — canonical identity, derived composition, honest gaps; survives a refresh`, async ({page}) => {
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await hosts[name].open(page, `/substance/nacl${FF}`);
    const p = page.locator(PASSPORT);
    await expect(p.locator('h1')).toHaveText('natriy xlorid (NaCl)');
    await expect(p.locator('[data-field=formula]')).toHaveText('NaCl');
    await expect(p.locator('[data-field=phase]')).toContainText('qattiq');
    await expect(p.locator('[data-field=composition]')).toContainText('Natriy (Na): 1 ta atom');
    await expect(p.locator('[data-field=composition]')).toContainText('Formuladan hisoblangan');
    await expect(p.locator('[data-field=molar-mass]')).toHaveText('Molyar massa uchun tasdiqlangan atom massalari hali mavjud emas.');
    await expect(p.locator('[data-field=hazards]')).toHaveText('Tasdiqlangan xavfsizlik ma’lumoti hali mavjud emas.');
    await expect(p.locator('[data-field=properties]')).toHaveText(MISSING);
    // NaCl's dissociation is the model's own rule, shown as model data (not an expert-approved fact)
    await expect(p.locator('[data-field=ions]')).toContainText('Na+ + Cl-');
    await expect(p.locator('[data-field=ions]')).toContainText('KimyoLab modelidagi ma’lumot');
    // NaCl(s) takes part in the records that name NaCl without a phase; rxn.agno3-nacl names NaCl(aq), which is not
    // this species (the registry has no NaCl(aq)), so it is not listed — participation is never by formula alone
    const rx = p.locator('[data-substance-reactions] li');
    await expect(rx.filter({hasText: 'H2SO4'}).first()).toBeVisible();
    await expect(rx.filter({hasText: 'AgNO3'})).toHaveCount(0);
    // no identifier reaches the learner
    const text = await visibleText(page, PASSPORT);
    expect(text).not.toMatch(/species\.|rxn\.|ReactionMatcher|IonicEngine|MODEL_RECORD|DERIVED|SOURCE_/);
    parity[`${name}:passport`] = text;
    await page.reload();
    await expect(page.locator(`${PASSPORT} h1`)).toHaveText('natriy xlorid (NaCl)');
    // CuO has no dissociation rule → "not modeled", never "does not dissociate"
    await hosts[name].open(page, `/substance/cuo${FF}`);
    await expect(page.locator(`${PASSPORT} [data-field=ions]`)).toHaveText('Bu modda uchun ionlarga ajralish modeli hali mavjud emas.');
    // a species whose "formula" is a name: no composition is made up
    await hosts[name].open(page, `/substance/kraxmal${FF}`);
    await expect(page.locator(`${PASSPORT} [data-field=composition]`)).toContainText('nomi bilan berilgan');
    await hosts[name].open(page, `/substance/zz-none${FF}`);
    await expect(page.locator('[data-substance-not-found]')).toContainText('Bunday modda KimyoLab modelida topilmadi');
    expect(errors).toEqual([]);
  });

  test(`${name}: explorer — modeled reaction, ionic equation only where supported, deep link + refresh`, async ({page}) => {
    await hosts[name].open(page, `/reactions${FF.replace('?', '?r=naoh&r=hcl&')}`);
    const res = page.locator('[data-explorer-result]');
    await expect(res).toHaveAttribute('data-outcome', 'MODELED_REACTION');
    await expect(res.locator('[data-field=equation]')).toContainText('NaOH');
    await expect(res.locator('[data-field=ionic]')).toContainText('→');
    await expect(res.locator('[data-explorer-provenance]')).toContainText('hali tasdiqlamagan');
    parity[`${name}:explorer`] = await visibleText(page, '[data-explorer-result]');
    await page.reload();
    await expect(page.locator('[data-explorer-result]')).toHaveAttribute('data-outcome', 'MODELED_REACTION');
    // AgNO3 + NaBr: modeled, but IonicEngine does not support it → no ionic equation is invented
    await hosts[name].open(page, `/reactions${FF.replace('?', '?r=agno3&r=nabr&')}`);
    await expect(res).toHaveAttribute('data-outcome', 'MODELED_REACTION');
    await expect(res.locator('[data-field=ionic]')).toHaveText('Ionli tenglama modeli bu reaksiya uchun hali to‘liq emas.');
    await expect(res.locator('[data-field=observation]')).toContainText('cho‘kma');
  });

  test(`${name}: explorer — conditions are never assumed; unknown is never "no reaction"`, async ({page}) => {
    await hosts[name].open(page, `/reactions${FF.replace('?', '?r=c&r=o2&')}`);
    const res = page.locator('[data-explorer-result]');
    await expect(res).toHaveAttribute('data-outcome', 'CONDITION_REQUIRED');
    await expect(res.locator('[data-explorer-requirements] li')).toHaveCount(2);
    await expect(res).not.toContainText('bormaydi');
    await hosts[name].open(page, `/reactions${FF.replace('?', '?r=c&r=o2&c=ignition:present&c=oxygen-supply:excess&')}`);
    await expect(res).toHaveAttribute('data-outcome', 'MODELED_REACTION');
    await expect(res.locator('[data-field=equation]')).toContainText('CO2');
    await hosts[name].open(page, `/reactions${FF.replace('?', '?r=cu&r=hcl&')}`);
    await expect(res).toHaveAttribute('data-outcome', 'NOT_MODELED');
    await expect(res.locator('[data-explorer-not-modeled]')).toHaveText(NOT_MODELED);
    await expect(res).toContainText('“reaksiya bormaydi” degani emas');
    // an unknown condition value in the link is refused, not applied
    await hosts[name].open(page, `/reactions${FF.replace('?', '?r=c&r=o2&c=ignition:sometimes&')}`);
    await expect(page.locator('[data-explorer-rejected]')).toBeVisible();
    await expect(res).toHaveAttribute('data-outcome', 'CONDITION_REQUIRED');
  });
}

test('portal and standalone show the same passport and the same explorer result', () => {
  expect(parity['standalone:passport']).toBe(parity['portal:passport']);
  expect(parity['standalone:explorer']).toBe(parity['portal:explorer']);
});

test('element profile ↔ passport ↔ explorer: one graph, both directions', async ({page}) => {
  await hosts.portal.open(page, `/periodic/Na${FF}`);
  const link = page.locator('[data-element-profile=Na] [data-element-substances] a', {hasText: 'NaCl'});
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.locator(`${PASSPORT} h1`)).toHaveText('natriy xlorid (NaCl)');
  await expect(page.locator('#kl-substance-title')).toBeFocused();
  // passport → element profile
  await page.locator('[data-substance-elements] a', {hasText: 'Natriy (Na)'}).click();
  await expect(page.locator('[data-element-profile=Na]')).toBeVisible();
  // passport → explorer: the record's own reactants and conditions; the matcher finds that record
  await hosts.portal.open(page, `/substance/nacl${FF}`);
  await page.locator('[data-substance-reactions] a').first().click();
  await expect(page.locator('[data-explorer-result]')).toHaveAttribute('data-outcome', 'MODELED_REACTION');
  await expect(page.locator('[data-explorer-result] [data-field=equation]')).toContainText('NaCl');
  // the element profile's reactions open the explorer too
  await hosts.portal.open(page, `/periodic/Ag${FF}`);
  await expect(page.locator('[data-element-profile=Ag] [data-element-reactions] a').first()).toHaveAttribute('href', /reactions\?/);
});

test('search: substances by formula and name, reactions by formula — the existing learner search', async ({page}) => {
  await hosts.portal.open(page, `/search${FF}&q=NaCl`);
  const first = page.locator('.kl-search-card').first();
  await expect(first.locator('h2')).toHaveText('natriy xlorid (NaCl)');
  await expect(first.locator('.kl-kicker')).toHaveText('Modda');
  await hosts.portal.open(page, `/search${FF}&q=${encodeURIComponent('kumush nitrat')}`);
  await expect(page.locator('.kl-search-card').first().locator('h2')).toHaveText('kumush nitrat (AgNO3)');
  await hosts.portal.open(page, `/search${FF}&q=AgBr`);
  const r = page.locator('.kl-search-card', {has: page.locator('.kl-kicker', {hasText: 'Reaksiya'})}).first();
  await expect(r.locator('h2')).toContainText('AgBr');
  await r.getByRole('link').click();
  await expect(page.locator('[data-explorer-result]')).toHaveAttribute('data-outcome', 'MODELED_REACTION');
});

test('keyboard: typed formula, ambiguity-free add, errors announced, result announced and focused', async ({page}) => {
  await hosts.portal.open(page, `/reactions${FF}`);
  const input = page.locator('#kl-reactions-formula');
  await input.focus();
  await page.keyboard.type('nacl');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-explorer-errors]')).toHaveText('Formulani o‘qib bo‘lmadi. Yozilishini tekshiring.');
  await expect(page.locator('[data-explorer-errors]')).toHaveAttribute('aria-live', 'assertive');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await input.fill('Xe');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-explorer-errors]')).toHaveText('Bunday formulali modda KimyoLab modelida yo‘q.');
  await input.fill('AgNO3'); await page.keyboard.press('Enter');
  await input.fill('NaBr'); await page.keyboard.press('Enter');
  await expect(page.locator('[data-explorer-status]')).toContainText('tanlandi');
  await expect(page.locator('[data-species="species.agno3"]')).toBeChecked();
  await expect(page.locator('[data-species="species.nabr"]')).toBeChecked();
  await page.locator('[data-explorer-submit]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-explorer-result]')).toHaveAttribute('data-outcome', 'MODELED_REACTION');
  await expect(page.locator('#kl-reactions-result-title')).toBeFocused();
  await expect(page.locator('[data-explorer-status]')).toHaveText('Natija: modelda reaksiya yozuvi topildi.');
  await expect(page.locator('[data-explorer-status]')).toHaveAttribute('aria-live', 'polite');
  expect(page.url()).toMatch(/r=agno3&r=nabr/);
});

test('accessibility: names, ids, 320 px, 44 px targets, reduced motion (passport + explorer)', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.setViewportSize({width: 320, height: 800});
  for (const [path, root] of [[`/substance/h2so4${FF}`, PASSPORT], [`/reactions${FF.replace('?', '?r=naoh&r=hcl&')}`, EXPLORER]]) {
    await hosts.portal.open(page, path);
    await expect(page.locator(root)).toBeVisible();
    const s = await semantics(page, root);
    expect(s.unnamed).toEqual([]); expect(s.duplicateIds).toBe(0); expect(s.positiveTabindex).toBe(0); expect(s.h1).toBe(1);
    const r = await reflow(page, root);
    expect(r.horizontalScroll).toBe(false); expect(r.clipped).toBe(0); expect(r.overlaps).toBe(0);
    expect(await targetSizes(page, 44, root)).toEqual([]);
    expect(await motion(page)).toEqual({running: 0, transitions: 0});
  }
});
