import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildStableSignoffTargets} from '../scripts/stable-signoff-targets.ts';
import {evaluateExternalApproval} from '../scripts/approval-evidence.ts';

const root=path.resolve('.');

function makeRoot(){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-chem-review-'));
  fs.mkdirSync(path.join(tmp,'content-src'),{recursive:true});
  fs.copyFileSync(path.join(root,'content-src/manifest.yaml'),path.join(tmp,'content-src/manifest.yaml'));
  for(const rel of ['concepts.json','learning-units.json','practice-activities.json','mapping-links.json']){
    fs.copyFileSync(path.join(root,'content-src',rel),path.join(tmp,'content-src',rel));
  }
  fs.cpSync(path.join(root,'content-src/chemistry'),path.join(tmp,'content-src/chemistry'),{recursive:true});
  fs.cpSync(path.join(root,'content-src/activity-configs'),path.join(tmp,'content-src/activity-configs'),{recursive:true});
  return tmp;
}

function mutateJson(file){
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  if(Array.isArray(data)) data.push({__chemReviewHashProbe:true});
  else data.__chemReviewHashProbe=true;
  fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
}

test('CHEM-033 review surface covers all chemistry knowledge and runtime activity configs',()=>{
  const target=buildStableSignoffTargets(root).targets['CHEM-033'];
  assert.equal(target.reviewSurfaceSchema,'kimyolab.chemistry-review-surface.v2');
  assert.ok(target.reviewSurfaceFileCount>=18);
  for(const rel of [
    'content-src/chemistry/species.json',
    'content-src/chemistry/reactions.json',
    'content-src/chemistry/organic.json',
    'content-src/chemistry/equilibrium.json',
    'content-src/chemistry/electrolysis.json',
    'content-src/chemistry/guided-step-reaction-map.json',
    'content-src/activity-configs/guided-labs.json',
    'content-src/activity-configs/beta2-organic.json',
    'content-src/activity-configs/beta3-advanced.json',
  ]) assert.ok(target.reviewSurfaceFiles.includes(rel),`missing review surface file: ${rel}`);
});

test('CHEM-033 target hash changes when chemistry knowledge changes',()=>{
  const tmp=makeRoot();
  try{
    const before=buildStableSignoffTargets(tmp).targets['CHEM-033'];
    mutateJson(path.join(tmp,'content-src/chemistry/organic.json'));
    const after=buildStableSignoffTargets(tmp).targets['CHEM-033'];
    assert.notEqual(after.hash,before.hash);
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});

test('CHEM-033 target hash changes when guided chemistry runtime config changes',()=>{
  const tmp=makeRoot();
  try{
    const before=buildStableSignoffTargets(tmp).targets['CHEM-033'];
    mutateJson(path.join(tmp,'content-src/activity-configs/guided-labs.json'));
    const after=buildStableSignoffTargets(tmp).targets['CHEM-033'];
    assert.notEqual(after.hash,before.hash);
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});

test('an approval for the previous CHEM-033 hash becomes stale after chemistry review-surface change',()=>{
  const tmp=makeRoot();
  try{
    const before=buildStableSignoffTargets(tmp).targets['CHEM-033'];
    const approved={
      status:'approved',reviewerId:'chem-reviewer-1',reviewerRole:before.reviewerRole,
      reviewedVersion:before.version,reviewedHash:before.hash,reviewedAt:'2026-09-28T00:00:00Z',notes:'test approval',
    };
    assert.equal(evaluateExternalApproval(approved,before).valid,true);
    mutateJson(path.join(tmp,'content-src/chemistry/equilibrium.json'));
    const after=buildStableSignoffTargets(tmp).targets['CHEM-033'];
    const result=evaluateExternalApproval(approved,after);
    assert.equal(result.valid,false);
    assert.equal(result.reason,'APPROVAL_HASH_STALE');
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});
