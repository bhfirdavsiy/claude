import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateReleaseGate} from '../src/runtime/governance/release-gate.ts';

const base={
  mapping:{gate:{duplicateCanonicalIds:0,unknownRefs:0,forwardReverseMismatch:0,schemaErrors:0,orphanRequiredEntities:0}},
  content:{schemaErrors:0},
  chemistry:{formulaErrors:0,reactionBalanceErrors:0,referenceErrors:0,sourceErrors:0,expertApproval:'approved'},
  beta1:{totalLearningUnits:47,technicalReady:47,releaseReady:47,technicalErrors:0,pendingApprovals:0},
  beta2:{totalLearningUnits:53,technicalReady:53,releaseReady:53,technicalErrors:0,pendingApprovals:0},
  beta3:{totalLearningUnits:22,technicalReady:22,releaseReady:22,technicalErrors:0,pendingApprovals:0},
  licensing:{releaseReady:true},packIntegrity:{valid:true},
  browser:{viteBuild:'pass',e2e:'pass',visual:'pass',accessibility:'pass',webVitals:'pass'},
};

test('release gate treats Beta3 technical errors as technical blockers',()=>{
  const result=evaluateReleaseGate({...base,beta3:{...base.beta3,technicalReady:21,technicalErrors:1}});
  assert.equal(result.technicalReady,false);
  assert.ok(result.blockers.includes('BETA3_TECHNICAL_ERRORS'));
});

test('release gate keeps Beta3 human approvals explicit without hiding technical readiness',()=>{
  const result=evaluateReleaseGate({...base,beta3:{...base.beta3,releaseReady:0,pendingApprovals:70}});
  assert.equal(result.technicalReady,true);
  assert.equal(result.releaseReady,false);
  assert.ok(result.blockers.includes('BETA3_APPROVALS_PENDING'));
});
