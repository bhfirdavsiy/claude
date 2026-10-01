// P2.4 — the governed content workbench in a real browser: an author fills a unit's structured-theory slots (neutral
// TEST FIXTURE text, never chemistry), a chemistry and a didactic reviewer — two different people — approve the same
// hashes, an edit makes the reviews stale, and the exported packet passes the governed apply's checks in a sandbox
// copy. Machine identities, self-review and one person in both roles are refused in the page. Nothing is committed.
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {structuredFixture,FIXTURE_UNIT_ID,FIXTURE_SOURCE} from '../fixtures/structured-theory.fixture.mjs';

const root=fileURLToPath(new URL('../..',import.meta.url));
const page$=pathToFileURL(path.join(root,'review-packets/reviewer-workspace.html')).href;
const f=structuredFixture();

async function reviewer(page,id,role){ await page.fill('#wbReviewerId',id); await page.locator('#wbReviewerId').press('Tab'); await page.selectOption('#wbReviewerRole',role); }
async function approveEveryBlock(page){ const n=await page.locator('#ctEditor [data-block]').count(); for(let i=0;i<n;i+=1) await page.locator('#ctEditor [data-block]').nth(i).locator('[data-review="approved"]').click(); }

test('theory workbench: author → chemistry → didactic → APPROVED; edit → STALE; export passes the apply checks',async({page})=>{
  const errors=[];const external=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{ if(!/^(file|blob|data):/.test(r.url())) external.push(r.url()); });
  await page.goto(page$);
  await page.getByRole('tab',{name:'Nazariya (structured)'}).click();
  await page.selectOption('#ctUnit',FIXTURE_UNIT_ID);
  await expect(page.locator('#ctSummary [data-theory-state]')).toHaveAttribute('data-theory-state','DRAFT');
  await expect(page.locator('#ctAuthor')).toHaveValue('');                                   // no default identity
  await expect(page.locator('[data-block="explanation"] textarea')).toHaveValue('');        // no generated content
  await page.fill('#ctAuthor','fixture.author'); await page.locator('#ctAuthor').press('Tab');
  await page.locator('#ctEditor label:has-text("Versiya") input').fill('1.0.0');
  const block=(name)=>page.locator(`[data-block="${name}"]`);
  await block('explanation').locator('textarea').fill(f.explanation.text);
  await block('workedExamples[0]').locator('textarea').nth(0).fill(f.workedExamples[0].problem);
  await block('workedExamples[0]').locator('textarea').nth(1).fill(f.workedExamples[0].solutionSteps.join('\n'));
  await block('workedExamples[0]').locator('input[type=text]').fill(f.workedExamples[0].answer);
  await block('misconceptions[0]').locator('textarea').nth(0).fill(f.misconceptions[0].statement);
  await block('misconceptions[0]').locator('textarea').nth(1).fill(f.misconceptions[0].correction);
  await block('summary').locator('textarea').fill(f.summary.points.join('\n'));
  for(const name of ['explanation','workedExamples[0]','misconceptions[0]','summary']){
    await block(name).getByRole('checkbox',{name:new RegExp(FIXTURE_SOURCE.replace(/\./g,'\\.'))}).check();
    await block(name).locator('select').selectOption('ready-for-review');
  }
  await expect(page.locator('#ctSummary [data-theory-state]')).toHaveAttribute('data-theory-state','REVIEW_PENDING');
  // machine identity and self-review are refused
  await reviewer(page,'claude','chemistry'); await block('summary').locator('[data-review="approved"]').click();
  await expect(page.locator('#ctError')).toContainText('Avtomatlashtirish');
  await reviewer(page,'fixture.author','chemistry'); await block('summary').locator('[data-review="approved"]').click();
  await expect(page.locator('#ctError')).toContainText('Muallif');
  // chemistry reviewer: one role is not approval
  await reviewer(page,'fixture.chemistry-reviewer','chemistry'); await approveEveryBlock(page);
  await expect(page.locator('#ctSummary [data-theory-state]')).toHaveAttribute('data-theory-state','REVIEW_PENDING');
  // the same person cannot take the didactic role
  await reviewer(page,'fixture.chemistry-reviewer','didactic'); await block('summary').locator('[data-review="approved"]').click();
  await expect(page.locator('#ctError')).toContainText('ikkala rolda');
  // a different person, didactic: APPROVED — both reviews pinned to the current hash
  await reviewer(page,'fixture.didactic-reviewer','didactic'); await approveEveryBlock(page);
  await expect(page.locator('#ctSummary [data-theory-state]')).toHaveAttribute('data-theory-state','APPROVED');
  const gov=block('summary').locator('[data-gov]');
  const current=(await gov.textContent()).match(/Joriy hash: ([a-f0-9]{64})/)[1];
  await expect(gov.locator('[data-review-hash="chemistry"]')).toContainText('(joriy)');
  await expect(gov.locator('[data-review-hash="didactic"]')).toContainText('(joriy)');
  // export the approved packet and run the governed apply's checks on it (sandbox copy; nothing committed)
  const [download]=await Promise.all([page.waitForEvent('download'),page.click('#ctExport')]);
  const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'kl-cw-')),'packet.json'); await download.saveAs(file);
  const packet=JSON.parse(fs.readFileSync(file,'utf8'));
  expect(packet.learningUnit.id).toBe(FIXTURE_UNIT_ID);
  expect(packet.contentHashes.summary).toBe(current);
  expect(packet.slots.summary.reviews.map(r=>[r.reviewerRole,r.reviewedHash])).toEqual([['chemistry',current],['didactic',current]]);
  const check=spawnSync(process.execPath,['--experimental-strip-types','--no-warnings','scripts/content-operations.ts','theory:check',file],{cwd:root,encoding:'utf8'});
  expect(check.stdout).toContain('"ok": true');
  // an edit after review: STALE, never approved
  await block('summary').locator('textarea').fill(`${f.summary.points.join('\n')}\nQo‘shimcha fixture bandi.`);
  await expect(page.locator('#ctSummary [data-theory-state]')).not.toHaveAttribute('data-theory-state','APPROVED');
  await expect(block('summary').locator('[data-review-hash="chemistry"]')).toContainText('STALE');
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

