// P2.7 — keyboard-only learner driver + per-activity accessibility audit, shared by the sweep spec and the family
// regression specs. The driver executes the operations of a flow plan (scripts/lib/accessibility-plan.ts) with
// Tab / Shift+Tab / arrows / Space / Enter / typing only — no click, no fill(), no element.check().
import {WORKSPACE, tabTo, focusFacts, semantics, announced, alerts, reflow, targetSizes, motion, settle, VERDICT_WRONG, VERDICT_RIGHT} from './a11y.mjs';

const NEXT = 'Mustahkamlashga o‘tish';
/** two animation frames + a short pause: style and layout changes are applied before anything is measured */
const layoutSettled = async (page) => { await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForTimeout(120); };
const pause = (page, ms = 60) => page.waitForTimeout(ms);

async function checkedIndex(radios) {
  return radios.evaluateAll((xs) => xs.findIndex((x) => x.checked));
}
/** arrow keys inside a radio group until option `index` is checked (Space first when nothing is checked yet) */
async function arrowTo(page, radios, index, state) {
  const n = await radios.count();
  if (await checkedIndex(radios) < 0) { await page.keyboard.press('Space'); await pause(page); }
  for (let i = 0; i <= n + 1; i += 1) {
    const current = await checkedIndex(radios);
    if (current === index) return;
    await page.keyboard.press(index > current ? 'ArrowDown' : 'ArrowUp');
    await pause(page, 90);
  }
  state.issues.add('RADIO_TARGET_NOT_REACHED');
  throw new Error('RADIO_TARGET_NOT_REACHED');
}
async function typeInto(page, value) {
  await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Backspace');
  if (value) await page.keyboard.type(value);
}
/** after an action that produces a result: wait for the announcement and check focus did not fall to <body> */
async function afterUpdate(page, before, state) {
  const now = await settle(page, before);
  const f = await focusFacts(page);
  if (f.onBody) state.issues.add('FOCUS_LOST_AFTER_UPDATE');
  return now;
}

