// P2.12 — Content Studio end to end in real Chromium, against the SEPARATE Studio build (dist-studio in a temp dir,
// served by scripts/serve-content-studio.mjs on 127.0.0.1).
//   flag off      → a notice, no Studio
//   PDF lane      → class → topic → synthetic PDF upload → learner preview (“Darslikdan o‘qish”, PDF on demand) →
//                   check → deterministic publish candidate that the CLI re-verifies; a non-PDF is refused
//   lab lane      → class → topic → the canonical 7.10 instruction → the learner dynamic lab as preview, partial and
//                   unsupported parts in plain Uzbek → candidate; a changed instruction gets no improvised lab view
//   unsafe PDF    → active content or a header-only file is refused at upload; no PDF viewer element is ever created
//   author text   → no technical concept anywhere in the Studio's own UI
//   accessibility → labels, bound errors, focus, 320 px reflow, 44 px targets, no motion
import {test, expect} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createStudioServer} from '../../scripts/serve-content-studio.mjs';
import {semantics, reflow, targetSizes, motion} from '../helpers/a11y.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kimyolab-studio-'));
const out = path.join(tmp, 'dist-studio');
const pdfFile = path.join(tmp, 'sinov qismi.pdf');
const notPdf = path.join(tmp, 'notpdf.pdf');
const activePdf = path.join(tmp, 'faol.pdf');
const brokenPdf = path.join(tmp, 'buzuq.pdf');
// the same terms the readiness report checks the catalog against — here applied to the live Studio UI
const TECHNICAL = /\bJSON\b|schema|learningUnitId|\blu\.\d|practice\.|theory\.|ReactionMatcher|IonicEngine|ElectrolysisModel|SchoolLab|handler|\bfamily\b|sha-?256|\bhash\b|checksum|revision|\bcommit\b|\bbranch\b|\bCI\b|kimyolab\.[a-z-]+\.v\d|\b[A-Z]{3,}_[A-Z_]{3,}\b|\bnull\b|undefined/i;
const FLAG = '?ff=contentStudioV1';
let server, base;

function node(args) { const r = spawnSync(process.execPath, ['--no-warnings', ...args], {cwd: root, encoding: 'utf8'}); if (r.status !== 0) throw new Error(`${args.join(' ')}\n${r.stdout}\n${r.stderr}`); return r.stdout; }

