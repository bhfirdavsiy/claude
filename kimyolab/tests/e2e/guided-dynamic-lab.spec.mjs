// P2.10 — guided dynamic lab vertical slices in real Chromium on BOTH hosts (portal /kimyolab/ and the standalone file).
//   flag off      → notice + the unchanged classic route; the classic practice page still works
//   8.1 (ionic)   → object → action → parameter; a precipitate from the reaction record; FILTER is not in the topic
//                   (ACTION_NOT_ALLOWED_IN_TOPIC, with a reason); equation → completion; nothing written to IndexedDB
//   11.2 (gas)    → observing before current: honest "no process"; the full flow; the anode gas from the model
//   7.2 (STRICT)  → an early step is blocked by the declared order; keyboard only; reset returns to the initial state
//   accessibility → names, groups, bound errors, no duplicate ids, 320 px reflow, 44 px targets, reduced motion
import {test, expect} from '@playwright/test';
import {startHosts, semanticStore} from './host-scenarios.mjs';
import {semantics, reflow, targetSizes, motion} from '../helpers/a11y.mjs';

const FLAG = '?ff=guidedDynamicLabV1';
const LAB = '.kl-dlab';
const result = (page) => page.locator(`${LAB} .kl-dlab__result`);
let hosts;
test.beforeAll(async () => { hosts = await startHosts(); });
test.afterAll(async () => { await hosts?.close(); });

async function object(page, ref) { await page.locator(`${LAB} [data-object="${ref}"]`).click(); }
async function action(page, family) { await page.locator(`${LAB} .kl-dlab__action-list [data-action-family="${family}"]`).click(); }
async function addTo(page, substance, container) {
  await object(page, `substance:${substance}`); await action(page, 'ADD_SUBSTANCE');
  await page.locator('#dlab-param-container').selectOption(container);
  await page.locator(`${LAB} .kl-dlab__params button[type=submit]`).click();
}
async function on(page, ref, family) { await object(page, ref); await action(page, family); }

