import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBeta1ReadinessReport} from '../src/runtime/beta1/readiness.ts';
import {computeReviewHash} from '../src/runtime/governance/approvals.ts';

function rec(hash){return {status:'approved',reviewerId:'r',reviewerRole:'review',reviewedVersion:'1',reviewedHash:hash,reviewedAt:'2026-09-20T00:00:00Z'};}

test('Beta readiness treats stale approved hashes as pending',()=>{
 const base={id:'practice.trainer.x',type:'trainer',title:'X',goal:'G',conceptIds:['c'],prerequisiteConceptIds:[],lifecycleStatus:'ready',accessibilityProfile:['keyboard'],engineCompatibility:{engine:'trainer',range:'^1'},sourceRefs:[],legacyIds:[],version:'1'};
 const hash=computeReviewHash(base); const approvals={technical:rec(hash),didactic:rec(hash),accessibility:rec(hash),chemistry:'not_applicable'};
 const practice={...base,approvals};
 const unit={id:'lu.7.01',grade:7,title:'U',learningOutcomes:[],conceptIds:['c'],prerequisiteConceptIds:[],lessonTemplates:[],curriculumVersion:'1',sourceRefs:[],legacyIds:['7.01']};
 const mapping={id:'m',learningUnitId:unit.id,practiceActivityId:practice.id,conceptIds:['c'],role:'primary',required:true,coverageStatus:'full'};
 const ok=buildBeta1ReadinessReport({units:[unit],practices:[practice],mappings:[mapping],configRegistry:{[practice.id]:{}}});
 assert.equal(ok.releaseReady,1);
 const changed={...practice,title:'Changed'};
 const stale=buildBeta1ReadinessReport({units:[unit],practices:[changed],mappings:[mapping],configRegistry:{[practice.id]:{}}});
 assert.equal(stale.releaseReady,0);
 assert.ok(stale.rows[0].approvalPending.includes('technical'));
});
