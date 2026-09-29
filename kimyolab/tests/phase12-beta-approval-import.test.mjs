import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {computeReviewHash,effectiveApprovalState} from '../src/runtime/governance/approvals.ts';
import {importBetaApprovals} from '../scripts/import-beta-approvals.ts';

const root=path.resolve('.');

test('beta approval importer persists exact review hash as source override',()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-beta-import-'));
  try{
    fs.mkdirSync(path.join(base,'content-src'),{recursive:true});
    fs.cpSync(path.join(root,'content-src/practice-activities.json'),path.join(base,'content-src/practice-activities.json'));
    fs.writeFileSync(path.join(base,'content-src/activity-approval-overrides.json'),'[]\n');
    const practices=JSON.parse(fs.readFileSync(path.join(base,'content-src/practice-activities.json'),'utf8'));
    const p=practices.find(x=>x.approvals?.technical?.status==='pending');
    assert.ok(p);
    const register={schema:'kimyolab.beta-approval-register.v1',beta:'TEST',records:[{practiceActivityId:p.id,approvalType:'technical',status:'approved',reviewerId:'tech-reviewer',reviewerRole:'technical',reviewedVersion:p.version,reviewedHash:computeReviewHash(p),reviewedAt:'2026-09-28T10:00:00Z',notes:'test'}]};
    const file=path.join(base,'register.json');fs.writeFileSync(file,JSON.stringify(register));
    const result=importBetaApprovals(file,base);
    assert.equal(result.imported,1);
    const current=JSON.parse(fs.readFileSync(path.join(base,'content-src/practice-activities.json'),'utf8')).find(x=>x.id===p.id);
    assert.equal(effectiveApprovalState(current).technical.status,'approved');
    const overrides=JSON.parse(fs.readFileSync(path.join(base,'content-src/activity-approval-overrides.json'),'utf8'));
    assert.equal(overrides.length,1);
    assert.equal(overrides[0].activityId,p.id);
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('beta approval importer rejects stale activity hash',()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-beta-import-'));
  try{
    fs.mkdirSync(path.join(base,'content-src'),{recursive:true});
    fs.cpSync(path.join(root,'content-src/practice-activities.json'),path.join(base,'content-src/practice-activities.json'));
    fs.writeFileSync(path.join(base,'content-src/activity-approval-overrides.json'),'[]\n');
    const p=JSON.parse(fs.readFileSync(path.join(base,'content-src/practice-activities.json'),'utf8')).find(x=>x.approvals?.technical?.status==='pending');
    const register={schema:'kimyolab.beta-approval-register.v1',beta:'TEST',records:[{practiceActivityId:p.id,approvalType:'technical',status:'approved',reviewerId:'tech-reviewer',reviewerRole:'technical',reviewedVersion:p.version,reviewedHash:'0'.repeat(64),reviewedAt:'2026-09-28T10:00:00Z'}]};
    const file=path.join(base,'register.json');fs.writeFileSync(file,JSON.stringify(register));
    assert.throws(()=>importBetaApprovals(file,base),/BETA_APPROVAL_HASH_STALE/);
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});