for (const name of ['portal', 'standalone']) {
  test(`${name}: flag off → notice and the classic route; the classic practice page is unchanged`, async ({page}) => {
    await hosts[name].open(page, '/dynamic-lab/practice.experiment.8.1');
    await expect(page.locator('.kl-practice-workspace .kl-notice[role=status]')).toContainText('yoqilmagan');
    await expect(page.locator(LAB)).toHaveCount(0);
    await page.getByRole('link', {name: 'Odatdagi amaliy mashg‘ulotni ochish'}).click();
    await expect(page.locator('.kl-practice-workspace [data-renderer^="ionic-precipitation"]')).toBeVisible();
  });

  test(`${name}: 8.1 precipitation — observation from the reaction record, FILTER not in topic, completion, nothing persisted`, async ({page}) => {
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await hosts[name].open(page, `/dynamic-lab/practice.experiment.8.1${FLAG}`);
    await expect(page.locator(`${LAB}[data-order-mode=FLEXIBLE]`)).toBeVisible();
    await expect(page.locator(`${LAB} .kl-dlab__flow a`)).toHaveText(['Maqsad', 'Amal', 'Kuzatish', 'Nega?']);
    // mixing needs two solutions: the domain says why (a hidden button is never the only guard)
    await on(page, 'apparatus:tube-1', 'MIX');
    await expect(result(page)).toHaveAttribute('data-code', 'STATE_PRECONDITION_UNMET');
    await expect(result(page)).toContainText('ikkita eritma');
    await addTo(page, 'agno3', 'tube-1'); await addTo(page, 'nacl', 'tube-1');
    await on(page, 'apparatus:tube-1', 'MIX');
    await expect(result(page)).toHaveAttribute('data-status', 'accepted');
    await expect(page.locator(`${LAB} .kl-dlab__observations li[data-produced-by=ReactionMatcher]`)).toContainText('oq rangli cho‘kma');
    await expect(page.locator(`${LAB} .kl-dlab__sources`)).toContainText('rxn.agno3-nacl');
    // FILTER: a precipitate exists, but filtering is not in this topic's instruction
    await object(page, 'apparatus:tube-1');
    await page.locator(`${LAB} .kl-dlab__other summary`).click();
    await page.locator(`${LAB} .kl-dlab__other [data-action-family=FILTER]`).click();
    await expect(result(page)).toHaveAttribute('data-code', 'ACTION_NOT_ALLOWED_IN_TOPIC');
    await expect(result(page)).toContainText('laboratoriya ko‘rsatmasida yo‘q');
    // the equation (learner text) → the ionic engine decides; completion
    await on(page, 'apparatus:tube-1', 'RECORD');
    await page.locator('#dlab-param-text').fill('Ag+ + Cl- -> AgCl');
    await page.locator(`${LAB} .kl-dlab__params button[type=submit]`).click();
    await expect(result(page)).toContainText('Tenglama to‘g‘ri.');
    await expect(page.locator(`${LAB}[data-complete=true]`)).toBeVisible();
    // P2.10 closeout: WASH is not in 8.1's instruction — offered only under "not in the instruction", rejected with the reason
    await object(page, 'apparatus:tube-1');
    await expect(page.locator(`${LAB} .kl-dlab__action-list [data-action-family=WASH]`)).toHaveCount(0);
    await page.locator(`${LAB} .kl-dlab__other summary`).click();
    await page.locator(`${LAB} .kl-dlab__other [data-action-family=WASH]`).click();
    await expect(result(page)).toHaveAttribute('data-code', 'ACTION_NOT_ALLOWED_IN_TOPIC');
    // retry = the lab-level RESET; afterwards another pair can be tested in the same tube
    await page.locator(`${LAB} [data-dlab-reset]`).click();
    await expect(page.locator(`${LAB} .kl-dlab__observations li`)).toHaveCount(0);
    await addTo(page, 'bacl2', 'tube-1'); await addTo(page, 'h2so4', 'tube-1');
    await on(page, 'apparatus:tube-1', 'MIX');
    await expect(result(page)).toHaveAttribute('data-status', 'accepted');
    await expect(page.locator(`${LAB} .kl-dlab__observations li[data-grounding=MODEL_BASED]`)).toHaveCount(1);
    // no attempt, evidence, progress or mastery is written by the dynamic lab
    const store = await semanticStore(page, hosts[name].dbName);
    expect(store.evidence).toEqual([]); expect(store.attempts ?? []).toEqual([]); expect(store.progress).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`${name}: 11.2 electrolysis — no process before current, then the model's cathode and anode`, async ({page}) => {
    await hosts[name].open(page, `/dynamic-lab/practice.experiment.11.2${FLAG}`);
    await expect(page.locator(`${LAB}[data-order-mode=HUMAN_DECISION_REQUIRED]`)).toBeVisible();
    await on(page, 'target:cathode', 'OBSERVE');
    await expect(result(page)).toHaveAttribute('data-code', 'NO_PROCESS_YET');
    await expect(page.locator(`${LAB} .kl-dlab__observations li`)).toHaveCount(0);
    await on(page, 'apparatus:cell', 'ELECTRIC_CURRENT');
    await expect(result(page)).toHaveAttribute('data-code', 'APPARATUS_NOT_SET_UP');
    await addTo(page, 'cucl2-solution', 'cell');
    await on(page, 'apparatus:electrodes', 'SETUP_APPARATUS'); await on(page, 'apparatus:dc-source', 'SETUP_APPARATUS');
    await on(page, 'apparatus:cell', 'ELECTRIC_CURRENT');
    await expect(result(page)).toHaveAttribute('data-status', 'accepted');
    await on(page, 'target:cathode', 'OBSERVE'); await on(page, 'target:anode', 'OBSERVE');
    const obs = page.locator(`${LAB} .kl-dlab__observations li[data-produced-by=ElectrolysisModel]`);
    await expect(obs).toHaveCount(2);
    await expect(obs.nth(0)).toContainText('Cu'); await expect(obs.nth(1)).toContainText('Cl2'); await expect(obs.nth(1)).toContainText('hidlab ko‘rmang');
    await expect(page.locator(`${LAB}[data-complete=true]`)).toBeVisible();
  });

  test(`${name}: 7.2 STRICT — an early step is blocked by the declared order; keyboard only; reset`, async ({page}) => {
    await hosts[name].open(page, `/dynamic-lab/practice.experiment.7.2${FLAG}`);
    await expect(page.locator(`${LAB}[data-order-mode=STRICT]`)).toBeVisible();
    await addTo(page, 'water', 'beaker');
    await expect(result(page)).toHaveAttribute('data-code', 'PROCEDURE_BLOCKED');
    await expect(result(page)).toContainText('oldingi bosqich');
    // keyboard: focus the beaker, choose it, then its recommended action — Enter only, focus follows the result
    await page.locator(`${LAB} [data-object="apparatus:beaker"]`).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(`${LAB} .kl-dlab__actions h3`)).toBeFocused();
    const setup = page.locator(`${LAB} .kl-dlab__action-list [data-action-family=SETUP_APPARATUS]`);
    await expect(setup).toHaveAttribute('data-category', 'recommended');
    await setup.focus(); await page.keyboard.press('Enter');
    await expect(result(page)).toBeFocused();
    await expect(result(page)).toContainText('1-qadami bajarildi');
    // the 20 ml limit comes from the instruction
    await object(page, 'substance:water'); await action(page, 'ADD_SUBSTANCE');
    await page.locator('#dlab-param-container').selectOption('beaker');
    await page.locator('#dlab-param-quantity').fill('50');
    await page.locator(`${LAB} .kl-dlab__params button[type=submit]`).click();
    await expect(result(page)).toHaveAttribute('data-code', 'QUANTITY_LIMIT');
    // "Nega?": an instruction-derived observation is labelled as instruction text, never as model chemistry
    await addTo(page, 'water', 'beaker');                     // the declared 20 ml (the form's default)
    await expect(result(page)).toHaveAttribute('data-status', 'accepted');
    await on(page, 'apparatus:glass-rod', 'SETUP_APPARATUS');
    await addTo(page, 'contaminated-salt', 'beaker');
    await on(page, 'apparatus:beaker', 'MIX');
    await expect(page.locator(`${LAB} .kl-dlab__sources li[data-grounding=INSTRUCTION_TEXT]`)).toContainText('ko‘rsatmaning o‘z jumlasidan');
    await expect(page.locator(`${LAB} .kl-dlab__sources li[data-grounding=MODEL_BASED]`)).toContainText('eruvchanlik');
    // guidance level 4 shows the instruction sentence and never an outcome
    await page.locator('#dlab-guidance-4').check();
    await expect(page.locator(`${LAB} .kl-dlab__guidance-text`)).toContainText('20 ml distillangan suvga');
    await expect(page.locator(`${LAB} .kl-dlab__guidance-text`)).not.toContainText('kristall');
    await page.locator(`${LAB} [data-dlab-reset]`).click();
    await expect(result(page)).toHaveAttribute('data-code', 'RESET');
    await expect(page.locator(`${LAB} .kl-dlab__state`)).toContainText('hali yo‘q');
  });

  test(`${name}: accessibility — names, groups, bound errors, 320 px reflow, targets, reduced motion`, async ({page}) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.setViewportSize({width: 320, height: 800});
    await hosts[name].open(page, `/dynamic-lab/practice.experiment.7.2${FLAG}`);
    await object(page, 'substance:water'); await action(page, 'ADD_SUBSTANCE');
    await page.locator(`${LAB} .kl-dlab__params button[type=submit]`).click();   // empty container → bound alert
    await expect(page.locator(`${LAB} .kl-dlab__params [role=alert]`)).toHaveText('Barcha sozlamalarni to‘ldiring.');
    await expect(page.locator('#dlab-param-container')).toBeFocused();
    const s = await semantics(page);
    expect(s.unnamed).toEqual([]); expect(s.ungrouped).toEqual([]); expect(s.unboundErrors).toEqual([]);
    expect(s.duplicateIds).toBe(0); expect(s.positiveTabindex).toBe(0); expect(s.h1).toBe(1); expect(s.liveRegions).toBeGreaterThan(0);
    const r = await reflow(page);
    expect(r.horizontalScroll, r.culprit).toBe(false); expect(r.clipped).toBe(0);
    expect(await targetSizes(page)).toEqual([]);
    const m = await motion(page);
    expect(m.running).toBe(0);
  });
}