test.beforeAll(async () => {
  node(['scripts/build-content-studio.ts', out]);
  node(['--input-type=module', '-e', `import {syntheticPdf} from ${JSON.stringify(pathToFileURL(path.join(root, 'scripts/lib/synthetic-pdf.ts')).href)};import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(pdfFile)},syntheticPdf());`]);
  fs.writeFileSync(notPdf, '<html><body>not a pdf</body></html>');
  // synthetic negatives: a structurally valid PDF carrying a JavaScript open action, and a header + %%EOF shell
  node(['--input-type=module', '-e', `import {syntheticPdf} from ${JSON.stringify(pathToFileURL(path.join(root, 'scripts/lib/synthetic-pdf.ts')).href)};import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(activePdf)},syntheticPdf(undefined,{catalogExtra:'/OpenAction << /S /JavaScript /JS (app.alert(1)) >>'}));`]);
  fs.writeFileSync(brokenPdf, '%PDF-1.4\n%%EOF\n');
  server = createStudioServer(out);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
test.afterAll(async () => { await new Promise((r) => server.close(r)); fs.rmSync(tmp, {recursive: true, force: true}); });

/** the Studio's own text (the learner preview region is the learner app itself and is checked by its own suites) */
async function authorText(page) {
  return page.locator('[data-content-studio]').evaluate((el) => { const c = el.cloneNode(true); c.querySelectorAll('[data-studio-preview]').forEach((n) => n.remove()); return c.innerText; });
}
async function choose(page, grade, topic, role) {
  await page.goto(base + FLAG);
  await page.locator('#studio-grade').selectOption(String(grade));
  await page.locator('#studio-topic').selectOption(topic);
  await page.locator(`#studio-role-${role}`).check();
  await page.locator('[data-studio-next]').click();
}
async function downloadCandidate(page) {
  await page.locator('[data-studio-prepare]').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-studio-download]').click()]);
  const file = path.join(tmp, `candidate-${Date.now()}.json`);
  await download.saveAs(file);
  return file;
}

test('flag off: a notice, no Studio', async ({page}) => {
  await page.goto(base);
  await expect(page.locator('[role=status]')).toContainText('Kontent studiyasi yoqilmagan');
  await expect(page.locator('[data-content-studio]')).toHaveCount(0);
});

test('PDF lane: synthetic excerpt → learner preview on demand → check → candidate verified by the CLI', async ({page}) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await choose(page, 7, 'lu.7.01', 'textbook_excerpt');
  await expect(page.locator('h2')).toHaveText('To‘ldirish');
  // empty submit: a bound, announced error and focus on the first field to fix
  await page.locator('[data-studio-next]').click();
  await expect(page.locator('#studio-form-error')).toHaveText('Belgilangan maydonlarni to‘ldiring.');
  await expect(page.locator('#studio-x-title')).toBeFocused();
  await expect(page.locator('#studio-x-title')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#studio-x-title')).toHaveAttribute('aria-describedby', /studio-form-error/);
  // a non-PDF is refused in plain Uzbek
  await page.locator('#studio-x-file').setInputFiles(notPdf);
  await expect(page.locator('[data-studio-file-status]')).toHaveText('Bu fayl PDF emas yoki uni o‘qib bo‘lmaydi.');
  await page.locator('#studio-x-title').fill('Sinov qismi');
  await page.locator('#studio-x-source-title').fill('Sinov darsligi');
  await page.locator('#studio-x-source-authority').fill('Sinov nashriyoti');
  await page.locator('#studio-x-page-from').fill('12'); await page.locator('#studio-x-page-to').fill('14');
  await page.locator('#studio-x-file').setInputFiles(pdfFile);
  await expect(page.locator('[data-studio-file-status]')).toContainText('Fayl qabul qilindi: sinov-qismi.pdf');
  await page.locator('#studio-x-author').fill('Sinov Muallifi');
  await page.locator('[data-studio-next]').click();
  // preview: the learner renderer; nothing is loaded until the learner opens it
  const frame = page.locator('[data-studio-preview]');
  await expect(frame.locator('[data-textbook-excerpt]')).toContainText('Darslikdan o‘qish');
  await expect(frame).toContainText('12–14');
  await expect(frame.locator('[data-excerpt-pdf]')).toHaveCount(0);
  await frame.locator('[data-excerpt-open]').click();
  await expect(frame.locator('[data-excerpt-pdf]')).toHaveAttribute('data', /^blob:/);
  await page.locator('#studio-mode-mobile').check();
  await expect(frame).toHaveAttribute('data-mode', 'mobile');
  await page.locator('[data-studio-next]').click();
  // check: attention for rights and source acceptance, never a fabricated approval
  await expect(page.locator('[data-studio-status]')).toHaveAttribute('data-studio-status', 'ATTENTION_REQUIRED');
  await expect(page.locator('[data-studio-findings]')).toContainText('Nashr qilish huquqi hali hujjatlashtirilmagan');
  await expect(page.locator('[data-studio-findings]')).toContainText('Darslik manbasini mutaxassis qabul qilishi kerak.');
  await page.locator('[data-studio-next]').click();
  await expect(page.locator('main')).toContainText('Studiyadan to‘g‘ridan-to‘g‘ri nashr qilib bo‘lmaydi');
  await expect(page.getByRole('button', {name: 'Nashr qilish', exact: true})).toHaveCount(0);
  const file = await downloadCandidate(page);
  const check = JSON.parse(node(['scripts/content-studio.ts', 'check', file]));
  expect(check).toEqual({file: path.basename(file), ok: true, problems: []});
  const candidate = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(candidate.derived.sourceIntake.status).toBe('draft');
  expect(candidate.derived.sourceIntake.reviews).toEqual([]);
  expect(candidate.humanGates.every((g) => g.status === 'REQUIRED')).toBe(true);
  expect(await authorText(page)).not.toMatch(TECHNICAL);
  expect(errors).toEqual([]);
});

test('unsafe PDF: active content and a header-only file are refused; no PDF viewer is ever created', async ({page}) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  // count every viewer-capable element the page ever inserts, from the first script on
  await page.addInitScript(() => {
    window.__viewers = 0;
    new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) window.__viewers += (n.matches('object,embed,iframe') ? 1 : 0) + n.querySelectorAll('object,embed,iframe').length; })
      .observe(document, {childList: true, subtree: true});
  });
  await choose(page, 7, 'lu.7.01', 'textbook_excerpt');
  await page.locator('#studio-x-title').fill('Sinov qismi');
  await page.locator('#studio-x-source-title').fill('Sinov darsligi');
  await page.locator('#studio-x-source-authority').fill('Sinov nashriyoti');
  await page.locator('#studio-x-author').fill('Sinov Muallifi');
  // a safe file first, then replaced by an active one: the safe one is dropped too (fail closed)
  await page.locator('#studio-x-file').setInputFiles(pdfFile);
  await expect(page.locator('[data-studio-file-status]')).toContainText('Fayl qabul qilindi');
  await page.locator('#studio-x-file').setInputFiles(activePdf);
  await expect(page.locator('[data-studio-file-status]')).toContainText('faol yoki interaktiv qismlar bor');
  await expect(page.locator('[data-studio-file-status]')).toContainText('statik PDF fayl bilan almashtiring');
  await expect(page.locator('#studio-x-file')).toHaveAttribute('aria-invalid', 'true');
  // there is no accepted file, so the author cannot go on to a preview
  await page.locator('[data-studio-next]').click();
  await expect(page.locator('h2')).toHaveText('To‘ldirish');
  await expect(page.locator('#studio-form-error')).toHaveText('Belgilangan maydonlarni to‘ldiring.');
  await expect(page.locator('#studio-x-file')).toBeFocused();
  // a header + %%EOF with nothing valid in between has no provable structure
  await page.locator('#studio-x-file').setInputFiles(brokenPdf);
  await expect(page.locator('[data-studio-file-status]')).toContainText('ichki tuzilishi buzilgan');
  await page.locator('[data-studio-next]').click();
  await expect(page.locator('h2')).toHaveText('To‘ldirish');
  await expect(page.locator('[data-textbook-excerpt]')).toHaveCount(0);
  await expect(page.locator('object,embed,iframe')).toHaveCount(0);
  expect(await page.evaluate(() => window.__viewers)).toBe(0);
  expect(TECHNICAL.test(await authorText(page))).toBe(false);
  expect(errors).toEqual([]);
});

