import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateStablePreflight} from '../scripts/stable-preflight.ts';

const build={valid:true,fileCount:124,sha256:'build-hash',deployFileCount:123,deploySurfaceSha256:'deploy-hash'};
const green={
 rc:{internalReady:true,technicalPreflight:'GREEN',internalBlockers:[]},bundle:{valid:true},licensing:{releaseReady:true},rollback:{valid:true},
 chemistry:{expertApprovalValid:true,expertApproval:'approved',expertApprovalReason:'APPROVED',expertReviewVersion:'1',expertReviewHash:'h'},
 didacticApproval:{valid:true,status:'approved'},visualApproval:{valid:true,status:'approved'},
 beta1:{totalLearningUnits:47,releaseReady:47,pendingApprovals:0},beta2:{totalLearningUnits:53,releaseReady:53,pendingApprovals:0},beta3:{totalLearningUnits:22,releaseReady:22,pendingApprovals:0},
 productionBuild:build,
 browser:{prodBuild:{status:'pass',fileCount:124,sha256:'build-hash',deployFileCount:123,deploySurfaceSha256:'deploy-hash'},e2e:{status:'pass'},visual:{status:'pending',screenshots:[{route:'/',path:'shot.png',sha256:'shot-hash'}]},accessibility:{status:'pass'},webVitals:{status:'pass'}},
 httpSmoke:{httpSmoke:{status:'pass'},staticAccessibility:{status:'pass'}},
};

test('stable preflight is green only when all technical human and browser evidence is green',()=>{
 const result=evaluateStablePreflight(green); assert.equal(result.stableReady,true); assert.deepEqual(result.pending,[]);
});

test('pending human approval remains an explicit blocker',()=>{
 const result=evaluateStablePreflight({...green,didacticApproval:{valid:false,status:'pending'}}); assert.equal(result.stableReady,false); assert.ok(result.pending.includes('PROD-002'));
});

test('browser gates remain explicit external blockers',()=>{
 const result=evaluateStablePreflight({...green,browser:{...green.browser,e2e:{status:'blocked',reason:'REAL_BROWSER_REQUIRED'}}}); assert.equal(result.stableReady,false); assert.ok(result.pending.includes('BROWSER-E2E'));
});

test('browser evidence is rejected when it belongs to a stale production build',()=>{
 const result=evaluateStablePreflight({...green,browser:{...green.browser,prodBuild:{status:'pass',fileCount:124,sha256:'old-build',deployFileCount:123,deploySurfaceSha256:'old-deploy'}}});
 assert.equal(result.stableReady,false);
 assert.ok(result.pending.includes('BROWSER-E2E'));
 assert.ok(result.pending.includes('BROWSER-ACCESSIBILITY'));
 assert.ok(result.pending.includes('BROWSER-WEBVITALS'));
 assert.ok(result.pending.includes('BROWSER-VISUAL'));
});

test('visual review needs screenshot evidence and an explicit reviewer approval',()=>{
 const result=evaluateStablePreflight({...green,visualApproval:{valid:false,status:'pending'}});
 assert.equal(result.stableReady,false);
 assert.ok(result.pending.includes('BROWSER-VISUAL'));
});
