// P2.7 — reusable, dependency-free accessibility checks for real learner flows (Playwright page in, plain facts out).
// One helper per WCAG concern instead of copy-pasted E2E code: tab-through with focus visibility, accessible name,
// group semantics, status/error announcement, non-colour verdict text, reflow, target size, reduced motion.
// Everything here only OBSERVES the page (and presses keys like a learner); it never reads answers from the DOM.

/** Workspace that holds the learner's controls (legacy practice card or a registry renderer). */
export const WORKSPACE = '.kl-practice-workspace';
export const VERDICT_WRONG = /noto‘g‘ri|urinib ko‘ring|✗/i;
export const VERDICT_RIGHT = /to‘g‘ri\.|✓|yakunlandi|maqsadga erishildi/i;
/** Names that exist but tell a screen-reader user nothing: catalog fallbacks used when content has no label. */
export const GENERIC_NAME = /^(\d+-(variant|qadam|dalil|ishora)|#\d+|…)$/;

/** Facts about the focused element: is it inside the workspace, and is a focus indicator painted? */
export async function focusFacts(page) {
  return page.evaluate((ws) => {
    const el = document.activeElement;
    if (!el || el === document.body) return {onBody: true, inWorkspace: false, visible: false, tag: 'BODY'};
    const cs = getComputedStyle(el);
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2;
    const ring = cs.boxShadow && cs.boxShadow !== 'none';
    return {onBody: false, inWorkspace: Boolean(el.closest(ws)), visible: Boolean(outline || ring), tag: el.tagName, type: el.getAttribute('type') ?? ''};
  }, WORKSPACE);
}

/**
 * Move focus with Tab / Shift+Tab (the direction follows DOM order) until `locator` (or a radio of its group) holds
 * focus. Records every focus stop inside the workspace without a visible indicator. Throws KEYBOARD_UNREACHABLE.
 */
export async function tabTo(page, locator, state, {group = false, max = 120} = {}) {
  const handle = await locator.elementHandle({timeout: 3000}).catch(() => null);
  if (!handle) throw new Error('KEYBOARD_TARGET_MISSING');
  for (let i = 0; i < max; i += 1) {
    const where = await handle.evaluate((target, isGroup) => {
      const a = document.activeElement;
      const hit = a === target || (isGroup && a instanceof HTMLInputElement && a.type === 'radio' && a.name === target.name);
      if (hit) return 'here';
      if (!a || a === document.body) return 'after';
      return a.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING ? 'after' : 'before';
    }, group);
    if (where === 'here') { await recordFocus(page, state); return; }
    await page.keyboard.press(where === 'after' ? 'Tab' : 'Shift+Tab');
    await recordFocus(page, state);
  }
  throw new Error('KEYBOARD_UNREACHABLE');
}
async function recordFocus(page, state) {
  const f = await focusFacts(page);
  if (f.inWorkspace) { state.focusStops += 1; if (!f.visible) state.issues.add(`FOCUS_NOT_VISIBLE:${f.tag.toLowerCase()}${f.type ? `[${f.type}]` : ''}`); }
}

/** Accessible-name audit of every control in the workspace (simplified accname: labelledby, label, aria-label, text).
 *  P2.12: `ws` scopes the audit to another root (the Content Studio); the default — the learner workspace — is unchanged. */
export async function semantics(page, ws = WORKSPACE) {
  return page.evaluate(({ws, generic}) => {
    const root = document.querySelector(ws); const out = {unnamed: [], genericNames: [], ungrouped: [], duplicateButtonNames: [], unboundErrors: [], headings: [], positiveTabindex: 0, duplicateIds: 0, liveRegions: 0, h1: 0};
    if (!root) return {...out, missingWorkspace: true};
    const text = (n) => (n?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const nameOf = (el) => {
      const by = el.getAttribute('aria-labelledby');
      if (by) return by.split(/\s+/).map((id) => text(document.getElementById(id))).join(' ').trim();
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
      if (el.labels?.length) return [...el.labels].map(text).join(' ').trim();
      if (el.tagName === 'BUTTON' || el.tagName === 'A') return text(el);
      return (el.getAttribute('title') ?? '').trim();
    };
    const controls = [...root.querySelectorAll('button, input:not([type=hidden]), select, textarea, a[href]')].filter((el) => el.getClientRects().length);
    const buttonNames = new Map();
    for (const el of controls) {
      const name = nameOf(el); const id = el.tagName.toLowerCase() + (el.type ? `[${el.type}]` : '');
      if (!name) out.unnamed.push(id);
      else if (generic.test(name)) out.genericNames.push(name);
      if ((el.type === 'radio' || el.type === 'checkbox')) {
        const group = el.closest('fieldset, [role=group], [role=radiogroup]');
        const legend = group?.tagName === 'FIELDSET' ? text(group.querySelector(':scope > legend')) : (group ? nameOf(group) : '');
        if (!legend) out.ungrouped.push(name || id);
      }
      if (el.tagName === 'BUTTON' && !el.disabled) {
        const desc = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).map((x) => text(document.getElementById(x))).join(' ');
        const key = `${name}|${desc}`; buttonNames.set(key, (buttonNames.get(key) ?? 0) + 1);
      }
    }
    out.duplicateButtonNames = [...buttonNames].filter(([, n]) => n > 1).map(([k]) => k.split('|')[0]);
    for (const alert of root.querySelectorAll('[role=alert]')) {
      if (!alert.id || !root.querySelector(`[aria-describedby~="${alert.id}"]`)) out.unboundErrors.push(alert.className || 'alert');
    }
    out.headings = [...document.querySelectorAll('main h1, main h2, main h3, main h4, h1')].map((h) => Number(h.tagName[1]));
    out.h1 = document.querySelectorAll('h1').length;
    out.positiveTabindex = root.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').length;
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id); out.duplicateIds = ids.length - new Set(ids).size;
    out.liveRegions = root.querySelectorAll('[role=status], [aria-live]').length;
    return out;
  }, {ws, generic: GENERIC_NAME});
}