test('lab lane: canonical 7.10 instruction → learner dynamic lab preview, partial in plain Uzbek → candidate', async ({page}) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await choose(page, 7, 'lu.7.15', 'lab_instruction');
  await page.locator('[data-studio-start-existing]').click();
  await expect(page.locator('[data-studio-lab-source]')).toHaveText('Mavzuning mavjud yo‘riqnomasi nusxalandi. Asl matn o‘zgarmaydi.');
  await expect(page.locator('#studio-lab-steps')).toHaveValue(/Magniy ustiga suyultirilgan H2SO4 quying/);
  await page.locator('[data-studio-next]').click();
  const frame = page.locator('[data-studio-preview]');
  await expect(frame.locator('[data-dynamic-lab="lab-profile.7.10.metal-acid-gas"]')).toBeVisible();
  await expect(frame.locator('[data-dynamic-lab]')).toHaveAttribute('data-completion-scope', 'PARTIAL_INSTRUCTION');
  await expect(page.locator('main')).toContainText('Bu laboratoriya yo‘riqnomaning faqat bir qismini qo‘llab-quvvatlaydi.');
  await expect(page.locator('[data-studio-uncovered]')).toContainText('«tekshiring» — bu amal uchun model hali mavjud emas');
  await expect(page.locator('[data-studio-analysis]')).toContainText('Bu amal uchun model hali mavjud emas.');
  await page.locator('[data-studio-next]').click();
  await expect(page.locator('[data-studio-findings]')).toContainText('Laboratoriya yo‘riqnomaning faqat bir qismini bajaradi.');
  await page.locator('[data-studio-next]').click();
  const file = await downloadCandidate(page);
  expect(JSON.parse(node(['scripts/content-studio.ts', 'check', file])).ok).toBe(true);
  const candidate = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(candidate.derived.previewState).toBe('PROFILE_PREVIEW');
  expect(candidate.derived.completionScope.kind).toBe('PARTIAL_INSTRUCTION');
  expect(candidate.applyBoundary.canonicalWriteFromStudio).toBe(false);
  expect(await authorText(page)).not.toMatch(TECHNICAL);
  expect(errors).toEqual([]);
});

