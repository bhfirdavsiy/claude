import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const json=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));

test('guided chemistry hardening covers every curated chemistry-evidence target step',()=>{
  const report=json('reports/guided-lab-hardening.json');
  assert.equal(report.classification,'engineering-audit-not-expert-approval');
  assert.equal(report.summary.chemistryBaselined,19);
  assert.equal(report.summary.chemistryBaselineMissing,0);
  assert.equal(report.summary.chemistryTargetSteps,47);
  assert.equal(report.summary.chemistryTargetGrounded,47);
  assert.equal(report.summary.chemistryTargetMissing,0);
  assert.equal(report.summary.chemistryTargetCoverage,100);
  assert.equal(report.missingTargets.length,0);
});

test('hybrid guided steps retain exact Reaction KB evidence and add the missing bounded branch model',()=>{
  const guided=json('content-src/activity-configs/guided-labs.json');
  for(const [activityId,stepIndex] of [['practice.experiment.8.6',3],['practice.experiment.9.16',2]]){
    const step=guided[activityId].scenario.steps[stepIndex];
    assert.equal(step.groundingMode,'hybrid');
    assert.ok(step.reactionId);
    assert.equal(step.modelId,'school.znoh2.excess-base');
    assert.ok(step.observations.length>=2);
  }
});