/** Execute one operation with the keyboard. Returns the announced text after it. */
export async function runOp(page, op, state) {
  const before = await announced(page);
  if (op.op === 'choice' || op.op === 'type') {
    const form = page.locator(`${WORKSPACE} .kl-question`).nth(op.form);
    if (op.op === 'choice') {
      const radios = form.locator('input[type=radio]');
      await tabTo(page, radios.first(), state, {group: true});
      if (op.index >= 0) await arrowTo(page, radios, op.index, state);
      await tabTo(page, form.locator('button[type=submit]'), state);
      await page.keyboard.press('Enter');
    } else {
      await tabTo(page, form.locator('input').first(), state);
      await typeInto(page, op.value);
      await page.keyboard.press('Enter');
    }
    return afterUpdate(page, before, state);
  }
  if (op.op === 'step') {
    await tabTo(page, page.locator(`${WORKSPACE} .kl-experiment-step button`).nth(op.index), state);
    await page.keyboard.press('Enter');
    const text = await afterUpdate(page, before, state);
    // a colour change recorded WITHOUT its colour: the content has no description to show (BLOCKED_BY_CONTENT)
    const observation = await page.locator(`${WORKSPACE} .kl-experiment-observation`).textContent().catch(() => '');
    if (/(— |; )rang o‘zgarishi(;| qayd)/.test(observation ?? '')) state.issues.add('CONTENT_COLOR_OBSERVATION_UNDESCRIBED');
    return text;
  }
  if (op.op === 'case') {
    const form = page.locator(`${WORKSPACE} form.kl-form`).first();
    const boxes = form.locator('input[type=checkbox]');
    for (const i of op.checks) { await tabTo(page, boxes.nth(i), state); await page.keyboard.press('Space'); }
    await tabTo(page, form.locator('input[name=decision]'), state); await typeInto(page, op.decision);
    await tabTo(page, form.locator('textarea[name=justification]'), state); await typeInto(page, op.justification);
    await tabTo(page, form.locator('button[type=submit]'), state);
    await page.keyboard.press('Enter');
    return afterUpdate(page, before, state);
  }
  if (op.op === 'radio') {
    const target = page.locator(`${WORKSPACE} input[${op.attr}="${op.value}"], ${WORKSPACE} [${op.attr}="${op.value}"] input`).first();
    const name = await target.getAttribute('name');
    const radios = page.locator(`${WORKSPACE} input[type=radio][name="${name}"]`);
    await tabTo(page, radios.first(), state, {group: true});
    const index = await radios.evaluateAll((xs, t) => xs.findIndex((x) => x.matches(t)), `input[${op.attr}="${op.value}"], [${op.attr}="${op.value}"] input`);
    await arrowTo(page, radios, index, state);
    return afterUpdate(page, before, state);
  }
  if (op.op === 'select') {
    const select = page.locator(`${WORKSPACE} select[data-slot="${op.slot}"]`);
    await tabTo(page, select, state);
    const values = await select.locator('option').evaluateAll((xs) => xs.map((x) => x.value));
    for (let i = 0; i <= values.length; i += 1) {
      const current = await select.inputValue();
      if (current === op.value) break;
      await page.keyboard.press(values.indexOf(op.value) > values.indexOf(current) ? 'ArrowDown' : 'ArrowUp');
      await pause(page, 40);
    }
    if (await select.inputValue() !== op.value) { state.issues.add('SELECT_TARGET_NOT_REACHED'); throw new Error('SELECT_TARGET_NOT_REACHED'); }
    return afterUpdate(page, before, state);
  }
  if (op.op === 'press') {
    await tabTo(page, page.locator(`${WORKSPACE} ${op.selector}`).first(), state);
    for (let i = 0; i < (op.times ?? 1); i += 1) { await page.keyboard.press('Enter'); await pause(page, 50); }
    return afterUpdate(page, before, state);
  }
  // fill
  await tabTo(page, page.locator(`${WORKSPACE} ${op.selector}`).first(), state);
  await typeInto(page, op.value);
  await page.keyboard.press('Enter');
  return afterUpdate(page, before, state);
}

async function runOps(page, ops, state) {
  let text = '';
  for (const op of ops) text = await runOp(page, op, state);
  return text;
}

/** checks every family shares; `applies` false → NOT_APPLICABLE (never counted as a pass) */
export const CHECKS = ['keyboard', 'noKeyboardTrap', 'focusVisible', 'noFocusLoss', 'accessibleName', 'groupSemantics', 'headings', 'statusAnnouncement', 'errorAnnouncement', 'wrongAnswer', 'retry', 'nonColor', 'srTextState', 'reflow320', 'reflow375', 'zoom200', 'textScale', 'targetSize', 'reducedMotion', 'noPageError'];

/**
 * Full audit of ONE activity through the real learner path (open → keyboard → empty input → wrong answer → retry →
 * complete), then reflow / target size / reduced motion on the finished state. Returns facts, never throws.
 */
