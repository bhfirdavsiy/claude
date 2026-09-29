import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const json=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));

const domainIds=[
  'practice.experiment.9.9','practice.experiment.9.13','practice.experiment.9.15','practice.experiment.9.19',
  'practice.experiment.9.20','practice.experiment.10.2','practice.experiment.10.6','practice.experiment.10.10'
];

test('all eight domain-model-required guided labs now have bounded model evidence',()=>{
  const guided=json('content-src/activity-configs/guided-labs.json');
  for(const id of domainIds){
    assert.ok(guided[id],id);
    assert.ok(guided[id].hardening.modelGroundedSteps>=1,`${id} lacks model-grounded step`);
    const modeled=guided[id].scenario.steps.filter(x=>x.modelId);
    assert.equal(modeled.length,guided[id].hardening.modelGroundedSteps);
    for(const step of modeled){
      assert.ok(step.observations?.length,`${id}/${step.id} has no observations`);
      assert.ok(step.sourceRefs?.length,`${id}/${step.id} has no source refs`);
      assert.equal(step.reviewStatus,'pending');
    }
  }
});

test('school lab model registry is source-linked, pending expert review, and unique',()=>{
  const data=json('content-src/chemistry/school-lab-models.json');
  assert.equal(data.models.length,28);
  assert.equal(new Set(data.models.map(x=>x.id)).size,data.models.length);
  const sourceIds=new Set(data.sourceRefs.map(x=>x.id));
  for(const model of data.models){
    assert.equal(model.reviewStatus,'pending');
    assert.ok(model.observations.length>=1);
    assert.ok(model.sourceRefs.length>=1);
    for(const ref of model.sourceRefs) assert.ok(sourceIds.has(ref),`${model.id} missing source ${ref}`);
  }
});

test('domain model set preserves key positive and negative controls',()=>{
  const data=json('content-src/chemistry/school-lab-models.json');
  const byId=new Map(data.models.map(x=>[x.id,x]));
  const displacement=byId.get('school.metal-displacement.9.9');
  assert.equal(displacement.observations.length,3);
  assert.ok(displacement.observations.some(x=>x.type==='no-visible-change'));
  assert.equal(byId.get('school.iron3.thiocyanate').observations[0].to,'deep-red');
  assert.equal(byId.get('school.water.anhydrous-cuso4').observations[0].to,'blue');
  assert.equal(byId.get('school.formalin.cuoh2-heat').observations[0].color,'brick-red');
  assert.ok(byId.get('school.glucose.cuoh2-heat').observations.some(x=>x.sample==='glycerol-control'));
});

test('student experiment renderer prefers authored chemistry description over generic internal labels',()=>{
  const src=fs.readFileSync(path.join(root,'src/features/practice/render.ts'),'utf8');
  assert.match(src,/observation\?\.description/);
  assert.doesNotMatch(src,/Reaction-KB grounded guided/);
});