test('lab lane: a changed instruction gets no improvised lab view; 8.14 keeps its source conflict', async ({page}) => {
  await choose(page, 7, 'lu.7.15', 'lab_instruction');
  await page.locator('[data-studio-start-existing]').click();
  await page.locator('#studio-lab-steps').fill(`${await page.locator('#studio-lab-steps').inputValue()}\nNatijani daftarga yozing.`);
  await page.locator('[data-studio-next]').click();
  await expect(page.locator('[data-studio-preview] [data-dynamic-lab]')).toHaveCount(0);
  await expect(page.locator('[data-studio-preview]')).toContainText('Yo‘riqnoma mavjud matndan farq qiladi.');
  await page.locator('[data-studio-next]').click();
  await expect(page.locator('[data-studio-findings]')).toContainText('Yo‘riqnoma o‘zgartirildi.');
  await choose(page, 8, 'lu.8.22', 'lab_instruction');
  await page.locator('[data-studio-start-existing]').click();
  await page.locator('[data-studio-next]').click();
  await page.locator('[data-studio-next]').click();
  await expect(page.locator('[data-studio-status]')).toHaveAttribute('data-studio-status', 'SOURCE_CONFLICT');
  await expect(page.locator('[data-studio-findings]')).toContainText('Qaysi biri to‘g‘riligini mutaxassis hal qiladi.');
  expect(await authorText(page)).not.toMatch(TECHNICAL);
});

test('accessibility: keyboard, labels, bound errors, 320 px reflow, 44 px targets, no motion', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.setViewportSize({width: 320, height: 800});
  await page.goto(base + FLAG);
  // keyboard only: once the Studio has loaded, the first control is reachable by Tab and the form submits with Enter
  await expect(page.locator('#studio-grade')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('#studio-grade')).toBeFocused();
  await page.locator('[data-studio-next]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#studio-form-error')).toHaveText('Belgilangan maydonlarni to‘ldiring.');
  await expect(page.locator('#studio-grade')).toBeFocused();
  const s = await semantics(page, '[data-content-studio]');
  expect(s.missingWorkspace).toBeUndefined();
  expect(s.unnamed).toEqual([]); expect(s.unboundErrors).toEqual([]); expect(s.duplicateIds).toBe(0); expect(s.positiveTabindex).toBe(0); expect(s.h1).toBe(1);
  const r = await reflow(page);
  expect(r.horizontalScroll, r.culprit).toBe(false); expect(r.clipped).toBe(0);
  expect(await targetSizes(page)).toEqual([]);
  expect((await motion(page)).running).toBe(0);
  // state is never colour-only: the current stage is marked in the accessibility tree and in text
  await expect(page.locator('[aria-current=step]')).toHaveText('Tanlash');
});
