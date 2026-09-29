import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {importGateApproval} from '../scripts/import-gate-approval.ts';
import {importBrowserEvidence} from '../scripts/import-browser-evidence.ts';
import {buildStableSignoffTargets} from '../scripts/stable-signoff-targets.ts';

const root=path.resolve('.');
const copy=(src,dst)=>fs.cpSync(src,dst,{recursive:true});
function tempBase(){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-approval-import-'));
  copy(path.join(root,'content-src'),path.join(base,'content-src'));
  copy(path.join(root,'reports'),path.join(base,'reports'));
  return base;
}

test('CHEM-033 uses a non-placeholder chemistry rules version',()=>{
  const target=buildStableSignoffTargets(root).targets['CHEM-033'];
  assert.notEqual(target.version,'0.0.0');
  assert.match(target.version,/rc|\d+\.\d+\.\d+/i);
});

test('gate approval import accepts exact target and rejects stale hash',()=>{
  const base=tempBase();
  try{
    const target=buildStableSignoffTargets(base).targets['CHEM-033'];
    const good=path.join(base,'good.json');
    fs.writeFileSync(good,JSON.stringify({gateId:'CHEM-033',status:'approved',reviewerId:'reviewer-test',reviewerRole:target.reviewerRole,reviewedVersion:target.version,reviewedHash:target.hash,reviewedAt:'2026-09-28T10:00:00Z',notes:'test'}));
    const result=importGateApproval('CHEM-033',good,base);
    assert.equal(result.status,'approved');
    const bad=path.join(base,'bad.json');
    fs.writeFileSync(bad,JSON.stringify({gateId:'CHEM-033',status:'approved',reviewerId:'reviewer-test',reviewerRole:target.reviewerRole,reviewedVersion:target.version,reviewedHash:'0'.repeat(64),reviewedAt:'2026-09-28T10:00:00Z'}));
    assert.throws(()=>importGateApproval('CHEM-033',bad,base),/APPROVAL_HASH_STALE/);
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('browser evidence import accepts current build evidence with pending visual review',()=>{
  const base=tempBase();
  const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-browser-evidence-'));
  try{
    const prod=JSON.parse(fs.readFileSync(path.join(base,'reports/production-build.json'),'utf8'));
    const shotDir=path.join(evidence,'reports/visual-regression/phase12-smoke');fs.mkdirSync(shotDir,{recursive:true});
    const shot=path.join(shotDir,'home.png');fs.writeFileSync(shot,'test-image');
    const sha=crypto.createHash('sha256').update(fs.readFileSync(shot)).digest('hex');
    const report={environment:{managedPolicyBlocked:false},prodBuild:{status:'pass',fileCount:prod.fileCount,sha256:prod.sha256,deployFileCount:prod.deployFileCount,deploySurfaceSha256:prod.deploySurfaceSha256},e2e:{status:'pass'},accessibility:{status:'pass'},webVitals:{status:'pass'},visual:{status:'pending',reason:'HUMAN_VISUAL_REVIEW_REQUIRED',screenshots:[{route:'/',path:'reports/visual-regression/phase12-smoke/home.png',sha256:sha}]}};
    fs.mkdirSync(path.join(evidence,'reports'),{recursive:true});fs.writeFileSync(path.join(evidence,'reports/browser-gates.json'),JSON.stringify(report));
    const result=importBrowserEvidence(evidence,base);
    assert.equal(result.status,'IMPORTED');
    assert.equal(result.screenshotCount,1);
  }finally{fs.rmSync(base,{recursive:true,force:true});fs.rmSync(evidence,{recursive:true,force:true});}
});

test('browser evidence import rejects evidence from another production build',()=>{
  const base=tempBase();
  const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-browser-evidence-'));
  try{
    const prod=JSON.parse(fs.readFileSync(path.join(base,'reports/production-build.json'),'utf8'));
    const shotDir=path.join(evidence,'reports/visual-regression/phase12-smoke');fs.mkdirSync(shotDir,{recursive:true});
    const shot=path.join(shotDir,'home.png');fs.writeFileSync(shot,'test-image');
    const sha=crypto.createHash('sha256').update(fs.readFileSync(shot)).digest('hex');
    const report={environment:{managedPolicyBlocked:false},prodBuild:{status:'pass',fileCount:prod.fileCount,sha256:'bad-build',deployFileCount:prod.deployFileCount,deploySurfaceSha256:prod.deploySurfaceSha256},e2e:{status:'pass'},accessibility:{status:'pass'},webVitals:{status:'pass'},visual:{status:'pending',screenshots:[{route:'/',path:'reports/visual-regression/phase12-smoke/home.png',sha256:sha}]}};
    fs.mkdirSync(path.join(evidence,'reports'),{recursive:true});fs.writeFileSync(path.join(evidence,'reports/browser-gates.json'),JSON.stringify(report));
    assert.throws(()=>importBrowserEvidence(evidence,base),/BROWSER_EVIDENCE_BUILD_HASH_MISMATCH/);
  }finally{fs.rmSync(base,{recursive:true,force:true});fs.rmSync(evidence,{recursive:true,force:true});}
});