/** All announced text (live regions + alerts) inside the workspace. */
export async function announced(page) {
  return page.evaluate((ws) => [...document.querySelectorAll(`${ws} [role=status], ${ws} [aria-live], ${ws} [role=alert]`)].map((n) => n.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '), WORKSPACE);
}
/** Alert text inside the workspace (validation / unsupported input). */
export async function alerts(page) {
  return page.evaluate((ws) => [...document.querySelectorAll(`${ws} [role=alert]`)].map((n) => n.textContent.trim()).filter(Boolean).join(' | '), WORKSPACE);
}

/** Reflow: no page-level horizontal scroll, no overlapping controls, every control still on screen width. */
export async function reflow(page) {
  return page.evaluate((ws) => {
    const doc = document.documentElement; const vw = doc.clientWidth;
    const root = document.querySelector(ws);
    // a real data table may scroll inside its own wrapper (WCAG 1.4.10 exception) — the page itself may not
    const controls = root ? [...root.querySelectorAll('button, input:not([type=hidden]), select, textarea, a[href], label')].filter((el) => el.getClientRects().length) : [];
    const boxes = controls.map((el) => ({el, r: el.getBoundingClientRect()}));
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i], b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el) || (a.el.tagName === 'LABEL' && a.el.control === b.el) || (b.el.tagName === 'LABEL' && b.el.control === a.el)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left); const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 2 && h > 2) overlaps += 1;
    }
    const clippedEls = boxes.filter(({r}) => r.right > vw + 1 || r.left < -1);
    // culprit: the first text that runs past the viewport outside any scroll container (a long word, a wide control)
    const scrolls = (el) => { for (let x = el; x && x !== document.body; x = x.parentElement) if (getComputedStyle(x).overflowX !== 'visible') return true; return false; };
    let wide = null; const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let node;
    while (!wide && (node = walker.nextNode())) { const range = document.createRange(); range.selectNodeContents(node); if (range.getBoundingClientRect().right > vw + 1 && !scrolls(node.parentElement)) wide = node.parentElement; }
    const tag = (el) => el ? `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}` : '';
    return {horizontalScroll: doc.scrollWidth > vw + 1, overlaps, clipped: clippedEls.length, culprit: tag(clippedEls[0]?.el ?? (doc.scrollWidth > vw + 1 ? wide : null))};
  }, WORKSPACE);
}

/** Pointer/touch targets: buttons, text inputs and selects, and the clickable label around a radio/checkbox. */
export async function targetSizes(page, min = 44) {
  return page.evaluate(({ws, min}) => {
    const root = document.querySelector(ws); if (!root) return [];
    const small = [];
    for (const el of root.querySelectorAll('button, input:not([type=hidden]), select, textarea')) {
      if (!el.getClientRects().length) continue;
      const box = (el.type === 'radio' || el.type === 'checkbox') ? (el.closest('label') ?? el) : el;
      const r = box.getBoundingClientRect();
      if (r.height < min - 0.5) small.push(`${el.tagName.toLowerCase()}${el.type ? `[${el.type}]` : ''}:${Math.round(r.height)}`);
    }
    return small;
  }, {ws: WORKSPACE, min});
}

/** Under prefers-reduced-motion: reduce nothing in the app may animate or transition. */
export async function motion(page) {
  return page.evaluate(() => {
    const running = document.getAnimations().filter((a) => a.playState === 'running').length;
    const transitions = [...document.querySelectorAll('.kl-app *')].filter((el) => getComputedStyle(el).transitionDuration.split(',').some((d) => parseFloat(d) > 0)).length;
    return {running, transitions};
  });
}

/** Wait until announced text stops changing (results are applied asynchronously). */
export async function settle(page, before) {
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(60);
    const now = await announced(page);
    if (now !== before && i > 1) { await page.waitForTimeout(60); return announced(page); }
  }
  return announced(page);
}
