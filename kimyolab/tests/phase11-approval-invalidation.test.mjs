import test from 'node:test';
import assert from 'node:assert/strict';
import {computeReviewHash,effectiveApprovalState} from '../src/runtime/governance/approvals.ts';

function record(hash,version='1'){return {status:'approved',reviewerId:'r1',reviewerRole:'technical',reviewedVersion:version,reviewedHash:hash,reviewedAt:'2026-09-20T00:00:00.000Z'};}
function activity(){return {id:'practice.trainer.demo',type:'trainer',title:'Demo',goal:'Goal',conceptIds:['c1'],prerequisiteConceptIds:[],lifecycleStatus:'ready',accessibilityProfile:['keyboard'],engineCompatibility:{engine:'trainer',range:'^1.0.0'},sourceRefs:[],legacyIds:[],version:'1'};}

test('approval remains approved only for the exact reviewed version and content hash',()=>{
  const a=activity(); const hash=computeReviewHash(a);
  const state={technical:record(hash),didactic:{...record(hash),reviewerRole:'didactic'},accessibility:{...record(hash),reviewerRole:'accessibility'},chemistry:'not_applicable'};
  assert.equal(effectiveApprovalState({...a,approvals:state}).technical.status,'approved');
  const changed={...a,title:'Changed',approvals:state};
  assert.equal(effectiveApprovalState(changed).technical.status,'pending');
  assert.equal(effectiveApprovalState({...a,version:'2',approvals:state}).technical.status,'pending');
});
