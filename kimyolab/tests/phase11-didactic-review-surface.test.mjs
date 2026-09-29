import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildStableSignoffTargets} from '../scripts/stable-signoff-targets.ts';
import {evaluateExternalApproval} from '../scripts/approval-evidence.ts';
const root=path.resolve('.');
function makeRoot(){const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-didactic-review-'));fs.cpSync(path.join(root,'content-src'),path.join(tmp,'content-src'),{recursive:true});return tmp;}
function mutateJson(file){const data=JSON.parse(fs.readFileSync(file,'utf8'));if(Array.isArray(data))data.push({__didacticReviewHashProbe:true});else data.__didacticReviewHashProbe=true;fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}

test('PROD-002 covers canonical learning flow, external labs and runtime activity configs',()=>{
 const t=buildStableSignoffTargets(root).targets['PROD-002'];
 assert.equal(t.reviewSurfaceSchema,'kimyolab.didactic-review-surface.v2');
 for(const rel of ['content-src/concepts.json','content-src/learning-units.json','content-src/practice-activities.json','content-src/theory-activities.json','content-src/mapping-links.json','content-src/external-lab-bindings.json','content-src/activity-configs/guided-labs.json']) assert.ok(t.reviewSurfaceFiles.includes(rel),`missing didactic file: ${rel}`);
});

test('PROD-002 target changes when learner-facing theory/external/config content changes',()=>{
 const tmp=makeRoot();try{const a=buildStableSignoffTargets(tmp).targets['PROD-002'];mutateJson(path.join(tmp,'content-src/external-lab-bindings.json'));const b=buildStableSignoffTargets(tmp).targets['PROD-002'];assert.notEqual(a.hash,b.hash);mutateJson(path.join(tmp,'content-src/activity-configs/guided-labs.json'));const c=buildStableSignoffTargets(tmp).targets['PROD-002'];assert.notEqual(b.hash,c.hash);}finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('old PROD-002 approval becomes stale after didactic review-surface change',()=>{
 const tmp=makeRoot();try{const before=buildStableSignoffTargets(tmp).targets['PROD-002'];const approved={status:'approved',reviewerId:'didactic-reviewer-1',reviewerRole:before.reviewerRole,reviewedVersion:before.version,reviewedHash:before.hash,reviewedAt:'2026-09-28T00:00:00Z'};assert.equal(evaluateExternalApproval(approved,before).valid,true);mutateJson(path.join(tmp,'content-src/theory-activities.json'));const after=buildStableSignoffTargets(tmp).targets['PROD-002'];const result=evaluateExternalApproval(approved,after);assert.equal(result.valid,false);assert.equal(result.reason,'APPROVAL_HASH_STALE');}finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