test('sources workbench: machine metadata checks; only a human who is not the submitter decides, on the current hash',async({page})=>{
  const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(page$);
  await page.getByRole('tab',{name:'Manbalar'}).click();
  await expect(page.locator('#csRegistry li')).toHaveCount(5);
  await page.fill('#csf-sourceId','src.fixture.textbook'); await page.selectOption('#csf-category','TEXTBOOK');
  await page.fill('#csf-title','Fixture textbook title'); await page.fill('#csf-authority','Fixture publisher'); await page.fill('#csf-language','uz-Latn');
  await page.fill('#csf-submittedBy','fixture.submitter'); await page.selectOption('#csf-status','ready-for-review');
  await expect(page.locator('#csLive')).toHaveAttribute('data-source-state','READY_FOR_REVIEW');
  await reviewer(page,'github-actions','chemistry'); await page.selectOption('#csDecision','approved'); await page.selectOption('#csAccepted','TEXTBOOK');
  await page.click('#csReview'); await expect(page.locator('#csError')).toContainText('Avtomatlashtirish');
  await reviewer(page,'fixture.submitter','chemistry'); await page.click('#csReview'); await expect(page.locator('#csError')).toContainText('taklif qilgan');
  await reviewer(page,'fixture.source-reviewer','chemistry'); await page.selectOption('#csAccepted','');
  await page.click('#csReview'); await expect(page.locator('#csError')).toContainText('kategoriya');
  await page.selectOption('#csAccepted','TEXTBOOK'); await page.click('#csReview');
  await expect(page.locator('#csLive')).toHaveAttribute('data-source-state','APPROVED');
  await page.fill('#csf-edition','2');                                                         // metadata edit → decision stale
  await expect(page.locator('#csLive')).toHaveAttribute('data-source-state','READY_FOR_REVIEW');
  await page.getByRole('tab',{name:'Option set'}).click();
  await expect(page.locator('#coList .wb-card')).toHaveCount(32);
  expect(errors).toEqual([]);
});
