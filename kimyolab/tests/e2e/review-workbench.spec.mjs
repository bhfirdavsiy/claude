// P1.8 — the Human Review Workbench in a real browser: offline page, keyboard tabs, DOM-safe packet text, identity
// guard, and a decision file that the (read-only) import preview accepts. Runs on a fixture copy with hostile
// packet text; nothing is imported and no production register is touched.
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../..',import.meta.url));
const node=(code,cwd)=>{ const r=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',code],{cwd,encoding:'utf8'}); if(r.status!==0) throw new Error(r.stderr); return r.stdout; };

let fixture;
test.beforeAll(()=>{
  fixture=fs.mkdtempSync(path.join(os.tmpdir(),'kl-workbench-'));
  for(const d of ['content-src','reports','review-packets']) fs.cpSync(path.join(root,d),path.join(fixture,d),{recursive:true});
  const file=path.join(fixture,'content-src/assessment-items.json');
  const bank=JSON.parse(fs.readFileSync(file,'utf8'));
  bank.items[0].prompt='<img src=x onerror="window.__xss=1"> katodda nima bo‘ladi?';
  bank.items[0].explanation='</script><script>window.__xss2=1</script>';
  fs.writeFileSync(file,JSON.stringify(bank,null,2));
  node(`import {buildPackets} from ${JSON.stringify(pathToFileURL(path.join(root,'scripts/assessment-review/lib.ts')).href)};import {writeWorkspace} from ${JSON.stringify(pathToFileURL(path.join(root,'scripts/generate-reviewer-workspace.ts')).href)};buildPackets(${JSON.stringify(fixture)});writeWorkspace(${JSON.stringify(fixture)});`,root);
});

test('workbench: offline, keyboard-operable tabs, hostile packet text stays text, export → import preview valid',async({page})=>{
  const errors=[];const external=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{ if(!r.url().startsWith('file:')&&!r.url().startsWith('blob:')) external.push(r.url()); });
  await page.goto(pathToFileURL(path.join(fixture,'review-packets/reviewer-workspace.html')).href);
  await expect(page.locator('#wbChemList article')).toHaveCount(134);
  // decisions are disabled until a person with the right role is named
  await expect(page.locator('#wbChemList article').first().locator('input[type=radio]').first()).toBeDisabled();
  await page.fill('#wbReviewerId','claude');await page.locator('#wbReviewerId').press('Tab');
  await expect(page.locator('#wbIdentity')).toContainText('avtomatlashtirish');
  await page.fill('#wbReviewerId','dilnoza.karimova');await page.locator('#wbReviewerId').press('Tab');
  await page.selectOption('#wbReviewerRole','chemistry');
  await expect(page.locator('#wbIdentity')).toContainText('dilnoza.karimova');
  // priority A first: the flagged observations
  await expect(page.locator('#wbChemList article h3').first()).toHaveText(/^observation:rxn\./);
  const card=page.locator('#wbChemList article',{has:page.locator('h3',{hasText:'hydrolysis:NaCl'})});
  await card.getByLabel('O‘zgartirish kerak (change_required)').check();
  // a non-approval without a comment is not exported
  await page.click('#wbExport');
  await expect(page.locator('#wbErrors')).toBeVisible();
  await expect(page.locator('#wbErrors')).toBeFocused();
  await card.locator('textarea').fill('Tushuntirish maktab darajasida aniqroq bo‘lsin.');await card.locator('textarea').press('Tab');
  // keyboard: arrows move between tabs and show the panel
  await page.locator('#tabbtn-chemistry').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tabbtn-candidates')).toBeFocused();
  await expect(page.locator('#tabbtn-candidates')).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#tab-candidates')).toBeVisible();
  await expect(page.locator('#wbCandList .wb-badge.candidate').first()).toHaveText('CANDIDATE — NOT PART OF CANONICAL KB');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tab-assessment')).toBeVisible();
  // hostile packet text is shown as text, never executed or parsed as markup
  await expect(page.locator('#wbAssessList article').first()).toContainText('<img src=x onerror="window.__xss=1">');
  await expect(page.locator('#wbAssessList article').first()).toContainText('</script><script>window.__xss2=1</script>');
  expect(await page.evaluate(()=>[window.__xss,window.__xss2,document.querySelectorAll('#wbAssessList img').length])).toEqual([undefined,undefined,0]);
  await expect(page.locator('#wbAssessList .wb-flag').first()).toContainText('MAPPING_REVIEW_REQUIRED');
  await page.keyboard.press('End');
  await expect(page.locator('#tabbtn-help')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.locator('#tabbtn-chemistry')).toBeFocused();
  const [download]=await Promise.all([page.waitForEvent('download'),page.click('#wbExport')]);
  const file=path.join(fixture,'decisions.json');
  await download.saveAs(file);
  const exported=JSON.parse(fs.readFileSync(file,'utf8'));
  expect(exported.decisions).toHaveLength(1);
  expect(exported.decisions[0]).toMatchObject({surface:'chemistry',assertionId:'hydrolysis:NaCl',decision:'change_required',reviewerId:'dilnoza.karimova',reviewerRole:'chemistry'});
  const preview=JSON.parse(node(`import {validateDecisionFile} from ${JSON.stringify(pathToFileURL(path.join(root,'scripts/lib/review-workbench.ts')).href)};import fs from 'node:fs';console.log(JSON.stringify(validateDecisionFile(${JSON.stringify(fixture)},JSON.parse(fs.readFileSync(${JSON.stringify(file)},'utf8')))));`,root));
  expect(preview.issues).toEqual([]);
  expect(preview.categories.valid).toEqual(['chemistry:hydrolysis:NaCl']);
  expect(JSON.parse(fs.readFileSync(path.join(fixture,'content-src/chemistry-reviews.json'),'utf8')).records).toEqual([]);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('release decisions tab (P1.9): content-owner only, RELEASE disabled while NOT_ELIGIBLE, export → preview valid',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(pathToFileURL(path.join(fixture,'review-packets/reviewer-workspace.html')).href);
  await page.locator('#tabbtn-chemistry').focus();
  for(let i=0;i<5;i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tabbtn-release')).toBeFocused();
  await expect(page.locator('#tab-release')).toBeVisible();
  const card=page.locator('#wbReleaseList article',{has:page.locator('h3',{hasText:'practice.experiment.9.10'})});
  await expect(card.locator('input[value=KEEP_PENDING]')).toBeDisabled();
  await page.fill('#wbReviewerId','malika.content');await page.locator('#wbReviewerId').press('Tab');
  await page.selectOption('#wbReviewerRole','content-owner');
  await expect(card).toContainText('Eligibility: NOT_ELIGIBLE');
  await expect(card).toContainText('PILOT — sign-off alohida');
  await expect(card.locator('input[value=RELEASE]')).toBeDisabled();
  await card.getByLabel('Kutishda qoldirish').check();
  await card.locator('textarea').fill('Chemistry va assessment review hali yo‘q.');await card.locator('textarea').press('Tab');
  await page.keyboard.press('Shift+Tab');
  const [download]=await Promise.all([page.waitForEvent('download'),page.click('#wbExport')]);
  const file=path.join(fixture,'release.json');await download.saveAs(file);
  const exported=JSON.parse(fs.readFileSync(file,'utf8'));
  expect(exported.decisions).toEqual([expect.objectContaining({surface:'release',activityId:'practice.experiment.9.10',decision:'KEEP_PENDING',role:'content-owner'})]);
  const preview=JSON.parse(node(`import {validateDecisionFile} from ${JSON.stringify(pathToFileURL(path.join(root,'scripts/lib/review-workbench.ts')).href)};import fs from 'node:fs';console.log(JSON.stringify(validateDecisionFile(${JSON.stringify(fixture)},JSON.parse(fs.readFileSync(${JSON.stringify(file)},'utf8')))));`,root));
  expect(preview.issues).toEqual([]);
  await page.click('#tabbtn-authoring');
  await expect(page.locator('#wbTaskList article').first()).toBeVisible();
  expect(errors).toEqual([]);
});
