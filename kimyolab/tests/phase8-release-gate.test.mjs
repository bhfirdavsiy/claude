import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateReleaseGate} from '../src/runtime/governance/release-gate.ts';

const greenStructural={
  mapping:{gate:{duplicateCanonicalIds:0,unknownRefs:0,forwardReverseMismatch:0,schemaErrors:0,orphanRequiredEntities:0}},
  content:{schemaErrors:0},
  chemistry:{formulaErrors:0,reactionBalanceErrors:0,referenceErrors:0,sourceErrors:0,expertApproval:'approved'},
  beta1:{totalLearningUnits:47,technicalReady:47,releaseReady:47,technicalErrors:0,pendingApprovals:0},
  beta2:{totalLearningUnits:53,technicalReady:53,releaseReady:53,technicalErrors:0,pendingApprovals:0},
  beta3:{totalLearningUnits:22,technicalReady:22,releaseReady:22,technicalErrors:0,pendingApprovals:0},
  licensing:{releaseReady:true},
  packIntegrity:{valid:true},
  browser:{viteBuild:'pass',e2e:'pass',visual:'pass',accessibility:'pass',webVitals:'pass'},
};

test('release gate is ready only when structural, approvals, licensing and browser gates are green',()=>{
  const result=evaluateReleaseGate(greenStructural);
  assert.equal(result.technicalReady,true);
  assert.equal(result.releaseReady,true);
  assert.deepEqual(result.blockers,[]);
});

test('current carry-forward gates remain explicit release blockers without hiding technical readiness',()=>{
  const result=evaluateReleaseGate({
    ...greenStructural,
    chemistry:{...greenStructural.chemistry,expertApproval:'pending'},
    beta1:{...greenStructural.beta1,releaseReady:0,pendingApprovals:155},
    beta2:{...greenStructural.beta2,releaseReady:0,pendingApprovals:175},
    beta3:{...greenStructural.beta3,releaseReady:0,pendingApprovals:70},
    licensing:{releaseReady:false},
    browser:{viteBuild:'blocked',e2e:'blocked',visual:'blocked',accessibility:'blocked',webVitals:'pending'},
  });
  assert.equal(result.technicalReady,true);
  assert.equal(result.releaseReady,false);
  assert.ok(result.blockers.includes('CHEMISTRY_EXPERT_APPROVAL_PENDING'));
  assert.ok(result.blockers.includes('BETA1_APPROVALS_PENDING'));
  assert.ok(result.blockers.includes('BETA2_APPROVALS_PENDING'));
  assert.ok(result.blockers.includes('BETA3_APPROVALS_PENDING'));
  assert.ok(result.blockers.includes('LICENSING_PENDING'));
  assert.ok(result.blockers.includes('BROWSER_GATES_PENDING'));
});

test('structural validation errors make the technical gate fail',()=>{
  const result=evaluateReleaseGate({...greenStructural,content:{schemaErrors:1}});
  assert.equal(result.technicalReady,false);
  assert.equal(result.releaseReady,false);
  assert.ok(result.blockers.includes('CONTENT_SCHEMA_ERRORS'));
  const packResult=evaluateReleaseGate({...greenStructural,packIntegrity:{valid:false}});
  assert.equal(packResult.technicalReady,false);
  assert.ok(packResult.blockers.includes('CONTENT_PACK_INTEGRITY_FAILED'));
});
