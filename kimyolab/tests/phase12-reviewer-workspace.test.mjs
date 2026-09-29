import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const run=spawnSync(process.execPath,['--experimental-strip-types','scripts/generate-reviewer-workspace.ts'],{encoding:'utf8'});
test('reviewer workspace generator exits cleanly',()=>assert.equal(run.status,0,run.stderr));
const html=fs.readFileSync('review-packets/reviewer-workspace.html','utf8');
const report=JSON.parse(fs.readFileSync('reports/reviewer-workspace.json','utf8'));
const targets=JSON.parse(fs.readFileSync('reports/stable-signoff-targets.json','utf8'));
test('workspace embeds current exact-hash global gates',()=>{for(const id of ['CHEM-033','PROD-002','VISUAL-001']){assert.match(html,new RegExp(targets.targets[id].hash));assert.match(html,new RegExp(targets.targets[id].version.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));}});
test('workspace includes all beta activity-role review rows',()=>{assert.equal(report.betaRows.total,384);assert.equal(report.betaRows.beta1,142);assert.equal(report.betaRows.beta2,175);assert.equal(report.betaRows.beta3,67);});
test('workspace intentionally has no approve-all action',()=>{assert.equal(report.approveAllAvailable,false);assert.doesNotMatch(html,/data-approve-all|id=[\"']approveAll[\"']/i);});
test('workspace does not mutate source and visual gate stays disabled before browser evidence',()=>{assert.equal(report.sourceMutation,false);const visual=report.globalGates.find(x=>x.id==='VISUAL-001');assert.equal(visual.readyForReview,false);assert.match(html,/VISUAL-001 hozir review uchun ochilmagan/);});


test('workspace autosaves drafts under an exact-hash fingerprint without changing repository source',()=>{
  assert.match(html,/workspaceFingerprint/);
  assert.match(html,/localStorage\.setItem\(storageKey/);
  assert.match(html,/kimyolab-reviewer:/);
  assert.equal(typeof report.workspaceFingerprint,'string');
  assert.equal(report.workspaceFingerprint.length,64);
});