export async function auditActivity(page, open, plan) {
  const state = {issues: new Set(), notes: new Set(), focusStops: 0};
  const result = {};
  const errors = []; const onError = (e) => errors.push(String(e.message).slice(0, 120)); page.on('pageerror', onError);
  const set = (k, ok, applies = true) => { result[k] = !applies ? 'NOT_APPLICABLE' : ok ? 'PASS' : 'FAIL'; };
  try {
    await page.setViewportSize({width: 1280, height: 900});
    await page.emulateMedia({reducedMotion: 'no-preference'});
    await open(page, `/practice/${plan.activityId}`);
    await page.locator(`${WORKSPACE} button, ${WORKSPACE} input`).first().waitFor({timeout: 10000});
    await page.waitForTimeout(150);
    const initial = await semantics(page);
    const isRenderer = plan.family.startsWith('renderer:');
    // a fresh attempt: navigate AND reload — in the standalone host the same hash route is not a navigation at all
    const reopen = async () => { await open(page, `/practice/${plan.activityId}`); await page.reload(); await page.locator(`${WORKSPACE} button, ${WORKSPACE} input`).first().waitFor({timeout: 10000}); await page.waitForTimeout(150); };

    // empty / invalid input: announced, bound to its control, focus stays in the form
    let errorOk = null;
    if (plan.empty) {
      const before = await announced(page);
      const after = await runOps(page, plan.empty, state).catch((e) => { state.issues.add(`EMPTY_PROBE:${e.message}`); return before; });
      // announced = a role=alert message, or a live-region sentence that changed because of the invalid input
      const a = (await alerts(page)) || (after !== before ? after : ''); const f = await focusFacts(page); const s = await semantics(page);
      errorOk = Boolean(a) && s.unboundErrors.length === 0 && f.inWorkspace;
      if (!a) state.issues.add('ERROR_NOT_ANNOUNCED'); if (s.unboundErrors.length) state.issues.add('ERROR_NOT_BOUND_TO_CONTROL'); if (!f.inWorkspace) state.issues.add('FOCUS_LEFT_FORM_ON_ERROR');
      if (isRenderer) { await reopen(); }
    }
    // wrong answer: announced as text; legacy forms continue in the SAME attempt (keyboard retry)
    let wrongOk = null; let retried = false;
    if (plan.wrong) {
      const text = await runOps(page, plan.wrong, state).catch((e) => { state.issues.add(`WRONG_PROBE:${e.message}`); return ''; });
      const accepted = plan.wrong[0].op === 'step' && (await page.locator(`${WORKSPACE} .kl-experiment-step button`).nth(plan.wrong[0].index).getAttribute('aria-disabled')) === 'true';
      if (accepted) { wrongOk = null; state.notes.add('STEP_ORDER_NOT_ENFORCED_BY_ENGINE: the out-of-order step was accepted, so there is no wrong answer to announce'); }
      // the engine judged nothing: a non-target value is recorded as progress ("Natija saqlandi. Davom eting.") for EVERY
      // learner — a feedback-design question, not an accessibility inequivalence (reported as a note, never as a pass)
      else if (/Davom eting/.test(text) && !VERDICT_WRONG.test(text)) { wrongOk = null; state.notes.add('ENGINE_GIVES_NO_VERDICT_FOR_NON_TARGET_STATE: a non-target value is accepted as progress, so there is no wrong answer to announce'); }
      else { wrongOk = VERDICT_WRONG.test(text); if (!wrongOk) state.issues.add('WRONG_ANSWER_NOT_ANNOUNCED'); }
      if (isRenderer) { await reopen(); }
      else retried = true;
    }
    let completed = false; let finalText = '';
    try {
      finalText = await runOps(page, plan.success, state);
      completed = await page.getByRole('link', {name: NEXT}).isVisible();
      if (!completed) state.issues.add('NOT_COMPLETED_BY_KEYBOARD');
    } catch (e) { state.issues.add(`KEYBOARD:${e.message}`); }
    const final = await semantics(page);
    const names = [...new Set([...initial.unnamed, ...final.unnamed])];
    const generic = [...new Set([...initial.genericNames, ...final.genericNames])];
    const dupes = [...new Set(final.duplicateButtonNames)];
    const ungrouped = [...new Set([...initial.ungrouped, ...final.ungrouped])];
    names.forEach((n) => state.issues.add(`UNNAMED_CONTROL:${n}`)); dupes.forEach((n) => state.issues.add(`AMBIGUOUS_BUTTON_NAME:${n}`)); ungrouped.forEach(() => state.issues.add('UNGROUPED_CHOICE'));
    generic.forEach((n) => state.issues.add(`CONTENT_LABEL_MISSING:${n}`));
    const headingJump = final.headings.some((h, i) => i > 0 && h - final.headings[i - 1] > 1);
    if (final.h1 !== 1 || headingJump) state.issues.add('HEADING_STRUCTURE');
    if (final.positiveTabindex) state.issues.add('POSITIVE_TABINDEX');
    if (final.duplicateIds) state.issues.add('DUPLICATE_ID');

    set('keyboard', completed);
    set('noKeyboardTrap', ![...state.issues].some((i) => i.includes('UNREACHABLE')));
    set('focusVisible', state.focusStops > 0 && ![...state.issues].some((i) => i.startsWith('FOCUS_NOT_VISIBLE')));
    set('noFocusLoss', !state.issues.has('FOCUS_LOST_AFTER_UPDATE') && !state.issues.has('FOCUS_LEFT_FORM_ON_ERROR'));
    set('accessibleName', names.length === 0 && dupes.length === 0 && final.duplicateIds === 0);
    set('groupSemantics', ungrouped.length === 0, (await page.locator(`${WORKSPACE} input[type=radio], ${WORKSPACE} input[type=checkbox]`).count()) > 0);
    set('headings', final.h1 === 1 && !headingJump);
    set('statusAnnouncement', final.liveRegions > 0 && VERDICT_RIGHT.test(finalText || (await announced(page))));
    set('errorAnnouncement', errorOk, errorOk !== null);
    set('wrongAnswer', wrongOk, wrongOk !== null);
    set('retry', completed, retried);
    set('nonColor', VERDICT_RIGHT.test(await announced(page)) && (wrongOk ?? true));
    set('srTextState', Boolean(await announced(page)) && completed);

    // reflow at 320 / 375 CSS px, 200 % zoom (= 640 CSS px on a 1280 window), 200 % text size
    for (const [key, width] of [['reflow320', 320], ['reflow375', 375], ['zoom200', 640]]) {
      await page.setViewportSize({width, height: 800}); await layoutSettled(page);
      const r = await reflow(page);
      if (r.horizontalScroll) state.issues.add(`HORIZONTAL_SCROLL@${width}:${r.culprit}`); if (r.overlaps) state.issues.add(`OVERLAP@${width}`); if (r.clipped) state.issues.add(`CLIPPED@${width}:${r.culprit}`);
      set(key, !r.horizontalScroll && !r.overlaps && !r.clipped);
      if (width === 375) { const small = await targetSizes(page); small.forEach((s) => state.issues.add(`TARGET_SMALL:${s.split(':')[0]}`)); set('targetSize', small.length === 0); }
    }
    await page.setViewportSize({width: 1280, height: 900});
    await page.addStyleTag({content: 'html{font-size:200%!important}'}); await layoutSettled(page);
    { const r = await reflow(page); if (r.horizontalScroll || r.overlaps || r.clipped) state.issues.add(`TEXT_SCALE_200:${r.horizontalScroll ? 'scroll' : r.overlaps ? 'overlap' : 'clipped'}:${r.culprit}`); set('textScale', !r.horizontalScroll && !r.overlaps && !r.clipped); }
    await page.emulateMedia({reducedMotion: 'reduce'}); await layoutSettled(page);
    { const m = await motion(page); if (m.running || m.transitions) state.issues.add('MOTION_UNDER_REDUCE'); set('reducedMotion', m.running === 0 && m.transitions === 0); }
  } catch (e) {
    state.issues.add(`AUDIT_ABORTED:${String(e.message).split('\n')[0].slice(0, 80)}`);
    for (const k of CHECKS) if (!result[k]) result[k] = 'FAIL';
  } finally { page.off('pageerror', onError); }
  if (errors.length) state.issues.add('PAGE_ERROR');
  result.noPageError = errors.length ? 'FAIL' : 'PASS';
  return {checks: Object.fromEntries(CHECKS.map((k) => [k, result[k] ?? 'FAIL'])), issues: [...state.issues].sort(), ...(state.notes.size ? {notes: [...state.notes].sort()} : {})};
}
